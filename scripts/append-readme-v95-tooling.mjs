import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../README.md', import.meta.url);
const marker = '<!-- v95-toolchain -->';
const section = `

${marker}
## 17. Build-, Typ- und Testwerkzeuge v9.5

Die Produktionsanwendung bleibt frameworkfrei. Ein schmaler, reproduzierbarer Build-Layer erzeugt ausschließlich die lokal ausgelieferten Browser-Abhängigkeiten und prüft die typisierten Solvergrenzen.

| Baustein | Version | Aufgabe | Lizenz |
| --- | ---: | --- | --- |
| \`or-tools-wasm\` | \`0.9.1\` | lokaler CP-SAT-WebAssembly-Kern im Modul-Worker | Apache-2.0 |
| Vite | \`8.1.5\` | deterministischer ESM-Library-Build für Browser-Vendorcode | MIT |
| TypeScript | \`7.0.2\` | strikte Typprüfung der Solver-, Zertifikat- und Vendorgrenzen | Apache-2.0 |
| \`fast-check\` | \`4.9.0\` | Property-Based Tests mathematischer Invarianten | MIT |
| Floating UI DOM | \`1.8.0\` | kollisionsfreie, viewportgebundene Rich-Tooltip-Positionierung | MIT |
| Playwright | \`1.61.1\` | Browser-, Layout-, Theme- und Workerregressionen | Apache-2.0 |

### Reproduzierbarer Build

\`\`\`bash
npm ci
npm run build
\`\`\`

\`npm run build\` führt nacheinander aus:

1. Kopieren des exakt gepinnten CP-SAT-Pakets nach \`vendor/or-tools-wasm/cp-sat\`;
2. Tree-Shaking von Floating UI zu \`vendor/floating-ui/floating-ui-dom.js\`;
3. strikte TypeScript-Prüfung ohne Emit.

Für Cloudflare Pages lautet der Build-Befehl \`npm run build\`; das Ausgabeverzeichnis bleibt das Repository-Root. Die Anwendung lädt im Betrieb ausschließlich die versionierten lokalen Vendorpfade. Externe CDN-Quellen sind nur ein kontrollierter Solver-Fallback, niemals Voraussetzung für den Regelbetrieb.

### Qualitätsprüfungen

\`\`\`bash
npm run check
npm run typecheck
npm test
npm run test:e2e
\`\`\`

Die Property-Based Tests prüfen insbesondere:

- Unabhängigkeit des mathematischen Modells von der Personalreihenfolge;
- ausschließlich personenbezogene Summation von BD-Obergrenzen;
- binäre, linear gewichtete Split-Wochenendindikatoren;
- reproduzierbare Seeds und schrumpfbare Gegenbeispiele.
`;

const current = await readFile(path, 'utf8');
if (!current.includes(marker)) await writeFile(path, `${current.trimEnd()}${section}\n`, 'utf8');
