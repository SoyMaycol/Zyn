#!/usr/bin/env node
const { readdirSync, statSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function extname(file) {
  const index = file.lastIndexOf('.');
  return index === -1 ? '' : file.slice(index);
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, files);
    } else if (EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = collectFiles(process.cwd()).sort();
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push({ file, output: result.stderr || result.stdout });
  }
}

for (const failure of failures) {
  console.error(`Syntax check failed: ${failure.file}`);
  console.error(failure.output.trim());
}

console.log(`Checked ${files.length} JavaScript files.`);
process.exit(failures.length ? 1 : 0);
