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
 *
 * Called from two places, which is why `--optional` exists. From the build it
 * must succeed, because the client has to exist before webpack resolves it. From
 * `postinstall` it is a convenience for local development, and it runs at a point
 * where Vercel has not finished placing dependencies — so a failure there is not
 * an error, it just means the build will do it.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const optional = process.argv.includes('--optional');

let cli;
try {
  cli = require.resolve('prisma/build/index.js');
} catch {
  const message = 'the prisma package is not resolvable yet';
  if (optional) {
    console.log(`Skipping Prisma generate: ${message}. The build step will run it.`);
    process.exit(0);
  }
  console.error(`Cannot generate the Prisma client: ${message}.`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [cli, 'generate', '--schema', resolve(repoRoot, 'server/prisma/schema.prisma')],
  { stdio: 'inherit', cwd: repoRoot },
);

process.exit(optional ? 0 : (result.status ?? 1));
