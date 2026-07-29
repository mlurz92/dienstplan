# DienstplanRAD

Cloudflare-Pages-Anwendung für den manuellen radiologischen Dienstplan.

## Kernmerkmale

- Manuelle BD-/HG-Einteilung
- RBN rein manuell und getrennt
- Live-Regelprüfung mit Grün/Gelb/Orange/Rot
- Pflichtbestätigung bei roten Konflikten
- Cloud-Speicherung in Workers KV
- JSON-Backup
- Excel-Import für die Jahresplanerstruktur 2025/2026
- Excel-Export und A4-PDF über die Druckansicht

## Cloudflare Pages

- GitHub-Repository: `mlurz92/dienstplan`
- Produktionsbranch: `main`
- Pages-Projekt: `dienstplanrad`
- Produktionsadresse: `https://dienstplanrad.pages.dev`
- KV Binding: `DIENSTPLAN_KV`
- KV Namespace: `dienstplanrad-kv`

## Struktur

- `/index.html` – Anwendung
- `/styles.css` – Liquid-Glass-Oberfläche
- `/js/*.js` – Frontendlogik
- `/functions/api/*` – Cloudflare Pages Functions

## Deployment

Cloudflare Pages übernimmt jeden Commit auf `main` automatisch. Das KV-Binding `DIENSTPLAN_KV` muss im Pages-Projekt auf den Namespace `dienstplanrad-kv` zeigen.
