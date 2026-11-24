'use strict';

/**
 * Clean Native Web-Bundle Builder for Capacitor / Cordova APK & AAB packaging.
 *
 * - Copies ONLY runtime game assets (index.html, manifest.json, privacy-policy.html, src/, assets/)
 *   into `dist-native/` (~4.2 MB total).
 * - NEVER modifies or deletes `promo/`, `android-twa/`, or backend folders.
 * - Injects `window.JELLY_NATIVE_RELEASE = true` into `dist-native/index.html` so local QA warp
 *   shortcuts (KeyT / KeyB / KeyV) are strictly disabled inside Capacitor's `https://localhost` shell.
 *
 * Usage:
 *   node scripts/build-native-www.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist-native');

const FILES_TO_COPY = [
  'index.html',
  'manifest.json',
  'privacy-policy.html'
];

const DIRS_TO_COPY = [
  'src',
  'assets'
];

function rmDirSync(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyDirRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function calcDirStats(dir) {
  let bytes = 0;
  let files = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(p).size;
      }
    }
  };
  walk(dir);
  return { files, bytes };
}

function buildNativeBundle() {
  console.log('[native-build] Cleaning dist-native/ ...');
  rmDirSync(OUT_DIR);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const rel of FILES_TO_COPY) {
    const src = path.join(ROOT, rel);
    const dst = path.join(OUT_DIR, rel);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  for (const relDir of DIRS_TO_COPY) {
    const src = path.join(ROOT, relDir);
    const dst = path.join(OUT_DIR, relDir);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, dst);
    }
  }

  // Inject production Native flag & strip Service Worker registration (unnecessary in bundled Native APK)
  const indexDst = path.join(OUT_DIR, 'index.html');
  if (fs.existsSync(indexDst)) {
    let html = fs.readFileSync(indexDst, 'utf8');
    const nativeFlagsScript =
      '  <script>window.JELLY_NATIVE_RELEASE = true; window.JELLY_API_BASE = "https://jelly-climb.netlify.app";</script>\n';
    html = html.replace('</head>', `${nativeFlagsScript}</head>`);
    // Skip Service Worker registration inside bundled Native WebView
    html = html.replace(
      /if\s*\('serviceWorker'\s*in\s*navigator\)/,
      "if (!window.JELLY_NATIVE_RELEASE && 'serviceWorker' in navigator)"
    );
    fs.writeFileSync(indexDst, html, 'utf8');
  }

  const stats = calcDirStats(OUT_DIR);
  const mb = (stats.bytes / (1024 * 1024)).toFixed(2);
  console.log(
    `[native-build] Ready! ${stats.files} runtime files (${mb} MB) written to dist-native/ (promo/ untouched).`
  );
}

buildNativeBundle();
