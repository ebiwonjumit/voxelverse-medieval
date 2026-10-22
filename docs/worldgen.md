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

## Zones and terrain

### `worldgen/zones/ZoneInfo.ts`

One entry per legacy zone: name, shape (a circle with a radius, or the square Greensom uses), a falloff `band` just inside the edge and a `core` size. The shapes repeat each zone's own `isInside`, and a test checks the two agree. `getZone` from `zones/` still decides which zone owns a column.

| Zone | Shape | Band | Core (height is exactly the legacy one) |
| --- | --- | --- | --- |
| Town of Beginnings | circle, r 200 | 60 | r < 140 |
| Greensom Village | square, half 70 | 25 | half < 45 |
| Federation of Tempest | circle, r 700 | none | r < 550 |
| Amestris District | circle, r 700 | none | r < 550 |
| Kingdom of Bosse | circle, r 700 | 100 | r < 600 |
| Kingdom of Fremmevilla | circle, r 250 | 50 | r < 200 |
| Magnolia Town | circle, r 250 | 50 | r < 200 |

### `worldgen/terrain/TerrainField.ts`

`TerrainField(seed).height(x, z)` is the wilderness height W as a float, built only from seeded simplex noise:

- Hills around the zones: a broad macro field, hills at about 300 block wavelength, rolling ground and fine detail, on a base of 11.
- Forest: roughness fades in between z = 3200 and z = 4000 and stays on south of that.
- Mountains: a ridged field fades in from x = 10000 to 11500 on top of a 35 block uplift.
- Coast: the shore sits near x = -3000 (warped by up to 260 blocks so it is not a straight line) and the land drops 75 blocks into the sea over 700 blocks. Amestris ends at x = -2200, so the sea never touches it.

Heights are kept in `TERRAIN_MIN_Y..TERRAIN_MAX_Y` by `softLimit`, not a clamp. It leaves heights between -16 and 64 alone and eases the rest towards the bounds along a tanh, so it is smooth and strictly increasing and there are no flat plateaus at the limits. Over 30,000 samples out to 100,000 blocks east and west, no column sat on a bound; the range was -47 to 105.

### `worldgen/terrain/ZoneBlender.ts`

The one place where zone terrain meets the wilderness.

- Wilderness: W.
- Core of a zone: the zone's own `getHeight(x, z, W)`, so a zone that blends towards the base height it is given blends towards W. This is returned as is, so cores are bit for bit the legacy heights.
- Band (Town of Beginnings, Greensom, Bosse, Fremmevilla, Magnolia): the zone's height near the core's rim, faded into W with a smoothstep on the distance from the edge, so the edge itself is exactly W. "Near the rim" means each point is moved to the nearest core point and the height is averaged over a 3 x 3 grid 5 blocks apart. The legacy zones are not smooth along their rim (the Town's roads head for a fixed height of 7, Greensom's stream is cut off by a circle of radius 50), and the averaging stops those from becoming cliffs in the band. For the flat zones it changes nothing.
- Tempest and Amestris have no band. They already blend to the base height over their last 100 blocks and meet W exactly.

The ground height is `floor` of the blend, clamped to the terrain bounds.

The old edges, measured by walking rays across each border with the largest height difference between neighbouring columns (the test prints both numbers):

| Zone | Old largest step | New largest step |
| --- | --- | --- |
| Town of Beginnings | 7 | 1 |
| Greensom Village | 5 | 2 |
| Federation of Tempest | 6 | 1 |
| Amestris District | 22 | 1 |
| Kingdom of Bosse | 22 | 1 |
| Kingdom of Fremmevilla | 9 | 1 |
| Magnolia Town | 5 | 1 |

A brute-force scan of every column pair from 30 blocks outside each zone to the end of its blend found a largest step of 2 in Greensom (one pair) and 1 everywhere else.

## `worldgen/VoxelverseGenerator.ts`

`createVoxelverseGenerator(registry, seed = WORLD_SEED)` returns a `WorldGenerator`. It is not wired into the game yet.

- Stone below the ground, water above it up to `WATER_LEVEL`.
- At and above the ground, inside a zone, whatever the legacy zone's `getBlock` says for the blended ground height, up to 64 blocks above it.
- In the wilderness there is only a placeholder surface block (snow above 60, stone above 45, sand at the water line, grass otherwise) and air above it, until biomes arrive.
- `generateChunk(chunk, { lod })`: `lod: 0` is far away and asks zones for their low detail blocks (no tall grass, flowers, fences or lanterns). Any other value, or none, is full detail. `sampleBlock` always answers at full detail, so it matches `generateChunk` exactly except for those details in a chunk made at LOD 0.
- `sampleBlock`, `terrainHeight` and `zoneNameAt` share their code with `generateChunk` (one `blockAt` rule and one height function), so they cannot drift apart.

Known gaps in this step: the legacy roads still stop at each zone's edge and nothing grows in the wilderness. Rivers, biomes, vegetation and the road network come in the next steps.

## Tools

Node-side only (they use `node:fs` and `node:zlib`). Run them with `vite-node`.

| Command | What it does |
| --- | --- |
| `npm run map -- --cx 0 --cz 0 --size 4000 --step 8 --borders --out map.png` | Top-down map of the generated world: surface block colours, shaded by slope, open water darker with depth. `--size` is the view width in blocks, `--step` the blocks per pixel, `--borders` draws zone edges, `--seed` picks another seed. |
| `npm run bench:chunks` | Time per generated chunk in node for the wilderness, sea, mountains and two zones. On a laptop: about 5 ms for hills and forest, 9 ms in the mountains, 8 ms in the Town and Tempest. |

`tools/png.ts` is the small PNG writer the map uses.

## Tests

`tests/worldgen/blender.test.ts` checks: no height step above 2 along rays that cross every zone border (120 crossing rays per zone at many angles and positions plus sweeps along the border across the road strips), the open wilderness being walkable, the cores of the Town, Greensom, Tempest and Amestris matching `LegacyZoneAdapter` at 3,000 random points and cell for cell in seven landmark chunks, `sampleBlock` equal to `generateChunk` at 3,000 random points and down whole columns, heights inside the terrain bounds with nothing piled on them, the same seed giving the same chunk hash, LOD 0 only simplifying details, wilderness chunks averaging under 40 ms, and `ZoneInfo` agreeing with the legacy zones. `tests/worldgen/terrain.test.ts` covers `softLimit` and the geography of `TerrainField`.

`tests/worldgen/noise.test.ts` checks: determinism per seed, different seeds being uncorrelated, output bounds, mean and spread over large samples, no step at simplex cell edges, no lattice artefacts (neighbour differences from integer and half-integer points agree within 5%), a chi-square test of `hash2` and `hash3` for uniformity, no link between neighbouring hashes, and negative coordinates.
