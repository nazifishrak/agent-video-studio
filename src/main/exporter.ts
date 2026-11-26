import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  assertSafeChild,
  getProjectState,
  listMotionScenes,
  probeMediaPaths,
  resolveVaultPaths,
  updateProjectManifest,
} from './vault.js';
import type { BrandTokens } from '../shared/designTokens.js';
import { normalizeCaptionStyle } from '../shared/designTokens.js';
import type { EditPlanV2, MotionPlate } from '../shared/schemas.js';

const execFileAsync = promisify(execFile);

export type ExportPreset = 'preview-720p' | 'master-1080p' | 'master-4k' | 'custom';

export interface ExportProjectOptions {
  vaultRoot: string;
  projectSlug: string;
  resourcesDir?: string;
  preset?: ExportPreset;
  width?: number;
  height?: number;
  fps?: number;
  bitrateMbps?: number;
  outPath?: string;
  renderMotionPlateVideo?: (opts: {
    plate: MotionPlate;
    sceneFile: string;
    tokens: BrandTokens;
    width: number;
    height: number;
    fps: number;
    outVideoPath: string;
  }) => Promise<boolean>;
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
  const style = normalizeCaptionStyle(tokens.caption_style);
  const fontName = style === 'editorial-serif' ? 'Instrument Serif' : 'SF Pro Text';
  const fontSize = Math.max(24, Math.round(height * (width >= height ? 0.034 : 0.025)));
  const primaryCol = hexToAssColor(tokens.caption_color, '00');
  const isGlass = style === 'editorial-glass';
  const outlineCol = isGlass ? '&H680C0E12' : '&HB0000000';
  const backCol = isGlass ? '&H680C0E12' : '&H90000000';
  const borderStyle = isGlass ? 3 : 1;
  const outlineWidth = isGlass ? 8 : 1.2;
  const shadowDepth = isGlass ? 0 : 2;
  const isBold = Number(tokens.caption_weight) >= 600 ? 1 : 0;

  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${fontName},${fontSize},${primaryCol},${primaryCol},${outlineCol},${backCol},${isBold},0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadowDepth},${alignment},40,40,${marginV},1`,
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
  const paths = resolveVaultPaths(vaultRoot, opts.resourcesDir);
  const projectDir = assertSafeChild(paths.projectsDir, path.join(paths.projectsDir, projectSlug));
  const exportsDir = path.join(projectDir, 'exports');
  await fs.mkdir(exportsDir, { recursive: true });

  const plan = state.editPlan;
  const isVertical = state.manifest.aspectRatio === '9:16';
  const baseW = plan.width || (isVertical ? 1080 : 1920);
  const baseH = plan.height || (isVertical ? 1920 : 1080);

  let rawW = baseW;
  let rawH = baseH;
  if (preset === 'preview-720p') {
    rawW = isVertical ? 720 : 1280;
    rawH = isVertical ? 1280 : 720;
  } else if (preset === 'master-1080p') {
    rawW = isVertical ? 1080 : 1920;
    rawH = isVertical ? 1920 : 1080;
  } else if (preset === 'master-4k') {
    rawW = isVertical ? 2160 : 3840;
    rawH = isVertical ? 3840 : 2160;
  } else if (preset === 'custom') {
    rawW = opts.width || baseW;
    rawH = opts.height || baseH;
  }

  const outW = Math.max(320, Math.round(rawW / 2) * 2);
  const outH = Math.max(240, Math.round(rawH / 2) * 2);
  const fps = Math.max(12, Math.min(120, Math.round(opts.fps || plan.fps || 30)));

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

  // Composite HTML Motion Plates when renderMotionPlateVideo is provided (Electron offscreen renderer)
  const tmpPlatePaths: string[] = [];
  if (plan.motionPlates.length > 0 && opts.renderMotionPlateVideo) {
    const scenes = await listMotionScenes(vaultRoot, opts.resourcesDir);
    onProgress?.(30, `Rendering ${plan.motionPlates.length} motion plate(s)...`);
    for (let i = 0; i < plan.motionPlates.length; i++) {
      const plate = plan.motionPlates[i];
      const meta = scenes.find((s) => s.id === plate.sceneId);
      if (!meta) continue;
      const ext = plate.transparent ? '.mov' : '.mp4';
      const platePath = path.join(exportsDir, `.plate-${ts}-${i}${ext}`);
      const ok = await opts.renderMotionPlateVideo({
        plate,
        sceneFile: meta.file,
        tokens: state.brandTokens,
        width: outW,
        height: outH,
        fps,
        outVideoPath: platePath,
      });
      if (ok && fsSync.existsSync(platePath)) {
        tmpPlatePaths.push(platePath);
        const pIdx = inputIdx++;
        args.push('-i', platePath);
        const shiftTag = `[pshift${i}]`;
        const outTag = `[vplate${i}]`;
        filterParts.push(`[${pIdx}:v]setpts=PTS-STARTPTS+${plate.start.toFixed(3)}/TB${shiftTag}`);
        filterParts.push(
          `${videoLabel}${shiftTag}overlay=0:0:enable='between(t,${plate.start.toFixed(3)},${plate.end.toFixed(3)})':eof_action=pass${outTag}`
        );
        videoLabel = outTag;
      }
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
    const defaultMbps = preset === 'master-4k' ? 35 : preset === 'preview-720p' ? 6 : 14;
    const mbps = opts.bitrateMbps ?? defaultMbps;
    args.push('-c:v', 'h264_videotoolbox', '-b:v', `${mbps}M`);
  } else {
    const crf = preset === 'master-4k' ? '16' : preset === 'preview-720p' ? '22' : '18';
    args.push('-c:v', 'libx264', '-crf', crf, '-preset', 'medium');
  }
  args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart', outPath);

  onProgress?.(45, `Encoding with ${encoder} (${outW}x${outH} @ ${fps}fps)...`);
  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 16 });
  } finally {
    if (tmpAssPath) {
      await fs.unlink(tmpAssPath).catch(() => undefined);
    }
    await Promise.all([
      ...tmpPngPaths.map((p) => fs.unlink(p).catch(() => undefined)),
      ...tmpPlatePaths.map((p) => fs.unlink(p).catch(() => undefined)),
    ]);
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
