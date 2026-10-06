// Exact pixel extraction requested by the user; retain the original letter shapes.
const sharp = require('../tools/diagrams/node_modules/sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const root = path.resolve(__dirname, '..');
  const {data, info} = await sharp(path.join(root, 'docs/design/brand/neiroot-logo-source.png'))
    .extract({left: 55, top: 305, width: 395, height: 80}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  for (let i = 0; i < data.length; i += 4) {
    const chroma = data[i + 2] - data[i];
    data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (chroma - 8) / 24)));
  }
  const png = await sharp(data, {raw: info}).trim({background: '#00000000'}).png().toBuffer();
  for (const target of ['docs/design/brand/neiroot-wordmark.png', 'apps/web/public/neiroot-wordmark.png', 'infra/keycloak/themes/neiroot/login/resources/img/neiroot-wordmark.png']) {
    await fs.writeFile(path.join(root, target), png);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
