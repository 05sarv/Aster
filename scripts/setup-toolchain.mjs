// One-time setup: extract JDK 17 + Android cmdline-tools, install SDK packages.
// Toolchain lives outside the project: %LOCALAPPDATA%\aster-toolchain
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TC = path.join(process.env.LOCALAPPDATA, "aster-toolchain");
const SDK = path.join(TC, "android-sdk");
const JDK = path.join(TC, "jdk");
const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`FAILED (${r.status}): ${cmd} ${args.join(" ")}`);
    process.exit(1);
  }
}

// Windows bsdtar reads zip; Git Bash's GNU tar does not — use the System32 one.
const TAR = "C:\\Windows\\System32\\tar.exe";

// tar.exe treats "C:\…" as a remote host — always give it relative paths via cwd.
const untar = (zip, dest) =>
  run(TAR, ["-xf", zip, "-C", dest], { cwd: TC });

// 1. JDK 17
if (!isDir(JDK)) {
  console.log("Extracting JDK 17…");
  fs.rmSync(path.join(TC, "jdk-tmp"), { recursive: true, force: true });
  fs.mkdirSync(path.join(TC, "jdk-tmp"), { recursive: true });
  untar("jdk17.zip", "jdk-tmp");
  const entries = fs.readdirSync(path.join(TC, "jdk-tmp")).filter((n) => n.startsWith("jdk-") && isDir(path.join(TC, "jdk-tmp", n)));
  if (entries.length !== 1) { console.error("Unexpected JDK zip layout:", entries); process.exit(1); }
  fs.renameSync(path.join(TC, "jdk-tmp", entries[0]), JDK);
  fs.rmSync(path.join(TC, "jdk-tmp"), { recursive: true, force: true });
}
console.log("JDK ok:", fs.readdirSync(path.join(JDK, "bin")).includes("java.exe") ? "java.exe present" : "MISSING");

// 2. cmdline-tools → SDK/cmdline-tools/latest
const ctlLatest = path.join(SDK, "cmdline-tools", "latest");
if (!isDir(ctlLatest)) {
  console.log("Extracting Android cmdline-tools…");
  fs.rmSync(path.join(TC, "ct-tmp"), { recursive: true, force: true });
  fs.mkdirSync(path.join(TC, "ct-tmp"), { recursive: true });
  untar("cmdtools.zip", "ct-tmp");
  fs.mkdirSync(path.join(SDK, "cmdline-tools"), { recursive: true });
  fs.renameSync(path.join(TC, "ct-tmp", "cmdline-tools"), ctlLatest);
  fs.rmSync(path.join(TC, "ct-tmp"), { recursive: true, force: true });
}

// 3. SDK packages
const BT = path.join(SDK, "build-tools", "34.0.0");
const PLATFORM = path.join(SDK, "platforms", "android-34");
if (!isDir(BT) || !isDir(PLATFORM)) {
  console.log("Installing SDK packages (platform-tools, android-34, build-tools 34.0.0)…");
  const env = { ...process.env, JAVA_HOME: JDK, PATH: path.join(JDK, "bin") + ";" + process.env.PATH };
  const sdkmanager = path.join(ctlLatest, "bin", "sdkmanager.bat");
  // Accept licenses
  spawnSync("cmd.exe", ["/c", sdkmanager, "--licenses"], {
    input: "y\n".repeat(30), stdio: ["pipe", "ignore", "inherit"], env,
  });
  run("cmd.exe", ["/c", sdkmanager, "platform-tools", "platforms;android-34", "build-tools;34.0.0"], { env });
}

// 4. Verify
const need = [
  path.join(JDK, "bin", "javac.exe"),
  path.join(BT, "aapt2.exe"),
  path.join(BT, "zipalign.exe"),
  path.join(BT, "lib", "d8.jar"),
  path.join(BT, "lib", "apksigner.jar"),
  path.join(PLATFORM, "android.jar"),
];
for (const p of need) {
  if (!fs.existsSync(p)) { console.error("MISSING:", p); process.exit(1); }
}
console.log("Toolchain ready ✓");
console.log("  JDK:", JDK);
console.log("  SDK:", SDK);
