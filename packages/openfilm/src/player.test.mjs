import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { serve } from './host.mjs';
import { MEDIA_RATE_MIN, MEDIA_RATE_MAX, mediaPlays } from './film-doc.mjs';
import { playerAudioSource } from './player-build.mjs';

class Element {
  style = {};
  children = [];
  listeners = {};
  attributes = {};
  appendChild(el) { this.children.push(el); return el; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  querySelector() { return this.icon ??= { textContent: '' }; }
  getBoundingClientRect() { return { left: 0, width: 100 }; }
}

async function player(t) {
  const root = mkdtempSync(join(tmpdir(), 'of-player-'));
  writeFileSync(join(root, 'film.html'), '<!doctype html><html><head><meta name="film-width" content="640"><meta name="film-height" content="360"></head><body><section><audio src="tone.wav" duration="4"></audio></section></body></html>');
  const site = await serve(root);
  t.after(async () => { await site.close(); rmSync(root, { recursive: true, force: true }); });
  const html = await (await fetch(`${site.url}/film.html?player=1`)).text();
  const intervals = new Map(), frames = new Map(), messages = [], events = {}, draws = [], nodes = [];
  let now = 0, next = 0;
  const animation = { playState: 'running', currentTime: 0, pause() { this.playState = 'paused'; } };
  class AudioContext {
    state = 'running'; currentTime = 0; destination = {}; baseLatency = 0; outputLatency = 0;
    createGain() { return { gain: { value: 1 }, connect() { return this; } }; }
    createChannelSplitter() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 2048 }; }
    addEventListener() {}
    decodeAudioData() { return Promise.resolve({ duration: 4 }); }
    createBufferSource() {
      const node = { connect() { return this; }, start(at, offset, length) { Object.assign(this, { at, offset, length, active: true }); }, stop() { this.active = false; } };
      nodes.push(node); return node;
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  const document = { documentElement: new Element(), createElement: () => new Element(), getAnimations: () => [animation] };
  const window = { document, parent: { postMessage: m => messages.push(m) }, addEventListener: (key, fn) => { events[key] = fn; },
    film: { duration: 4, ready: Promise.resolve(), frame: async time => draws.push(time) },
    __filmEditor: { watch: async time => draws.push(time) },
    __filmSounds: () => [{ src: 'tone.wav', at: 0, from: 0, to: 4, speed: 1, volume: 1 }],
    location: { href: `${site.url}/film.html?player=1` },
  };
  const context = vm.createContext({ window, document, AudioContext, URL, console, MEDIA_RATE_MIN, MEDIA_RATE_MAX, mediaPlays,
    performance: { now: () => now },
    setInterval: fn => { intervals.set(++next, fn); return next; }, clearInterval: id => intervals.delete(id),
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id),
    fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }),
    HTMLMediaElement: class { get currentTime() { return 0; } set currentTime(value) {} },
  });
  Object.assign(window, { performance: context.performance, Date: vm.runInContext('Date', context), requestAnimationFrame: context.requestAnimationFrame,
    setInterval: context.setInterval, clearInterval: context.clearInterval });
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    if (script.includes('window.filmHost=') || script.includes("source: 'openfilm-player'")) vm.runInContext(script, context);
  }
  if (html.includes('__film/player.mjs')) {
    const audio = await (await fetch(`${site.url}/__film/player-audio.mjs`)).text();
    vm.runInContext('(function () {' + audio.replace(/^import .*;$/gm, '').replace(/^export /gm, '') + ';globalThis.Player = Player;})()', context);
    const controller = await (await fetch(`${site.url}/__film/player.mjs`)).text();
    vm.runInContext(controller.replace(/^import .*;$/gm, ''), context);
  }
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  for (const fn of [...intervals.values()]) fn();
  await flush();
  const command = async (cmd, time) => { events.message({ source: window.parent, data: { source: 'easel', type: 'openfilm:player-command', cmd, time } }); await flush(); };
  return { nodes, animation, context, draws, messages, document, command,
    state: () => messages.at(-1),
    async tick(ms) { now += ms; const callbacks = [...frames.values()]; frames.clear(); for (const fn of callbacks) fn(now); await flush(); },
    async key(key) { events.keydown({ key, target: {}, preventDefault() {} }); await flush(); },
  };
}

test('inline player freezes the page animation and clock at its paused seek time', async t => {
  const p = await player(t);
  await p.command('seek', 2);
  await p.tick(1000);
  assert.equal(p.animation.playState, 'paused');
  assert.equal(p.animation.currentTime, 2000);
  assert.equal(vm.runInContext('performance.now()', p.context), 2000);
});

test('inline player plays native audio and stops every source when paused', async t => {
  const p = await player(t);
  assert.equal(p.state().playing, false);
  assert.equal(p.nodes.length, 0);
  await p.command('play');
  assert.equal(p.nodes.filter(n => n.active).length, 1);
  await p.command('pause');
  assert.equal(p.nodes.filter(n => n.active).length, 0);
});

test('inline player stops at the end and replay starts from zero', async t => {
  const p = await player(t);
  await p.command('seek', 4);
  await p.command('play');
  assert.equal(p.state().playing, true);
  assert.equal(p.state().time, 0);
  await p.tick(5000);
  assert.equal(p.state().playing, false);
  assert.equal(p.state().time, 4);
});

test('inline player supports keyboard scrubbing while paused', async t => {
  const p = await player(t);
  await p.key('End');
  assert.equal(p.state().time, 4);
  await p.key('Home');
  assert.equal(p.state().time, 0);
  assert.equal(p.state().playing, false);
});

test('browser audio runtime matches its native Studio sources', () => {
  assert.equal(readFileSync(new URL('./player-audio.mjs', import.meta.url), 'utf8'), playerAudioSource());
});

test('seeking during playback replaces audio at the new source offset', async t => {
  const p = await player(t);
  await p.command('play');
  await p.command('seek', 2);
  assert.equal(p.state().playing, true);
  assert.equal(p.nodes.filter(n => n.active).length, 1);
  assert.equal(p.nodes[0].active, false);
  assert.equal(p.nodes.at(-1).offset, 2);
});

test('seeking to the end stops audio without silently replaying', async t => {
  const p = await player(t);
  await p.command('play');
  await p.command('seek', 4);
  assert.equal(p.state().playing, false);
  assert.equal(p.state().time, 4);
  assert.equal(p.nodes.filter(n => n.active).length, 0);
});
