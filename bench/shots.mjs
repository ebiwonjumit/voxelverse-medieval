// Takes one screenshot per entry in bench/viewpoints.json, one headless Chrome per shot.
//
//   node bench/shots.mjs --prefix before --url http://localhost:3101     (writes docs/screens/p2/before-<name>.png)
//   node bench/shots.mjs --prefix after --url http://localhost:3101 --only spawn,great-tower
//   node bench/shots.mjs --file bench/cityshots.json --prefix city --dir docs/screens/p7 --url http://localhost:3105
//     (an entry may carry a `query` such as "&sky=dusk", added to the URL)
//
// The game must already be running at --url (dev server or vite preview).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const prefix = option('prefix', 'shot');
const base = option('url', 'http://localhost:3000').replace(/\/$/, '');
const dir = option('dir', 'docs/screens/p2');
const only = option('only', null)?.split(',');
const viewpoints = JSON.parse(readFileSync(option('file', join(here, 'viewpoints.json')), 'utf8')).filter((v) => !only || only.includes(v.name));

let failed = 0;
for (const v of viewpoints) {
  const file = `${dir}/${prefix}-${v.name}.png`;
  console.log(`${v.name} (${v.shot})`);
  const result = spawnSync('node', [join(here, 'run.mjs'), '--url', `${base}/?shot=${v.shot}${v.query ?? ''}`, '--shot', file], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
