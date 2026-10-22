// Runs the flythrough in headless Chrome and writes the result as JSON.
//
//   npm run dev                    (in another terminal)
//   npm run bench                  (full run, about 2.5 minutes)
//   npm run bench -- --quick       (harness smoke test)
//   npm run bench -- --url http://localhost:4173/?bench --out docs/bench-prod.json
//
// Chrome is driven over --remote-debugging-pipe, so there are no extra dependencies.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const quick = flag('quick');
const url = option('url', `http://localhost:3000/?bench${quick ? '=quick' : ''}`);
const out = option('out', quick ? 'docs/bench-quick.json' : 'docs/bench-latest.json');
const width = Number(option('width', 1280));
const height = Number(option('height', 800));
const timeoutMs = Number(option('timeout', quick ? 120000 : 480000));
const chromePath = option('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');

const profile = mkdtempSync(join(tmpdir(), 'voxelverse-bench-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
);

const toChrome = chrome.stdio[3];
const fromChrome = chrome.stdio[4];
let nextId = 1;
const pending = new Map();
let buffer = '';

fromChrome.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  }
});

const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    toChrome.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shutdown = (code) => {
  chrome.kill('SIGKILL');
  process.exit(code);
};
chrome.on('exit', () => {});

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Page.navigate', { url }, sessionId);
  console.log(`Running ${url} in headless Chrome at ${width}x${height}`);

  const started = Date.now();
  let lastLeg = '';
  while (Date.now() - started < timeoutMs) {
    await sleep(2000);
    const { result } = await send(
      'Runtime.evaluate',
      {
        expression: `JSON.stringify({ result: window.__BENCH_RESULT__ ?? null, text: document.body ? document.body.innerText.slice(-80) : '' })`,
        returnByValue: true,
      },
      sessionId,
    );
    const state = JSON.parse(result.value);
    const leg = /Benchmark running(?:: ([\w-]+))?/.exec(state.text);
    if (leg && leg[1] && leg[1] !== lastLeg) {
      lastLeg = leg[1];
      console.log(`  leg: ${lastLeg}`);
    }
    if (state.result) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(state.result, null, 2) + '\n');
      const o = state.result.overall;
      console.log(`Done. ${state.result.env.renderer}`);
      for (const l of state.result.legs) {
        console.log(`  ${l.name.padEnd(16)} fps ${String(l.avgFps).padStart(6)}  p50 ${String(l.p50).padStart(7)}  p95 ${String(l.p95).padStart(7)}  p99 ${String(l.p99).padStart(7)}  max ${String(l.max).padStart(7)}  >50ms ${l.hitches}`);
      }
      console.log(`  ${'overall'.padEnd(16)} fps ${String(o.avgFps).padStart(6)}  p50 ${String(o.p50).padStart(7)}  p95 ${String(o.p95).padStart(7)}  p99 ${String(o.p99).padStart(7)}  max ${String(o.max).padStart(7)}  >50ms ${o.hitches}`);
      console.log(`Wrote ${out}`);
      shutdown(0);
    }
  }
  console.error(`Timed out after ${timeoutMs / 1000}s without a result.`);
  shutdown(1);
} catch (err) {
  console.error(err);
  shutdown(1);
}
