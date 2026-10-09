import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const root = resolve('dist');
const prefix = '/batcave-reader/';
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
};
createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(302, { Location: prefix });
    res.end();
    return;
  }
  const relative =
    decodeURIComponent(
      url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname.slice(1),
    ) || 'index.html';
  const path = resolve(root, relative);
  try {
    if (!path.startsWith(root + '/')) throw Error();
    const stat = statSync(path);
    if (!stat.isFile()) throw Error();
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(4173, '0.0.0.0', () => console.log('BATCAVE QA: http://127.0.0.1:4173/batcave-reader/'));
