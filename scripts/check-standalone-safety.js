#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

if (process.env.VERCEL === '1') {
  console.log('Standalone safety check skipped: Vercel uses its native Next.js build output.');
  process.exit(0);
}

const standaloneRoot = path.resolve('.next', 'standalone');

if (!fs.existsSync(standaloneRoot)) {
  console.error('Standalone safety check failed: .next/standalone is missing.');
  process.exit(1);
}

const forbiddenRootNames = new Set([
  '.git',
  '.agent',
  '.codex',
  '.gemini',
  '.tmp',
  'data',
  'docs',
  'logs',
  'mobile',
  'mobile_ios',
]);

const forbiddenFileNames = new Set([
  'CLAUDE.md',
  'mcp_config.json',
]);

const violations = [];

for (const entry of fs.readdirSync(standaloneRoot, { withFileTypes: true })) {
  const name = entry.name;
  if (forbiddenRootNames.has(name) || /^author-/i.test(name)) {
    violations.push(name);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    const relative = path.relative(standaloneRoot, fullPath).replace(/\\/g, '/');
    const lowerName = entry.name.toLowerCase();
    if (
      forbiddenFileNames.has(entry.name) ||
      lowerName.startsWith('.env') ||
      lowerName.endsWith('.log') ||
      lowerName.endsWith('.key') ||
      lowerName.endsWith('.pem')
    ) {
      violations.push(relative);
    }
  }
}

walk(standaloneRoot);

if (violations.length > 0) {
  console.error('Standalone safety check failed. Non-public files or directories were traced into the build:');
  for (const violation of violations.slice(0, 100)) {
    console.error(`- ${violation}`);
  }
  if (violations.length > 100) {
    console.error(`- ... and ${violations.length - 100} more`);
  }
  process.exit(1);
}

console.log('Standalone safety check passed.');
