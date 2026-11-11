import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoots = new Set(['css', 'js', 'fonts', 'pict', 'bgm']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wav': 'audio/wav'
};

const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const segments = relative.split('/');
    if (segments.some(segment => segment === '..' || segment.includes('\\')) ||
        (relative !== 'index.html' && !publicRoots.has(segments[0]))) {
      response.writeHead(404).end('Not found');
      return;
    }
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root) || !(await stat(filename)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filename).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400).end('Not found');
  }
});

server.listen(1420, '127.0.0.1', () => {
  console.log('DRAW! development server: http://localhost:1420');
});
server.on('error', error => {
  console.error(`Cannot start development server: ${error.message}`);
  process.exitCode = 1;
});
