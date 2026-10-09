import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('public/pdf', { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs'])
  cpSync(`node_modules/pdfjs-dist/${dir}`, `public/pdf/${dir}`, { recursive: true });
