# World generation

Phase 6 of the rebuild replaces the wilderness and the land between the zones with a seeded generator. The legacy zones keep their interiors. This page describes what exists so far and grows with each step of the phase.

## Seed

`WORLD_SEED` in `worldConstants.ts` seeds every noise field in `worldgen/`. Same seed, same world, on the main thread or in a worker.

## Noise (`worldgen/noise/`)

Pure data code. Nothing here imports Three.js, React or the DOM.

| File | What it gives you |
| --- | --- |
| `Rng.ts` | `Rng`, a seeded mulberry32 generator: `next()` in [0, 1), `int(n)`, `range(a, b)`, `chance(p)`, `fork(salt)` for an independent stream. Also the integer hashes `hash2(x, z, seed)` and `hash3(x, y, z, seed)` (unsigned 32-bit) and `hash2f` / `hash3f` (floats in [0, 1)). |
| `SimplexNoise.ts` | `new SimplexNoise(seed)` with `noise2(x, z)` and `noise3(x, y, z)`. Both return values in [-1, 1] with a mean near 0. |
| `fractal.ts` | `fbm`, `fbm3`, `ridged`, `billow` and `domainWarp`. |

### Hashes

`hash2` and `hash3` are Murmur3 on the integer coordinates, with no float maths, unlike the old sine hash. Coordinates are truncated to int32, so pass whole numbers. Negative coordinates are fine and do not mirror positive ones. Use these for per-cell decisions (where a tree goes, which flower grows) so the answer never depends on the order chunks are generated in.

### Simplex noise

The permutation table is shuffled with `Rng(seed)`, so each seed is a different, repeatable field. Two choices worth knowing:

- 2D uses its own table of 16 unit gradients. Reusing the 3D table would mix gradient lengths and favour the axes.
- The 3D kernel radius is sqrt(0.5), not the often-copied 0.6. At 0.6 a corner still contributes when the point crosses into the next tetrahedron, which leaves a small step in the field (about 0.0035). A test guards this.

The output is scaled so the real extremes sit just inside [-1, 1] (measured over 20 seeds and 8 million samples: about 0.99 in both 2D and 3D) and clamped as a guard.

### Fractal helpers

All of them divide by the total amplitude, so the range does not depend on the octave count. Options are `{ octaves = 4, lacunarity = 2, gain = 0.5 }`.

| Helper | Range | Use |
| --- | --- | --- |
| `fbm`, `fbm3` | [-1, 1] | Layered noise: continents, moisture, temperature. |
| `ridged` | [0, 1], 1 on the crest | Mountain spines. Each octave is `(1 - |n|)^2`. |
| `billow` | [0, 1], 0 in the creases | Rounded hills. Each octave is `|n|`. |
| `domainWarp` | input shifted by at most `amount` per axis | Makes straight coasts and borders wander. Pass an `out` object in hot loops to avoid allocating. |

## Tests

`tests/worldgen/noise.test.ts` checks: determinism per seed, different seeds being uncorrelated, output bounds, mean and spread over large samples, no step at simplex cell edges, no lattice artefacts (neighbour differences from integer and half-integer points agree within 5%), a chi-square test of `hash2` and `hash3` for uniformity, no link between neighbouring hashes, and negative coordinates.
