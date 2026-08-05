import { access, cp, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = process.cwd();
const packageRoot = resolve(root, 'node_modules/or-tools-wasm');
const source = resolve(packageRoot, 'cp-sat');
const destinationRoot = resolve(root, 'vendor/or-tools-wasm');
const destination = resolve(destinationRoot, 'cp-sat');

async function requirePath(path, label) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`${label} fehlt oder ist nicht lesbar: ${path}`);
  }
}

await requirePath(source, 'OR-Tools-CP-SAT-Paket');
await mkdir(destinationRoot, { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true, force: true, errorOnExist: false });

for (const fileName of ['LICENSE', 'README.md', 'package.json']) {
  const input = resolve(packageRoot, fileName);
  try {
    await access(input, constants.R_OK);
    await cp(input, resolve(destinationRoot, fileName), { force: true });
  } catch {
    // Metadata files differ between package releases; the runtime assets above
    // are mandatory, while missing optional documentation does not break build.
  }
}

console.log(`Prepared ${basename(destination)} at ${destination}`);
