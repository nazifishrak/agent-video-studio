import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  applyTimelineOps,
  beginProjectEdit,
  commitProjectEdit,
  createCustomMotionScene,
  createProjectFromIdea,
  createStarterVault,
  getProjectState,
  listBrandKits,
  listIdeas,
  listMotionScenes,
  listProjects,
  probeMediaPaths,
  resolveVaultPaths,
  saveProjectBrandKit,
  undoLastTransaction,
} from '../src/main/vault.js';
import { exportProjectVideo, inspectTimelineContactSheet } from '../src/main/exporter.js';
import {
  DEFAULT_BRAND_TOKENS,
  getCaptionVisualSpec,
  parseDesignMd,
  serializeDesignMd,
} from '../src/shared/designTokens.js';
import {
  readLiveContext,
  readUiCommand,
  writeLiveContext,
  writeUiCommand,
} from '../src/main/liveContextStore.js';
import { startAssetServer } from '../src/main/server.js';
import { prepareAgentHarness } from '../src/main/harness.js';

const VAULT_ROOT = path.resolve(__dirname, '..', '..');
const RESOURCES_DIR = path.resolve(__dirname, '..', 'resources');

async function testVaultAndTransactions(): Promise<number> {
  const ideas = await listIdeas(VAULT_ROOT);
  assert.ok(ideas.length >= 6, `Expected >= 6 ideas, got ${ideas.length}`);
  for (const idea of ideas) {
    for (const cue of idea.cues) {
      assert.ok(
        !cue.text.startsWith('`'),
        `Cue in ${idea.slug} has stray leading backtick: ${cue.text}`
      );
    }
  }

  const scenes = await listMotionScenes(VAULT_ROOT);
  assert.equal(scenes.length, 60, `Expected 60 motion scenes, got ${scenes.length}`);

  const kits = await listBrandKits(VAULT_ROOT);
  assert.ok(kits.length >= 5, `Expected >= 5 brand kits, got ${kits.length}`);

  // Round-trip DESIGN.md
  const serialized = serializeDesignMd('Test Brand', DEFAULT_BRAND_TOKENS);
  const parsed = parseDesignMd(serialized, 'light');
  assert.equal(parsed.accent_primary, DEFAULT_BRAND_TOKENS.accent_primary);
  assert.equal(parsed.caption_style, DEFAULT_BRAND_TOKENS.caption_style);

  // Project + Transaction lifecycle
  const paths = resolveVaultPaths(VAULT_ROOT);
  const projectsDirExisted = await fs
    .access(paths.projectsDir)
    .then(() => true)
    .catch(() => false);
  const tempSlug = `smoke-test-${Date.now()}`;
  const tempProjectDir = path.join(paths.projectsDir, tempSlug);

  try {
    const created = await createProjectFromIdea(VAULT_ROOT, {
      ideaSlug: ideas[0].slug,
      title: 'Smoke Test Project',
      slug: tempSlug,
      aspectRatio: '16:9',
    });
    assert.equal(created.manifest.slug, tempSlug);

    const { txId } = await beginProjectEdit(VAULT_ROOT, tempSlug, {
      actor: 'agent',
      agentName: 'SmokeTestAgent',
      reason: 'Add plate and caption',
    });

    await applyTimelineOps(
      VAULT_ROOT,
      txId,
      [
        {
          op: 'add_motion_plate',
          plate: {
            id: 'plate-smoke-1',
            sceneId: '01-kinetic-hook-mask',
            start: 1.0,
            end: 5.8,
            props: { kicker: 'Test' },
            transparent: false,
          },
        },
        {
          op: 'add_caption',
          caption: {
            id: 'cap-smoke-1',
            text: 'Smoke test caption',
            start: 1.0,
            end: 4.0,
          },
        },
        {
          op: 'add_camera_move',
          move: {
            start: 1.0,
            end: 3.5,
            fromScale: 1.0,
            toScale: 1.08,
          },
        },
      ],
      tempSlug
    );

    const committed = await commitProjectEdit(VAULT_ROOT, txId, 'Smoke commit', tempSlug);
    assert.equal(committed.actor, 'agent');

    const afterCommit = await getProjectState(VAULT_ROOT, tempSlug);
    assert.equal(afterCommit.editPlan.motionPlates.length, 1);
    assert.equal(afterCommit.editPlan.cameraMoves.length, 1);

    const undone = await undoLastTransaction(VAULT_ROOT, tempSlug);
    assert.ok(undone, 'Expected undo result');

    const afterUndo = await getProjectState(VAULT_ROOT, tempSlug);
    assert.equal(afterUndo.editPlan.motionPlates.length, 0);
    assert.equal(afterUndo.editPlan.cameraMoves.length, 0);
  } finally {
    await fs.rm(tempProjectDir, { recursive: true, force: true });
    if (!projectsDirExisted) {
      await fs.rmdir(paths.projectsDir).catch(() => undefined);
    }
  }
  console.log('✓ Vault, DESIGN.md, and transactional history passed');
  return ideas.length;
}

