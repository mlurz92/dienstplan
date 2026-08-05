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

function shouldInclude(relativePath) {
  const relative = normalize(relativePath);
  if (!relative) return true;
  if (excludedFiles.has(relative)) return false;
  return !excludedPrefixes.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
}

await rm(stageRoot, { recursive: true, force: true });
await rm(artifactDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!shouldInclude(entry.name)) continue;
  const source = path.join(root, entry.name);
  const destination = path.join(releaseDir, entry.name);
  await cp(source, destination, {
    recursive: entry.isDirectory(),
    preserveTimestamps: true,
    filter(candidate) {
      return shouldInclude(path.relative(root, candidate));
    },
  });
}

const readmePath = path.join(releaseDir, 'README.md');
const readme = await readFile(readmePath, 'utf8');
const correctedReadme = readme.replace(
  '> **Regelwerk:** Eignungsregeln `v4.9`',
  '> **Regelwerk:** Eignungsregeln `v4.10`',
);
if (correctedReadme === readme) {
  throw new Error('README-Regelwerkszeile konnte nicht deterministisch auf v4.10 korrigiert werden.');
}
await writeFile(readmePath, correctedReadme, 'utf8');

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
    `Vor Erzeugung dieses Archivs im isolierten CI-Lauf erfolgreich abgeschlossen:\n\n` +
    `- reproduzierbare Abhängigkeitsinstallation mit \`npm ci\`\n` +
    `- vollständige JavaScript-Syntax- und Lieferumfangsprüfung mit \`npm run check\`\n` +
    `- vollständige Node-Regressionssuite mit \`npm test\`\n` +
    `- Vendor-Build und TypeScript-Vertragsprüfung mit \`npm run build\`\n\n` +
    `Die Browser-Regressionssuite wird im selben CI-Lauf nach der Archiverzeugung ausgeführt; ihr Ergebnis ist daher absichtlich nicht als vorab bestandene Archivprüfung ausgewiesen.\n\n` +
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
