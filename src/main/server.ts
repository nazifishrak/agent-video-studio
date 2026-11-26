import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { assertSafeChild, getProjectState, resolveVaultPaths } from './vault.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

const ALLOWED_MEDIA_EXTS = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.mp3',
  '.wav',
  '.m4a',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

export interface AssetServer {
  port: number;
  baseUrl: string;
  token: string;
  setVaultRoot: (vaultRoot: string) => void;
  close: () => Promise<void>;
}

function streamFileWithRange(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  fullPath: string,
  size: number,
  contentType: string
) {
  const isHead = req.method === 'HEAD';
  const range = req.headers.range;
  const headersBase = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=300',
  };

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : size - 1;
    if (!match[1] && match[2]) {
      const suffixLen = parseInt(match[2], 10);
      start = Math.max(0, size - suffixLen);
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      ...headersBase,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': end - start + 1,
    });
    if (isHead) {
      res.end();
      return;
    }
    const stream = fs.createReadStream(fullPath, { start, end });
    req.on('close', () => stream.destroy());
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
    return;
  }

  res.writeHead(200, {
    ...headersBase,
    'Content-Length': size,
  });
  if (isHead) {
    res.end();
    return;
  }
  const stream = fs.createReadStream(fullPath);
  req.on('close', () => stream.destroy());
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
}

export async function startAssetServer(
  initialVaultRoot: string,
  bundledResourcesDir?: string
): Promise<AssetServer> {
  let vaultRoot = initialVaultRoot;
  const authToken = crypto.randomBytes(16).toString('hex');
  let baseUrl = '';

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(reqUrl.pathname);

      // Token authentication (allow same-origin subresource fetches from authenticated /scenes/* iframes)
      const queryToken = reqUrl.searchParams.get('token');
      const headerToken = req.headers['x-studio-token'];
      const referer = req.headers.referer ?? '';
      const validToken = queryToken === authToken || headerToken === authToken;
      const validRefererScene =
        pathname.startsWith('/scenes/') &&
        baseUrl &&
        referer.startsWith(`${baseUrl}/scenes/`) &&
        referer.includes(`token=${authToken}`);

      if (!validToken && !validRefererScene) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!vaultRoot && !bundledResourcesDir) {
        res.writeHead(404);
        res.end('No vault active');
        return;
      }

      const paths = resolveVaultPaths(vaultRoot || process.cwd(), bundledResourcesDir);

      // Route 1: /scenes/* -> user custom scenes or bundled motion library
      if (pathname.startsWith('/scenes/')) {
        const rel = pathname.slice('/scenes/'.length);
        const fullPath =
          rel.startsWith('custom/') && vaultRoot
            ? assertSafeChild(
                paths.userCustomScenesDir,
                path.join(paths.userCustomScenesDir, rel.slice('custom/'.length))
              )
            : assertSafeChild(paths.motionLibraryDir, path.join(paths.motionLibraryDir, rel));

        const stat = await fsPromises.stat(fullPath);
        if (!stat.isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        streamFileWithRange(req, res, fullPath, stat.size, MIME_TYPES[ext] ?? 'application/octet-stream');
        return;
      }

      // Route 2: /project-media/<slug>/* -> media/image files inside project folder
      if (pathname.startsWith('/project-media/') && vaultRoot) {
        const rest = pathname.slice('/project-media/'.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx <= 0) {
          res.writeHead(400);
          res.end('Invalid media path');
          return;
        }
        const slug = rest.slice(0, slashIdx);
        const relMedia = rest.slice(slashIdx + 1);
        const ext = path.extname(relMedia).toLowerCase();
        if (!ALLOWED_MEDIA_EXTS.has(ext)) {
          res.writeHead(403);
          res.end('Unsupported file type');
          return;
        }
        const projectDir = assertSafeChild(paths.projectsDir, path.join(paths.projectsDir, slug));
        const fullPath = assertSafeChild(projectDir, path.join(projectDir, relMedia));
        const stat = await fsPromises.stat(fullPath);
        if (!stat.isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        streamFileWithRange(req, res, fullPath, stat.size, MIME_TYPES[ext] ?? 'application/octet-stream');
        return;
      }

      // Route 3: /project-asset/<slug>/<assetId> -> registered external or relative MediaAsset
      if (pathname.startsWith('/project-asset/') && vaultRoot) {
        const rest = pathname.slice('/project-asset/'.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx <= 0) {
          res.writeHead(400);
          res.end('Invalid asset path');
          return;
        }
        const slug = rest.slice(0, slashIdx);
        const assetId = rest.slice(slashIdx + 1);
        const state = await getProjectState(vaultRoot, slug);
        const asset = state.editPlan.assets.find((a) => a.id === assetId);
        if (!asset) {
          res.writeHead(404);
          res.end('Asset not found');
          return;
        }
        const projectDir = assertSafeChild(paths.projectsDir, path.join(paths.projectsDir, slug));
        let targetPath = asset.uri;
        if (targetPath.startsWith('file://')) {
          targetPath = decodeURIComponent(targetPath.slice('file://'.length));
        } else if (!path.isAbsolute(targetPath)) {
          targetPath = assertSafeChild(projectDir, path.join(projectDir, targetPath));
        }
        const ext = path.extname(targetPath).toLowerCase();
        if (!ALLOWED_MEDIA_EXTS.has(ext)) {
          res.writeHead(403);
          res.end('Unsupported asset type');
          return;
        }
        const stat = await fsPromises.stat(targetPath);
        if (!stat.isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        streamFileWithRange(req, res, targetPath, stat.size, MIME_TYPES[ext] ?? 'application/octet-stream');
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch {
      if (!res.headersSent) {
        res.writeHead(404);
      }
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    baseUrl,
    token: authToken,
    setVaultRoot: (nextRoot: string) => {
      vaultRoot = nextRoot;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