async function testAssetServer() {
  const srv = await startAssetServer(VAULT_ROOT);
  try {
    const res = await fetch(`${srv.baseUrl}/scenes/scenes/01-kinetic-hook-mask.html?token=${srv.token}`);
    assert.equal(res.status, 200, `Expected HTTP 200 for scene HTML, got ${res.status}`);
    const body = await res.text();
    assert.ok(body.includes('MotionEngine'), 'Scene HTML should reference MotionEngine');

    const unauthRes = await fetch(`${srv.baseUrl}/scenes/scenes/01-kinetic-hook-mask.html`);
    assert.equal(unauthRes.status, 403, 'Unauthenticated request should be rejected');

    const cssRes = await fetch(`${srv.baseUrl}/scenes/engine/tokens.css?token=${srv.token}`);
    assert.equal(cssRes.status, 200, `Expected HTTP 200 for tokens.css, got ${cssRes.status}`);
  } finally {
    await srv.close();
  }
  console.log('✓ Local HTTP asset server passed');
}

async function testMcpServer(expectedIdeaCount: number) {
  const mcpPath = path.resolve(__dirname, '..', 'dist', 'mcp', 'server.js');
  const child = spawn('node', [mcpPath, '--vault', VAULT_ROOT], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  child.stdout.on('data', (d: Buffer) => {
    stdoutBuf += d.toString('utf8');
  });
  child.stderr.on('data', (d: Buffer) => {
    stderrBuf += d.toString('utf8');
  });

  const send = (obj: unknown) => {
    child.stdin.write(JSON.stringify(obj) + '\n');
  };

  const waitForId = async (id: number, timeoutMs = 5000): Promise<any> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const lines = stdoutBuf.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === id) return msg;
        } catch {
          // ignore partial line
        }
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`Timed out waiting for MCP id=${id}. stdout=${stdoutBuf} stderr=${stderrBuf}`);
  };

  try {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'smoke-test', version: '0.1.0' },
      },
    });
    const initRes = await waitForId(1);
    assert.ok(initRes.result?.serverInfo?.name === 'agent-video-studio');

    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const toolsRes = await waitForId(2);
    assert.ok(toolsRes.result?.tools?.length >= 15, 'Expected >= 15 MCP tools');

    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_vault_overview', arguments: {} },
    });
    const overviewRes = await waitForId(3);
    const overviewJson = JSON.parse(overviewRes.result.content[0].text);
    assert.equal(overviewJson.counts.ideas, expectedIdeaCount);
    assert.equal(overviewJson.counts.motionScenes, 60);

    send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'search_motion_scenes', arguments: { query: 'roi' } },
    });
    const searchRes = await waitForId(4);
    const searchJson = JSON.parse(searchRes.result.content[0].text);
    assert.ok(searchJson.count >= 1, 'Expected ROI motion scene match');

    send({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'check_environment', arguments: {} },
    });
    const envRes = await waitForId(5);
    const envJson = JSON.parse(envRes.result.content[0].text);
    assert.ok(envJson.bundled_skills.includes('hyperframes'), 'check_environment should list bundled hyperframes');
  } finally {
    child.kill('SIGTERM');
  }
  console.log('✓ Local stdio MCP server passed');
}

