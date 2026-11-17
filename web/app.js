(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const layouts = ['standard', 'gpu', 'memory', 'fps'];
  let layout = layouts.includes(localStorage.getItem('layout')) ? localStorage.getItem('layout') : 'standard';
  let mode = 'monitor';
  let requestRunning = false;
  let animationFrame = 0;
  let diskSignature = '';
  if (navigator.userAgent.includes('AndroidCompanionApp')) document.body.classList.add('native-app');
  const metrics = Object.fromEntries(['cpu', 'gpu', 'ram', 'vram', 'fps'].map(id => [id, {
    current: null, from: null, target: null, start: 0, history: [], pending: null, shown: ''
  }]));
  const duration = 1700;

  function setMode(next) {
    mode = next;
    document.body.classList.toggle('scenes-active', next === 'scenes');
    document.body.classList.toggle('scene-controls-visible', next === 'scenes');
    $('monitor-pane').hidden = next !== 'monitor';
    $('scenes-pane').hidden = next !== 'scenes';
    $('monitor-tab').classList.toggle('selected', next === 'monitor');
    $('scenes-tab').classList.toggle('selected', next === 'scenes');
    if (window.SceneViewer) window.SceneViewer.setVisible(next === 'scenes');
    else if (next === 'scenes') {
      $('scene-stage').dataset.loading = 'loading scenes';
      import('/scenes.js').catch(() => { $('scene-stage').dataset.loading = 'scenes unavailable'; });
    }
    if (next === 'monitor') poll();
    else if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
    if (next === 'scenes' && !document.fullscreenElement && !document.body.classList.contains('native-app')) {
      document.documentElement.requestFullscreen().then(() => screen.orientation.lock('landscape')).catch(() => {});
    }
  }
  $('monitor-tab').addEventListener('click', () => setMode('monitor'));
  $('scenes-tab').addEventListener('click', () => setMode('scenes'));
  $('scene-exit').addEventListener('click', () => setMode('monitor'));
  window.CompanionSceneExit = () => setMode('monitor');

  function applyLayout() {
    document.body.classList.remove('layout-gpu', 'layout-memory', 'layout-fps');
    if (layout !== 'standard') document.body.classList.add('layout-' + layout);
    $('layout').textContent = `[layout: ${layout}]`;
    localStorage.setItem('layout', layout);
  }
  $('layout').addEventListener('click', () => {
    layout = layouts[(layouts.indexOf(layout) + 1) % layouts.length];
    applyLayout();
  });
  applyLayout();

  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        try { await screen.orientation.lock('landscape'); } catch (_) { /* Rotate manually if needed. */ }
      }
    } catch (_) { $('fullscreen').title = 'Fullscreen is unavailable in this browser'; }
  });

  function makePath(points) {
    if (!points.length) return '';
    let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], mid = (a.x + b.x) / 2;
      path += ` C${mid.toFixed(1)},${a.y.toFixed(1)} ${mid.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    }
    return path;
  }
  function drawGraph(id, state, progress = 1) {
    const graph = $(id + '-graph');
    if (!graph) return;
    const values = state.history.slice();
    if (state.pending != null) values.push(state.current);
    const offset = state.pending != null ? 10 * (1 - progress) : 0;
    const points = values.map((value, i) => ({
      x: 300 - (values.length - 1 - i) * 10 + offset,
      y: 30 - Math.max(0, Math.min(100, value)) * .28
    }));
    graph.querySelector('path').setAttribute('d', makePath(points));
  }
  function finishPending(state) {
    if (state.pending == null) return;
    state.history.push(state.pending);
    if (state.history.length > 30) state.history.shift();
    state.pending = null;
  }
  function showNumber(id, value, previous) {
    const element = $(id);
    const next = String(value);
    element.setAttribute('aria-label', next);
    const token = (element.rollToken || 0) + 1;
    element.rollToken = token;
    if (previous == null || previous === value || reduced.matches) {
      element.textContent = next;
      return;
    }
    const old = String(previous).padStart(next.length, ' ');
    const fresh = next.padStart(old.length, ' ');
    const up = value > previous;
    element.replaceChildren();
    for (let i = 0; i < fresh.length; i++) {
      const slot = document.createElement('span');
      const reel = document.createElement('span');
      slot.className = 'slot'; reel.className = 'slot-reel';
      const start = old[i], end = fresh[i];
      const numeric = /^\d$/.test(start) && /^\d$/.test(end);
      const frames = [start];
      if (numeric && start !== end) {
        let digit = Number(start);
        for (let step = 0; step < 2; step++) {
          digit = (digit + (up ? 1 : 9)) % 10;
          if (digit === Number(end)) break;
          frames.push(String(digit));
        }
      }
      if (start !== end) frames.push(end);
      if (!up) frames.reverse();
      for (const frame of frames) {
        const face = document.createElement('span');
        face.textContent = frame === ' ' ? '\u00a0' : frame;
        reel.append(face);
      }
      slot.append(reel); element.append(slot);
      if (frames.length > 1) reel.animate(
        up ? [{ transform: 'translateY(0)' }, { transform: `translateY(-${((frames.length - 1) / frames.length) * 100}%)` }]
           : [{ transform: `translateY(-${((frames.length - 1) / frames.length) * 100}%)` }, { transform: 'translateY(0)' }],
        { duration: 760, delay: i * 45, easing: 'cubic-bezier(.18,.72,.18,1)', fill: 'forwards' }
      );
    }
    setTimeout(() => { if (element.rollToken === token) element.textContent = next; }, 900);
  }
  function tick(now) {
    animationFrame = 0;
    if (document.hidden || mode !== 'monitor') return;
    let active = false;
    for (const [id, state] of Object.entries(metrics)) {
      if (state.pending == null) continue;
      const t = Math.min(1, (now - state.start) / duration);
      const eased = t * (2 - t);
      state.current = state.from + (state.target - state.from) * eased;
      drawGraph(id, state, t);
      if (t === 1) { finishPending(state); drawGraph(id, state); }
      else active = true;
    }
    if (active) animationFrame = requestAnimationFrame(tick);
  }
  function setMetric(id, value) {
    const state = metrics[id], element = $(id);
    if (!Number.isFinite(value)) {
      finishPending(state);
      state.current = state.from = state.target = null;
      state.shown = '--'; element.textContent = '--'; element.removeAttribute('aria-label');
      return;
    }
    if (state.target == null) {
      state.current = state.from = state.target = value;
      state.history.push(value);
      state.shown = String(Math.round(value)); showNumber(id, Math.round(value), null);
      drawGraph(id, state);
      return;
    }
    finishPending(state);
    if (reduced.matches || mode !== 'monitor' || Math.abs(value - state.current) < .05) {
      state.current = state.from = state.target = value;
      state.history.push(value);
      if (state.history.length > 30) state.history.shift();
      showNumber(id, Math.round(value), Number(state.shown));
      state.shown = String(Math.round(value));
      drawGraph(id, state);
      return;
    }
    state.from = state.current;
    state.target = value;
    state.start = performance.now();
    state.pending = value;
    showNumber(id, Math.round(value), Number(state.shown));
    state.shown = String(Math.round(value));
    if (!animationFrame) animationFrame = requestAnimationFrame(tick);
  }

  const temperature = (id, value) => { $(id).textContent = Number.isFinite(value) ? `${Math.round(value)}°c` : 'n/a'; };
  const space = gib => gib >= 1024 ? `${(gib / 1024).toFixed(1)} TiB` : `${gib.toFixed(1)} GiB`;
  function renderDisks(disks) {
    const signature = JSON.stringify(disks);
    if (signature === diskSignature) return;
    diskSignature = signature;
    const list = $('disks');
    list.replaceChildren();
    if (!Array.isArray(disks) || !disks.length) {
      const empty = document.createElement('div'); empty.className = 'disk-empty';
      empty.textContent = 'no local volumes available'; list.append(empty); return;
    }
    for (const disk of disks) {
      const row = document.createElement('div'); row.className = 'disk-row';
      const line = document.createElement('div'); line.className = 'disk-line';
      const name = document.createElement('strong'); name.textContent = disk.name;
      const detail = document.createElement('span');
      detail.textContent = `${Math.round(disk.percent)}% · ${space(disk.usedGiB)} / ${space(disk.totalGiB)}`;
      line.append(name, detail);
      const track = document.createElement('div'); track.className = 'disk-track';
      const fill = document.createElement('i'); fill.style.width = `${Math.max(0, Math.min(100, disk.percent))}%`;
      track.append(fill); row.append(line, track); list.append(row);
    }
  }
  function update(s) {
    if (!s.time) throw Error('missing sample');
    $('connection').textContent = 'usb / live';
    $('hostname').textContent = s.hostName || 'pc';
    $('cpu-name').textContent = s.cpuName || 'processor';
    $('gpu-name').textContent = s.gpuName || 'graphics adapter';
    setMetric('cpu', s.cpu); setMetric('gpu', s.gpu);
    setMetric('ram', s.ramPercent); setMetric('vram', s.vramPercent);
    setMetric('fps', s.fps);
    temperature('cpu-temp', s.cpuTemp); temperature('gpu-temp', s.gpuTemp);
    $('ram-detail').textContent = `${s.ramUsedGiB.toFixed(1)} / ${s.ramTotalGiB.toFixed(1)} GiB used`;
    $('vram-detail').textContent = s.vramUsedGiB == null ? 'sensor unavailable' :
      `${s.vramUsedGiB.toFixed(1)} / ${s.vramTotalGiB.toFixed(1)} GiB used`;
    renderDisks(s.disks || []);
    if (s.fpsSource === 'PresentMon CSV') {
      $('fps-source').textContent = 'PresentMon / per-game capture';
      $('fps-state').textContent = s.fps == null ? 'waiting for capture' : 'recent frame average';
    } else if (s.fpsSource === 'AMD display FPS') {
      $('fps-source').textContent = 'AMD display / all apps';
      $('fps-state').textContent = s.fps == null ? 'no active frames detected' : 'display average, not per-game';
    } else {
      $('fps-source').textContent = 'no frame source';
      $('fps-state').textContent = 'PresentMon needed for per-game FPS';
    }
    $('updated').textContent = 'updated just now';
  }
  async function poll() {
    if (requestRunning || document.hidden || mode !== 'monitor') return;
    requestRunning = true;
    try {
      const response = await fetch('/api/stats', { cache: 'no-store' });
      if (!response.ok) throw Error('offline');
      update(await response.json());
    } catch (_) {
      $('connection').textContent = 'usb / waiting';
      $('updated').textContent = 'reconnecting';
    } finally { requestRunning = false; }
  }
  poll();
  setInterval(poll, 2000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
    else if (!document.hidden) poll();
  });
})();
