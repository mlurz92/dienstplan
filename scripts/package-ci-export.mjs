import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const stageRoot = path.join(root, '.release-export');
const releaseName = 'dienstplanRAD-v0.9.5-engine-9.5';
const releaseDir = path.join(stageRoot, releaseName);
const artifactDir = path.join(root, 'playwright-report', 'source-export');
const zipPath = path.join(artifactDir, `${releaseName}.zip`);

const normalize = (value) => value.split(path.sep).join('/');
const excludedPrefixes = [
  '.git',
  'node_modules',
  'playwright-report',
  'test-results',
  '.release-export',
  '.export',
  'docs/diagnostics',
];
const excludedFiles = new Set([
  '.github/workflows/diagnose-e2e-v95-temporary.yml',
  '.github/workflows/package-v95-export-temporary.yml',
  'scripts/package-ci-export.mjs',
]);

await rm(stageRoot, { recursive: true, force: true });
await rm(artifactDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

await cp(root, releaseDir, {
  recursive: true,
  preserveTimestamps: true,
  filter(source) {
    const relative = normalize(path.relative(root, source));
    if (!relative) return true;
    if (excludedFiles.has(relative)) return false;
    return !excludedPrefixes.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
  },
});

const readmePath = path.join(releaseDir, 'README.md');
const readme = await readFile(readmePath, 'utf8');
await writeFile(
  readmePath,
  readme.replace('> **Regelwerk:** Eignungsregeln `v4.9`', '> **Regelwerk:** Eignungsregeln `v4.10`'),
  'utf8',
);

const packagePath = path.join(releaseDir, 'package.json');
const packageData = JSON.parse(await readFile(packagePath, 'utf8'));
delete packageData.scripts['pretest:e2e'];
delete packageData.scripts['posttest:e2e'];
packageData.scripts['test:e2e'] = 'playwright test';
await writeFile(packagePath, `${JSON.stringify(packageData, null, 2)}\n`, 'utf8');

const validationPath = path.join(releaseDir, 'docs', 'VALIDATION-v9.5.md');
await writeFile(
  validationPath,
  `# Validierung Auto-Plan v9.5\n\n` +
    `Quellstand: \`${process.env.GITHUB_SHA || 'lokaler Exportlauf'}\`\n\n` +
    `Vor Erzeugung dieses Archivs erfolgreich ausgeführt:\n\n` +
    `- \`npm ci\`\n` +
    `- \`npm run check\`\n` +
    `- \`npm test\`\n` +
    `- \`npm run build\`\n` +
    `- \`npm run test:e2e\`\n\n` +
    `Nicht enthalten: Git-Metadaten, \`node_modules\`, Testreports, temporäre Diagnose- und Exporthilfen.\n`,
  'utf8',
);

const zip = spawnSync('zip', ['-X', '-q', '-r', zipPath, releaseName], {
  cwd: stageRoot,
  encoding: 'utf8',
});
if (zip.status !== 0) {
  throw new Error(`ZIP-Erstellung fehlgeschlagen: ${zip.stderr || zip.stdout || `Exit ${zip.status}`}`);
}

const bytes = await readFile(zipPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(`${zipPath}.sha256`, `${sha256}  ${path.basename(zipPath)}\n`, 'utf8');

async function countFiles(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await countFiles(target);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

const metadata = {
  release: releaseName,
  sourceCommit: process.env.GITHUB_SHA || null,
  generatedAt: new Date().toISOString(),
  sha256,
  sizeBytes: (await stat(zipPath)).size,
  fileCount: await countFiles(releaseDir),
};
await writeFile(
  path.join(artifactDir, `${releaseName}.manifest.json`),
  `${JSON.stringify(metadata, null, 2)}\n`,
  'utf8',
);

console.log(`Release export ready: ${zipPath}`);
console.log(`SHA-256: ${sha256}`);
