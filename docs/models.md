# Block models

Phase 4 gave blocks a shape. A block no longer has to be a cube: `BlockDef.model` says what it looks like, where it can be bumped into and which sides of its cell it covers. Blocks without a model are plain cubes, which is how every block that other branches add keeps working until it asks for more. The models live in `engine/models/` (pure data, no Three.js, so they run in the mesh workers) and the mesher draws every block that is not a plain cube from them.

## The interface

```ts
interface BlockModel {
  readonly isFullCube: boolean;
  readonly connectGroup?: string;
  quads(state: number, nb?: Neighbourhood): readonly ModelQuad[];
  collisionBoxes(state: number, nb?: Neighbourhood): readonly Box[];
  occludesFace(state: number, side: number): boolean;
  faceCoverage(state: number, side: number): number;   // 4-bit mask, see below
}
```

- Everything is in **cell coordinates**: the cell fills 0 to 1 on each axis, x east, y up, z south (so north is -z, as in the world). A `Box` is `[x0, y0, z0, x1, y1, z1]` and may stick out of the cell (a fence is 1.5 high).
- **State** is the 4 high bits of the cell (0 to 15). What it means is defined per model, in the table below. A model ignores state bits it does not use, so a stray bit never breaks anything.
- **Neighbourhood** is how a model asks about the blocks around it: `cell(dx, dy, dz)` and the `registry`. The mesher answers from its padded grid, the game from the world (`CellNeighbourhood` takes any cell source), tests from a map. Without one a model draws as if nothing were beside it.
- **Sides** are numbered as the mesher draws them: east 0, west 1, up 2, down 3, south 4, north 5 (`engine/models/Side.ts`). The neighbour of a face on side `s` covers it with its side `s ^ 1`.

A `ModelQuad` is one face, ready to copy into the mesh: four corners counter-clockwise from the front, four uv pairs, a normal, which of the block's three textures it wears (top, bottom or side), and for culling `cullSide` (the side of the cell the quad lies flat against, or -1), `need` (the quarters of that side it touches) and `fullFace` (it is the whole cell face). Quads are **built once per model variant and shared** by every cell that uses them, so meshing a stair is a table lookup, not geometry work. Never change one.

## The models

| Model | Looks like | State | Registered for |
| --- | --- | --- | --- |
| `CubeModel` | a full cube; the mesher has a fast path for it and never asks it for quads | unused | the default for every block |
| `SlabModel` | half a cube | bit 0: 0 fills the lower half, 1 the upper half | stone brick, cobblestone, wood plank, dark plank, red roof and blue roof slabs (80, 82, 84, 86, 88, 90) |
| `StairModel` | straight stairs: a low step and a full-height back | bits 0 and 1: the facing, bit 2: 0 bottom half, 1 upside down | the six stairs (81, 83, 85, 87, 89, 91) |
| `FenceModel` | a post a quarter of a block wide with two rails towards each joined side | unused, **connections are read from the neighbours** | wood fence (34) |
| `PaneModel` | a thin upright pane, two sixteenths thick, joining sideways | unused, connections read from the neighbours | glass pane (92) |
| `CrossModel(width, height)` | two planes crossing on the diagonals, each drawn on both sides | unused | flowers, tall grass, sugarcane |
| `CropModel` | four planes in a number sign, a quarter in from each edge, each on both sides, a sixteenth lower than the cell | unused (the growth stage is in the tile: one block per stage) | wheat and its two growth stages |
| `BoxModel(boxes, uv)` | one or more fixed boxes | unused | small rock, magic crystal, lantern, red apple, and farmland (a cube 15/16 high) |
| `PlateModel(inset, y)` | a flat square 1/16 thick, lying at height `y` | unused | lily pad |

**Stair facing** is the way you climb: the tall back is on that side and the low step on the other. Facings turn clockwise seen from above: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x), the order of `HORIZONTAL_SIDES`. `stairState(facing, upsideDown)` builds the state byte. Only straight stairs exist, no corners.

