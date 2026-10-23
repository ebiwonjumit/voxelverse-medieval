import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../content/blocks';
import { ShapedBlock } from '../content/blocksShaped';
import { Cell, packCell } from '../engine/cell';
import { CollisionWorld, getCollisionBoxes, moveAABB, playerBox, STEP_HEIGHT } from '../engine/collision';
import { Box } from '../engine/models/BlockModel';
import { SLAB_BOTTOM, SLAB_TOP } from '../engine/models/SlabModel';
import { stairState } from '../engine/models/StairModel';
import { VoxelWorld } from '../engine/VoxelWorld';
import { LegacyZoneAdapter } from '../worldgen/LegacyZoneAdapter';
import { BlockType, GRAVITY, JUMP_FORCE, MOVE_SPEED, PLAYER_HEIGHT, PLAYER_RADIUS } from '../worldConstants';

// A flat world: stone up to and including y = 0, so the ground surface is at world y 0.5. Block (x, y, z) fills
// x - 0.5 .. x + 0.5 on each axis. Everything else is placed by the tests.
const GROUND = 0.5;

class TestWorld implements CollisionWorld {
  readonly registry = createDefaultRegistry();
  private readonly cells = new Map<string, Cell>();

  set(x: number, y: number, z: number, id: number, state = 0): this {
    this.cells.set(`${x},${y},${z}`, packCell(id, state));
    return this;
  }

  getCell(x: number, y: number, z: number): Cell {
    return this.cells.get(`${x},${y},${z}`) ?? (y <= 0 ? packCell(BlockType.STONE) : 0);
  }
}

const FPS = 60;
const DT = 1 / FPS;

// A player standing on the ground at x, z, with its feet at the given height.
const standing = (x: number, z: number, feetY = GROUND): Box => playerBox(x, feetY + PLAYER_HEIGHT, z);
const feet = (box: Box) => box[1];
const centreX = (box: Box) => (box[0] + box[3]) / 2;

interface Sim {
  box: Box;
  vy: number;
  onGround: boolean;
  maxFeet: number;
  maxX: number;
}

// Runs the player's physics the way components/Player.tsx does: gravity, an optional jump while grounded, then one
// moveAABB with a constant walking speed along +x.
const simulate = (world: CollisionWorld, start: Box, opts: { speed?: number; frames: number; jumpAt?: number }): Sim => {
  const sim: Sim = { box: start, vy: 0, onGround: false, maxFeet: feet(start), maxX: start[3], };
  const speed = opts.speed ?? MOVE_SPEED;
  let jumped = false;
  for (let f = 0; f < opts.frames; f++) {
    sim.vy = Math.max(sim.vy - GRAVITY * DT, -50);
    if (opts.jumpAt !== undefined && !jumped && f >= opts.jumpAt && sim.onGround) {
      sim.vy = JUMP_FORCE;
      jumped = true;
    }
    const r = moveAABB(world, sim.box, { x: speed * DT, y: sim.vy * DT, z: 0 });
    sim.box = r.box;
    if (r.hitY) sim.vy = 0;
    sim.onGround = r.onGround;
    sim.maxFeet = Math.max(sim.maxFeet, feet(sim.box));
    sim.maxX = Math.max(sim.maxX, sim.box[3]);
  }
  return sim;
};

