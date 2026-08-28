// Renders scripts/icon.html at every needed size → build/icon.png + android res mipmaps.
// Run: npx electron scripts/gen-icons.mjs
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const TARGETS = [
  { size: 512, out: path.join(ROOT, "build", "icon.png") },
  { size: 192, out: path.join(ROOT, "android", "res", "mipmap-xxxhdpi", "ic_launcher.png") },
  { size: 144, out: path.join(ROOT, "android", "res", "mipmap-xxhdpi", "ic_launcher.png") },
  { size: 96, out: path.join(ROOT, "android", "res", "mipmap-xhdpi", "ic_launcher.png") },
  { size: 72, out: path.join(ROOT, "android", "res", "mipmap-hdpi", "ic_launcher.png") },
  { size: 48, out: path.join(ROOT, "android", "res", "mipmap-mdpi", "ic_launcher.png") },
];

app.whenReady().then(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const { size, out } of TARGETS) {
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        const win = new BrowserWindow({
          width: size,
          height: size,
          show: false,
          frame: false,
          useContentSize: true,
          transparent: true,               // keep alpha — white corners otherwise
          backgroundColor: "#00000000",
          webPreferences: { offscreen: true, backgroundThrottling: false },
        });
        await win.loadFile(path.join(__dirname, "icon.html"));
        const image = await win.webContents.capturePage();
        const exact = image.isEmpty() ? image : image.resize({ width: size, height: size });
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, exact.toPNG());
        win.destroy();
        done = true;
        console.log("icon", size + "px →", path.relative(ROOT, out));
      } catch (e) {
        console.error(`retry ${attempt + 1} for ${size}px:`, e.message);
        await sleep(400);
      }
    }
    if (!done) { console.error("FAILED for", size, "px"); app.exit(1); return; }
    await sleep(200);
  }
  app.quit();
});
