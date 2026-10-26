// Serves the bench pages: https on two origins (tours only open https) and the http launcher on a listed origin.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pages');
export const HTTPS_PORT = 8443;
/** The cross-site iframe's origin, served from the same files. */
export const OTHER_PORT = 8444;
/** A dev listing origin, so the launcher may message the extension. */
export const LAUNCH_PORT = 3001;
export const SITE = `https://localhost:${HTTPS_PORT}`;
export const LAUNCHER = `http://localhost:${LAUNCH_PORT}/launch.html`;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = url.pathname.startsWith('/spa/') ? '/spa.html' : url.pathname;
  if (file === '/') file = '/launch.html';
  const full = path.join(PAGES, path.normalize(file));
  if (!full.startsWith(PAGES) || !existsSync(full)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(full)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(full));
}

function cert(): { key: Buffer; cert: Buffer } {
  const dir = path.join(os.tmpdir(), 'sb-bench-cert');
  const key = path.join(dir, 'key.pem');
  const crt = path.join(dir, 'cert.pem');
  if (!existsSync(crt)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '30',
      '-subj',
      '/CN=localhost',
      '-keyout',
      key,
      '-out',
      crt,
    ]);
  }
  return { key: readFileSync(key), cert: readFileSync(crt) };
}

export async function startServers(): Promise<() => Promise<void>> {
  const tls = cert();
  const servers = [
    https.createServer(tls, handler).listen(HTTPS_PORT),
    https.createServer(tls, handler).listen(OTHER_PORT),
    http.createServer(handler).listen(LAUNCH_PORT),
  ];
  await Promise.all(
    servers.map((s) => new Promise((r) => s.once('listening', r)))
  );
  return async () => {
    await Promise.all(
      servers.map((s) => new Promise((r) => s.close(() => r(null))))
    );
  };
}
