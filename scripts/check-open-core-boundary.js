#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const forbiddenPrefixes = [
  'mobile/',
  'mobile_ios/',
  'author-pro/',
  'reader/',
  'reader-mobile/',
  'reader-cloud/',
  'author-official-deploy/',
];

const forbiddenExact = new Set([
  'author-pro',
  'reader',
  'reader-mobile',
  'reader-cloud',
  'author-official-deploy',
]);

const forbiddenExtensions = new Set([
  '.dart',
  '.jks',
  '.keystore',
  '.p12',
  '.pfx',
]);

const forbiddenNames = new Set([
  'key.properties',
  'upload-keystore.properties',
]);

function trackedFiles() {
  const output = process.argv.includes('--stdin')
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync('.open-core-file-list', 'utf8');
  return output.split('\0').filter(Boolean).map((file) => file.replace(/\\/g, '/'));
}

function reasonFor(file) {
  if (forbiddenExact.has(file)) {
    return 'closed-source workspace marker';
  }
  const prefix = forbiddenPrefixes.find((item) => file.startsWith(item));
  if (prefix) {
    return `closed-source path prefix "${prefix}"`;
  }
  const basename = path.posix.basename(file);
  if (forbiddenNames.has(basename)) {
    return `private credential filename "${basename}"`;
  }
  const ext = path.posix.extname(file).toLowerCase();
  if (forbiddenExtensions.has(ext)) {
    return `private or mobile-only extension "${ext}"`;
  }
  return null;
}

const violations = trackedFiles()
  .map((file) => ({ file, reason: reasonFor(file) }))
  .filter((item) => item.reason);

if (violations.length > 0) {
  console.error('Open-core boundary check failed. Remove these tracked files from the public repository:');
  for (const violation of violations) {
    console.error(`- ${violation.file} (${violation.reason})`);
  }
  process.exit(1);
}

console.log('Open-core boundary check passed.');
