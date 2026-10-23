# Collision and player movement

Phase 4 step 2. The player used to test four points around the body against `registry.isSolid`, so every block was a full cube. It now sweeps a box through the collision boxes of the block models (see [models.md](models.md#collision-boxes)), which is what lets it stand on a slab, walk up stairs and be stopped by a fence at the height the fence is drawn. The code is `engine/collision.ts`: pure, no Three.js, no React, and tested without a browser (`tests/collision.test.ts`).

## Coordinates

World coordinates, with the block grid the renderer uses: block `(x, y, z)` fills `x - 0.5 .. x + 0.5` on each axis (the renderer puts every chunk mesh half a block back), so the middle of a block is its integer coordinate and the top of a block at height `y` is at `y + 0.5`. Model boxes are in cell coordinates (0 to 1) and are moved by `(x - 0.5, y - 0.5, z - 0.5)`.

A `Box` is `[x0, y0, z0, x1, y1, z1]`. Boxes that only touch do not collide; a tolerance of one millionth keeps float noise from turning resting into overlapping.

## The API

```ts
getCollisionBoxes(world, x, y, z): Box[]            // world coordinates
moveAABB(world, box, delta, options?): MoveResult
playerBox(x, eyeY, z): Box
```

`world` is a `CollisionWorld`: anything with a `registry` and `getCell(x, y, z)`. `VoxelWorld` fits, and so does a few lines of test code.

`getCollisionBoxes` is empty for air and for every block that is not `solid`, whatever its model: crops, flowers, tall grass, sugarcane and lily pads are `solid: false` in the registry, so nobody bumps into their planes. A solid cube is one box. Stairs give two, slabs one, panes their pillar and arms, and a fence a post plus an arm to each side it joins (it reads its neighbours), all **1.5 blocks high**. A block without a model is a cube, so blocks other branches add with only an id and a colour collide as cubes. The block's `solid` flag still decides; an id the registry does not know is not solid, as before.

`moveAABB` moves the box by `delta` through the world and returns the new box, how far it moved on each axis (`dx`, `dy`, `dz`), whether each axis was cut short (`hitX`, `hitY`, `hitZ`), `onGround` and `stepped`.

## How it moves

1. It collects every box in the region the move can touch (the box grown by the delta, plus the step height above, plus one cell below because a fence sticks out of its cell upwards).
2. It moves vertically first, then x, then z, each axis straight to the first box in its way. Every box in the swept region is tested, not just the end point, so a move of any length stops at the first thing it meets. A 500 block step stops at a wall one block thick, a fall of 1000 blocks lands on a slab, and neither depends on the frame rate. (The player still caps a frame at 0.1 s so a stalled tab does not become one enormous move.)
3. **Step up.** When the box is standing on something and a horizontal move was cut short, the move is tried again from the same place: lifted by up to `STEP_HEIGHT` (0.6), moved horizontally, and set back down. If that got further than walking into the ledge did, it replaces the first result. So a slab (0.5) and each stair (0.5) are walked up by walking into them, while a full block (1.0), a top slab, a fence and any ledge with a low ceiling over it are not. Nothing is stepped onto in mid air or while rising.
4. `onGround` is true when the box is not moving up and something lies within a thousandth of a block under the feet.

A box that already overlaps a block (spawning inside one) is not pushed out and not trapped: only boxes it would run into count.

## The player

`components/Player.tsx` keeps its structure and feel: acceleration by lerp, sprint, jump cooldown and sprint-jump boost, bobbing, the void respawn at y -20. Per frame it does gravity, jump, then one `moveAABB` with `velocity * dt`, adds the result to its position, zeroes the velocity on any axis that was hit, and takes `isGrounded` from `onGround`.

- The body is `playerBox(x, eyeY, z)`: 0.8 wide (`PLAYER_RADIUS` 0.4), the feet `PLAYER_HEIGHT` (1.82) below the eyes and the top 0.1 above them, so the head is 1.92 tall and fits a doorway two blocks high.
- Jumping is decided from the previous frame's `onGround`, before the move. The old code also allowed a jump on the frame of landing; it is one frame later now.
- When the player steps up, the body is lifted at once but the camera eases up (rate 14 per second), so stairs are not a series of jolts. The HUD position is the body's.
- The cells around the player are cached for 120 frames, as the old solid check was, because the main thread's world answers unloaded chunks from the generator block by block. A move costs about 4 microseconds on the legacy world with a warm cache, 7 without.

## Jump height

`JUMP_FORCE` went from 8 to 6.7. With `GRAVITY` 18 the old jump rose 1.78 blocks, which clears a fence 1.5 high, so a player could walk up to any fence, jump and carry on over it, and the fence did not stop anyone. The new jump rises about 1.25 blocks (the same as Minecraft's, which the code's comments already aim at): enough for a full block with some margin, not enough for a fence. Walking speed, gravity and acceleration are unchanged, and a jump now lasts 0.74 s instead of 0.89 s. `tests/collision.test.ts` pins both ends: a jump must rise between 1.1 and 1.5 blocks, and a jumper starting at any of fourteen moments is stopped by a fence but gets onto a full block.

The benchmark flythrough (`bench/Benchmark.tsx`) keeps its own jump profile at the old numbers so its results stay comparable with the baseline; it does not use `Player`.

## Not done

- Collision against entities, swimming and ladders: none exist yet.
- The block under the cursor, ray casts and placing blocks: a later step reads the same boxes.
- Corner stairs: the model has only straight stairs.
