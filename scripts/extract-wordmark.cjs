// Exact pixel extraction requested by the user; retain the original letter shapes.
const sharp = require('../tools/diagrams/node_modules/sharp');
const fs = require('node:fs/promises');
const path = require('node:path');

async function removeLightMatte(png) {
  const {data, info} = await sharp(png).raw().toBuffer({resolveWithObject: true});
  const {width, height, channels} = info;
  const inkChroma = Array(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      inkChroma[x] = Math.max(inkChroma[x], data[i + 2] - data[i]);
    }
  }

  const matte = [244, 245, 247];
  const matteChroma = matte[2] - matte[0];
  const original = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (!data[i + 3]) continue;

      const nearEdge = [-1, 0, 1].some(dy =>
        [-1, 0, 1].some(dx => {
          const column = x + dx;
          const row = y + dy;
          return column < 0 || column >= width || row < 0 || row >= height ||
            original[(row * width + column) * channels + 3] < 255;
        }),
      );
      if (!nearEdge) continue;

      // The original gradient runs horizontally. Nearby columns also cover
      // the tips of strokes, where a single column can contain only edge pixels.
      const localChroma = Math.max(...inkChroma.slice(Math.max(0, x - 2), x + 3));
      const coverage = (data[i + 2] - data[i] - matteChroma) / (localChroma - matteChroma);
      if (coverage >= 0.9) continue;

      // Undo the original light background on the anti-aliased edge.
      for (let channel = 0; channel < 3; channel++) {
        const color = (data[i + channel] - (1 - coverage) * matte[channel]) / coverage;
        data[i + channel] = Math.round(Math.max(0, Math.min(255, color)));
      }
      data[i + 3] = Math.round(Math.min(data[i + 3], 255 * coverage));
    }
  }
  return sharp(data, {raw: info}).png().toBuffer();
}

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
  await fs.writeFile(path.join(root, 'apps/web/public/neiroot-wordmark-dark.png'), await removeLightMatte(png));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
