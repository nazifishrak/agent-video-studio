import { z } from 'zod';

export const IdeaFrontmatterSchema = z
  .object({
    title: z.string().default('Untitled Idea'),
    pillar: z.string().default('General'),
    format: z.string().default('Long-Form'),
    status: z.string().default('Idea'),
    target_length: z.string().optional(),
    intro_formula: z.string().optional(),
    repurpose_short: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export type IdeaFrontmatter = z.infer<typeof IdeaFrontmatterSchema>;

export interface ChecklistItem {
  index: number;
  text: string;
  checked: boolean;
  line: number;
}

export interface IdeaCue {
  type: 'VISUAL' | 'B-ROLL CUE' | 'DELIVERY CUE' | 'SCREEN / ARTIFACT CUE' | 'B-ROLL RESET' | 'SAY';
  text: string;
  line: number;
}

export interface IdeaRecord {
  id: string;
  slug: string;
  filePath: string;
  frontmatter: IdeaFrontmatter;
  body: string;
  checklistItems: ChecklistItem[];
  cues: IdeaCue[];
}

export const WordTokenSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  isFiller: z.boolean().optional(),
  deleted: z.boolean().optional(),
  speaker: z.string().optional(),
});

export type WordToken = z.infer<typeof WordTokenSchema>;

export const TranscriptDocSchema = z.object({
  version: z.literal(1).default(1),
  sourceFile: z.string().optional(),
  language: z.string().default('en'),
  words: z.array(WordTokenSchema).default([]),
});

export type TranscriptDoc = z.infer<typeof TranscriptDocSchema>;

export const WordAnchorSchema = z.object({
  wordId: z.string(),
  offsetSec: z.number().default(0),
});

export type WordAnchor = z.infer<typeof WordAnchorSchema>;

export const CutSegmentSchema = z.object({
  id: z.string().optional(),
  in: z.number().nonnegative(),
  out: z.number().nonnegative(),
  jCut: z.number().nonnegative().optional(),
  lCut: z.number().nonnegative().optional(),
  transition: z.enum(['cut', 'dip-to-black']).optional(),
  note: z.string().optional(),
});

export type CutSegment = z.infer<typeof CutSegmentSchema>;

export const CameraMoveSchema = z.object({
  id: z.string().optional(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  fromScale: z.number().default(1.0),
  toScale: z.number().default(1.08),
  fromPanX: z.number().optional(),
  toPanX: z.number().optional(),
  fromPanY: z.number().optional(),
  toPanY: z.number().optional(),
  holdAfter: z.boolean().optional(),
  returnDuration: z.number().optional(),
  easing: z.enum(['easeInOutCubic', 'easeOutCubic', 'easeInOutSine', 'linear', 'spring']).optional(),
  focusX: z.number().min(0).max(1).optional(),
  focusY: z.number().min(0).max(1).optional(),
  wordAnchor: WordAnchorSchema.optional(),
  reason: z.string().optional(),
});

export type CameraMove = z.infer<typeof CameraMoveSchema>;

export const BrollBeatSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  source: z.string(),
  kind: z.enum(['video', 'image']).optional(),
  srcIn: z.number().nonnegative().optional(),
  fade: z.number().nonnegative().optional(),
  ambientVolume: z.number().min(0).max(1).optional(),
  playbackRate: z.number().positive().optional(),
  credit: z.string().optional(),
  rightsTag: z.enum(['CLEARED', 'UNCLEARED_REFERENCE', 'LOCAL']).optional(),
  wordAnchor: WordAnchorSchema.optional(),
});

export type BrollBeat = z.infer<typeof BrollBeatSchema>;

export const MotionPlateSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  label: z.string().optional(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  wordAnchor: WordAnchorSchema.optional(),
  props: z.record(z.unknown()).default({}),
  transparent: z.boolean().default(false),
  themeOverride: z.string().optional(),
});

export type MotionPlate = z.infer<typeof MotionPlateSchema>;

export const CaptionSegmentSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  wordAnchor: WordAnchorSchema.optional(),
  highlightWord: z.string().optional(),
});

export type CaptionSegment = z.infer<typeof CaptionSegmentSchema>;

