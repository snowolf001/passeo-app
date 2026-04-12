## Tech constraints

- React Native 0.73.6 (do not upgrade RN, Metro, Babel, Gradle)
- Node 20.11.1
- Hermes enabled, New Architecture disabled
- TypeScript preferred
- Target: Android + iOS release

## Product goals (MVP)

- Camera scanning workflow (multi-page)
- Document edge detection + perspective crop
- Basic enhancement filters (color/grayscale/BW, contrast)
- PDF export (multi-page)
- Local document library (rename/delete/share)

## Coding rules

- Keep features modular under src/features/\*
- Avoid heavy refactors; small incremental PRs
- Prefer well-maintained RN libraries for scanning/PDF/storage
- No experimental/beta Babel packages
- Always include basic error handling and loading states
- Use npm only (no yarn, no pnpm)
