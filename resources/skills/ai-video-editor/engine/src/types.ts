export type EasingName =
  | 'easeInOutCubic'
  | 'easeOutCubic'
  | 'easeInOutSine'
  | 'linear'
  | 'spring';

export interface CutSegment {
  /** Start time in source footage (seconds) */
  in: number;
  /** End time in source footage (seconds) */
  out: number;
  /** J-cut: seconds of audio leading BEFORE the visual cut (e.g. 0.35-0.75) */
  jCut?: number;
  /** L-cut: seconds of audio trailing AFTER the visual cut (e.g. 0.35-0.75) */
  lCut?: number;
  /** Optional scene transition into this cut */
  transition?: 'cut' | 'dip-to-black';
  /** Optional editorial note (why kept / what is said) */
  note?: string;
}

export interface CameraMove {
  /** Start time on the EDITED output timeline (seconds) */
  start: number;
  /** End time on the EDITED output timeline (seconds) */
  end: number;
  fromScale: number;
  toScale: number;
  fromPanX?: number;
  toPanX?: number;
  fromPanY?: number;
  toPanY?: number;
  holdAfter?: boolean;
  returnDuration?: number;
  easing?: EasingName;
  focusX?: number;
  focusY?: number;
  reason?: string;
}

export interface BrollBeat {
  label: string;
  start: number;
  end: number;
  source: string;
  kind?: 'video' | 'image';
  srcIn?: number;
  fade?: number;
  /** Keep subtle ambient sound (0 = silent default; 0.15-0.25 = Sarah Li / MKBHD natural ambience) */
  ambientVolume?: number;
  /** Optional playback speed (e.g., 1.5 or 2.0 for subtle speed-ramp feel) */
  playbackRate?: number;
  credit?: string;
}

export interface CalloutOverlay {
  type:
    | 'lower-third'
    | 'stat-card'
    | 'chapter-pill'
    | 'comparison'
    | 'spotlight'
    | 'counter'
    | 'editorial-title'
    | 'chapter-tracker';
  start: number;
  end: number;
  title: string;
  subtitle?: string;
  beforeText?: string;
  afterText?: string;
  /** For `counter`: numeric animation */
  fromValue?: number;
  toValue?: number;
  prefix?: string;
  suffix?: string;
  /** For `spotlight`: normalized 0..1 box to highlight while dimming background */
  box?: { x: number; y: number; w: number; h: number };
  /** For `chapter-tracker`: list of steps and 0-based active index */
  steps?: string[];
  activeStep?: number;
  accent?: string;
  position?: 'bottom-left' | 'top-left' | 'center-right' | 'center';
}

export interface SfxCue {
  /** Timestamp on EDITED timeline (seconds) */
  at: number;
  /** Built-in name (soft_pop | subtle_whoosh | riser_swell | ui_tick | bass_hit) or file path */
  sound: string;
  /** Gain in dB (default -18) */
  db?: number;
}

export interface SilenceDrop {
  start: number;
  end: number;
  /** Smooth fade-out / fade-in ramp duration in seconds (default 0.35) */
  fade?: number;
  reason?: string;
}

export interface ColorGrade {
  contrast?: number;
  saturate?: number;
  brightness?: number;
  vignette?: number;
  /** Subtle organic film grain opacity (0..0.08; Sarah Li / filmic texture) */
  filmGrain?: number;
  /** Built-in LUT name (sarah_warm_film | mkbhd_matte_clean) or path to custom .cube file */
  lut?: string;
  /** Blend intensity 0.0..1.0 (default 0.65 so skin tones stay natural) */
  lutIntensity?: number;
}

export interface EditPlan {
  project: string;
  sourceVideo: string;
  width: number;
  height: number;
  fps: number;
  faceAnchor?: { x: number; y: number };
  cuts: CutSegment[];
  /** Preserved audit log of auto-dropped flubbed/repeated takes */
  droppedRetakes?: CutSegment[];
  cameraMoves?: CameraMove[];
  broll?: BrollBeat[];
  callouts?: CalloutOverlay[];
  colorGrade?: ColorGrade;
  audio?: {
    musicTrack?: string;
    /** Base music level during non-speech pauses (default -18 dB when sidechainDuck=true, else -28 dB) */
    musicDb?: number;
    /** Enable smooth sidechain ducking (music ducks under speech, swells on pauses) */
    sidechainDuck?: boolean;
    targetLufs?: number;
    /** Automatically place subtle tactile SFX on callouts & transitions */
    autoSfx?: boolean;
    sfx?: SfxCue[];
    silenceDrops?: SilenceDrop[];
  };
}
