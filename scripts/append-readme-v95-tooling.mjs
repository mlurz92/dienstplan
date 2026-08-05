import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../README.md', import.meta.url);
const marker = '<!-- v95-toolchain -->';
const section = `

${marker}
## 17. Build-, Typ- und Testwerkzeuge v9.5

Die Produktionsanwendung bleibt frameworkfrei. Ein schmaler, reproduzierbarer Build-Layer erzeugt ausschließlich deploybare Browser-Abhängigkeiten und prüft die typisierten Solvergrenzen.

| Baustein | Version | Aufgabe | Lizenz |
| --- | ---: | --- | --- |
| \`or-tools-wasm\` | \`0.9.1\` | primärer CP-SAT-WebAssembly-Kern im Modul-Worker | Apache-2.0 |
| \`cpsat-js\` | \`1.0.0\` | kostenfreier, einsträngiger CP-SAT-Laufzeitfallback | MIT |
| Vite | \`8.1.5\` | deterministischer ESM-Build für lokal ausgelieferten Vendorcode | MIT |
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

1. Tree-Shaking von Floating UI zu \`vendor/floating-ui/floating-ui-dom.js\`;
2. strikte TypeScript-Prüfung der Solver-API und Ergebnisverträge ohne Emit.

Der vollständige Browser-Build von \`or-tools-wasm\` enthält mehrere WASM-Laufzeitvarianten und überschreitet die 25-MiB-Grenze eines einzelnen Cloudflare-Pages-Assets. Der Worker lädt deshalb die exakt gepinnte freie Version \`or-tools-wasm@0.9.1\` über jsDelivr; bei Lade- oder Kompatibilitätsfehlern folgen \`cpsat-js@1.0.0\` und anschließend die vollständig lokale v8.5-Heuristik. Es gibt keine kostenpflichtige Solver- oder Serverabhängigkeit.

Für Cloudflare Pages lautet der Build-Befehl \`npm run build\`; das Ausgabeverzeichnis bleibt das Repository-Root.

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
