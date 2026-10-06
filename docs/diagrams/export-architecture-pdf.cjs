// Export the existing SVG as a single vector PDF page without changing its layout.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

async function main() {
  if (!process.argv[2]) throw new Error('Pass the Node modules directory as the first argument.');
  const moduleRoot = path.resolve(process.argv[2]);
  const runtimeRequire = createRequire(path.join(moduleRoot, '__runtime__.cjs'));
  const { chromium } = runtimeRequire('playwright');
  const basename = process.argv[3] || 'architecture';
  if (!['architecture', 'core-architecture'].includes(basename)) throw new Error('Unknown diagram name.');
  const source = fs.readFileSync(path.join(__dirname, basename + '.svg'), 'utf8');
  const model = JSON.parse(fs.readFileSync(path.join(__dirname, basename + '.json'), 'utf8'));
  const svg = source.slice(source.indexOf('<svg'));
  const dimensions = svg.match(/<svg width="([\d.]+)pt" height="([\d.]+)pt"/);
  if (!dimensions) throw new Error('SVG dimensions in points were not found.');
  const [, width, height] = dimensions;
  const output = path.resolve(__dirname, '../../output/pdf/' + (basename === 'architecture' ? 'neiroot-saas-architecture.pdf' : 'neiroot-core-architecture.pdf'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
      <title>Neiroot - ${basename === 'architecture' ? 'архитектура SaaS' : 'ядро приложения'} v${model.version}</title><style>
      @page { size: ${width}pt ${height}pt; margin: 0; }
      html, body { margin: 0; padding: 0; width: ${width}pt; height: ${height}pt; }
      body { background: #171717; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      svg { display: block; }
      </style></head><body>${svg}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: output, width: `${+width / 72}in`, height: `${+height / 72}in`,
      preferCSSPageSize: true, printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    console.log(JSON.stringify({ output, widthPt: +width, heightPt: +height }));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
