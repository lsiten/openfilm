#!/usr/bin/env node
/* validate.mjs — a static check of an atelier film and its scenes, run before you say it is done.
   It catches what `openfilm look` does not see: a scene that never paints its `frame`, a page without
   the preview-fallback loop (so the host reports "a frame() function did not appear"), an impossible
   `#t` trim, a missing referenced file, and text that is too close to its background to read.
   It is static — it reads the files; it does not render. For black frames, flashes and sound, that is
   `openfilm look --full`.
   Usage:  node validate.mjs <film.html>      or      node validate.mjs <folder-with-film.html>
   Exit 0 when everything passes, 1 when any check fails (a warning is still 0). */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

/* ---------- color + contrast (WCAG) ---------- */
function toRgb(c) {
  if (!c) return null;
  c = c.trim();
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (h.length !== 6) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) return m[1].split(',').slice(0, 3).map((x) => parseFloat(x.trim()));
  return null;
}
function lum([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ---------- small parsers ---------- */
function cssVars(css) {
  const out = {};
  const block = css.match(/:root\s*\{([^}]+)\}/);
  const body = block ? block[1] : css;
  for (const m of body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+)/gi)) out[m[1].toLowerCase()] = m[2].trim();
  return out;
}
function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
}
function clips(html) {
  const out = [];
  for (const m of html.matchAll(/<(iframe|img|video|audio)\b[^>]*>/gi)) {
    const tag = m[0], src = attr(tag, 'src');
    let inT = null, outT = null, at = attr(tag, 'at');
    const t = src ? src.match(/#t=([0-9.]+)(?:,([0-9.]+))?/) : null;
    if (t) { inT = parseFloat(t[1]); outT = t[2] !== undefined ? parseFloat(t[2]) : null; }
    out.push({ tag: m[1].toLowerCase(), src, at, inT, outT });
  }
  return out;
}

/* ---------- report ---------- */
class Report {
  constructor() { this.nFail = 0; this.nWarn = 0; this.nOk = 0; this.lines = []; }
  pass(m) { this.nOk++; this.lines.push(`  \u2713 ${m}`); }
  warn(m) { this.nWarn++; this.lines.push(`  \u25B6 ${m}`); }
  fail(m) { this.nFail++; this.lines.push(`  \u2717 ${m}`); }
  print(title) { console.log(`\n${title}`); for (const l of this.lines) console.log(l); }
  get good() { return this.nFail === 0; }
}

/* ---------- run ---------- */
const arg = process.argv[2];
if (!arg) { console.error('usage: node validate.mjs <film.html | folder>'); process.exit(2); }
const film = arg.endsWith('.html') ? arg : join(arg, 'film.html');
const dir = dirname(film);
if (!existsSync(film)) { console.error(`no film.html at ${film}`); process.exit(2); }
const html = readFileSync(film, 'utf8');
const rep = new Report();

const r = contrast(toRgb('#0F172A'), toRgb('#0F172A')); // sanity, unused
const need = (c, min, label) => c < min ? `fail(${label} ${c.toFixed(1)}:1 < ${min})` : `warn(${label} ${c.toFixed(1)}:1)`;

for (const clip of clips(html)) {
  if (!clip.src) continue;
  const file = join(dir, clip.src.split('#')[0]);
  if (!existsSync(file)) { rep.fail(`${clip.tag} \u2192 ${clip.src}: the file is not there`); continue; }
  // trim checks
  if (clip.inT !== null && clip.inT < 0) rep.fail(`${clip.src} #t in=${clip.inT} is negative`);
  if (clip.inT !== null && clip.outT !== null && clip.outT < clip.inT) rep.fail(`${clip.src} #t=${clip.inT},${clip.outT}: out is before in (impossible trim)`);
  // pages: check the contract
  if (clip.tag === 'iframe' && file.endsWith('.html')) {
    const p = readFileSync(file, 'utf8');
    if (!/window\.film\s*=/.test(p)) rep.fail(`${clip.src}: no window.film (the host has no frame to draw)`);
    else if (!/frame\s*\(/.test(p) && !/frame:/.test(p)) rep.fail(`${clip.src}: window.film has no frame()`);
    if (!/window\.filmHost/.test(p)) rep.warn(`${clip.src}: no preview-fallback loop; it may report "a frame() function did not appear"`);
    // contrast of the scene's own palette
    const v = cssVars(p);
    if (v['--bg'] && v['--ink']) {
      const c = contrast(toRgb(v['--ink']), toRgb(v['--bg']));
      if (c < 3) rep.fail(`${clip.src}: --ink on --bg is ${c.toFixed(1)}:1 (unreadable; need \u22653)`);
      else if (c < 4.5) rep.warn(`${clip.src}: --ink on --bg is ${c.toFixed(1)}:1 (ok for large text, thin for body)`);
      else rep.pass(`${clip.src}: --ink/${c.toFixed(1)}:1`);
    }
    if (v['--color'] && v['--bg']) {
      const c = contrast(toRgb(v['--color']), toRgb(v['--bg']));
      if (c < 3) rep.warn(`${clip.src}: --color on --bg is ${c.toFixed(1)}:1 (accent may vanish on the backdrop)`);
    }
  } else if (clip.tag !== 'iframe') {
    rep.pass(`${clip.tag} ${clip.src}`);
  }
}

rep.print('validate \u2014 ' + basename(dir));
const n = rep.lines.length || 0;
console.log(`\n${rep.nFail ? rep.nFail + ' failed, ' : ''}${rep.nWarn} warning${rep.nWarn === 1 ? '' : 's'}, ${rep.nOk} passed ${rep.good ? '\u2014 OK' : '\u2014 FIX before you say it is done'}`);
process.exit(rep.good ? 0 : 1);
