/**
 * Saim CLI - Cloudflare R2 backend
 * ---------------------------------------------------------------------------
 * Cloudflare R2 speaks the S3 API, so we sign requests with AWS Signature V4
 * and talk to the account-specific R2 endpoint. Used by both the Electron main
 * process and the browser preview server.
 *
 * Credentials are passed in per call (never logged or persisted here).
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const archiver = require("archiver");

const REGION = "auto";
const SERVICE = "s3";
const UA = "SaimCLI/1.0";

function endpoint(accountId) {
    if (!accountId) throw new Error("Cloudflare account ID required");
    return `https://${accountId}.r2.cloudflarestorage.com`;
}

function hash(data) {
    return crypto.createHash("sha256").update(data || "").digest("hex");
}

function hmac(key, data) {
    return crypto.createHmac("sha256", key).update(data).digest();
}

function amzDate(date) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/** Build AWS Signature V4 authorization headers for an R2 request. */
function sign(opts, method, key, query, bodyBuf, extraHeaders) {
    const host = new URL(endpoint(opts.accountId)).host;
    const now = new Date();
    const short = amzDate(now).slice(0, 8);
    const full = amzDate(now);
    const payloadHash = hash(bodyBuf || "");

    const headers = Object.assign({
        host,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": full
    }, extraHeaders || {});

    // Canonical headers (sorted, lowercased)
    const sortedKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedKeys.map(k => `${k.toLowerCase()}:${String(headers[k]).trim()}`).join("\n") + "\n";
    const signedHeaders = sortedKeys.map(k => k.toLowerCase()).join(";");

    // Canonical query string (sorted, encoded)
    const params = Object.keys(query || {}).sort().map(k =>
        `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join("&");

    const canonicalRequest = [
        method,
        `/${key}`,
        params,
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join("\n");

    const scope = `${short}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign = [
        "AWS4-HMAC-SHA256",
        full,
        scope,
        hash(canonicalRequest)
    ].join("\n");

    const kDate = hmac(`AWS4${opts.secretAccessKey}`, short);
    const kRegion = hmac(kDate, REGION);
    const kService = hmac(kRegion, SERVICE);
    const kSigning = hmac(kService, "aws4_request");
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return headers;
}

function creds(opts) {
    if (!opts.accountId) throw new Error("Cloudflare account ID required");
    if (!opts.accessKeyId) throw new Error("R2 access key ID required");
    if (!opts.secretAccessKey) throw new Error("R2 secret access key required");
    return opts;
}

async function request(opts, method, key, query, bodyBuf, extraHeaders) {
    creds(opts);
    const headers = sign(opts, method, key, query, bodyBuf, extraHeaders);
    const params = Object.keys(query || {}).map(k =>
        `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join("&");
    const url = `${endpoint(opts.accountId)}/${key}${params ? `?${params}` : ""}`;
    const res = await fetch(url, {
        method,
        headers: Object.assign({ "User-Agent": UA }, headers),
        body: bodyBuf || undefined
    });
    const text = await res.text();
    if (!res.ok) {
        const msg = (text && text.slice(0, 300)) || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return { text, headers: res.headers, status: res.status };
}

/* ------------------------------- buckets -------------------------------- */

function parseBuckets(xml) {
    const out = [];
    const re = /<Bucket>([\s\S]*?)<\/Bucket>/g;
    let m;
    while ((m = re.exec(xml))) {
        const block = m[1];
        const name = (block.match(/<Name>([\s\S]*?)<\/Name>/) || [])[1];
        const created = (block.match(/<CreationDate>([\s\S]*?)<\/CreationDate>/) || [])[1];
        if (name) out.push({ name, createdAt: created || null });
    }
    return out;
}

async function listBuckets(opts = {}) {
    const { text } = await request(opts, "GET", "", {});
    return { ok: true, buckets: parseBuckets(text) };
}

async function createBucket(opts = {}) {
    if (!opts.bucket) throw new Error("Bucket name required");
    await request(opts, "PUT", opts.bucket, {});
    return { ok: true, bucket: opts.bucket };
}

async function listObjects(opts = {}) {
    if (!opts.bucket) throw new Error("Bucket name required");
    const query = { "list-type": "2" };
    if (opts.prefix) query.prefix = opts.prefix;
    const { text } = await request(opts, "GET", `${opts.bucket}`, query);
    const objects = [];
    const re = /<Contents>([\s\S]*?)<\/Contents>/g;
    let m;
    while ((m = re.exec(text))) {
        const block = m[1];
        const get = tag => (block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1];
        objects.push({
            key: get("Key") || "",
            size: Number(get("Size") || 0),
            modified: get("LastModified") || null,
            etag: (get("ETag") || "").replace(/&quot;/g, '"')
        });
    }
    return { ok: true, bucket: opts.bucket, objects };
}

/* ------------------------------- objects -------------------------------- */

async function deleteObject(opts = {}) {
    if (!opts.bucket || !opts.key) throw new Error("Bucket and object key required");
    await request(opts, "DELETE", `${opts.bucket}/${opts.key}`, {});
    return { ok: true };
}

/** Generate a presigned GET URL so the browser can download without proxying. */
function presign(opts = {}, key, expires = 3600) {
    creds(opts);
    const host = new URL(endpoint(opts.accountId)).host;
    const now = new Date();
    const short = amzDate(now).slice(0, 8);
    const full = amzDate(now);
    const scope = `${short}/${REGION}/${SERVICE}/aws4_request`;
    const query = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": `${opts.accessKeyId}/${scope}`,
        "X-Amz-Date": full,
        "X-Amz-Expires": String(expires),
        "X-Amz-SignedHeaders": "host"
    };
    const sorted = Object.keys(query).sort();
    const canonicalQuery = sorted.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join("&");
    const canonicalRequest = ["GET", `/${key}`, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", full, scope, hash(canonicalRequest)].join("\n");
    const kDate = hmac(`AWS4${opts.secretAccessKey}`, short);
    const kRegion = hmac(kDate, REGION);
    const kService = hmac(kRegion, SERVICE);
    const kSigning = hmac(kService, "aws4_request");
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    return { ok: true, url: `${endpoint(opts.accountId)}/${key}?${canonicalQuery}&X-Amz-Signature=${signature}` };
}

/* -------------------------------- backup -------------------------------- */

/** Create a zip of one or more source folders and upload it to R2. */
async function backup(opts = {}) {
    creds(opts);
    if (!opts.bucket) throw new Error("R2 bucket required");
    const sources = (opts.sources || []).filter(p => p && fs.existsSync(p));
    if (!sources.length) throw new Error("No project folders to back up");

    const tmp = path.join(os.tmpdir(), `saim-backup-${Date.now()}.zip`);
    try {
        await new Promise((resolve, reject) => {
            const out = fs.createWriteStream(tmp);
            const archive = archiver("zip", { zlib: { level: 6 } });
            out.on("close", resolve);
            out.on("error", reject);
            archive.on("error", reject);
            archive.pipe(out);
            sources.forEach(src => {
                const folder = path.basename(src) || "project";
                archive.directory(src, folder);
            });
            archive.finalize();
        });

        const bodyBuf = fs.readFileSync(tmp);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const key = `${opts.prefix || "backups"}/saim-backup-${stamp}.zip`;
        await request(opts, "PUT", `${opts.bucket}/${key}`, {}, bodyBuf, {
            "Content-Type": "application/zip"
        });
        return { ok: true, key, size: bodyBuf.length, sources: sources.map(s => path.basename(s)) };
    } finally {
        try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    }
}

module.exports = {
    listBuckets,
    createBucket,
    listObjects,
    deleteObject,
    presign,
    backup
};
