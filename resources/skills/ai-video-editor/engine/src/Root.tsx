import React from 'react';
import { Composition } from 'remotion';
import { VideoEditor } from './VideoEditor';
import type { EditPlan } from './types';

const DEFAULT_PLAN: EditPlan = {
  project: 'demo-edit',
  sourceVideo: '',
  width: 1920,
  height: 1080,
  fps: 30,
  faceAnchor: { x: 0.5, y: 0.38 },
  cuts: [{ in: 0, out: 5, note: 'Placeholder segment' }],
  cameraMoves: [],
  broll: [],
  callouts: [],
};

export function totalEditedDurationSec(plan: EditPlan): number {
  const total = (plan.cuts || []).reduce((acc, c) => acc + Math.max(0, c.out - c.in), 0);
  return Math.max(0.5, total);
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AIVideoEdit"
      component={VideoEditor}
      durationInFrames={150}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ plan: DEFAULT_PLAN }}
      calculateMetadata={({ props }) => {
        const plan = props.plan || DEFAULT_PLAN;
        const fps = plan.fps || 30;
        const durationSec = totalEditedDurationSec(plan);
        return {
          durationInFrames: Math.max(1, Math.round(durationSec * fps)),
          fps,
          width: plan.width || 1920,
          height: plan.height || 1080,
        };
      }}
    />
  );
};