describe('getCollisionBoxes', () => {
  const world = new TestWorld()
    .set(1, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM)
    .set(2, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_TOP)
    .set(3, 1, 0, ShapedBlock.STONE_BRICK_STAIRS, stairState(1))
    .set(4, 1, 0, BlockType.WOOD_FENCE);

  const rounded = (boxes: Box[]) => boxes.map((b) => b.map((v) => Math.round(v * 1e4) / 1e4));

  it('gives a full cube one box in world coordinates', () => {
    expect(getCollisionBoxes(world, 0, 0, 0)).toEqual([[-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]]);
    expect(getCollisionBoxes(world, 7, 3, -2)).toEqual([]);
  });

  it('gives slabs half a block', () => {
    expect(rounded(getCollisionBoxes(world, 1, 1, 0))).toEqual([[0.5, 0.5, -0.5, 1.5, 1, 0.5]]);
    expect(rounded(getCollisionBoxes(world, 2, 1, 0))).toEqual([[1.5, 1, -0.5, 2.5, 1.5, 0.5]]);
  });

  it('gives stairs a low step and a tall back', () => {
    // Facing east: the back is on the east side.
    expect(rounded(getCollisionBoxes(world, 3, 1, 0)).sort()).toEqual(
      rounded([[2.5, 0.5, -0.5, 3, 1, 0.5], [3, 0.5, -0.5, 3.5, 1.5, 0.5]]).sort(),
    );
  });

  it('makes a fence 1.5 blocks tall', () => {
    const [post] = getCollisionBoxes(world, 4, 1, 0);
    expect(post[4] - post[1]).toBeCloseTo(1.5);
    expect(post[3] - post[0]).toBeCloseTo(0.25);
  });

  it('gives nothing for blocks that do not block', () => {
    const w = new TestWorld();
    const plants = [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS, BlockType.SUGARCANE,
      BlockType.WHEAT, BlockType.WHEAT_STAGE_1, BlockType.WHEAT_STAGE_2, BlockType.LILY_PAD, BlockType.WATER];
    for (const id of plants) {
      w.set(0, 1, 0, id);
      expect(getCollisionBoxes(w, 0, 1, 0), BlockType[id]).toEqual([]);
    }
  });

  it('treats a block without a model as a full cube', () => {
    const w = new TestWorld().set(0, 1, 0, BlockType.GOLD_BLOCK);
    expect(getCollisionBoxes(w, 0, 1, 0)).toEqual([[-0.5, 0.5, -0.5, 0.5, 1.5, 0.5]]);
  });

  it('lets a fence grow arms towards the blocks it joins', () => {
    const w = new TestWorld().set(0, 1, 0, BlockType.WOOD_FENCE).set(1, 1, 0, BlockType.WOOD_FENCE);
    expect(getCollisionBoxes(w, 0, 1, 0)).toHaveLength(2);
    expect(getCollisionBoxes(w, 5, 1, 5)).toEqual([]);
  });
});

describe('standing and falling', () => {
  it('stands on a slab, on its surface and not in it', () => {
    const w = new TestWorld().set(0, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM);
    // A slab above the ground has its top at world y 1.0.
    const r = moveAABB(w, standing(0, 0, 1.4), { x: 0, y: -1, z: 0 });
    expect(feet(r.box)).toBeCloseTo(1.0, 9);
    expect(r.onGround).toBe(true);
    expect(r.hitY).toBe(true);
    // Staying put frame after frame does not sink it.
    let box = r.box;
    for (let i = 0; i < 120; i++) box = moveAABB(w, box, { x: 0, y: -GRAVITY * DT * DT, z: 0 }).box;
    expect(feet(box)).toBeCloseTo(1.0, 9);
  });

  it('stands under an upper slab on the lower half of the cell', () => {
    const w = new TestWorld().set(0, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_TOP);
    const r = moveAABB(w, standing(0, 0, 3), { x: 0, y: -5, z: 0 });
    expect(feet(r.box)).toBeCloseTo(1.5, 9);
    // The ground beside the slab is lower than the slab's underside is, so walking under it is possible.
    const under = moveAABB(w, standing(2, 0), { x: -1.4, y: 0, z: 0 });
    expect(under.hitX).toBe(true);
  });

  it('stops a fall onto a slab at its surface, however fast', () => {
    const w = new TestWorld().set(0, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM);
    for (const fall of [-0.3, -3, -40, -400, -1000]) {
      const r = moveAABB(w, standing(0, 0, 400), { x: 0, y: fall, z: 0 });
      // Short falls stay in the air; long ones stop on the surface and never go through.
      expect(feet(r.box)).toBeCloseTo(Math.max(1.0, 400 + fall), 9);
      expect(r.onGround).toBe(400 + fall <= 1.0);
    }
  });

  it('lands frame by frame on a slab at terminal speed', () => {
    const w = new TestWorld().set(0, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM);
    const sim = simulate(w, standing(0, 0, 150), { frames: 600, speed: 0 });
    expect(feet(sim.box)).toBeCloseTo(1.0, 9);
    expect(sim.onGround).toBe(true);
  });

  it('bumps its head on a ceiling', () => {
    const w = new TestWorld().set(0, 3, 0, BlockType.STONE);
    const r = moveAABB(w, standing(0, 0), { x: 0, y: 5, z: 0 });
    expect(r.box[4]).toBeCloseTo(2.5, 9);
    expect(r.hitY).toBe(true);
    expect(r.onGround).toBe(false);
  });
});

