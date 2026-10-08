import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const output = resolve(root, 'output');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');

async function readAsset(asset) {
  const path = resolve(dist, asset.replace(/^\//, ''));
  if (!path.startsWith(dist + sep)) throw new Error('Unexpected build asset path.');
  return readFile(path, 'utf8');
}

function dataUrl(mime, contents) {
  return `data:${mime};base64,${Buffer.from(contents).toString('base64')}`;
}

const scriptTag = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;
const scripts = [...html.matchAll(scriptTag)];
if (scripts.length !== 1) throw new Error('Expected a single bundled entry script.');

let script = await readAsset(scripts[0][1]);
const mapUrl = dataUrl('image/svg+xml', await readAsset('/istanbul-map.svg'));
if (!script.includes('"/istanbul-map.svg"')) throw new Error('Offline map was not found in the built entry.');
script = script.replaceAll('"/istanbul-map.svg"', JSON.stringify(mapUrl));
for (const match of [...script.matchAll(/"(\/photos\/[^"\s]+\.webp)"/g)]) {
  const buffer = await readFile(resolve(dist, match[1].replace(/^\//, '')));
  script = script.replaceAll(match[0], JSON.stringify(dataUrl('image/webp', buffer)));
}
html = html.replace(scripts[0][0], () => `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>`);

const stylesheetTag = /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g;
for (const match of [...html.matchAll(stylesheetTag)]) {
  let css = await readAsset(match[1]);
  // Inline emitted images/fonts if a future build stops using data URLs.
  for (const asset of [...css.matchAll(/url\(["']?(\/assets\/[^)"']+)["']?\)/g)]) {
    const extension = asset[1].split('.').at(-1);
    const mime = { png: 'image/png', svg: 'image/svg+xml', woff: 'font/woff', woff2: 'font/woff2' }[extension];
    if (!mime) throw new Error(`Unsupported CSS preview asset: ${extension}`);
    const buffer = await readFile(resolve(dist, asset[1].replace(/^\//, '')));
    css = css.replaceAll(asset[0], `url("${dataUrl(mime, buffer)}")`);
  }
  html = html.replace(match[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}

html = html.replace(/<link\b[^>]*rel="(?:manifest|apple-touch-icon|modulepreload)"[^>]*>/g, '');
const icon = dataUrl('image/svg+xml', await readAsset('/icon.svg'));
html = html.replace(/<link\b[^>]*rel="icon"[^>]*>/g, () => `<link rel="icon" href="${icon}" />`);
html = html.replace('<head>', '<head>\n<meta name="travelbuddy-preview" content="standalone" />');
html = html.replace('<title>', '<!-- Standalone desktop preview: no installation or local server required. -->\n<title>');

await mkdir(output, { recursive: true });
const path = resolve(output, 'TravelBuddy-preview.html');
await writeFile(path, html);
console.log(`Standalone preview saved: ${path}`);
