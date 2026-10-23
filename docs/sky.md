# Sky and day/night cycle

Phase 5 step 3. `render/SkySystem.ts` replaces the old `DayNightCycle` component, its ambient, hemisphere and directional lights, the drei `Sky` and the unused shadow map. Chunks are lit by baked light ([light.md](light.md)), so the time of day only has to feed the shader two numbers per frame, `uDaylight` and `uSkyLight`; nothing is re-lit or re-meshed when the sun moves. The sky also owns the scene's fog and finally reads the zone atmosphere fields `skyTint` and `fogDensity`, which every zone defines and nothing used before.

The file has two halves. The first is pure maths with no scene (`sunDirection`, `samplePalette`, `daylightAt`, `fogRange`, `computeSky`, `SkyClock`, `parseSkyOptions`), which `tests/render/sky-system.test.ts` drives directly. The second is the `SkySystem` class, which owns the Three.js objects. `components/SkyRig.tsx` puts it in the canvas (dome, fog, key listener, one `update` per frame) and has to come before `<World />` so the chunks see this frame's daylight. The game creates one `SkySystem` and hands it to both.

## The clock

Time of day is a fraction of a day: 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. A full day is 20 real minutes (`DAY_LENGTH_SECONDS`, 1200), and a new game starts at 09:00. The clock has a preset, a speed and a stopped flag:

| Preset | Hour | What it is |
| --- | --- | --- |
| `cycle` | runs | the live clock (the default) |
| `dawn` | 06:15 | sun just above the eastern horizon |
| `noon` | 12:00 | sun high |
| `dusk` | 17:45 | sun just above the western horizon |
| `night` | 00:00 | darkest, moon overhead |
| `twilight` | n/a | the old fixed look, see below |

Keys (handled by `SkySystem.handleKey`, which `SkyRig` calls from a `keydown` listener):

| Key | Does |
| --- | --- |
| F4 | next preset: cycle, dawn, noon, dusk, night, twilight, and round. A fixed preset stops the clock at its hour; going back to `cycle` runs it again from there |
| `[` and `]` | set the time back or forward one hour. The clock keeps running or stopped as it was; from a fixed preset it becomes a stopped `cycle` |
| `-` and `=` | slower and faster through 1x, 8x, 40x and 200x (a day in 6 seconds). `-` at 1x stops the clock, `=` on a stopped clock starts it at 1x |

The debug panel (F3) and the HUD show the time and mode, for example `09:13 (1x)`, `06:15 (dawn)` or `07:15 (stopped)`.

Page address, read by `parseSkyOptions` (also in the README):

| Parameter | Does |
| --- | --- |
| `?sky=cycle\|dawn\|noon\|dusk\|night\|twilight` | start in that preset |
| `?time=7.5` or `?time=07:30` | start at that hour and stop there (add `&sky=cycle` or `&speed=` to let it run) |
| `?daylength=seconds` | length of the full day |
| `?speed=0..3` | index into 1x, 8x, 40x, 200x |
| `?daylight=0..1` | overrides only the sky light multiplier the chunks use, for tests of the light (the sky and fog still follow the clock) |

`?shot` pages default to `sky=noon`, so the screenshots of one viewpoint stay comparable; `?bench` runs the live cycle.

## Sun and moon

The sun rises in the east (+x), climbs, and sets in the west (-x). It leans toward -z (north) by 0.3 so that it is up and a little north at noon, where a camera looking along -z can see it. The moon is exactly opposite the sun. `SkyState.sunDir` and `moonDir` are unit vectors; nothing uses them for lighting yet (light is baked and has no direction), so a later step can use them for shadows or a sun-facing tint without touching the clock.

## Colours

