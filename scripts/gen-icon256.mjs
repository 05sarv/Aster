// Renders scripts/icon.html at 256px once → build/icon256.png (for the .ico).
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

app.whenReady().then(async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const win = new BrowserWindow({
        width: 256, height: 256, show: false, frame: false, useContentSize: true,
        webPreferences: { offscreen: true, backgroundThrottling: false },
      });
      await win.loadFile(path.join(__dirname, "icon.html"));
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(ROOT, "build", "icon256.png"), image.toPNG());
      win.destroy();
      console.log("icon256.png written");
      app.quit();
      return;
    } catch (e) {
      console.error("retry", attempt + 1, e.message);
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  app.exit(1);
});
