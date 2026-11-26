#!/usr/bin/env node
/**
 * render.mjs — Render any EditPlan JSON directly to MP4 without copying large source videos.
 * Starts an ephemeral local HTTP Range server for local files referenced in edit-plan.json.
 *
 * Usage:
 *   node engine/render.mjs <edit-plan.json> <output.mp4> [--preview] [--crf 18]
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const crfIdx = args.indexOf('--crf');
const crf = crfIdx >= 0 ? args[crfIdx + 1] : preview ? '26' : '18';
const positional = args.filter(
  (a, i) => a !== '--preview' && (crfIdx < 0 || (i !== crfIdx && i !== crfIdx + 1))
);

if (positional.length < 2) {
  console.error('Usage: node engine/render.mjs <edit-plan.json> <output.mp4> [--preview] [--crf 18]');
  process.exit(1);
}

const planPath = path.resolve(positional[0]);
const outPath = path.resolve(positional[1]);
const planDir = path.dirname(planPath);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

// Map local file paths to ephemeral HTTP Range server routes
const mediaMap = new Map();
let mediaCounter = 0;

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  return 'application/octet-stream';
}

function registerLocal(src, baseUrl) {
  if (!src || /^https?:\/\//i.test(src)) return src;
  const resolved = path.isAbsolute(src) ? src : path.resolve(planDir, src);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Referenced media file not found: ${resolved}`);
  }
  const id = `m${mediaCounter++}${path.extname(resolved)}`;
  mediaMap.set(id, resolved);
  return `${baseUrl}/${id}`;
}

function startMediaServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const id = (req.url || '').replace(/^\/+/, '').split('?')[0];
      const filePath = mediaMap.get(id);
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const stat = fs.statSync(filePath);
      const total = stat.size;
      const mime = mimeFor(filePath);
      const range = req.headers.range;

      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        const start = match ? parseInt(match[1], 10) : 0;
        const end = match && match[2] ? parseInt(match[2], 10) : total - 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': mime,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': total,
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(filePath).pipe(res);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function detectBrowser() {
  const candidates = [
    process.env.REMOTION_BROWSER_EXECUTABLE,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

async function main() {
  const { server, baseUrl } = await startMediaServer();

  const rewritten = structuredClone(plan);
  rewritten.sourceVideo = registerLocal(rewritten.sourceVideo, baseUrl);
  if (Array.isArray(rewritten.broll)) {
    rewritten.broll = rewritten.broll.map((b) => ({
      ...b,
      source: registerLocal(b.source, baseUrl),
    }));
  }

  const tmpProps = path.join(os.tmpdir(), `edit_props_${Date.now()}.json`);
  fs.writeFileSync(tmpProps, JSON.stringify({ plan: rewritten }));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const remotionBin = path.join(__dirname, 'node_modules', '.bin', 'remotion');
  const cmdArgs = [
    'render',
    'src/index.ts',
    'AIVideoEdit',
    outPath,
    '--props',
    tmpProps,
    '--crf',
    String(crf),
    '--codec',
    'h264',
    '--pixel-format',
    'yuv420p',
  ];

  if (preview) {
    cmdArgs.push('--scale', '0.5');
  }

  const browser = detectBrowser();
  if (browser) {
    cmdArgs.push('--browser-executable', browser);
  }

  console.log(`==> Rendering ${preview ? 'PREVIEW (50%)' : 'MASTER'} -> ${outPath}`);
  const child = spawn(remotionBin, cmdArgs, { cwd: __dirname, stdio: 'inherit' });

  child.on('exit', (code) => {
    try { fs.unlinkSync(tmpProps); } catch {}
    server.close();
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