**Fences and panes store nothing.** The four bits of connection are worked out whenever the block is meshed or bumped into: a fence joins fences and solid full cubes that are opaque, a pane joins panes and any solid full cube including glass. (Leaves, water, slabs and the like join nothing.) A pane that joins nothing draws the full cross, so it never shrinks to a pillar. The far end of a joined rail or arm lies against its neighbour and is not drawn.

### Texture coordinates

Boxes wear their tile in one of two ways (`UvMode`). `cell` lays the tile over the whole cell and shows the part the box covers, so a slab's wall shows the lower half of the tile, a stair's step the matching part, and they line up with the cubes beside them. That is the default for slabs, stairs, fences, panes and farmland. `stretch` squeezes the whole tile onto each face, for small objects whose tile is the whole picture (lantern, apple, small rock, crystal, lily pad). Planes (`CrossModel`, `CropModel`) show the whole tile, bottom of the picture at the bottom. Wall and top orientation follow the cube convention in [meshing.md](meshing.md#textures), and a test checks that the cube model produces exactly what the mesher draws for a cube.

## Faces hidden by neighbours

A face is drawn unless the block beside it covers the side it looks at. Coverage comes from the model: `faceCoverage(state, side)` says which of the four **quarters** of that side the block fully covers. A face is cut in halves along its two axes taken in x, y, z order, quarter `q` is `(upper half of the second axis ? 2 : 0) | (upper half of the first ? 1 : 0)`, and bit `1 << q` of the mask is set when it is covered. 15 is the whole face, which is what `occludesFace` means. Examples: a lower slab covers `5` of each east or west wall and `3` of each north or south wall, 15 of its base, nothing on top; a bottom stair covers its base and its back (15), three quarters of each side wall (an L) and two of its front.

- A **cube** face is hidden only when the neighbour covers all of that side (`occludesFace`). A cube next to a slab keeps its wall, and a cube on top of a slab keeps its underside, because the slab does not cover them.
- A **model quad** that lies flat against a side of its cell is hidden when the neighbour covers every quarter the quad touches. So a slab's wall is hidden by the slab beside it, an L-shaped stair wall by another stair, but only the covered part of a stair wall goes when the next stair is a different one: the quad is kept whole, drawn partly behind the neighbour, rather than cut.
- A block only covers anything if the registry says it is `opaque`. Glass and leaves cover nothing even though they are cubes, fences cover nothing, water is handled apart (water faces are hidden by what covers them and by other water). Below the bottom of the world counts as covering everything.
- Quads that do not lie against a side (a stair's riser, a slab's top, every plant) are never hidden.

Models are built from boxes by `compileBoxes` (`engine/models/shape.ts`): it drops a face that another box of the same model covers completely (the inside of a stair), trims one that is covered along an edge (the tread under the riser) and keeps whole one that is covered in the middle (the post behind a rail).

## Ambient occlusion

Unchanged for cubes and still off by default (`AO_STRENGTH`). Only blocks that cover all six sides count as occluders, so a slab or stair does not darken a cube beside it. A model quad that is a whole cell face (a slab's base, a stair's back) is shaded like a cube face; every other quad of a model is fully lit.

## Collision boxes

`collisionBoxes(state, nb)` returns the boxes in cell coordinates that stop the player, and the block's own `solid` flag still decides whether they are used (plants and lily pads are not solid, so nobody collides with their planes). A slab is one box, a stair two (the low step and the back), a fence the post plus a box for each joined side, all **1.5 high** so nobody jumps over it, a pane its pillar and arms, boxes and farmland their own boxes, planes none. Fences and panes need a neighbourhood for their arms; asked without one they give the post alone.

The player is moved against these boxes by `engine/collision.ts`, which also climbs stairs and slabs; see [collision.md](collision.md).

## State across chunk borders

The mesher reads the ring of blocks around a chunk through `WorldGenerator.sampleCell(x, y, z)` when the generator has it, and through `sampleBlock` (state 0) when it does not. A generator that places stairs must implement `sampleCell`, or the stair on the far side of a border is read facing north and its neighbour draws or hides the wrong faces. The legacy zones place no states, so `LegacyZoneAdapter` has none. `VoxelWorld.getCell` uses it too.

## The legacy blocks

`LEGACY_BOXES` is gone. The fourteen blocks that used to be scaled cubes now have models, in `content/blocks.ts`:

| Block | Model | Compared with the old box |
| --- | --- | --- |
| small rock, magic crystal, lantern, red apple | `BoxModel` | the same boxes, same size and place, in cell coordinates (a test checks them against the old scale and offset numbers) |
| wood fence | `FenceModel` | the same post (a quarter wide, a block tall); rails appear when it joins something |
| farmland | `BoxModel`, `cell` mapping | 15/16 high instead of 0.9, and now `opaque`: it covers its own base, and its walls show the dirt tile at full scale |
| lily pad | `PlateModel(0.2, 0.985)` | 0.6 wide as before, 1/16 thick instead of 0.05, lying on its water cube (`holdsWater`) |
| flowers, tall grass, sugarcane | `CrossModel` (0.8 and 0.9 wide, sugarcane a full block tall) | crossing planes showing the tile instead of a small box wearing it |
| wheat and its two stages | `CropModel` | four planes instead of one box; each stage's height is in its tile |

Their random rotations were already dropped in Phase 2. The old `HOLDS_WATER` list in the mesher became `BlockDef.holdsWater`.

## New blocks

`content/blocksShaped.ts` registers ids 80 to 127 (`ShapedBlock` has the numbers; only 80 to 92 are used so far). They reuse the tile and colour of the cube they are cut from, so no texture recipe was needed, and `createDefaultRegistry` registers them. Never renumber one.

| Id | Block | Id | Block |
| ---: | --- | ---: | --- |
| 80, 81 | stone brick slab, stairs | 88, 89 | red roof slab, stairs |
| 82, 83 | cobblestone slab, stairs | 90, 91 | blue roof slab, stairs |
| 84, 85 | wood plank slab, stairs | 92 | glass pane |
| 86, 87 | dark plank slab, stairs | | |

Stairs and slabs are `solid` and `opaque` (so they go in the opaque bucket and cover what their model says); the pane is solid and not opaque (cutout bucket).

## Adding a model

Give the block a `model` in its `BlockDef`. For a shape made of boxes extend `ShapeModel`: say which variant a state (and neighbourhood) selects and build the boxes of each variant; quads, collision and coverage follow. For planes extend `PlaneModel`. The model decides what its state bits mean, document them in the table above, and keep to the 4 bits.

## Speed

Models cost nothing in the common case: cubes keep their own fast path in the mesher, and the tables the mesher reads (kind, covered sides, opaque, wet) are indexed by the whole cell and built once per registry. The mesher timing test (`tests/meshing/mesher-timing.test.ts`) on the same four chunks as before: spawn 7.3 ms, Town of Beginnings 9.3 ms, Great Tower corner 9.2 ms, Tempest Coliseum 5.7 ms (7.9, 10.0, 9.9 and 6.3 ms in Phase 2), with fewer triangles at spawn (7,660 against 8,500: a flower is 4 quads, not 6).

Production build, the same flythrough and machine as [perf-after-p3.md](perf-after-p3.md) ([`bench-p4-prod.json`](bench-p4-prod.json)): 60.0 fps in every leg, p99 17.2 to 17.7 ms, worst frame 21.1 ms, no frame over 50 ms, draw calls and geometry counts as in Phase 3 (142 to 151 draw calls, 367 geometries on the long leg against 368), triangles within 3 percent (286,450 at rest against 295,840; 559,132 on the long leg against 558,584), heap about the same (108 and 269 MB against 112 and 258 MB). The Phase 2 targets all still hold. World screenshots at the five viewpoints are in `docs/screens/p4/`.