describe('walking up', () => {
  it('walks up a slab by walking into it', () => {
    const w = new TestWorld();
    for (let x = 1; x <= 30; x++) w.set(x, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM);
    const sim = simulate(w, standing(-1, 0), { frames: 90 });
    expect(feet(sim.box)).toBeCloseTo(1.0, 9);
    expect(centreX(sim.box)).toBeGreaterThan(1.5);
    expect(sim.onGround).toBe(true);
  });

  it('reports the step it took', () => {
    const w = new TestWorld().set(1, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM);
    // Standing 0.05 short of the slab, walking into it.
    const r = moveAABB(w, standing(0.45 - PLAYER_RADIUS + 0.05, 0), { x: 0.2, y: 0, z: 0 });
    expect(r.stepped).toBeCloseTo(0.5, 9);
    expect(feet(r.box)).toBeCloseTo(1.0, 9);
    expect(r.hitX).toBe(false);
    expect(r.onGround).toBe(true);
  });

  it('walks up a flight of stairs without jumping', () => {
    // Three stairs climbing east, each on solid ground, ending on a platform at the height of the last back.
    const w = new TestWorld();
    for (let i = 1; i <= 3; i++) {
      w.set(i, i, 0, ShapedBlock.STONE_BRICK_STAIRS, stairState(1));
      for (let y = 1; y < i; y++) w.set(i, y, 0, BlockType.STONE);
    }
    for (let x = 4; x <= 80; x++) for (let y = 1; y <= 3; y++) w.set(x, y, 0, BlockType.STONE);
    for (const speed of [MOVE_SPEED * 0.5, MOVE_SPEED, MOVE_SPEED * 2]) {
      const sim = simulate(w, standing(-1, 0), { frames: Math.ceil(10 / (speed * DT)), speed });
      expect(feet(sim.box), `speed ${speed}`).toBeCloseTo(3.5, 9);
      expect(centreX(sim.box), `speed ${speed}`).toBeGreaterThan(5);
    }
  });

  it('walks down the same stairs from the back', () => {
    const w = new TestWorld();
    for (let i = 1; i <= 3; i++) {
      w.set(i, i, 0, ShapedBlock.STONE_BRICK_STAIRS, stairState(1));
      for (let y = 1; y < i; y++) w.set(i, y, 0, BlockType.STONE);
    }
    // Start on top of the last back and walk west.
    const sim = simulate(w, standing(3.4, 0, 3.5), { frames: 300, speed: -MOVE_SPEED });
    expect(feet(sim.box)).toBeCloseTo(GROUND, 9);
    expect(centreX(sim.box)).toBeLessThan(0);
  });

  it('does not climb a full block, a fence or a wall of two slabs', () => {
    const block = new TestWorld().set(1, 1, 0, BlockType.STONE);
    const sim = simulate(block, standing(-1, 0), { frames: 90 });
    expect(sim.maxX).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(feet(sim.box)).toBeCloseTo(GROUND, 9);

    const stacked = new TestWorld().set(1, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_TOP);
    expect(simulate(stacked, standing(-1, 0), { frames: 90 }).maxX).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('does not step up into a space that is too low', () => {
    const w = new TestWorld().set(1, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM).set(1, 2, 0, BlockType.STONE);
    const sim = simulate(w, standing(-1, 0), { frames: 90 });
    expect(sim.maxX).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(feet(sim.box)).toBeCloseTo(GROUND, 9);
  });

  it('does not step up in mid air', () => {
    const w = new TestWorld().set(1, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM);
    // Feet 0.2 above the ground, level with nothing: a slab top is 0.5 above the ground.
    const r = moveAABB(w, standing(-0.2, 0, GROUND + 0.1), { x: 0.5, y: 0, z: 0 });
    expect(r.stepped).toBe(0);
    expect(r.hitX).toBe(true);
  });

  it('can be told not to step', () => {
    const w = new TestWorld().set(1, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM);
    const r = moveAABB(w, standing(0, 0), { x: 0.5, y: 0, z: 0 }, { stepHeight: 0 });
    expect(r.hitX).toBe(true);
    expect(r.stepped).toBe(0);
    expect(STEP_HEIGHT).toBe(0.6);
  });

  it('slides along a wall instead of stopping dead', () => {
    const w = new TestWorld();
    for (let z = -5; z <= 5; z++) w.set(1, 1, z, BlockType.STONE).set(1, 2, z, BlockType.STONE);
    const r = moveAABB(w, standing(0, 0), { x: 0.3, y: 0, z: 0.3 });
    expect(r.hitX).toBe(true);
    expect(r.hitZ).toBe(false);
    expect(r.dz).toBeCloseTo(0.3, 9);
  });
});

describe('fences', () => {
  const fenceWorld = () => new TestWorld().set(1, 1, 0, BlockType.WOOD_FENCE);
  // The post fills x 0.875 .. 1.125.
  const POST_FACE = 0.875;

  it('jumps no higher than a block and a half, so a fence cannot be jumped', () => {
    const sim = simulate(new TestWorld(), standing(0, 0), { frames: 90, speed: 0, jumpAt: 0 });
    const height = sim.maxFeet - GROUND;
    expect(height).toBeGreaterThan(1.1);
    expect(height).toBeLessThan(1.5);
  });

  it('blocks a walker, and a jumper, however they approach it', () => {
    const walk = simulate(fenceWorld(), standing(-1, 0), { frames: 120 });
    expect(walk.maxX).toBeLessThanOrEqual(POST_FACE + 1e-9);

    for (let start = 0; start < 40; start += 3) {
      const jump = simulate(fenceWorld(), standing(-1, 0), { frames: 160, jumpAt: start });
      expect(jump.maxX, `jump from frame ${start}`).toBeLessThanOrEqual(POST_FACE + 1e-9);
    }
  });

  it('blocks a box that is a block off the ground', () => {
    // Feet 1.2 up, the height a jump reaches: still below the fence top (1.5 above the ground).
    const r = moveAABB(fenceWorld(), standing(0, 0, GROUND + 1.2), { x: 1, y: 0, z: 0 });
    expect(r.hitX).toBe(true);
    expect(r.box[3]).toBeCloseTo(POST_FACE, 9);
    // Above the fence top it passes.
    const over = moveAABB(fenceWorld(), standing(0, 0, GROUND + 1.6), { x: 1, y: 0, z: 0 });
    expect(over.hitX).toBe(false);
  });

  it('can still be jumped when it is a full block high', () => {
    const w = new TestWorld();
    for (let x = 1; x <= 30; x++) w.set(x, 1, 0, BlockType.STONE);
    const sim = simulate(w, standing(-1, 0), { frames: 150, jumpAt: 0 });
    expect(feet(sim.box)).toBeCloseTo(1.5, 9);
    expect(centreX(sim.box)).toBeGreaterThan(1);
    expect(sim.onGround).toBe(true);
  });

  it('is stopped by the arms it grows towards a wall', () => {
    const w = new TestWorld()
      .set(1, 1, 0, BlockType.WOOD_FENCE).set(1, 1, 1, BlockType.WOOD_FENCE).set(1, 1, 2, BlockType.WOOD_FENCE);
    // Walking along z beside the line of fences at x = 1 is fine, walking into it from the west is not.
    const sim = simulate(w, standing(-1, 1), { frames: 120 });
    expect(sim.maxX).toBeLessThanOrEqual(0.875 + 1e-9);
  });
});

describe('plants do not block', () => {
  it('walks through crops, flowers, tall grass, sugarcane and lily pads', () => {
    const w = new TestWorld();
    const plants = [BlockType.WHEAT, BlockType.WHEAT_STAGE_1, BlockType.WHEAT_STAGE_2, BlockType.FLOWER_RED,
      BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS, BlockType.SUGARCANE];
    plants.forEach((id, i) => w.set(1 + i, 1, 0, id).set(1 + i, 2, 0, id));
    const x = 1 + plants.length;
    w.set(x, 1, 0, BlockType.WATER).set(x, 1, 0, BlockType.LILY_PAD);
    const sim = simulate(w, standing(-1, 0), { frames: 120 });
    expect(centreX(sim.box)).toBeGreaterThan(x + 1);
    expect(feet(sim.box)).toBeCloseTo(GROUND, 9);
  });

  it('still stands on farmland, which is a little lower than a full block', () => {
    const w = new TestWorld().set(0, 0, 0, BlockType.FARMLAND);
    const r = moveAABB(w, standing(0, 0, 3), { x: 0, y: -5, z: 0 });
    expect(feet(r.box)).toBeCloseTo(GROUND - 1 / 16, 9);
  });
});

describe('no tunnelling', () => {
  it('stops at a wall one block thick whatever the speed', () => {
    const w = new TestWorld();
    for (let y = 1; y <= 4; y++) w.set(5, y, 0, BlockType.STONE);
    for (const dx of [0.5, 5, 50, 500]) {
      const r = moveAABB(w, standing(0, 0), { x: dx, y: 0, z: 0 });
      expect(r.box[3], `dx ${dx}`).toBeLessThanOrEqual(4.5 + 1e-9);
      expect(r.hitX).toBe(dx > 4);
    }
    const back = moveAABB(w, standing(10, 0), { x: -500, y: 0, z: 0 });
    expect(back.box[0]).toBeGreaterThanOrEqual(5.5 - 1e-9);
  });

  it('stops at a fence post a quarter of a block thick in one big move', () => {
    const w = new TestWorld().set(5, 1, 0, BlockType.WOOD_FENCE);
    const r = moveAABB(w, standing(0, 0), { x: 80, y: 0, z: 0 });
    expect(r.box[3]).toBeCloseTo(4.875, 9);
  });

  it('stops at a pane, and at a slab, in one big move', () => {
    const pane = new TestWorld().set(5, 1, 0, ShapedBlock.GLASS_PANE);
    expect(moveAABB(pane, standing(0, 0), { x: 80, y: 0, z: 0 }).hitX).toBe(true);
    const slab = new TestWorld().set(5, 1, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_TOP);
    // A top slab is above the player's feet but inside its body.
    expect(moveAABB(slab, standing(0, 0), { x: 80, y: 0, z: 0 }).box[3]).toBeLessThanOrEqual(4.5 + 1e-9);
  });

  it('stops at a thin floor when falling a long way in one move', () => {
    const w = new TestWorld().set(0, 100, 0, ShapedBlock.STONE_BRICK_SLAB, SLAB_BOTTOM);
    const r = moveAABB(w, standing(0, 0, 300), { x: 0, y: -1000, z: 0 });
    expect(feet(r.box)).toBeCloseTo(100, 9);
  });

  it('keeps up at sprint speed with a slow frame', () => {
    const w = new TestWorld().set(3, 1, 0, BlockType.STONE).set(3, 2, 0, BlockType.STONE);
    let box = standing(0, 0);
    for (let i = 0; i < 20; i++) box = moveAABB(w, box, { x: MOVE_SPEED * 2 * 0.25, y: -GRAVITY * 0.0625, z: 0 }).box;
    expect(box[3]).toBeLessThanOrEqual(2.5 + 1e-9);
  });
});

describe('player box', () => {
  it('has the feet under the eyes and some room above them', () => {
    const b = playerBox(10, 20, -5);
    expect(b[1]).toBeCloseTo(20 - PLAYER_HEIGHT);
    expect(b[4]).toBeGreaterThan(20);
    expect(b[3] - b[0]).toBeCloseTo(PLAYER_RADIUS * 2);
    expect(b[5] - b[2]).toBeCloseTo(PLAYER_RADIUS * 2);
  });

  it('fits through a doorway two blocks high and one wide', () => {
    const w = new TestWorld();
    for (let y = 1; y <= 4; y++) for (let z = -3; z <= 3; z++) if (z !== 0) w.set(0, y, z, BlockType.STONE);
    for (let x = -3; x <= 3; x++) w.set(x, 3, 0, BlockType.STONE);
    const r = moveAABB(w, standing(-3, 0), { x: 6, y: 0, z: 0 });
    expect(r.hitX).toBe(false);
  });
});

describe('in the real world', () => {
  const registry = createDefaultRegistry();
  const world = new VoxelWorld(registry, new LegacyZoneAdapter(registry));

  // A fence of Greensom standing on flat ground with a clear run-up to its west.
  const findFence = () => {
    for (let z = 260; z <= 340; z++) {
      for (let x = -40; x <= 40; x++) {
        const h = world.terrainHeight(x, z);
        if (world.getBlock(x, h + 1, z) !== BlockType.WOOD_FENCE) continue;
        let clear = true;
        for (let dx = 1; dx <= 4; dx++) {
          clear &&= world.terrainHeight(x - dx, z) === h;
          for (let dy = 1; dy <= 3; dy++) clear &&= !registry.isSolid(world.getBlock(x - dx, h + dy, z));
        }
        // Only a lone post counts: arms would change where it stops the player.
        if (clear) return { x, y: h + 1, z, ground: h + 0.5 };
      }
    }
    return null;
  };

  it('lands on the ground at the spawn', () => {
    const ground = world.terrainHeight(0, 300) + 0.5;
    const sim = simulate(world, standing(0, 300, ground + 5), { frames: 120, speed: 0 });
    expect(feet(sim.box)).toBeCloseTo(ground, 9);
    expect(sim.onGround).toBe(true);
  });

  it('is stopped by a fence of the old zones, jumping or not', () => {
    const fence = findFence();
    expect(fence, 'a lone fence post near Greensom').not.toBeNull();
    const { x, y, z, ground } = fence!;
    const face = x - 0.5 + 6 / 16; // the west face of the post
    for (const jumpAt of [undefined, 0, 6, 12]) {
      const sim = simulate(world, standing(x - 4, z, ground), { frames: 150, jumpAt });
      expect(sim.maxX, `jump at ${jumpAt} beside the fence at ${x},${y},${z}`).toBeLessThanOrEqual(face + 1e-9);
    }
  });
});
