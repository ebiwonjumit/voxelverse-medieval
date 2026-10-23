# Dependencies and npm audit

Checked on 23 Oct 2026 with `npm audit` and `npm audit --omit=dev`. Run `npm audit` again from time to time; the advisory list changes without the code changing.

## Result

| | Before | After `npm audit fix` |
|---|---|---|
| `npm audit` (everything) | 13 findings: 2 critical, 7 high, 3 moderate, 1 low | 3 findings: 2 critical, 1 moderate |
| `npm audit --omit=dev` (what ships) | 1 moderate | 0 |

`npm audit fix` (no `--force`) only moved packages inside the ranges `package.json` already allows, so `package.json` is unchanged and only `package-lock.json` changed. Typecheck, the 1,324 tests (on the merged tree) and `vite build` pass after it.

## What reaches the shipped game

Only one finding did, and it is gone:

- **fflate** (moderate, a denial of service when it unzips a deliberately malformed archive). It arrived through `@react-three/drei` (`three-stdlib` and `@types/three`) and is bundled with the game. The game never unzips anything from a user or the network, so it was not reachable in practice. The lockfile now holds fflate 0.6.11 and 0.8.3, which are patched.

The game is a static bundle that only the visitor's own browser runs; there is no server code in this repository.

## Dev tooling only (never in the built game)

Fixed by `npm audit fix`:

- **vite** (high: file read and path traversal through the dev server, Windows-only `launch-editor` problems). These only matter while `npm run dev` is running and reachable by someone else. `vite.config.ts` binds the dev server to `0.0.0.0`, so on a shared network other machines could reach it; keep that in mind on public Wi-Fi. The lockfile now has vite 6.4.5.
- **rollup** (high: arbitrary file write by path traversal), **postcss** (high: XSS and source-map file reads), **source-map-js**, **picomatch**, **nanoid**, **browserslist**, **baseline-browser-mapping**, **@babel/core**. All are build-time helpers used by `vite build` or the React plugin. They process this project's own files, not attacker input, so the risk is low; they matter most for a build server that builds untrusted pull requests.

Not fixed:

- **vitest** (critical, with **tinypool** critical and **@vitest/mocker** moderate). The advisories are prototype pollution leading to code execution in the test runner's worker options, and an unauthenticated mock-registration endpoint in vitest's browser mode. We run only `vitest run` in node, with our own test files and no browser mode, so there is no untrusted input to the runner. The only fix npm offers is vitest 4.1.12, a major upgrade (`npm audit fix --force`). It was not applied: it is a breaking change for a dev-only risk that does not apply to how we use it, and this task is not the place for a test-runner migration.

## What remains, and why

Three findings, all in vitest 3.2.7 and its helpers, all dev-only, none in the built game. When convenient, upgrade `vitest` to 4.x on its own branch (check `vite.config.ts` `test` options, then run the suite) and the list should reach zero. Do it before running tests in CI on code from untrusted forks if that ever happens; for this repository's own branches it is not urgent.

## Continuous integration

`.github/workflows/ci.yml` runs typecheck, tests and `npm run build` on every pull request and on pushes to main. It sets `PERF_TOLERANCE=4`: a few tests assert wall-clock limits (mesher 25 ms, chunk generation 40 ms, road query 20 microseconds) and shared runners are slower than a laptop. `tests/perf.ts` reads the variable (default 1) and multiplies those limits and the vitest per-test timeouts; the limits written in the tests do not change. To check timing at full strictness locally, run `npm test` with the variable unset; to emulate CI, run `PERF_TOLERANCE=4 npm test`.
