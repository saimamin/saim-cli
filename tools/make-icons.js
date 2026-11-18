/**
 * Saim CLI - icon generator
 * Draws the application mark (a rounded badge with a terminal chevron) and
 * writes it as a PNG (512x512, 1024x1024) plus a scalable SVG source.
 *
 * Usage: node tools/make-icons.js
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = path.join(__dirname, "..", "media");

/* ------------------------------- PNG writer ------------------------------ */

function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c;
        }
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(file, width, height, rgba) {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter: none
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;      // bit depth
    ihdr[9] = 6;      // colour type RGBA
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0))
    ]);
    fs.writeFileSync(file, png);
    console.log("wrote", file, `${width}x${height}`);
}

/* ------------------------------- geometry -------------------------------- */

function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}

function insideRoundedRect(px, py, x, y, w, h, r) {
    const cx = Math.max(x + r, Math.min(px, x + w - r));
    const cy = Math.max(y + r, Math.min(py, y + h - r));
    return Math.hypot(px - cx, py - cy) <= r;
}

function mix(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
    ];
}

/**
 * Renders the Saim mark.
 *  - rounded badge with a teal -> blue gradient
 *  - a bright terminal chevron ">" and an underscore cursor
 */
function renderIcon(size) {
    const buf = Buffer.alloc(size * size * 4);
    const ss = 3; // supersampling factor
    const s = size / 512;

    const teal = [49, 224, 198];
    const blue = [74, 168, 255];
    const dark = [7, 12, 18];

    // Chevron geometry (in 512 space)
    const chevron = [
        [175, 175, 285, 256],
        [285, 256, 175, 337]
    ];
    const cursor = [[175, 355, 330, 355]];

    const stroke = 30 * s;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let sy = 0; sy < ss; sy++) {
                for (let sx = 0; sx < ss; sx++) {
                    const px = x + (sx + 0.5) / ss;
                    const py = y + (sy + 0.5) / ss;
                    if (!insideRoundedRect(px, py, 16 * s, 16 * s, size - 32 * s, size - 32 * s, 104 * s)) continue;

                    const t = Math.min(1, Math.max(0, (px / size + py / size) / 2));
                    let col = mix(teal, blue, t);
                    let alpha = 1;

                    // inner shading
                    const shade = 1 - (py / size) * 0.25;
                    col = [Math.round(col[0] * shade), Math.round(col[1] * shade), Math.round(col[2] * shade)];

                    // dark chevron cut-out
                    let d = Infinity;
                    chevron.forEach(seg => {
                        d = Math.min(d, distanceToSegment(px, py, seg[0] * s, seg[1] * s, seg[2] * s, seg[3] * s));
                    });
                    let dCur = Infinity;
                    cursor.forEach(seg => {
                        dCur = Math.min(dCur, distanceToSegment(px, py, seg[0] * s, seg[1] * s, seg[2] * s, seg[3] * s));
                    });
                    if (d < stroke || dCur < stroke * 0.9) {
                        col = dark;
                    }

                    r += col[0];
                    g += col[1];
                    b += col[2];
                    a += alpha;
                }
            }
            const total = ss * ss;
            const idx = (y * size + x) * 4;
            if (a === 0) {
                buf[idx] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0; buf[idx + 3] = 0;
            } else {
                buf[idx] = Math.round(r / a);
                buf[idx + 1] = Math.round(g / a);
                buf[idx + 2] = Math.round(b / a);
                buf[idx + 3] = Math.round((a / total) * 255);
            }
        }
    }
    return buf;
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="saim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#31e0c6"/>
      <stop offset="100%" stop-color="#4aa8ff"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="104" fill="url(#saim)"/>
  <path d="M175 175 L285 256 L175 337" fill="none" stroke="#070c12" stroke-width="30"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M175 355 L330 355" fill="none" stroke="#070c12" stroke-width="27" stroke-linecap="round"/>
</svg>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
writePng(path.join(OUT_DIR, "icon.png"), 512, 512, renderIcon(512));
writePng(path.join(OUT_DIR, "icon-1024.png"), 1024, 1024, renderIcon(1024));
fs.writeFileSync(path.join(OUT_DIR, "icon.svg"), SVG);
console.log("wrote", path.join(OUT_DIR, "icon.svg"));
