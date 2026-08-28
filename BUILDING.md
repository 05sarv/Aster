# Building ASTER — Windows .exe & Android .apk

ASTER is a plain static web app at heart. The same `index.html` + `src/` + `styles/`
are wrapped three ways:

| Output | Wrapper | How it serves the app | Data lives in |
|---|---|---|---|
| `releases/ASTER.exe` (~1.1 MB) | Native WebView2 shell (`desktop/Program.cs`) | app served from `https://app.aster` (virtual host) | `%LOCALAPPDATA%\ASTER` (survives updates) |
| `releases/ASTER-1.0.apk` | WebView (`android/src/…/MainActivity.java`) | assets served from `https://appassets.androidplatform.net` | Android app data |
| *(optional)* Electron portable (~93 MB) | `desktop/main.js` via `npm run build:exe-full` | custom `aster://app` protocol | `%APPDATA%\ASTER` |

The **Windows exe is a single ~1.1 MB file**: a C# WinForms host (compiled with the
in-box .NET Framework compiler — no toolchain download) that uses the system
WebView2 runtime (installed via Edge on Windows 10/11) instead of bundling
Chromium. The web app, the WebView2 DLLs and the native loader are all embedded
in the exe and extracted to `%LOCALAPPDATA%\ASTER` on first run. If you need a
self-contained exe that works even without WebView2, `npm run build:exe-full`
builds the 93 MB Electron variant (different storage origin — move data with a
Settings → Export/Import backup).

Both wrappers are ~1 file of glue each. The app code is never duplicated —
the build scripts copy `index.html`, `src/` and `styles/` in at package time.

## Making changes (the normal workflow)

1. Edit the web app — `src/**`, `styles/**`, `index.html` — exactly as before.
2. Rebuild one or both packages:

```bash
npm run build:exe     # → releases/ASTER.exe   (~1.1 MB native WebView2 shell, single file)
npm run build:apk     # → releases/ASTER-<v>.apk (signed, updates over itself)
npm run build         # both
```

Changes to native behavior live in the wrappers:
- Windows: `desktop/Program.cs` (native shell: virtual host, save dialogs, single instance) or `desktop/main.js` (Electron variant)
- Android: `android/src/com/aster/app/MainActivity.java` (asset server, file picker, backup-save shim)

## Version bumps

- **Windows**: `version` in `package.json` (shown as file version on the exe).
- **Android**: `android:versionCode` + `android:versionName` in `android/AndroidManifest.xml`.
  Always bump `versionCode` when shipping an update so Android allows installing over
  the old one (the signing key stays the same → updates install cleanly).

## Icons

`scripts/icon.html` is the single source for the icon. Edit it, then:

```bash
npm run icons          # regenerates build/icon.png + all android mipmaps
```

## One-time setup (already done on this machine)

```bash
npm i -D electron electron-builder   # done — in devDependencies
npm run toolchain                    # JDK 17 + Android SDK → %LOCALAPPDATA%\aster-toolchain
```

The toolchain lives outside the project (~700 MB) and is only needed for APK builds.
`npm run toolchain` re-verifies/reprovisions it on a fresh machine (expects
`jdk17.zip` + `cmdtools.zip` in the toolchain folder).

## Signing notes (personal-use)

- The .exe is **unsigned** — Windows SmartScreen will show "Windows protected your PC";
  click *More info → Run anyway*.
- The .apk is signed with a personal key generated at `android/aster.keystore`
  (pass: `aster-keep-out`). Keep this file — losing it means the next build can't
  install over the previous one. Not Play-Store compatible (that needs a real
  release process); install via "install unknown apps" on the phone.

## Data & backups inside the wrappers

- Export/Import in Settings works in both: on Windows it opens a save dialog and
  reveals the file; on Android it uses the system file picker ("Save as…").
- Photo picking works in both (system file/image pickers).
- Desktop notifications work on Windows; on Android reminders stay in-app
  (Web Notifications aren't supported by Android WebView — notify.js degrades gracefully).
- Moving data between phone/PC/browser: Settings → Export backup → Import on the other device.

## Development

```bash
npm start             # web dev as before → http://localhost:4173
npm run electron:dev  # desktop shell with live source + renderer console relayed
```

## Build internals (APK, for reference)

No Gradle: `scripts/build-android.mjs` runs aapt2 → javac → d8 → jar → zipalign → apksigner
directly (a few seconds per build). Assets are added via the JDK `jar` tool because
aapt2's `-A` flag writes backslash entry names on Windows, which Android cannot read.
