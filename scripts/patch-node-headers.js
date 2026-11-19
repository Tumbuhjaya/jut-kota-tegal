#!/usr/bin/env node
// Patch header V8 (Node >= 24) di cache node-gyp agar addon native (mis. deasync)
// bisa di-compile dengan Apple clang 14 (macOS Monterey) yang libc++-nya belum punya std::ranges.
// Blok specialization std::ranges::enable_view hanya dipakai bila compiler benar-benar mendukung ranges.
const fs = require('fs');
const path = require('path');
const os = require('os');

if (process.platform !== 'darwin') process.exit(0);

const version = process.versions.node;
const cacheRoot = process.env.npm_config_devdir ||
  path.join(os.homedir(), 'Library', 'Caches', 'node-gyp');
const file = path.join(cacheRoot, version, 'include', 'node', 'v8-memory-span.h');

if (!fs.existsSync(file)) {
  console.log('[patch-node-headers] header belum ada, unduh dulu: npx node-gyp install');
  process.exit(0);
}

const before = '#if __has_include(<ranges>)\n#include <ranges>';
const after = '#if __has_include(<ranges>) && defined(__cpp_lib_ranges)\n#include <ranges>';
const src = fs.readFileSync(file, 'utf8');

if (src.includes(after)) {
  console.log('[patch-node-headers] sudah di-patch:', file);
} else if (src.includes(before)) {
  fs.writeFileSync(file, src.replace(before, after));
  console.log('[patch-node-headers] berhasil patch:', file);
} else {
  console.log('[patch-node-headers] pola tidak ditemukan, dilewati:', file);
}
