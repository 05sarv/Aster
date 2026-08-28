// Builds releases/ASTER-<version>.apk from android/ + the web app source.
// No Gradle — direct aapt2 → javac → d8 → zipalign → apksigner (fast, ~seconds).
// Toolchain: %LOCALAPPDATA%\aster-toolchain (see scripts/setup-toolchain.mjs)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AND = path.join(ROOT, "android");
const BUILD = path.join(AND, "build");

const TC = path.join(process.env.LOCALAPPDATA, "aster-toolchain");
const JDK_BIN = path.join(TC, "jdk", "bin");
const BT = path.join(TC, "android-sdk", "build-tools", "34.0.0");
const PLATFORM_JAR = path.join(TC, "android-sdk", "platforms", "android-34", "android.jar");
const AAPT2 = path.join(BT, "aapt2.exe");
const JAVA = path.join(JDK_BIN, "java.exe");

const KS = path.join(AND, "aster.keystore");
const KS_PASS = "aster-keep-out"; // personal signing key, keep stable to allow app updates

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`\nFAILED (${r.status}): ${path.basename(cmd)} ${args.join(" ")}`);
    process.exit(1);
  }
}

function walk(dir, filter, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

const CLEAN = process.argv.includes("--clean");
const manifest = fs.readFileSync(path.join(AND, "AndroidManifest.xml"), "utf8");
const version = manifest.match(/android:versionName="([^"]+)"/)[1];
const versionCode = manifest.match(/android:versionCode="([^"]+)"/)[1];
const OUT = path.join(ROOT, "releases", CLEAN ? `ASTER-Clean-${version}.apk` : `ASTER-${version}.apk`);

// Variant: Clean rebuilds as its own app (different package + label + entry page).
const PKG = CLEAN ? "com.aster.clean" : "com.aster.app";
const manifestPath = path.join(BUILD, "AndroidManifest.xml");
if (CLEAN) {
  fs.writeFileSync(path.join(AND, "res", "values", "strings.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">ASTER Clean</string>\n</resources>\n`);
} else {
  fs.writeFileSync(path.join(AND, "res", "values", "strings.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">ASTER</string>\n</resources>\n`);
}

// 1. Bundle the web app into assets/app (Clean boots clean.html as index)
const assetsApp = path.join(AND, "assets", "app");
fs.rmSync(path.join(AND, "assets"), { recursive: true, force: true });
fs.mkdirSync(assetsApp, { recursive: true });
for (const item of [CLEAN ? "clean.html" : "index.html", "src", "styles"]) {
  fs.cpSync(path.join(ROOT, item), path.join(assetsApp, item), { recursive: true });
}
if (CLEAN) fs.renameSync(path.join(assetsApp, "clean.html"), path.join(assetsApp, "index.html"));

// 2. Clean build dir, then write the variant manifest into it
fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(path.join(BUILD, "gen"), { recursive: true });
fs.writeFileSync(manifestPath, manifest.replace(/package="[^"]+"/, `package="${PKG}"`));

// 3. Compile resources
console.log("▸ aapt2 compile");
run(AAPT2, ["compile", "--dir", path.join(AND, "res"), "-o", path.join(BUILD, "res.zip")]);

// 4. Link: resources + manifest → base apk + R.java
//    (assets are added later via jar — aapt2 -A stores backslash paths on Windows,
//     which Android's AssetManager can't read)
console.log("▸ aapt2 link");
run(AAPT2, [
  "link", "-o", path.join(BUILD, "base.apk"),
  "-I", PLATFORM_JAR,
  "--manifest", manifestPath,
  "--java", path.join(BUILD, "gen"),
  "--min-sdk-version", "24",
  "--target-sdk-version", "34",
  "--version-code", versionCode,
  "--version-name", version,
  path.join(BUILD, "res.zip"),
]);

// 5. javac (MainActivity only — icon lookup is package-agnostic, no R import)
console.log("▸ javac");
const javaSources = walk(path.join(AND, "src"), (p) => p.endsWith(".java"));
fs.mkdirSync(path.join(BUILD, "classes"), { recursive: true });
run(path.join(JDK_BIN, "javac.exe"), ["--release", "8", "-cp", PLATFORM_JAR, "-d", path.join(BUILD, "classes"), ...javaSources]);

// 6. d8 → classes.dex
console.log("▸ d8");
const classFiles = walk(path.join(BUILD, "classes"), (p) => p.endsWith(".class"));
fs.mkdirSync(path.join(BUILD, "dex"), { recursive: true });
run(JAVA, ["-cp", path.join(BT, "lib", "d8.jar"), "com.android.tools.r8.D8", "--min-api", "24", "--output", path.join(BUILD, "dex"), ...classFiles]);

// 7. Add classes.dex + web assets into the apk (jar = zip updater from the JDK).
//    Assets are passed with forward slashes so Android can read them.
console.log("▸ package");
run(path.join(JDK_BIN, "jar.exe"),
  ["--update", "--no-manifest", "--file", path.join(BUILD, "base.apk"), "classes.dex"],
  { cwd: path.join(BUILD, "dex") });
const assetEntries = walk(path.join(AND, "assets"), () => true)
  .map((p) => path.relative(AND, p).split(path.sep).join("/")); // → assets/app/…
run(path.join(JDK_BIN, "jar.exe"),
  ["--update", "--no-manifest", "--file", path.join(BUILD, "base.apk"), ...assetEntries],
  { cwd: AND });

// 8. Signing key (generated once; same key = installs update over older builds)
if (!fs.existsSync(KS)) {
  console.log("▸ generating signing key");
  run(path.join(JDK_BIN, "keytool.exe"), [
    "-genkeypair", "-v", "-keystore", KS, "-alias", "aster",
    "-keyalg", "RSA", "-keysize", "2048", "-validity", "10950",
    "-storepass", KS_PASS, "-keypass", KS_PASS,
    "-dname", "CN=ASTER, OU=Personal, O=Sarv",
  ]);
}

// 9. zipalign + sign
console.log("▸ zipalign + sign");
fs.mkdirSync(path.join(ROOT, "releases"), { recursive: true });
run(path.join(BT, "zipalign.exe"), ["-f", "-p", "4", path.join(BUILD, "base.apk"), path.join(BUILD, "aligned.apk")]);
run(JAVA, [
  "-jar", path.join(BT, "lib", "apksigner.jar"), "sign",
  "--ks", KS, "--ks-key-alias", "aster",
  "--ks-pass", `pass:${KS_PASS}`, "--key-pass", `pass:${KS_PASS}`,
  "--out", OUT,
  path.join(BUILD, "aligned.apk"),
]);

// 10. Verify
run(JAVA, ["-jar", path.join(BT, "lib", "apksigner.jar"), "verify", "--print-certs", OUT]);
const badging = spawnSync(AAPT2, ["dump", "badging", OUT], { encoding: "utf8" });
const interesting = badging.stdout.split("\n").filter((l) => /^(package|application-label|sdkVersion|targetSdkVersion|native-code)/.test(l));
console.log(interesting.join("\n"));
console.log(`\n✓ Built ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
