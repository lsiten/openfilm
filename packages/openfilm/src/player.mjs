import { Player } from './player-audio.mjs';

const player = new Player();
let film, duration = 1, t = 0, playing = false, raf = 0;
let bar, playBtn, prog, fill, timeEl;
let drawing = false, pending = false;

function sendState(error) {
  window.parent.postMessage({ source: 'openfilm-player', type: 'openfilm:player-state', time: t, duration, playing, ...(error ? { error } : {}) }, '*');
}
function fail(error) {
  player.pause();
  playing = false;
  cancelAnimationFrame(raf);
  update();
  sendState(error instanceof Error ? error.message : String(error));
}
async function draw() {
  pending = true;
  if (drawing) return;
  drawing = true;
  try {
    while (pending) {
      pending = false;
      const at = t;
      window.filmHost.time(at);
      if (window.__filmEditor?.watch) await window.__filmEditor.watch(at, playing ? { rate: 1, now: at } : null);
      else await film.frame(at);
      window.filmHost.settle(at);
    }
  } finally {
    drawing = false;
  }
}
function redraw() { void draw().catch(fail); }
function fmt(x) {
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(Math.floor(x % 60)).padStart(2, '0');
}
  function css() {
    var s = document.createElement('style');
    s.textContent =
      '.of-player-bar{position:fixed;left:0;right:0;bottom:0;height:42px;display:flex;align-items:center;gap:10px;padding:0 12px;'
      + 'background:linear-gradient(to top,rgba(0,0,0,.82),rgba(0,0,0,0));color:#fff;z-index:2147483647;'
      + 'font:12px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;pointer-events:auto}'
      + '.of-player-bar .of-player-play{flex:0 0 auto;width:32px;height:32px;border:0;border-radius:50%;cursor:pointer;'
      + 'background:rgba(255,255,255,.16);color:#fff;display:flex;align-items:center;justify-content:center;transition:background .12s}'
      + '.of-player-bar .of-player-play:hover{background:rgba(255,255,255,.30)}'
      + '.of-player-bar .of-player-playicon{font-size:13px;line-height:1}'
      + '.of-player-bar .of-player-progress{flex:1 1 auto;height:18px;display:flex;align-items:center;cursor:pointer}'
      + '.of-player-bar .of-player-track{flex:1 1 auto;height:4px;border-radius:2px;background:rgba(255,255,255,.22);position:relative;overflow:hidden}'
      + '.of-player-bar .of-player-fill{height:100%;width:0;background:#fff}'
      + '.of-player-bar .of-player-time{flex:0 0 auto;min-width:76px;text-align:right;font-variant-numeric:tabular-nums;opacity:.9}';
    document.documentElement.appendChild(s);
  }
  function build() {
    if (bar) return;
    bar = document.createElement('div'); bar.className = 'of-player-bar';
    playBtn = document.createElement('button'); playBtn.className = 'of-player-play'; playBtn.type = 'button';
    playBtn.setAttribute('aria-label', '播放/暂停'); playBtn.innerHTML = '<span class="of-player-playicon">▶</span>';
    prog = document.createElement('div'); prog.className = 'of-player-progress';
    var track = document.createElement('div'); track.className = 'of-player-track';
    fill = document.createElement('div'); fill.className = 'of-player-fill'; track.appendChild(fill); prog.appendChild(track);
    timeEl = document.createElement('span'); timeEl.className = 'of-player-time'; timeEl.textContent = '0:00 / 0:00';
    bar.appendChild(playBtn); bar.appendChild(prog); bar.appendChild(timeEl);
    document.documentElement.appendChild(bar);
    playBtn.addEventListener('click', function () { playing ? pause() : play(); });
    prog.addEventListener('click', function (e) {
      var r = prog.getBoundingClientRect();
      var x = (e.clientX - r.left) / Math.max(1, r.width);
      seek(x * duration);
    });
  }

function play() {
  if (!film) return;
  player.wake();
  if (playing) return;
  player.play(t);
  playing = true;
  loop();
}
function pause() {
  if (!film) return;
  player.pause();
  t = player.time();
  playing = false;
  cancelAnimationFrame(raf);
  redraw();
  update();
  sendState();
}
function seek(next) {
  if (!film || !Number.isFinite(next)) return;
  const target = Math.max(0, Math.min(duration, next));
  if (target >= duration) { player.pause(); playing = false; cancelAnimationFrame(raf); }
  player.seek(target);
  t = player.time();
  redraw();
  update();
  sendState();
}
function loop() {
  if (!playing) return;
  t = player.time();
  if (t >= duration) { player.pause(); playing = false; }
  redraw();
  update();
  sendState();
  if (playing) raf = requestAnimationFrame(loop);
}
function update() {
  if (!bar) return;
  fill.style.width = (100 * t / duration).toFixed(1) + '%';
  prog.setAttribute('aria-valuenow', String(t));
  prog.setAttribute('aria-valuemax', String(duration));
  timeEl.textContent = fmt(t) + ' / ' + fmt(duration);
  playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
  playBtn.querySelector('.of-player-playicon').textContent = playing ? '❚❚' : '▶';
}
window.addEventListener('message', (event) => {
  const m = event.data;
  if (event.source !== window.parent || m?.source !== 'easel' || m.type !== 'openfilm:player-command') return;
  switch (m.cmd) {
    case 'play': play(); break;
    case 'pause': pause(); break;
    case 'toggle': playing ? pause() : play(); break;
    case 'seek': seek(m.time); break;
  }
});
window.addEventListener('keydown', (event) => {
  if (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  switch (event.key) {
    case ' ': case 'k': playing ? pause() : play(); break;
    case 'ArrowLeft': seek(t - 5); break;
    case 'ArrowRight': seek(t + 5); break;
    case 'Home': seek(0); break;
    case 'End': seek(duration); break;
    default: return;
  }
  event.preventDefault();
});
window.addEventListener('pagehide', () => { player.close(); playing = false; cancelAnimationFrame(raf); clearInterval(waiting); });
async function start() {
  await window.film.ready;
  film = window.film;
  duration = film.duration;
  player.load(window.location.href, window.__filmSounds?.() ?? [], duration);
  css(); build();
  prog.tabIndex = 0;
  prog.setAttribute('role', 'slider');
  prog.setAttribute('aria-label', '播放进度');
  prog.setAttribute('aria-valuemin', '0');
  await draw();
  update(); sendState();
}
const waiting = setInterval(() => {
  if (!window.film) return;
  clearInterval(waiting);
  void start().catch(fail);
}, 40);
