#!/usr/bin/env node
/**
 * ASTER — tiny zero-dependency static file server (for local use).
 * Usage:  node serve.mjs [port]     → http://localhost:4173
 * The app is fully local: all data lives in your browser (IndexedDB).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const argPort = Number(process.argv.find((a) => /^\d+$/.test(a)) || process.env.PORT || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    let file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html"); // SPA fallback
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(500).end("Server error");
  }
});

server.listen(argPort, () => {
  console.log(`\n  ✦ ASTER is running\n`);
  console.log(`  Local:   http://localhost:${argPort}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs) {
      if (a.family === "IPv4" && !a.internal) console.log(`  Network: http://${a.address}:${argPort}  (open on your phone)`);
    }
  }
  console.log(`\n  Data stays in your browser. Stop with Ctrl+C.\n`);
});
