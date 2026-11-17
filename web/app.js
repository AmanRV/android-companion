(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cpuHistory = [], gpuHistory = [];
  const status = $('connection');
  const number = (value, suffix) => value == null ? '--<small>' + suffix + '</small>' : Math.round(value) + '<small>' + suffix + '</small>';
  const ring = (id, value, color, track) => { $(id).style.background = `radial-gradient(closest-side,#101b21 79%,transparent 81%),conic-gradient(${color} ${value || 0}%,${track} 0%)`; };
  const bars = $('ram-bars');
  for (let i = 0; i < 16; i++) bars.appendChild(document.createElement('i'));
  function graph(id, values) {
    const path = $(id).querySelector('path');
    path.setAttribute('d', values.map((v, i) => `${i ? 'L' : 'M'}${(i / 29 * 300).toFixed(1)},${(68 - Math.max(0, Math.min(100, v)) * .65).toFixed(1)}`).join(' '));
  }
  function update(s) {
    const age = Date.now() - Date.parse(s.time);
    if (!Number.isFinite(age) || age > 8000) throw Error('stale');
    status.textContent = 'LIVE / USB'; status.classList.add('live');
    $('cpu').innerHTML = number(s.cpu, '%'); $('gpu').innerHTML = number(s.gpu, '%');
    $('ram').innerHTML = number(s.ramPercent, '%'); $('fps').innerHTML = number(s.fps, 'FPS');
    $('cpu-temp').textContent = s.cpuTemp == null ? 'N/A' : `${Math.round(s.cpuTemp)}°C`;
    $('gpu-temp').textContent = s.gpuTemp == null ? 'N/A' : `${Math.round(s.gpuTemp)}°C`;
    $('gpu-source').textContent = s.gpuSource;
    $('ram-detail').textContent = `${s.ramUsedGiB.toFixed(1)} / ${s.ramTotalGiB.toFixed(1)} GiB`;
    $('fps-source').textContent = s.fps == null ? 'PRESENTMON OPTIONAL' : 'PRESENTMON CSV';
    $('fps-state').textContent = s.fps == null ? 'STANDBY' : 'ACTIVE';
    $('updated').textContent = `UPDATED ${new Date(s.time).toLocaleTimeString()}`;
    ring('cpu-ring', s.cpu, '#80f3db', '#273b40'); ring('gpu-ring', s.gpu, '#b6a0ef', '#303047');
    [...bars.children].forEach((bar, i) => { bar.classList.toggle('on', i < Math.round(s.ramPercent / 100 * 16)); bar.style.height = `${25 + (i * 17 % 65)}%`; });
    cpuHistory.push(s.cpu || 0); gpuHistory.push(s.gpu || 0);
    if (cpuHistory.length > 30) cpuHistory.shift(); if (gpuHistory.length > 30) gpuHistory.shift();
    graph('cpu-graph', cpuHistory); graph('gpu-graph', gpuHistory);
  }
  async function poll() {
    if (document.hidden) return;
    try {
      const response = await fetch('/api/stats', { cache: 'no-store' });
      if (!response.ok) throw Error('offline');
      update(await response.json());
    } catch (_) { status.textContent = 'WAITING FOR USB'; status.classList.remove('live'); $('updated').textContent = 'RECONNECTING'; }
  }
  poll(); setInterval(poll, 2000);
  setInterval(() => { if (!document.hidden) $('clock').textContent = new Date().toLocaleTimeString([], { hour12: false }); }, 1000);
  $('layout').addEventListener('click', () => { document.body.classList.toggle('compact'); localStorage.setItem('compact', document.body.classList.contains('compact') ? '1' : '0'); });
  if (localStorage.getItem('compact') === '1') document.body.classList.add('compact');
  $('fullscreen').addEventListener('click', async () => {
    try { if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); try { await screen.orientation.lock('landscape'); } catch (_) {} } else await document.exitFullscreen(); }
    catch (_) { $('fullscreen').title = 'Use Chrome Add to Home screen for a standalone view'; }
  });

  // Small character grid, six frames per second, no device-pixel-ratio scaling.
  const canvas = $('wallpaper'), ctx = canvas.getContext('2d', { alpha: false });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let cols = 0, rows = 0, tick = 0, last = 0;
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; cols = Math.ceil(innerWidth / 24); rows = Math.ceil(innerHeight / 28); ctx.font = '11px Consolas, monospace'; }
  addEventListener('resize', resize, { passive: true }); resize();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < (reduced.matches ? 1500 : 165)) return;
    last = now; tick++;
    ctx.fillStyle = '#070b10'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const glyphs = ['·', ':', '+', '×', '○'];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const wave = Math.sin(x * .29 + tick * .08) + Math.cos(y * .34 - tick * .06);
      if (wave < .45) continue;
      const n = (x * 17 + y * 31 + Math.floor(tick / 9)) % glyphs.length;
      ctx.fillStyle = wave > 1.5 ? '#3a7774' : '#255159';
      ctx.fillText(glyphs[n], x * 24 + 4, y * 28 + 12);
    }
  }
  requestAnimationFrame(frame);
})();
