import { scenes } from './vendor/ascii/manifest.js';
import { mount } from './vendor/ascii/mount.js';

const $ = id => document.getElementById(id);
const stage = $('scene-stage');
const pane = $('scenes-pane');
const picker = $('scene-list');
const names = $('scene-list-items');
let index = Math.max(0, scenes.indexOf(localStorage.getItem('scene')));
let visible = false;
let playing = true;
let stop = null;
let generation = 0;
let current = null;
let sceneRatio = 2;
let controlsTimer = 0;
const cache = new Map();

function revealControls() {
  if (!visible || !picker.hidden) return;
  document.body.classList.add('scene-controls-visible');
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => document.body.classList.remove('scene-controls-visible'), 3500);
}

for (const [i, slug] of scenes.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = slug.replaceAll('-', ' ');
  button.addEventListener('click', () => { picker.hidden = true; show(i); revealControls(); });
  names.append(button);
}

function resize() {
  if (!current) return;
  const width = Math.max(stage.clientWidth, stage.clientHeight * sceneRatio);
  current.style.width = Math.max(1, Math.floor(width)) + 'px';
}

function clear() {
  if (stop) stop();
  stop = null;
  if (current) current.remove();
  current = null;
}

async function show(next) {
  index = (next + scenes.length) % scenes.length;
  const slug = scenes[index];
  localStorage.setItem('scene', slug);
  $('scene-name').textContent = slug.replaceAll('-', ' ');
  $('scene-count').textContent = (index + 1) + ' / ' + scenes.length;
  for (const [i, button] of [...names.children].entries()) button.classList.toggle('selected', i === index);
  const request = ++generation;
  clear();
  if (!visible) return;
  stage.dataset.loading = 'loading scene';
  try {
    if (!cache.has(slug)) cache.set(slug, import('./vendor/ascii/pieces/' + slug + '.js'));
    const piece = await cache.get(slug);
    if (request !== generation || !visible) return;
    sceneRatio = (piece.meta.cols || 80) / ((piece.meta.rows || 24) * (piece.meta.cell || 2));
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', piece.meta.name || slug);
    stage.append(canvas);
    current = canvas;
    resize();
    stop = mount(canvas, piece, { fps: playing ? Math.min(piece.meta.fps || 10, 10) : 0 });
    delete stage.dataset.loading;
  } catch (_) {
    if (request !== generation) return;
    stage.dataset.loading = 'scene unavailable';
    cache.delete(slug);
  }
}

function setVisible(value) {
  visible = value;
  if (visible) { show(index); revealControls(); }
  else { ++generation; clear(); picker.hidden = true; clearTimeout(controlsTimer); delete stage.dataset.loading; }
}

window.SceneViewer = { setVisible };
if (!pane.hidden) setVisible(true);
$('scene-prev').addEventListener('click', () => { show(index - 1); revealControls(); });
$('scene-next').addEventListener('click', () => { show(index + 1); revealControls(); });
$('scene-play').addEventListener('click', () => {
  playing = !playing;
  $('scene-play').textContent = playing ? '[pause]' : '[play]';
  show(index);
  revealControls();
});
$('scene-picker').addEventListener('click', () => { picker.hidden = !picker.hidden; clearTimeout(controlsTimer); });
$('scene-list-close').addEventListener('click', () => { picker.hidden = true; revealControls(); });
document.addEventListener('keydown', e => {
  if (!visible) return;
  if (e.key === 'ArrowLeft') show(index - 1);
  if (e.key === 'ArrowRight') show(index + 1);
  if (e.key === 'Escape') { picker.hidden = true; revealControls(); }
});
stage.addEventListener('click', e => {
  if (!picker.hidden || (e.target !== stage && e.target !== current)) return;
  document.body.classList.contains('scene-controls-visible')
    ? document.body.classList.remove('scene-controls-visible') : revealControls();
});
let touchX = null, touchY = null;
stage.addEventListener('touchstart', e => {
  if (picker.hidden && e.touches.length === 1) {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }
}, { passive: true });
stage.addEventListener('touchend', e => {
  if (touchX == null || !picker.hidden) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
  touchX = touchY = null;
}, { passive: true });
new ResizeObserver(resize).observe(stage);
