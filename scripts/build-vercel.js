'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const file of ['index.html', 'manifest.json', 'privacy-policy.html', 'sw.js']) {
  const srcPath = path.join(ROOT, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(DIST, file));
  }
}

const wellKnownDir = path.join(ROOT, '.well-known');
if (fs.existsSync(wellKnownDir)) {
  copyDir(wellKnownDir, path.join(DIST, '.well-known'));
}

const srcDir = path.join(ROOT, 'src');
if (fs.existsSync(srcDir)) {
  copyDir(srcDir, path.join(DIST, 'src'));
}

const assetsDir = path.join(ROOT, 'assets');
if (fs.existsSync(assetsDir)) {
  copyDir(assetsDir, path.join(DIST, 'assets'));
}

console.log('[build] Static game assets copied to dist/ successfully.');