export const CalloutOverlaySchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    'lower-third',
    'stat-card',
    'chapter-pill',
    'comparison',
    'spotlight',
    'counter',
    'editorial-title',
    'chapter-tracker',
  ]),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  title: z.string(),
  subtitle: z.string().optional(),
  beforeText: z.string().optional(),
  afterText: z.string().optional(),
  fromValue: z.number().optional(),
  toValue: z.number().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  steps: z.array(z.string()).optional(),
  activeStep: z.number().int().optional(),
  accent: z.string().optional(),
  position: z.enum(['bottom-left', 'top-left', 'center-right', 'center']).optional(),
  wordAnchor: WordAnchorSchema.optional(),
});

export type CalloutOverlay = z.infer<typeof CalloutOverlaySchema>;

export const SfxCueSchema = z.object({
  id: z.string().optional(),
  at: z.number().nonnegative(),
  sound: z.string(),
  db: z.number().optional(),
  wordAnchor: WordAnchorSchema.optional(),
});

export type SfxCue = z.infer<typeof SfxCueSchema>;

export const SilenceDropSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  fade: z.number().nonnegative().optional(),
  reason: z.string().optional(),
});

export const ColorGradeSchema = z.object({
  contrast: z.number().optional(),
  saturate: z.number().optional(),
  brightness: z.number().optional(),
  vignette: z.number().optional(),
  filmGrain: z.number().optional(),
  lut: z.string().optional(),
  lutIntensity: z.number().min(0).max(1).optional(),
});

export const AudioConfigSchema = z.object({
  musicTrack: z.string().optional(),
  musicDb: z.number().optional(),
  sidechainDuck: z.boolean().optional(),
  targetLufs: z.number().optional(),
  autoSfx: z.boolean().optional(),
  sfx: z.array(SfxCueSchema).optional(),
  silenceDrops: z.array(SilenceDropSchema).optional(),
});

export const MediaAssetSchema = z.object({
  id: z.string(),
  kind: z.enum(['video', 'audio', 'image']),
  uri: z.string(),
  label: z.string().optional(),
  durationSec: z.number().nonnegative().optional(),
  fps: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  hasAudio: z.boolean().optional(),
});

export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const SequenceShotSchema = z.object({
  id: z.string(),
  assetId: z.string().optional(),
  source: z.string(),
  label: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  srcIn: z.number().nonnegative().default(0),
  speed: z.number().positive().default(1),
  volume: z.number().min(0).max(2).default(1),
  transitionIn: z.enum(['cut', 'crossfade', 'dip-to-black']).default('cut'),
  stabilize: z.boolean().default(false),
  note: z.string().optional(),
});

export type SequenceShot = z.infer<typeof SequenceShotSchema>;

export const ReviewNoteSchema = z.object({
  id: z.string(),
  atSec: z.number().nonnegative(),
  endSec: z.number().nonnegative().optional(),
  text: z.string(),
  author: z.enum(['human', 'agent']).default('human'),
  resolved: z.boolean().default(false),
  createdAt: z.string(),
});

export type ReviewNote = z.infer<typeof ReviewNoteSchema>;

export const EditPlanV2Schema = z.object({
  version: z.literal(2).default(2),
  revision: z.number().int().nonnegative().default(0),
  project: z.string(),
  sourceVideo: z.string().default(''),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.number().int().positive().default(30),
  faceAnchor: z.object({ x: z.number(), y: z.number() }).optional(),
  assets: z.array(MediaAssetSchema).default([]),
  shots: z.array(SequenceShotSchema).default([]),
  cuts: z.array(CutSegmentSchema).default([]),
  droppedRetakes: z.array(CutSegmentSchema).optional(),
  cameraMoves: z.array(CameraMoveSchema).default([]),
  broll: z.array(BrollBeatSchema).default([]),
  motionPlates: z.array(MotionPlateSchema).default([]),
  captions: z.array(CaptionSegmentSchema).default([]),
  callouts: z.array(CalloutOverlaySchema).default([]),
  reviewNotes: z.array(ReviewNoteSchema).default([]),
  colorGrade: ColorGradeSchema.optional(),
  audio: AudioConfigSchema.optional(),
});

export type EditPlanV2 = z.infer<typeof EditPlanV2Schema>;

