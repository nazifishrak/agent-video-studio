import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  assertSafeChild,
  getProjectState,
  probeMediaPaths,
  resolveVaultPaths,
  updateProjectManifest,
} from './vault.js';
import type { BrandTokens } from '../shared/designTokens.js';
import type { EditPlanV2 } from '../shared/schemas.js';

const execFileAsync = promisify(execFile);

export interface ExportProjectOptions {
  vaultRoot: string;
  projectSlug: string;
  preset?: 'preview-720p' | 'master-1080p';
  outPath?: string;
  renderCaptionPng?: (opts: {
    text: string;
    highlightWord?: string;
    tokens: BrandTokens;
    width: number;
    height: number;
    outPngPath: string;
  }) => Promise<boolean>;
  onProgress?: (pct: number, message: string) => void;
}

export interface ExportProjectResult {
  outPath: string;
  relativePath: string;
  durationSec: number;
  sizeBytes: number;
  encoder: string;
}

function resolveProjectFileUri(projectDir: string, uriOrRel: string, plan: EditPlanV2): string | null {
  if (!uriOrRel) return null;
  const asset = plan.assets.find((a) => a.id === uriOrRel);
  const raw = asset ? asset.uri : uriOrRel;
  if (raw.startsWith('file://')) {
    const abs = decodeURIComponent(raw.slice('file://'.length));
    return fsSync.existsSync(abs) ? abs : null;
  }
  if (path.isAbsolute(raw)) {
    return fsSync.existsSync(raw) ? raw : null;
  }
  const joined = path.join(projectDir, raw);
  return fsSync.existsSync(joined) ? joined : null;
}

function toAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${rem.toFixed(2).padStart(5, '0')}`;
}

function hexToAssColor(hex: string, alphaHex = '00'): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
  }
  return `&H${alphaHex}FFFFFF`;
}

function buildAssSubtitles(
  plan: EditPlanV2,
  tokens: BrandTokens,
  width: number,
  height: number
): string {
  const alignment =
    tokens.caption_position === 'center' ? 5 : tokens.caption_position === 'lower-third' ? 2 : 2;
  const marginV =
    tokens.caption_position === 'center'
      ? 0
      : tokens.caption_position === 'lower-third'
        ? Math.round(height * 0.12)
        : Math.round(height * 0.06);
  const fontSize = Math.max(26, Math.round(height * (width >= height ? 0.042 : 0.028)));
  const primaryCol = hexToAssColor(tokens.caption_color, '00');
  const backCol =
    tokens.caption_style === 'editorial' ? '&H80000000' : hexToAssColor('#090B0A', '40');
  const borderStyle = tokens.caption_style === 'editorial' ? 1 : 3;

  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial,${fontSize},${primaryCol},${primaryCol},${backCol},${backCol},1,0,0,0,100,100,0,0,${borderStyle},2,0,${alignment},40,40,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  for (const cap of plan.captions) {
    const safeText = cap.text.replace(/\r?\n/g, '\\N').replace(/[{}]/g, '');
    lines.push(`Dialogue: 0,${toAssTime(cap.start)},${toAssTime(cap.end)},Default,,0,0,0,,${safeText}`);
  }
  return lines.join('\n') + '\n';
}

export async function exportProjectVideo(opts: ExportProjectOptions): Promise<ExportProjectResult> {
  const { vaultRoot, projectSlug, preset = 'master-1080p', onProgress } = opts;
  onProgress?.(5, 'Loading project timeline...');
  const state = await getProjectState(vaultRoot, projectSlug);
  const paths = resolveVaultPaths(vaultRoot);
  const projectDir = assertSafeChild(paths.projectsDir, path.join(paths.projectsDir, projectSlug));
  const exportsDir = path.join(projectDir, 'exports');
  await fs.mkdir(exportsDir, { recursive: true });

  const plan = state.editPlan;
  const baseW = plan.width || (state.manifest.aspectRatio === '9:16' ? 1080 : 1920);
  const baseH = plan.height || (state.manifest.aspectRatio === '9:16' ? 1920 : 1080);
  const scaleFactor = preset === 'preview-720p' ? (baseW >= baseH ? 1280 / baseW : 720 / baseW) : 1;
  const outW = Math.round((baseW * scaleFactor) / 2) * 2;
  const outH = Math.round((baseH * scaleFactor) / 2) * 2;
  const fps = plan.fps || 30;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = opts.outPath
    ? path.resolve(opts.outPath)
    : path.join(exportsDir, `${projectSlug}-${preset}-${ts}.mp4`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const probe = await probeMediaPaths([]);
  const encoder = probe.ffmpegCapabilities.hasVideotoolbox ? 'h264_videotoolbox' : 'libx264';
  let hasLibAss = false;
  try {
    const { stdout: filters } = await execFileAsync('ffmpeg', ['-hide_banner', '-filters']);
    hasLibAss = /\bass\b/.test(filters);
  } catch {
    hasLibAss = false;
  }

  const args: string[] = ['-y'];
  const filterParts: string[] = [];
  let videoLabel = '';
  let audioLabel = '';
  let inputIdx = 0;

  // Build base video from shots[] or sourceVideo or stage_bg
  if (plan.shots.length > 0) {
    onProgress?.(15, `Preparing ${plan.shots.length} sequence shots...`);
    const concatInputs: string[] = [];
    let validShots = 0;
    for (const shot of plan.shots) {
      const srcPath = resolveProjectFileUri(projectDir, shot.assetId || shot.source, plan);
      if (!srcPath) continue;
      const idx = inputIdx++;
      const dur = Math.max(0.1, shot.end - shot.start);
      args.push('-ss', String(shot.srcIn || 0), '-t', String(dur * (shot.speed || 1)), '-i', srcPath);
      const speedFilter = shot.speed && shot.speed !== 1 ? `,setpts=PTS/${shot.speed}` : '';
      const stabFilter =
        shot.stabilize && probe.ffmpegCapabilities.hasDeshake ? ',deshake' : '';
      filterParts.push(
        `[${idx}:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${outW}:${outH},setsar=1,fps=${fps}${speedFilter}${stabFilter},setpts=PTS-STARTPTS[v${validShots}]`
      );
      concatInputs.push(`[v${validShots}]`);
      validShots++;
    }
    if (validShots > 0) {
      filterParts.push(`${concatInputs.join('')}concat=n=${validShots}:v=1:a=0[vbase]`);
      videoLabel = '[vbase]';
    }
  }

  if (!videoLabel && plan.sourceVideo) {
    const srcPath = resolveProjectFileUri(projectDir, plan.sourceVideo, plan);
    if (srcPath) {
      onProgress?.(20, 'Preparing source video...');
      const idx = inputIdx++;
      args.push('-i', srcPath);
      const srcProbe = await probeMediaPaths([srcPath]);
      const hasSrcAudio = srcProbe.clips[0]?.hasAudio ?? false;

      if (plan.cuts.length > 0) {
        const segV: string[] = [];
        const segA: string[] = [];
        plan.cuts.forEach((c, i) => {
          filterParts.push(
            `[${idx}:v]trim=start=${c.in}:end=${c.out},setpts=PTS-STARTPTS,scale=${outW}:${outH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${outW}:${outH},setsar=1,fps=${fps}[cv${i}]`
          );
          segV.push(`[cv${i}]`);
          if (hasSrcAudio) {
            filterParts.push(`[${idx}:a]atrim=start=${c.in}:end=${c.out},asetpts=PTS-STARTPTS[ca${i}]`);
            segA.push(`[ca${i}]`);
          }
        });
        filterParts.push(`${segV.join('')}concat=n=${plan.cuts.length}:v=1:a=0[vbase]`);
        videoLabel = '[vbase]';
        if (hasSrcAudio) {
          filterParts.push(`${segA.join('')}concat=n=${plan.cuts.length}:v=0:a=1[abase]`);
          audioLabel = '[abase]';
        }
      } else {
        filterParts.push(
          `[${idx}:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${outW}:${outH},setsar=1,fps=${fps}[vbase]`
        );
        videoLabel = '[vbase]';
        if (hasSrcAudio) {
          audioLabel = `${idx}:a`;
        }
      }
    }
  }

  const maxTimelineEnd = Math.max(
    10,
    ...plan.shots.map((s) => s.end),
    ...plan.captions.map((c) => c.end),
    ...plan.motionPlates.map((p) => p.end)
  );

  if (!videoLabel) {
    const bgHex = (state.brandTokens.stage_bg || '#090B0A').replace('#', '0x');
    const idx = inputIdx++;
    args.push('-f', 'lavfi', '-i', `color=c=${bgHex}:s=${outW}x${outH}:r=${fps}:d=${maxTimelineEnd}`);
    videoLabel = `[${idx}:v]`;
  }

  // Optional music track
  if (plan.audio?.musicTrack) {
    const musicPath = resolveProjectFileUri(projectDir, plan.audio.musicTrack, plan);
    if (musicPath) {
      const mIdx = inputIdx++;
      args.push('-stream_loop', '-1', '-i', musicPath);
      const db = plan.audio.musicDb ?? -18;
      filterParts.push(`[${mIdx}:a]volume=${db}dB[amusic]`);
      if (audioLabel) {
        const aIn = audioLabel.startsWith('[') ? audioLabel : `[${audioLabel}]`;
        filterParts.push(`${aIn}[amusic]amix=inputs=2:duration=first:dropout_transition=2[amixed]`);
        audioLabel = '[amixed]';
      } else {
        audioLabel = '[amusic]';
      }
    }
  }

  // Color grade
  if (plan.colorGrade) {
    const c = plan.colorGrade.contrast ?? 1;
    const s = plan.colorGrade.saturate ?? 1;
    const b = (plan.colorGrade.brightness ?? 1) - 1;
    if (c !== 1 || s !== 1 || b !== 0) {
      filterParts.push(`${videoLabel}eq=contrast=${c}:saturation=${s}:brightness=${b}[vgrade]`);
      videoLabel = '[vgrade]';
    }
  }

  // Burn captions: use libass when compiled in, otherwise render transparent PNGs via Electron
  let tmpAssPath: string | null = null;
  const tmpPngPaths: string[] = [];
  if (plan.captions.length > 0 && hasLibAss) {
    tmpAssPath = path.join(exportsDir, `.captions-${ts}.ass`);
    await fs.writeFile(tmpAssPath, buildAssSubtitles(plan, state.brandTokens, outW, outH), 'utf8');
    const escapedAss = tmpAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    filterParts.push(`${videoLabel}ass='${escapedAss}'[vcap]`);
    videoLabel = '[vcap]';
  } else if (plan.captions.length > 0 && opts.renderCaptionPng) {
    onProgress?.(35, `Rendering ${plan.captions.length} styled caption overlay(s)...`);
    for (let i = 0; i < plan.captions.length; i++) {
      const cap = plan.captions[i];
      const pngPath = path.join(exportsDir, `.cap-${ts}-${i}.png`);
      const ok = await opts.renderCaptionPng({
        text: cap.text,
        highlightWord: cap.highlightWord,
        tokens: state.brandTokens,
        width: outW,
        height: outH,
        outPngPath: pngPath,
      });
      if (ok && fsSync.existsSync(pngPath)) {
        tmpPngPaths.push(pngPath);
        const capIdx = inputIdx++;
        args.push('-loop', '1', '-i', pngPath);
        const outTag = `[vcap${i}]`;
        filterParts.push(
          `${videoLabel}[${capIdx}:v]overlay=0:0:enable='between(t,${cap.start.toFixed(3)},${cap.end.toFixed(3)})':shortest=1${outTag}`
        );
        videoLabel = outTag;
      }
    }
  }

  if (filterParts.length > 0) {
    args.push('-filter_complex', filterParts.join(';'));
  }

  args.push('-map', videoLabel);
  if (audioLabel) {
    args.push('-map', audioLabel, '-c:a', 'aac', '-b:a', '192k', '-shortest');
  } else {
    args.push('-an');
  }

  if (encoder === 'h264_videotoolbox') {
    args.push('-c:v', 'h264_videotoolbox', '-b:v', preset === 'preview-720p' ? '6M' : '14M');
  } else {
    args.push('-c:v', 'libx264', '-crf', preset === 'preview-720p' ? '22' : '18', '-preset', 'medium');
  }
  args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart', outPath);

  onProgress?.(45, `Encoding with ${encoder} (${outW}x${outH})...`);
  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 16 });
  } finally {
    if (tmpAssPath) {
      await fs.unlink(tmpAssPath).catch(() => undefined);
    }
    await Promise.all(tmpPngPaths.map((p) => fs.unlink(p).catch(() => undefined)));
  }

  onProgress?.(95, 'Finalizing export...');
  const stat = await fs.stat(outPath);
  const outProbe = await probeMediaPaths([outPath]);
  const durationSec = outProbe.clips[0]?.durationSec ?? maxTimelineEnd;
  await updateProjectManifest(vaultRoot, projectSlug, { status: 'Exported' });
  onProgress?.(100, 'Export complete');

  return {
    outPath,
    relativePath: path.relative(projectDir, outPath),
    durationSec,
    sizeBytes: stat.size,
    encoder,
  };
}

export async function inspectTimelineContactSheet(opts: {
  vaultRoot: string;
  projectSlug: string;
  frameCount?: number;
}): Promise<{ imagePath: string; relativePath: string; frameCount: number; sourcePath: string }> {
  const { vaultRoot, projectSlug, frameCount = 12 } = opts;
  const state = await getProjectState(vaultRoot, projectSlug);
  const paths = resolveVaultPaths(vaultRoot);
  const projectDir = assertSafeChild(paths.projectsDir, path.join(paths.projectsDir, projectSlug));
  const exportsDir = path.join(projectDir, 'exports');
  await fs.mkdir(exportsDir, { recursive: true });

  let sourcePath = resolveProjectFileUri(projectDir, state.editPlan.sourceVideo, state.editPlan);
  if (!sourcePath && state.editPlan.shots.length > 0) {
    sourcePath = resolveProjectFileUri(
      projectDir,
      state.editPlan.shots[0].assetId || state.editPlan.shots[0].source,
      state.editPlan
    );
  }
  if (!sourcePath) {
    throw new Error('No rendered or source video available to inspect yet.');
  }

  const probe = await probeMediaPaths([sourcePath]);
  const dur = Math.max(1, probe.clips[0]?.durationSec ?? 10);
  const cols = 4;
  const rows = Math.max(1, Math.ceil(frameCount / cols));
  const interval = Math.max(0.2, dur / frameCount);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const imagePath = path.join(exportsDir, `inspect-${ts}.png`);

  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    sourcePath,
    '-vf',
    `fps=1/${interval.toFixed(3)},scale=480:-1,tile=${cols}x${rows}`,
    '-frames:v',
    '1',
    imagePath,
  ]);

  return {
    imagePath,
    relativePath: path.relative(projectDir, imagePath),
    frameCount,
    sourcePath,
  };
}
