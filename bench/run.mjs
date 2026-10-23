// Runs the flythrough in headless Chrome and writes the result as JSON.
//
//   npm run dev                    (in another terminal)
//   npm run bench                  (full run, about 2.5 minutes)
//   npm run bench -- --quick       (harness smoke test)
//   npm run bench -- --url http://localhost:4173/?bench --out docs/bench-prod.json
//   npm run bench -- --smoke       (loads the real game, drops the player, checks the HUD zone, walks forward, presses the sky keys, reports console errors)
//   npm run bench -- --soak        (90 s closed-loop walk, prints geometry and triangle counts every 5 s)
//   npm run bench -- --shot docs/screens/p2/spawn.png --url "http://localhost:3000/?shot=0,10,300,0,0"
//                                  (screenshot at 1280x800 once the world reports window.__SHOT_READY__)
//
// Options:
//   --url <url>       page to load (defaults to port 3000; use --url for any other port)
//   --out <file>      where the JSON result goes (default docs/bench-latest.json, docs/bench-soak.json with --soak)
//   --timeout <ms>    give up after this long (screenshots wait for __SHOT_READY__ for up to 3 minutes)
//   --width/--height  window size, default 1280x800
//   --chrome <path>   Chrome binary
//
// Screenshot URLs use ?shot=x,y,z,yawDeg,pitchDeg: yaw 0 looks toward -z, positive turns left, positive pitch looks up.
// bench/shots.mjs takes the whole viewpoint list in bench/viewpoints.json in one go.
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
const smoke = flag('smoke');
const soak = flag('soak');
const shotFile = option('shot', null);
const defaultMode = quick ? '=quick' : soak ? '=soak' : '';
const url = option('url', smoke ? 'http://localhost:3000/' : `http://localhost:3000/?bench${defaultMode}`);
const out = option('out', quick ? 'docs/bench-quick.json' : soak ? 'docs/bench-soak.json' : 'docs/bench-latest.json');
const width = Number(option('width', 1280));
const height = Number(option('height', 800));
const timeoutMs = Number(option('timeout', quick ? 120000 : shotFile ? 180000 : 480000));
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
const pageErrors = [];

fromChrome.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      pageErrors.push(message.params.args.map((a) => a.value ?? a.description).join(' '));
    }
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

const printSoak = (samples) => {
  if (samples.length === 0) return;
  const statKeys = Object.keys(samples[0].stats ?? {});
  const col = (v, w) => String(v ?? '').padStart(w);
  console.log('Soak (closed loop, sprint speed):');
  console.log(`  ${col('t(s)', 5)} ${col('geometries', 11)} ${col('triangles', 10)} ${col('calls', 6)} ${col('heapMB', 7)}${statKeys.map((k) => ' ' + col(k, Math.max(k.length, 8))).join('')}`);
  for (const s of samples) {
    console.log(`  ${col(s.t, 5)} ${col(s.geometries, 11)} ${col(s.triangles, 10)} ${col(s.drawCalls, 6)} ${col(s.heapMB, 7)}${statKeys.map((k) => ' ' + col(s.stats?.[k], Math.max(k.length, 8))).join('')}`);
  }
  const geo = samples.map((s) => s.geometries);
  console.log(`  geometries min ${Math.min(...geo)}, max ${Math.max(...geo)}, last ${geo[geo.length - 1]}`);
};

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
  // The window size alone leaves the viewport a bit short once the browser chrome is subtracted.
  if (shotFile) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  }
  await send('Page.navigate', { url }, sessionId);
  console.log(`Running ${url} in headless Chrome at ${width}x${height}`);

  if (smoke) {
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    const readXYZ = async () => {
      const text = await evaluate('document.body.innerText');
      const m = /XYZ: (-?\d+), (-?\d+), (-?\d+)/.exec(text);
      return m ? { x: +m[1], y: +m[2], z: +m[3] } : null;
    };
    const key = (type, code, vk) =>
      send('Input.dispatchKeyEvent', { type, code, key: code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: vk }, sessionId);

    // The HUD's zone name comes from the generator on the main thread; at the spawn it has to be Greensom.
    const readZone = async () => /CURRENT LOCATION\s*\n\s*([^\n]+)/.exec(await evaluate('document.body.innerText'))?.[1]?.trim();
    await sleep(8000);
    const landed = await readXYZ();
    const zoneAtSpawn = await readZone();
    await key('rawKeyDown', 'KeyW', 87);
    await sleep(3000);
    await key('keyUp', 'KeyW', 87);
    await sleep(500);
    const walked = await readXYZ();

    // The sky keys: F4 steps to the dawn preset, then ] moves the clock on an hour and stops it.
    const readTime = async () => /Time: (\d\d:\d\d) \(([\w.]+)\)/.exec(await evaluate('document.body.innerText'))?.slice(1, 3).join(' ');
    const timeBefore = await readTime();
    await key('rawKeyDown', 'F4', 115);
    await key('keyUp', 'F4', 115);
    await sleep(400);
    const timeDawn = await readTime();
    await key('rawKeyDown', 'BracketRight', 221);
    await key('keyUp', 'BracketRight', 221);
    await sleep(400);
    const timeStepped = await readTime();

    console.log('  after landing:', landed, 'zone:', zoneAtSpawn);
    console.log('  after 3 s of W:', walked);
    console.log(`  sky clock: ${timeBefore}, after F4: ${timeDawn}, after ]: ${timeStepped}`);
    console.log(`  page errors: ${pageErrors.length}`);
    for (const e of pageErrors.slice(0, 5)) console.log('   ', String(e).slice(0, 200));

    const problems = [];
    if (!landed || !walked) problems.push('HUD position not found');
    else {
      if (landed.y < 5 || landed.y > 14) problems.push(`did not land on the ground (y ${landed.y})`);
      if (landed.z - walked.z < 10) problems.push(`did not walk forward (z ${landed.z} to ${walked.z})`);
    }
    if (zoneAtSpawn !== 'Greensom Village') problems.push(`the HUD names the zone "${zoneAtSpawn}" at the spawn`);
    if (timeDawn !== '06:15 dawn') problems.push(`F4 did not select the dawn preset (${timeDawn})`);
    if (timeStepped !== '07:15 stopped') problems.push(`] did not step the clock to 07:15 (${timeStepped})`);
    if (pageErrors.length) problems.push('page errors');
    console.log(problems.length ? `FAILED: ${problems.join('; ')}` : 'OK');
    shutdown(problems.length ? 1 : 0);
  }

  if (shotFile) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(500);
      const { result } = await send('Runtime.evaluate', { expression: 'window.__SHOT_READY__ === true', returnByValue: true }, sessionId);
      if (result.value === true) {
        await sleep(500); // let one more frame reach the compositor
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        mkdirSync(dirname(shotFile), { recursive: true });
        writeFileSync(shotFile, Buffer.from(data, 'base64'));
        console.log(`Wrote ${shotFile} after ${((Date.now() - started) / 1000).toFixed(1)}s, page errors: ${pageErrors.length}`);
        shutdown(0);
      }
    }
    console.error(`Timed out after ${timeoutMs / 1000}s waiting for window.__SHOT_READY__.`);
    shutdown(1);
  }

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
      if (state.result.soak) printSoak(state.result.soak);
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