export const ProjectManifestSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  ideaId: z.string().optional(),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  fps: z.number().int().positive().default(30),
  brandKitId: z.string().default('project-design-md'),
  status: z.enum(['Draft', 'Editing', 'Review', 'Exported']).default('Draft'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;

export const MotionSceneMetaSchema = z.object({
  id: z.string(),
  number: z.string(),
  name: z.string(),
  category: z.string(),
  inspiration: z.string().default('Custom'),
  duration: z.number().positive().default(5.0),
  fps: z.number().int().positive().default(30),
  transparent_ready: z.boolean().default(false),
  file: z.string(),
  description: z.string().default(''),
  default_props: z.record(z.unknown()).default({}),
  isCustom: z.boolean().optional(),
});

export type MotionSceneMeta = z.infer<typeof MotionSceneMetaSchema>;

export const TransactionRecordSchema = z.object({
  txId: z.string(),
  actor: z.enum(['human', 'agent']),
  agentName: z.string().optional(),
  summary: z.string(),
  timestamp: z.string(),
  projectSlug: z.string(),
  changedFiles: z.array(z.string()),
});

export type TransactionRecord = z.infer<typeof TransactionRecordSchema>;

export const TimelineOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_motion_plate'),
    plate: MotionPlateSchema,
  }),
  z.object({
    op: z.literal('update_motion_plate'),
    id: z.string(),
    patch: MotionPlateSchema.partial(),
  }),
  z.object({
    op: z.literal('remove_motion_plate'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('add_broll'),
    broll: BrollBeatSchema,
  }),
  z.object({
    op: z.literal('update_broll'),
    index: z.number().int().nonnegative().optional(),
    id: z.string().optional(),
    patch: BrollBeatSchema.partial(),
  }),
  z.object({
    op: z.literal('remove_broll'),
    index: z.number().int().nonnegative().optional(),
    id: z.string().optional(),
  }),
  z.object({
    op: z.literal('add_camera_move'),
    move: CameraMoveSchema,
  }),
  z.object({
    op: z.literal('update_camera_move'),
    index: z.number().int().nonnegative().optional(),
    id: z.string().optional(),
    patch: CameraMoveSchema.partial(),
  }),
  z.object({
    op: z.literal('remove_camera_move'),
    index: z.number().int().nonnegative().optional(),
    id: z.string().optional(),
  }),
  z.object({
    op: z.literal('add_callout'),
    callout: CalloutOverlaySchema,
  }),
  z.object({
    op: z.literal('update_callout'),
    index: z.number().int().nonnegative().optional(),
    id: z.string().optional(),
    patch: CalloutOverlaySchema.partial(),
  }),
  z.object({
    op: z.literal('remove_callout'),
    index: z.number().int().nonnegative().optional(),
    id: z.string().optional(),
  }),
  z.object({
    op: z.literal('add_caption'),
    caption: CaptionSegmentSchema,
  }),
  z.object({
    op: z.literal('update_caption'),
    id: z.string(),
    patch: CaptionSegmentSchema.partial(),
  }),
  z.object({
    op: z.literal('remove_caption'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('set_cuts'),
    cuts: z.array(CutSegmentSchema),
  }),
  z.object({
    op: z.literal('set_source_video'),
    sourceVideo: z.string(),
  }),
  z.object({
    op: z.literal('set_canvas'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive().optional(),
  }),
  z.object({
    op: z.literal('upsert_asset'),
    asset: MediaAssetSchema,
  }),
  z.object({
    op: z.literal('remove_asset'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('set_shots'),
    shots: z.array(SequenceShotSchema),
  }),
  z.object({
    op: z.literal('add_shot'),
    shot: SequenceShotSchema,
  }),
  z.object({
    op: z.literal('update_shot'),
    id: z.string(),
    patch: SequenceShotSchema.partial(),
  }),
  z.object({
    op: z.literal('remove_shot'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('add_review_note'),
    note: ReviewNoteSchema,
  }),
  z.object({
    op: z.literal('resolve_review_note'),
    id: z.string(),
    resolved: z.boolean(),
  }),
  z.object({
    op: z.literal('remove_review_note'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('toggle_word_deleted'),
    wordId: z.string(),
    deleted: z.boolean(),
  }),
  z.object({
    op: z.literal('update_color_grade'),
    colorGrade: ColorGradeSchema,
  }),
  z.object({
    op: z.literal('update_audio'),
    audio: AudioConfigSchema,
  }),
  z.object({
    op: z.literal('update_brand_tokens'),
    tokens: z.record(z.string()),
  }),
]);

export type TimelineOp = z.infer<typeof TimelineOpSchema>;

export interface ContextChip {
  id: string;
  kind: 'project' | 'time-range' | 'motion-scene' | 'brand-kit' | 'transcript-selection' | 'review-note';
  label: string;
  payload: Record<string, unknown>;
}