The sky is a function of the height of the sun above the horizon, `e` (the sun direction's y, -1 to 1), the same going up and coming down. Keys are interpolated (`samplePalette`):

| e | Zenith | Horizon | Sky light colour |
| --- | --- | --- | --- |
| -0.3 and below | `#03051a` | `#0a1230` | blue (0.55, 0.72, 1.15) |
| -0.1 | `#0f1a42` | `#3a2f5c` | blue |
| 0 | `#2b3f7a` | `#ef9a5e` | warm (1.0, 0.78, 0.62) |
| 0.12 | `#4778c4` | `#f2c48c` | slightly warm |
| 0.35 | `#3d7fe0` | `#a9cdf0` | white |
| 1 | `#2f6fdc` | `#9cc8f5` | white |

- **`daylight`** (`daylightAt`) is 0.15 in the dark (`NIGHT_DAYLIGHT`, moonlit, never black) rising by a smoothstep from e = -0.12 to 0.35 to 1. It is what the chunk shader multiplies baked sky light by. **Sky light colour** multiplies it per channel, so night light is blue and sunset light warm. Block light is not affected: a lantern is as bright at noon as at midnight and the room around it looks dark only by comparison.
- **Zone `skyTint`** pulls the zenith toward the tint (normalised so a grey tint desaturates and does not darken): 65 percent at noon, 25 percent at night.
- **Zone `fogColor`** is blended into the horizon colour: 75 percent at noon, 35 percent at night. The zone colour is itself darkened at night (multiplied toward `#0d1221`), so Amestris smog is still grey at noon and nearly black at night. The horizon colour is the fog colour, and the dome's horizon is exactly that colour (both are written in output colour space, untone-mapped), so terrain fades into the sky with no seam.
- **Zone changes** do not snap: the atmosphere the sky uses approaches the new zone's with an exponential, rate 1.2 per second (about 2 seconds to 90 percent), the same feel as the old fog lerp but independent of frame rate.
- **`fogDensity`** sets the fog distances (`fogRange`). The fog still has to hide the edge of the loaded world, so it is never thinner than the old fixed range (near at `(RENDER_DISTANCE - 2) * 32`, far at `RENDER_DISTANCE * 32`). A density at or below the reference 0.02 leaves it alone (Greensom, SAO, Tempest, Magnolia, Bosse, Fremmevilla and the wilderness are all at or below it), and a denser one scales both distances down in proportion: Amestris, 0.035, ends at 57 percent of the render distance (146 blocks at render distance 8). The result never goes inside 48 blocks.

## The dome

A sphere of radius 450 that follows the camera, drawn first with no depth test or depth write (the terrain draws over it) and without fog or tone mapping. One shader, no textures: a gradient from horizon to zenith, a warm halo round the sun near the horizon (and a faint white one by day), a sun disc and a moon disc (the moon is faint by day), and stars. Stars are a hash of the view direction in a fine grid, one dot per lucky cell, faded in as the sun drops below e = 0 and hidden near the horizon. It costs one draw call and one fill of the screen. Both discs fade out below the horizon.

## The fixed twilight preset

The old look was a purple twilight with a sun below the horizon, lit by Three.js lights. It stays as the `twilight` preset (F4, `?sky=twilight`): sky light 0.6 with a faint violet tint, a purple zenith (`#2f2350`, half pulled to the zone tint), a horizon halfway between `#6b4b7a` and the zone's fog colour, moon and some stars. It ignores the clock for its colours but still takes the zone fog colour and density.

## What was removed

`DayNightCycle` and its lights (ambient 0.4, hemisphere 0.4, directional 1.0 with a 2048 shadow map the chunk materials never used), the drei `Sky`, `<Canvas shadows>` and the fixed `<fog>`. The 8-digit hex `new Color('#385865ca')` that logged a warning every frame ([perf-baseline.md](perf-baseline.md)) went with it. A test (`what is gone`) reads `components/Game.tsx` and fails if any of them comes back.

## Screenshots

[screens/p5/](screens/p5/), all from `?shot` pages with `?sky=` set (production or dev, 1280x800):

| Place | Dawn | Noon | Dusk | Night |
| --- | --- | --- | --- | --- |
| Spawn, the Greensom road | `sky-spawn-dawn` (looking east at the sun) | `sky-spawn-noon` | `sky-spawn-dusk` (looking west at the sun) | `sky-spawn-night` (stars), `sky-spawn-night-moon` |
| Great Tower interior, with lanterns | `sky-tower-dawn` | `sky-tower-noon` | `sky-tower-dusk` | `sky-tower-night` |
| Tempest, the main street | `sky-tempest-dawn` | `sky-tempest-noon` | `sky-tempest-dusk` | `sky-tempest-night` |

Also `sky-spawn-twilight` (the old look), `sky-tower-entrance-noon` and `-night`, the six `world-*` viewpoints at noon (Amestris is grey and hazy, Bosse golden) and `night-spawn`. What they show:

- **A room is dark by day and a lantern lights it.** The tower interior at noon is dark except under the opening in the middle of the roof, where the ceiling and floor take sky light, and around the lanterns on the pillars, which are as bright as at midnight. The entrance shot at noon puts a day-lit arch next to the dark hall.
- **Corners show occlusion.** The wall and floor joins and the steps of the spiral stair darken in the interior shots.
- **No light seams on chunk borders.** The tower interior spans a chunk border (the tower is centred on the corner of four chunks) and shows none; `tests/meshing/light-seams.test.ts` checks every border vertex of real chunk pairs numerically.
- **Time of day changes only colour and light:** the interior at dawn, noon and dusk is the same image except where sky light reaches.
