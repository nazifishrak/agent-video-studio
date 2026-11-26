/**
 * NazifAnimationArtifacts — Deterministic 30/60fps Motion Engine
 * Exposes window.MotionEngine, window.renderFrame(t), window.setProps(overrides),
 * and window.applyDesignTokens(tokenMap) for headless Chromium/Hyperframes/Remotion rendering.
 */
(function () {
  const EASE = {
    linear: (t) => t,
    'power2.out': (t) => 1 - Math.pow(1 - t, 2),
    'power2.inOut': (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    'power3.out': (t) => 1 - Math.pow(1 - t, 3),
    'power3.inOut': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    'expo.out': (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    'sine.inOut': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    'back.out': (t, ov = 1.5) => {
      const c3 = ov + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + ov * Math.pow(t - 1, 2);
    },
  };

  function prog(t, start, dur, easeName = 'power3.out') {
    if (t <= start) return 0;
    if (t >= start + dur) return 1;
    const raw = (t - start) / dur;
    if (easeName.startsWith('back.out')) {
      const m = easeName.match(/\(([\d.]+)\)/);
      return EASE['back.out'](raw, m ? parseFloat(m[1]) : 1.5);
    }
    return (EASE[easeName] || EASE['power3.out'])(raw);
  }

  function lerp(a, b, p) {
    return a + (b - a) * p;
  }

  function fitStage() {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const params = new URLSearchParams(window.location.search);
    const targetW = parseInt(params.get('w') || '1920', 10) || 1920;
    const targetH = parseInt(params.get('h') || '1080', 10) || 1080;
    stage.style.width = targetW + 'px';
    stage.style.height = targetH + 'px';
    const s = Math.min(window.innerWidth / targetW, window.innerHeight / targetH);
    stage.style.transform = `scale(${s})`;
    stage.style.left = `${Math.max(0, (window.innerWidth - targetW * s) / 2)}px`;
    stage.style.top = `${Math.max(0, (window.innerHeight - targetH * s) / 2)}px`;
  }

  function applyDesignTokens(tokenMap) {
    if (!tokenMap || typeof tokenMap !== 'object') return;
    const root = document.documentElement;
    const keyMap = {
      display_font: '--font-display',
      body_font: '--font-body',
      display_weight: '--display-weight',
      display_tracking: '--display-tracking',
      body_tracking: '--body-tracking',
      stage_bg: '--stage-bg',
      surface_card: '--surface-card',
      surface_well: '--surface-well',
      border_subtle: '--border-subtle',
      border_width: '--border-width',
      text_primary: '--text-primary',
      text_muted: '--text-muted',
      accent_primary: '--accent-primary',
      accent_soft: '--accent-soft',
      accent_warm: '--accent-warm',
      accent_warm_soft: '--accent-warm-soft',
      status_positive: '--status-positive',
      status_positive_soft: '--status-positive-soft',
      status_negative: '--status-negative',
      status_negative_soft: '--status-negative-soft',
      skeleton_primary: '--skeleton-primary',
      skeleton_secondary: '--skeleton-secondary',
      radius_card: '--radius-card',
      radius_control: '--radius-control',
      shadow_card: '--shadow-card',
      aurora_opacity: '--aurora-opacity',
      aurora_gradient: '--aurora-gradient',
    };
    Object.entries(tokenMap).forEach(([k, v]) => {
      const cssVar = k.startsWith('--') ? k : keyMap[k];
      if (cssVar) root.style.setProperty(cssVar, v);
    });
  }

  function bootScene({ meta, defaultProps, mount, render }) {
    let props = Object.assign({}, defaultProps);
    const params = new URLSearchParams(window.location.search);

    if (params.get('transparent') === '1') {
      document.body.classList.add('transparent');
    }
    if (params.get('props')) {
      try {
        Object.assign(props, JSON.parse(params.get('props')));
      } catch (e) {}
    }

    window.SCENE_META = meta;
    window.SCENE_PROPS = props;
    window.applyDesignTokens = applyDesignTokens;

    window.setProps = function (overrides) {
      Object.assign(props, overrides || {});
      window.SCENE_PROPS = props;
      mount(props);
      render(currentT, props);
    };

    let currentT = 0;
    let rafId = null;
    let lastTs = null;
    const isManual = params.get('manual') === '1' || params.has('t');

    window.renderFrame = function (t) {
      currentT = Math.max(0, Math.min(meta.duration, Number(t) || 0));
      render(currentT, props);
    };

    window.addEventListener('message', (e) => {
      const msg = e.data || {};
      if (msg.type === 'SEEK') {
        cancelAnimationFrame(rafId);
        window.renderFrame(msg.t);
      } else if (msg.type === 'SET_TOKENS') {
        applyDesignTokens(msg.tokens);
      } else if (msg.type === 'SET_PROPS') {
        window.setProps(msg.props);
      }
    });

    window.addEventListener('resize', fitStage);
    fitStage();
    mount(props);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'SCENE_READY', id: meta.id }, '*');
      }
    } catch (e) {}

    if (isManual) {
      window.renderFrame(parseFloat(params.get('t') || '0'));
    } else {
      function loop(ts) {
        if (lastTs === null) lastTs = ts;
        const dt = Math.min(0.1, (ts - lastTs) / 1000);
        lastTs = ts;
        currentT = (currentT + dt) % meta.duration;
        render(currentT, props);
        rafId = requestAnimationFrame(loop);
      }
      rafId = requestAnimationFrame(loop);
    }
  }

  window.MotionEngine = { prog, lerp, bootScene, applyDesignTokens };
})();
