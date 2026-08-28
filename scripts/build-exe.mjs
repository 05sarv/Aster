// Builds releases/ASTER.exe — a single ~1.3 MB native WebView2 shell with the
// web app + WebView2 DLLs embedded as resources. Compiled with the in-box
// .NET Framework C# compiler, so no toolchain downloads are needed.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WV2 = path.join(ROOT, "desktop", "webview2");
const STAGE = path.join(ROOT, "build", "exe-stage");
const CLEAN = process.argv.includes("--clean");
const OUT = path.join(ROOT, "releases", CLEAN ? "ASTER-Clean.exe" : "ASTER.exe");
const CSC = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) { console.error("FAILED:", path.basename(cmd)); process.exit(1); }
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1. Stage the web app (single source of truth; Clean variant boots clean.html as index)
fs.rmSync(STAGE, { recursive: true, force: true });
const appDir = path.join(STAGE, "app");
fs.mkdirSync(appDir, { recursive: true });
for (const item of [CLEAN ? "clean.html" : "index.html", "src", "styles"]) {
  fs.cpSync(path.join(ROOT, item), path.join(appDir, item), { recursive: true });
}
if (CLEAN) fs.renameSync(path.join(appDir, "clean.html"), path.join(appDir, "index.html"));
const appFiles = walk(appDir);
const relPaths = appFiles.map((p) => path.relative(appDir, p).split(path.sep).join("/"));

// 2. Files manifest (drives extraction at runtime + version hash)
const manifestPath = path.join(ROOT, "build", "files-manifest.txt");
fs.writeFileSync(manifestPath, relPaths.join("\n") + "\n");

// 3. Compile: app files, WebView2 DLLs and loader all embedded
const iconFile = path.join(ROOT, "build", CLEAN ? "icon-clean.ico" : "icon.ico");
const args = [
  "/nologo", "/target:winexe", "/platform:x64",
  "/out:" + OUT,
  ...(CLEAN ? ["/d:CLEAN"] : []),
  ...(fs.existsSync(iconFile) ? ["/win32icon:" + iconFile] : []),
  "/win32manifest:" + path.join(ROOT, "desktop", "app.manifest"),
  "/r:System.dll", "/r:System.Windows.Forms.dll", "/r:System.Drawing.dll", "/r:System.Web.Extensions.dll",
  "/r:" + path.join(WV2, "lib", "net462", "Microsoft.Web.WebView2.Core.dll"),
  "/r:" + path.join(WV2, "lib", "net462", "Microsoft.Web.WebView2.WinForms.dll"),
  "/resource:" + path.join(WV2, "lib", "net462", "Microsoft.Web.WebView2.Core.dll") + ",Aster.Microsoft.Web.WebView2.Core.dll",
  "/resource:" + path.join(WV2, "lib", "net462", "Microsoft.Web.WebView2.WinForms.dll") + ",Aster.Microsoft.Web.WebView2.WinForms.dll",
  "/resource:" + path.join(WV2, "runtimes", "win-x64", "native", "WebView2Loader.dll") + ",Aster.WebView2Loader.dll",
  "/resource:" + manifestPath + ",Aster.files.manifest",
];
for (let i = 0; i < appFiles.length; i++) {
  args.push("/resource:" + appFiles[i] + ",Aster.app." + relPaths[i].replace(/\//g, "."));
}
args.push(path.join(ROOT, "desktop", "Program.cs"));

fs.mkdirSync(path.join(ROOT, "releases"), { recursive: true });
fs.rmSync(OUT, { force: true });
run(CSC, args);

const size = fs.statSync(OUT).size;
console.log(`\n✓ Built releases/ASTER.exe — ${(size / 1024 / 1024).toFixed(2)} MB (single file, app embedded)`);
console.log("  First run extracts the app to %LOCALAPPDATA%\\ASTER and uses the system WebView2 runtime.");
