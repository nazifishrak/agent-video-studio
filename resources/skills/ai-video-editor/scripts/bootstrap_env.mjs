#!/usr/bin/env node
/**
 * Environment checker and auto-bootstrap helper for Agent Video Studio.
 *
 * Usage:
 *   node bootstrap_env.mjs --check
 *   node bootstrap_env.mjs --install-hyperframes
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function runQuick(cmd, args) {
  try {
    const res = spawnSync(cmd, args, { encoding: 'utf8', timeout: 8000 });
    return {
      ok: res.status === 0,
      stdout: (res.stdout || '').trim(),
      stderr: (res.stderr || '').trim(),
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: String(err) };
  }
}

export function checkEnvironment(skillsDir) {
  const ffmpeg = runQuick('ffmpeg', ['-version']);
  const ffprobe = runQuick('ffprobe', ['-version']);
  const node = runQuick('node', ['--version']);
  const npx = runQuick('npx', ['--version']);
  const python3 = runQuick('python3', ['--version']);
  const hfWhich = runQuick('which', ['hyperframes']);

  let hasVidstab = false;
  let hasDeshake = false;
  let hasLibass = false;
  let hasVideotoolbox = false;
  if (ffmpeg.ok) {
    const filters = runQuick('ffmpeg', ['-hide_banner', '-filters']).stdout;
    hasVidstab = filters.includes('vidstabdetect') && filters.includes('vidstabtransform');
    hasDeshake = filters.includes('deshake');
    hasLibass = /\bass\b/.test(filters);
    const encoders = runQuick('ffmpeg', ['-hide_banner', '-encoders']).stdout;
    hasVideotoolbox = encoders.includes('h264_videotoolbox');
  }

  const chromeCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const chromePath = chromeCandidates.find((p) => fs.existsSync(p)) || null;

  let bundledSkills = [];
  if (skillsDir && fs.existsSync(skillsDir)) {
    bundledSkills = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort();
  }

  const missing = [];
  if (!ffmpeg.ok) missing.push('ffmpeg (install via `brew install ffmpeg` on macOS)');
  if (!ffprobe.ok) missing.push('ffprobe (included with ffmpeg)');
  if (!node.ok) missing.push('node (>= 20)');

  return {
    tools: {
      ffmpeg: ffmpeg.ok ? ffmpeg.stdout.split('\n')[0] : null,
      ffprobe: ffprobe.ok ? ffprobe.stdout.split('\n')[0] : null,
      node: node.ok ? node.stdout : null,
      npx: npx.ok ? npx.stdout : null,
      python3: python3.ok ? python3.stdout : null,
      hyperframesGlobal: hfWhich.ok ? hfWhich.stdout : null,
      chromePath,
    },
    ffmpeg_capabilities: {
      has_vidstab: hasVidstab,
      has_deshake: hasDeshake,
      has_libass: hasLibass,
      has_videotoolbox: hasVideotoolbox,
    },
    bundled_skills: bundledSkills,
    missing,
    hyperframes_ready_via_npx: npx.ok,
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const args = process.argv.slice(2);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const skillsDir = path.resolve(here, '..', '..');

  if (args.includes('--install-hyperframes')) {
    try {
      execFileSync('npx', ['-y', 'hyperframes', '--version'], { stdio: 'inherit' });
    } catch (err) {
      console.error('Failed to bootstrap hyperframes via npx:', err);
      process.exit(1);
    }
  } else {
    console.log(JSON.stringify(checkEnvironment(skillsDir), null, 2));
  }
}
