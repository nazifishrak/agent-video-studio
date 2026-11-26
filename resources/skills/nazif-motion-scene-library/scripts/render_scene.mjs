#!/usr/bin/env node
/**
 * Render any decoupled motion scene from scenes/*.html into a deterministic 1080p/4K MP4
 * or transparent ProRes 4444 / WebM motion plate.
 *
 * Usage:
 *   node scripts/render_scene.mjs --scene scenes/01-kinetic-hook-mask.html --out out/hook.mp4
 *   node scripts/render_scene.mjs --scene scenes/01-kinetic-hook-mask.html --design themes/linear-dark.design.md --props '{"line1":"Ship faster","line2":"without the chaos"}' --fps 30 --out out/hook.mp4
 *   node scripts/render_scene.mjs --scene scenes/06-lower-third-clean.html --transparent --width 3840 --height 2160 --out out/lower-third.mov
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = { fps: 30, width: 1920, height: 1080, transparent: false, mode: 'light' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scene') args.scene = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--design') args.design = argv[++i];
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--props') args.props = argv[++i];
    else if (a === '--fps') args.fps = Number(argv[++i]);
    else if (a === '--width') args.width = Number(argv[++i]);
    else if (a === '--height') args.height = Number(argv[++i]);
    else if (a === '--transparent') args.transparent = true;
  }
  if (!args.scene || !args.out) {
    console.error('Usage: node scripts/render_scene.mjs --scene <path> --out <output.mp4|mov> [--design DESIGN.md] [--props JSON] [--fps 30] [--width 1920] [--height 1080] [--transparent]');
    process.exit(1);
  }
  return args;
}

function parseDesignTokensFromMd(designPath) {
  const raw = fs.readFileSync(path.resolve(designPath), 'utf8');
  const tokens = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[-*]\s+)?`?([a-z0-9_]+)`?\s*:\s*["']?([^"'\r\n]+?)["']?\s*$/i);
    if (m) {
      tokens[m[1]] = m[2].trim();
    }
  }
  return tokens;
}

async function main() {
  const args = parseArgs(process.argv);
  const _here = path.dirname(fileURLToPath(import.meta.url));
  const designTokens = args.design ? parseDesignTokensFromMd(args.design) : null;

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright not found. Install once on your machine: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  const sysChrome = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch(sysChrome ? { executablePath: sysChrome } : {});
  const page = await browser.newPage({ viewport: { width: args.width, height: args.height }, deviceScaleFactor: 1 });

  const sceneUrl = new URL(pathToFileURL(path.resolve(args.scene)).href);
  sceneUrl.searchParams.set('manual', '1');
  sceneUrl.searchParams.set('w', String(args.width));
  sceneUrl.searchParams.set('h', String(args.height));
  if (args.transparent) sceneUrl.searchParams.set('transparent', '1');

  await page.goto(sceneUrl.href, { waitUntil: 'networkidle' });
  if (designTokens) {
    await page.evaluate((t) => window.applyDesignTokens && window.applyDesignTokens(t), designTokens);
  }
  if (args.props) {
    const parsedProps = fs.existsSync(args.props) ? JSON.parse(fs.readFileSync(args.props, 'utf8')) : JSON.parse(args.props);
    await page.evaluate((p) => window.setProps && window.setProps(p), parsedProps);
  }

  const meta = await page.evaluate(() => window.SCENE_META);
  const totalFrames = Math.ceil(meta.duration * args.fps);
  console.log(`Rendering ${meta.id} (${meta.duration}s @ ${args.fps}fps ${args.width}x${args.height} = ${totalFrames} frames) -> ${args.out}`);

  const ffmpegArgs = args.transparent
    ? ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(args.fps), '-i', '-', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', path.resolve(args.out)]
    : ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(args.fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', path.resolve(args.out)];

  const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let f = 0; f < totalFrames; f++) {
    const t = f / args.fps;
    await page.evaluate((sec) => window.renderFrame(sec), t);
    const png = await page.screenshot({ type: 'png', omitBackground: args.transparent });
    ff.stdin.write(png);
  }

  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
  await browser.close();
  console.log(`Done: ${args.out}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
