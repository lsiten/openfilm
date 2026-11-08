import { readFileSync } from 'node:fs';

const modules = new Map(['player.mjs', 'player-audio.mjs'].map(name => [
  name, readFileSync(new URL(name, import.meta.url), 'utf8'),
]));

export function playerFiles(res, path, headers) {
  const name = path.slice(path.lastIndexOf('/__film/') + 8);
  if (!path.endsWith(`/__film/${name}`) || !modules.has(name)) return false;
  res.writeHead(200, { ...headers, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }).end(modules.get(name));
  return true;
}
