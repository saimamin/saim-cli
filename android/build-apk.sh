#!/usr/bin/env bash
# Builds SaimCLI.apk without Gradle: aapt2 -> javac -> d8 -> zip -> zipalign -> apksigner.
set -euo pipefail

export JAVA_HOME="$HOME/Projects/android-tools/jdk-17.0.13+11"
export PATH="$JAVA_HOME/bin:$PATH"
BT="$HOME/Projects/android-tools/android-16"
AJ="$HOME/Projects/android-tools/android-36/android.jar"
PROJ="$HOME/Projects/saim-cli/android"
B="$PROJ/build"

rm -rf "$B"
mkdir -p "$B/classes" "$B/dex"

echo "[1/7] aapt2 compile"
"$BT/aapt2" compile --dir "$PROJ/res" -o "$B/res.zip"

echo "[2/7] aapt2 link"
"$BT/aapt2" link -o "$B/base.apk" -I "$AJ" \
  --manifest "$PROJ/AndroidManifest.xml" \
  -A "$PROJ/assets" "$B/res.zip" \
  --min-sdk-version 29 --target-sdk-version 36 --auto-add-overlay

echo "[3/7] javac"
javac -classpath "$AJ" -d "$B/classes" "$PROJ/src/com/saim/cli/MainActivity.java"

echo "[4/7] d8"
"$BT/d8" --lib "$AJ" --release --min-api 29 \
  --output "$B/dex" "$B/classes/com/saim/cli/MainActivity.class"

echo "[5/7] zip classes.dex into apk"
(cd "$B/dex" && zip -q -u "$B/base.apk" classes.dex)

echo "[6/7] zipalign"
"$BT/zipalign" -f 4 "$B/base.apk" "$B/aligned.apk"

echo "[7/7] sign"
KS="$PROJ/saim.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias saim -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass saimcli -keypass saimcli -dname "CN=Saim CLI,O=Saim"
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:saimcli \
  --out "$PROJ/SaimCLI.apk" "$B/aligned.apk"

"$BT/apksigner" verify --print-certs "$PROJ/SaimCLI.apk" | head -4
ls -la "$PROJ/SaimCLI.apk"
echo "APK BUILD OK"
