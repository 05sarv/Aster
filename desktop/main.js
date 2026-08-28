// ASTER desktop shell (Electron).
// Serves the plain web app from a custom aster:// protocol — no ports, no server,
// stable storage origin (localStorage/IndexedDB persist across app updates).
import { app, BrowserWindow, protocol, session, shell, dialog, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dev: project root. Packaged: .../resources/app.asar (fs reads asar transparently).
const APP_ROOT = app.getAppPath();

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".txt": "text/plain", ".woff": "font/woff", ".woff2": "font/woff2",
};

// Must be called before app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: "aster", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId("app.aster.desktop"); // correct Windows toast attribution
    Menu.setApplicationMenu(null);

    protocol.handle("aster", async (request) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      if (!pathname || pathname === "/") pathname = "/index.html";
      const file = path.join(APP_ROOT, pathname);
      if (!file.startsWith(APP_ROOT + path.sep) && file !== APP_ROOT) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        const data = await fs.promises.readFile(file);
        const mime = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
        return new Response(new Uint8Array(data), { headers: { "Content-Type": mime } });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });

    const win = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 680,
      minHeight: 560,
      backgroundColor: "#faf7f2",
      autoHideMenuBar: true,
      show: false,
      title: "ASTER",
    });
    win.loadURL("aster://app/index.html");
    win.once("ready-to-show", () => win.show());

    // Relay renderer console to terminal during development.
    if (!app.isPackaged) {
      win.webContents.on("console-message", (event) => {
        const msg = typeof event === "object" && event.message !== undefined ? event.message : arguments[2];
        if (msg) console.log("[renderer]", msg);
      });
    }

    // Open external http(s) links in the system browser, never in-app.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });

    // Backup export (blob <a download>) → real save dialog + reveal in folder.
    session.defaultSession.on("will-download", (event, item) => {
      item.setSaveDialogOptions({
        defaultPath: path.join(app.getPath("downloads"), item.getFilename()),
      });
      item.once("done", (e, state) => {
        if (state === "completed" && item.getSavePath()) {
          shell.showItemInFolder(item.getSavePath());
        }
      });
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) app.emit("ready");
    });
  });
}

app.on("window-all-closed", () => app.quit());