async function testStarterVaultAndHarness() {
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'avs-smoke-'));
  const tmpVault = path.join(tmpBase, 'user-vault');
  const tmpHarness = path.join(tmpBase, 'agent-harness');

  try {
    await createStarterVault(tmpVault);

    const bundledScenes = await listMotionScenes(tmpVault, RESOURCES_DIR);
    assert.equal(bundledScenes.length, 60, `Expected 60 bundled scenes, got ${bundledScenes.length}`);

    const custom = await createCustomMotionScene(
      tmpVault,
      {
        id: 'smoke-custom-plate',
        name: 'Smoke Custom Plate',
        htmlContent: '<!DOCTYPE html><html><body><div id="stage"></div></body></html>',
      },
      RESOURCES_DIR
    );
    assert.equal(custom.file, 'custom/smoke-custom-plate.html');

    const mergedScenes = await listMotionScenes(tmpVault, RESOURCES_DIR);
    assert.equal(mergedScenes.length, 61, `Expected 61 merged scenes, got ${mergedScenes.length}`);

    // Verify auto-discovery of agent-rendered video folders without project.json
    const autoProjDir = path.join(tmpVault, 'projects', 'day-in-the-life-test');
    await fs.mkdir(autoProjDir, { recursive: true });
    await fs.writeFile(path.join(autoProjDir, 'base.mp4'), 'fake-base', 'utf8');
    await fs.writeFile(path.join(autoProjDir, 'day_in_the_life_test.mp4'), 'fake-final', 'utf8');
    const discoveredProjects = await listProjects(tmpVault);
    const autoProj = discoveredProjects.find((p) => p.slug === 'day-in-the-life-test');
    assert.ok(autoProj, 'Expected auto-discovered project without project.json');
    assert.equal(autoProj.title, 'Day In The Life Test');

    const autoState = await getProjectState(tmpVault, 'day-in-the-life-test');
    assert.equal(autoState.editPlan.sourceVideo, 'day_in_the_life_test.mp4');
    assert.ok(autoState.mediaFiles.includes('day_in_the_life_test.mp4'));

    const autoTx = await beginProjectEdit(tmpVault, 'day-in-the-life-test', { actor: 'human' });
    await applyTimelineOps(
      tmpVault,
      autoTx.txId,
      [{ op: 'add_caption', caption: { id: 'cap-auto-1', text: 'Auto project caption', start: 0, end: 2 } }],
      'day-in-the-life-test'
    );
    await commitProjectEdit(tmpVault, autoTx.txId, 'Initialized auto project', 'day-in-the-life-test');
    const autoAfter = await getProjectState(tmpVault, 'day-in-the-life-test');
    assert.equal(autoAfter.editPlan.captions.length, 1);

    const harness = await prepareAgentHarness({
      harnessDir: tmpHarness,
      resourcesDir: RESOURCES_DIR,
      vaultRoot: tmpVault,
      mcpServerScript: path.resolve(__dirname, '..', 'dist', 'mcp', 'server.js'),
    });

    const claudeMd = await fs.readFile(path.join(harness.harnessDir, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeMd.includes(tmpVault), 'CLAUDE.md should reference user vault path');
    assert.ok(claudeMd.includes('READ-ONLY'), 'CLAUDE.md should mark bundled skills as read-only');
    assert.ok(claudeMd.includes('zoompan'), 'CLAUDE.md should enforce zoompan ban');
    assert.ok(claudeMd.includes('probe_clips.py'), 'CLAUDE.md should reference probe_clips.py');
    assert.ok(claudeMd.includes('get_active_studio_context'), 'CLAUDE.md should reference get_active_studio_context');
    assert.ok(claudeMd.includes('focus_studio_view'), 'CLAUDE.md should reference focus_studio_view');
    assert.ok(claudeMd.includes('APPROVED_LOOKS.md'), 'CLAUDE.md should reference APPROVED_LOOKS.md');

    // Verify sleek caption defaults, legacy mapping, and live context bridge
    assert.equal(DEFAULT_BRAND_TOKENS.caption_style, 'cinema-clean');
    assert.ok(!DEFAULT_BRAND_TOKENS.caption_font.includes('Google Sans Flex'));
    assert.notEqual(DEFAULT_BRAND_TOKENS.caption_highlight_color.toUpperCase(), '#60A5FA');
    assert.equal(parseDesignMd('- caption_style: word-highlight').caption_style, 'cinema-clean');
    assert.equal(parseDesignMd('- caption_style: pill').caption_style, 'editorial-glass');
    const glassSpec = getCaptionVisualSpec({ ...DEFAULT_BRAND_TOKENS, caption_style: 'editorial-glass' });
    assert.ok(glassSpec.backdropFilter.includes('blur'));

    await writeLiveContext(
      tmpVault,
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        vaultRoot: tmpVault,
        activeTab: 'editor',
        activeProjectSlug: 'day-in-the-life-test',
        playheadSec: 4.5,
        selectedItem: { kind: 'caption', id: 'cap_1' },
        selectedIdeaSlug: null,
      },
      harness.harnessDir
    );
    const liveRead = readLiveContext(tmpVault);
    assert.equal(liveRead?.activeProjectSlug, 'day-in-the-life-test');
    assert.equal(liveRead?.playheadSec, 4.5);
    const harnessCtxMirror = JSON.parse(
      await fs.readFile(path.join(harness.harnessDir, 'studio-context.json'), 'utf8')
    );
    assert.equal(harnessCtxMirror.activeProjectSlug, 'day-in-the-life-test');

    const cmdWritten = await writeUiCommand(tmpVault, {
      kind: 'focus_view',
      projectSlug: 'day-in-the-life-test',
      tab: 'editor',
      playheadSec: 6.2,
      summary: 'Smoke focus',
    });
    const cmdRead = readUiCommand(tmpVault);
    assert.equal(cmdRead?.id, cmdWritten.id);
    assert.equal(cmdRead?.playheadSec, 6.2);

    for (const relSkillLink of ['.agents/skills', '.claude/skills', '.gemini/skills']) {
      const target = await fs.realpath(path.join(harness.harnessDir, relSkillLink));
      assert.equal(
        target,
        await fs.realpath(path.join(RESOURCES_DIR, 'skills')),
        `${relSkillLink} should resolve to bundled skills`
      );
    }

    const mcpJson = JSON.parse(await fs.readFile(harness.mcpConfigPath, 'utf8'));
    assert.ok(mcpJson.mcpServers['agent-video-studio'], 'MCP config should register agent-video-studio');

    const kits = await listBrandKits(tmpVault, RESOURCES_DIR);
    const normNames = kits.map((k) => k.name.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    assert.equal(new Set(normNames).size, normNames.length, 'Brand kit presets must be deduplicated');

    // Verify transactional Brand Kit Undo & Export + Contact Sheet
    await saveProjectBrandKit(tmpVault, 'day-in-the-life-test', {
      ...DEFAULT_BRAND_TOKENS,
      accent_primary: '#FF00AA',
    });
    const afterBrandSave = await getProjectState(tmpVault, 'day-in-the-life-test');
    assert.equal(afterBrandSave.brandTokens.accent_primary, '#FF00AA');
    await undoLastTransaction(tmpVault, 'day-in-the-life-test');
    const afterBrandUndo = await getProjectState(tmpVault, 'day-in-the-life-test');
    assert.notEqual(afterBrandUndo.brandTokens.accent_primary, '#FF00AA');

    const capsCheck = await probeMediaPaths([]);
    assert.equal(typeof capsCheck.ffmpegCapabilities.hasDeshake, 'boolean');

    // Render a real 2s synthetic MP4 via exportProjectVideo + inspectTimelineContactSheet
    const exportProj = await createProjectFromIdea(tmpVault, {
      title: 'Export Smoke',
      slug: 'export-smoke',
      aspectRatio: '16:9',
    });
    assert.equal(exportProj.manifest.slug, 'export-smoke');
    const exportRes = await exportProjectVideo({
      vaultRoot: tmpVault,
      projectSlug: 'export-smoke',
      preset: 'custom',
      width: 1280,
      height: 720,
      fps: 24,
    });
    assert.ok(exportRes.sizeBytes > 1000, 'Exported MP4 should be non-empty');

    // Verify bundled HyperFrames & fixed motion-library scripts
    const renderSceneSrc = await fs.readFile(
      path.join(RESOURCES_DIR, 'skills', 'nazif-motion-scene-library', 'scripts', 'render_scene.mjs'),
      'utf8'
    );
    assert.ok(renderSceneSrc.includes('fileURLToPath'), 'render_scene.mjs should use fileURLToPath');
    const tokensCss = await fs.readFile(
      path.join(RESOURCES_DIR, 'skills', 'nazif-motion-scene-library', 'engine', 'tokens.css'),
      'utf8'
    );
    assert.ok(tokensCss.includes('html:has(body.transparent)'), 'tokens.css should fix transparent html');
    assert.ok(tokensCss.includes('SF Pro Display'), 'tokens.css should use Apple SF Pro / Inter');
    await fs.access(path.join(RESOURCES_DIR, 'skills', 'ai-video-editor', 'references', 'APPROVED_LOOKS.md'));
    await fs.access(path.join(RESOURCES_DIR, 'skills', 'hyperframes', 'SKILL.md'));
    await fs.access(path.join(RESOURCES_DIR, 'skills', 'hyperframes-core', 'SKILL.md'));
    const sheetRes = await inspectTimelineContactSheet({
      vaultRoot: tmpVault,
      projectSlug: 'export-smoke',
      frameCount: 8,
    });
    assert.ok(sheetRes.imagePath.endsWith('.png'), 'Contact sheet PNG should be generated');

    const srv = await startAssetServer(tmpVault, RESOURCES_DIR);
    try {
      const r1 = await fetch(`${srv.baseUrl}/scenes/scenes/01-kinetic-hook-mask.html?token=${srv.token}`);
      assert.equal(r1.status, 200);
      const r2 = await fetch(`${srv.baseUrl}/scenes/custom/smoke-custom-plate.html?token=${srv.token}`);
      assert.equal(r2.status, 200);
      const r3 = await fetch(`${srv.baseUrl}/scenes/engine/motion-engine.js?token=${srv.token}`);
      assert.equal(r3.status, 200);
    } finally {
      await srv.close();
    }
  } finally {
    await fs.rm(tmpBase, { recursive: true, force: true });
  }
  console.log('✓ Bundled resources, starter vault, custom scenes, and agent harness passed');
}

async function main() {
  const ideaCount = await testVaultAndTransactions();
  await testAssetServer();
  await testStarterVaultAndHarness();
  await testMcpServer(ideaCount);
  console.log('All smoke tests passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
