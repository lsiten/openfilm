import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchTree } from './watch.mjs';

test('per-directory watching follows atomic replacements and new folders, with root-relative paths and ignored folders excluded', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'of-tree-'));
  writeFileSync(join(root, 'film.html'), '{}');
  mkdirSync(join(root, 'node_modules'));
  // Replay the directory-relative callbacks of a non-recursive OS watcher; discovery and path joining stay real.
  const native = new Map();
  const backend = t.mock.method(fs, 'watch', (directory, listener) => {
    const watcher = new EventEmitter();
    watcher.closed = false;
    watcher.close = () => {
      watcher.closed = true;
      watcher.removeAllListeners();
    };
    watcher.on('change', listener);
    native.set(directory, watcher);
    return watcher;
  });
  syncBuiltinESMExports();
  t.after(() => {
    backend.mock.restore();
    syncBuiltinESMExports();
    rmSync(root, { recursive: true, force: true });
  });
  const names = [];
  const close = watchTree(root, (name) => names.push(name), false);
  t.after(close);

  for (const n of [1, 2]) {
    writeFileSync(join(root, `film.html.${n}.tmp`), `{"n":${n}}`);
    renameSync(join(root, `film.html.${n}.tmp`), join(root, 'film.html'));
    native.get(root).emit('change', 'rename', Buffer.from('film.html'));
    assert.deepEqual(names, Array(n).fill('film.html'), `replacement ${n} seen`);
  }

  mkdirSync(join(root, 'scenes'));
  native.get(root).emit('change', 'rename', 'scenes');
  writeFileSync(join(root, 'scenes', 'a.html'), '<p>');
  writeFileSync(join(root, 'node_modules', 'x.js'), '');
  assert.equal(native.has(join(root, 'scenes')), true, 'a new folder gets its own watcher');
  assert.equal(native.has(join(root, 'node_modules')), false, 'ignored folders are not watched');
  native.get(join(root, 'scenes')).emit('change', 'rename', 'a.html');
  assert.deepEqual(names, ['film.html', 'film.html', 'scenes', 'scenes/a.html']);

  close();
  for (const watcher of native.values()) {
    assert.equal(watcher.closed, true);
    watcher.emit('change', 'rename', 'after-close.html');
  }
  assert.deepEqual(names, ['film.html', 'film.html', 'scenes', 'scenes/a.html']);
});
