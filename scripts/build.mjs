import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const assets = ['index.html', 'css', 'js', 'fonts', 'pict', 'bgm'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of assets) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
console.log('Built DRAW! frontend in dist/');
