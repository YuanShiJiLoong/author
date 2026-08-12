#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const forbiddenPrefixes = [
  'mobile/',
  'mobile_ios/',
];

const forbiddenExact = new Set([
  'mobile',
  'mobile_ios',
]);

const forbiddenRootPatterns = [
  /^author-[^/]+(?:\/|$)/i,
  /^(?:private|internal)(?:[-_][^/]*)?(?:\/|$)/i,
];

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
  const repoRoot = process.cwd();
  const result = spawnSync(
    'git',
    ['-c', `safe.directory=${repoRoot}`, 'ls-files', '-z'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || `exit code ${result.status}`;
    throw new Error(`Unable to enumerate tracked files: ${detail}`);
  }
  const output = result.stdout;
  return output.split('\0').filter(Boolean).map((file) => file.replace(/\\/g, '/'));
}

function reasonFor(file) {
  if (forbiddenExact.has(file)) {
    return 'closed-source workspace marker';
  }
  const prefix = forbiddenPrefixes.find((item) => file.startsWith(item));
  if (prefix) {
    return `non-public path prefix "${prefix}"`;
  }
  const rootPattern = forbiddenRootPatterns.find((item) => item.test(file));
  if (rootPattern) {
    return 'non-public root workspace path';
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
  console.error('Public repository safety check failed. Remove these tracked files from the public repository:');
  for (const violation of violations) {
    console.error(`- ${violation.file} (${violation.reason})`);
  }
  process.exit(1);
}

console.log('Public repository safety check passed.');
