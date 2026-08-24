#!/usr/bin/env node
/**
 * Generate the Prisma client without depending on PATH or on `node_modules/.bin`.
 *
 * Three attempts at this failed on Vercel with `prisma: command not found`:
 * a bare `prisma`, then declaring it at the root, then `npx --yes prisma`. All
 * three resolve through `node_modules/.bin`, and that symlink is simply absent
 * in Vercel's install — reproduced locally by deleting it, which turns every one
 * of those into the same error.
 *
 * Node's own module resolution does not care about `.bin`: it looks the package
 * up the way `import` would, from here upwards, which works whether npm hoisted
 * `prisma` to the repo root or left it nested in a workspace.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let cli;
try {
  cli = require.resolve('prisma/build/index.js');
} catch {
  console.error(
    'Could not find the prisma package. It is a dependency of the root ' +
      'package.json, so this means the install did not complete.',
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [cli, 'generate', '--schema', resolve(repoRoot, 'server/prisma/schema.prisma')],
  { stdio: 'inherit', cwd: repoRoot },
);

process.exit(result.status ?? 1);
