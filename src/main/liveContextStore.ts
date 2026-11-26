import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  LIVE_CONTEXT_FILENAME,
  StudioLiveContext,
  StudioUiCommand,
  UI_COMMAND_FILENAME,
} from '../shared/liveContext.js';

export function getLiveContextPath(vaultRoot: string): string {
  return path.join(path.resolve(vaultRoot), LIVE_CONTEXT_FILENAME);
}

export function getUiCommandPath(vaultRoot: string): string {
  return path.join(path.resolve(vaultRoot), UI_COMMAND_FILENAME);
}

async function atomicWriteJson(targetPath: string, data: unknown): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.tmp-${path.basename(targetPath)}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  );
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, targetPath);
}

export async function writeLiveContext(
  vaultRoot: string,
  ctx: StudioLiveContext,
  harnessDir?: string
): Promise<void> {
  const payload: StudioLiveContext = {
    ...ctx,
    version: 1,
    vaultRoot: path.resolve(vaultRoot),
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(getLiveContextPath(vaultRoot), payload);
  if (harnessDir) {
    await atomicWriteJson(path.join(path.resolve(harnessDir), 'studio-context.json'), payload);
  }
}

export function readLiveContext(vaultRoot: string): StudioLiveContext | null {
  try {
    const p = getLiveContextPath(vaultRoot);
    if (!fsSync.existsSync(p)) return null;
    const raw = fsSync.readFileSync(p, 'utf8');
    return JSON.parse(raw) as StudioLiveContext;
  } catch {
    return null;
  }
}

export async function writeUiCommand(
  vaultRoot: string,
  cmd: Omit<StudioUiCommand, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
): Promise<StudioUiCommand> {
  const full: StudioUiCommand = {
    id: cmd.id ?? `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: cmd.timestamp ?? new Date().toISOString(),
    kind: cmd.kind,
    projectSlug: cmd.projectSlug,
    tab: cmd.tab,
    playheadSec: cmd.playheadSec,
    summary: cmd.summary,
    reloadMedia: cmd.reloadMedia,
  };
  await atomicWriteJson(getUiCommandPath(vaultRoot), full);
  return full;
}

export function readUiCommand(vaultRoot: string): StudioUiCommand | null {
  try {
    const p = getUiCommandPath(vaultRoot);
    if (!fsSync.existsSync(p)) return null;
    const raw = fsSync.readFileSync(p, 'utf8');
    return JSON.parse(raw) as StudioUiCommand;
  } catch {
    return null;
  }
}
