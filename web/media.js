(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let media = null, token = '', received = 0, busy = false, polling = false, dragging = false, key = '', art = '';
  const time = seconds => { const n = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
  const position = () => media ? Math.min(media.duration, media.position + (media.playing ? (performance.now() - received) / 1000 * media.rate : 0)) : 0;
  function progress() {
    if (!media || dragging || document.hidden || document.body.classList.contains('scenes-active')) return;
    const p = position(); $('media-seek').value = p; $('media-position').textContent = time(p);
  }
  function transition(next) {
    if (next === key) return false;
    const previous = key === 'idle' ? $('media-idle') : $('media-player');
    if (key && !reduced.matches) {
      const ghost = previous.cloneNode(true);
      ghost.removeAttribute('id'); ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      ghost.classList.add('media-ghost'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
      $('media-panel').append(ghost);
      ghost.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-110%)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.18,.72,.18,1)' }).onfinish = () => ghost.remove();
    }
    key = next;
    return true;
  }
  function render() {
    const active = media && media.available;
    const changed = transition(active ? media.session + media.title : 'idle');
    $('media-player').hidden = !active; $('media-idle').hidden = active;
    if (changed && !reduced.matches) $(active ? 'media-player' : 'media-idle').animate([{ transform: 'translateY(110%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.18,.72,.18,1)' });
    if (!active) return;
    $('media-title').textContent = media.title;
    $('media-artist').textContent = media.artist || (media.playing ? 'playing' : 'paused');
    $('media-source').textContent = /spotify/i.test(media.source) ? 'spotify' : /chrome|brave|edge|firefox/i.test(media.source) ? 'browser media' : 'now playing';
    $('media-player').dataset.kind = media.kind;
    if ((media.kind === 'unknown' || /chrome|brave|edge|firefox/i.test(media.source)) && $('media-art').naturalWidth) $('media-player').dataset.kind = $('media-art').naturalWidth / $('media-art').naturalHeight > 1.3 ? 'video' : 'music';
    if (art !== media.artwork) {
      art = media.artwork;
      $('media-art').hidden = !art; $('media-placeholder').hidden = !!art;
      if (art) $('media-art').src = '/api/media/artwork?v=' + encodeURIComponent(art);
      else $('media-art').removeAttribute('src');
    }
    $('media-toggle').textContent = media.playing ? 'Ⅱ' : '▶';
    $('media-toggle').setAttribute('aria-label', media.playing ? 'Pause' : 'Play');
    $('media-toggle').disabled = busy || !(media.playing ? media.canPause : media.canPlay);
    $('media-prev').disabled = busy || !media.canPrevious; $('media-next').disabled = busy || !media.canNext;
    for (const id of ['media-seek', 'media-back', 'media-forward']) $(id).disabled = busy || !media.canSeek || media.duration <= 0;
    $('media-seek').max = media.duration; $('media-duration').textContent = time(media.duration);
    progress();
  }
  $('media-art').addEventListener('load', () => {
    if (media && (media.kind === 'unknown' || /chrome|brave|edge|firefox/i.test(media.source))) $('media-player').dataset.kind = $('media-art').naturalWidth / $('media-art').naturalHeight > 1.3 ? 'video' : 'music';
  });
  $('media-art').addEventListener('error', () => { $('media-art').hidden = true; $('media-placeholder').hidden = false; });
  async function poll() {
    if (polling || busy || document.hidden || document.body.classList.contains('scenes-active')) return;
    polling = true;
    try {
      const response = await fetch('/api/media', { cache: 'no-store' });
      if (!response.ok) throw Error();
      const value = await response.json(); media = value.media; token = value.token; received = performance.now();
      render();
    } catch { media = null; render(); }
    finally { polling = false; }
  }
  async function command(action, seconds = 0) {
    if (!media || busy) return;
    busy = true; render(); $('media-message').textContent = '';
    try {
      const response = await fetch('/api/media/control', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Media-Token': token }, body: JSON.stringify({ session: media.session, action, seconds }) });
      if (!response.ok) throw Error();
      if (action === 'play' || action === 'pause') { media.position = position(); received = performance.now(); media.playing = action === 'play'; }
      if (action === 'seek') { media.position = seconds; received = performance.now(); }
    } catch { $('media-message').textContent = 'player did not accept control'; }
    finally { busy = false; render(); }
  }
  $('media-toggle').onclick = () => command(media.playing ? 'pause' : 'play');
  $('media-prev').onclick = () => command('previous'); $('media-next').onclick = () => command('next');
  $('media-back').onclick = () => command('seek', Math.max(0, position() - 10));
  $('media-forward').onclick = () => command('seek', Math.min(media.duration, position() + 10));
  $('media-seek').addEventListener('input', () => { dragging = true; $('media-position').textContent = time(Number($('media-seek').value)); });
  $('media-seek').addEventListener('change', () => { dragging = false; command('seek', Number($('media-seek').value)); });
  $('media-seek').addEventListener('pointercancel', () => { dragging = false; });
  setInterval(poll, 2000); setInterval(progress, 250); poll();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
