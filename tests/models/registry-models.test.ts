import { describe, expect, it } from 'vitest';
import { BlockRegistry } from '../../engine/BlockRegistry';
import { CUBE_MODEL } from '../../engine/models/CubeModel';
import { BoxModel } from '../../engine/models/BoxModel';
import { CropModel } from '../../engine/models/CropModel';
import { CrossModel } from '../../engine/models/CrossModel';
import { FenceModel } from '../../engine/models/FenceModel';
import { PlateModel } from '../../engine/models/PlateModel';
import { SlabModel } from '../../engine/models/SlabModel';
import { StairModel } from '../../engine/models/StairModel';
import { PaneModel } from '../../engine/models/PaneModel';
import { SHAPED_FIRST_ID, SHAPED_LAST_ID, ShapedBlock } from '../../content/blocksShaped';
import { BlockType } from '../../worldConstants';
import { quadBounds, registry } from './helpers';

const def = (over: object = {}) => ({ id: 1, name: 'test:a', color: '#112233', solid: true, opaque: true, emits: 0, ...over });

describe('BlockDef.model', () => {
  it('defaults to a plain cube, also for ids nobody registered', () => {
    const r = new BlockRegistry();
    r.register(def());
    expect(r.model(1)).toBe(CUBE_MODEL);
    expect(r.model(2)).toBe(CUBE_MODEL);
    expect(r.model(4095)).toBe(CUBE_MODEL);
  });

  it('keeps the model it was registered with', () => {
    const r = new BlockRegistry();
    const slab = new SlabModel();
    r.register(def({ model: slab }));
    expect(r.model(1)).toBe(slab);
    expect(r.get(1).model).toBe(slab);
  });

  it('rejects something that is not a model', () => {
    expect(() => new BlockRegistry().register(def({ model: {} }))).toThrow(/model/);
  });
});

describe('the legacy blocks', () => {
  // The blocks the old renderer made by scaling a cube. Everything else was, and is, a plain cube.
  const SHAPED: Array<[BlockType, new (...args: never[]) => object]> = [
    [BlockType.FLOWER_YELLOW, CrossModel],
    [BlockType.FLOWER_RED, CrossModel],
    [BlockType.SMALL_ROCK, BoxModel],
    [BlockType.MAGIC_CRYSTAL, BoxModel],
    [BlockType.WOOD_FENCE, FenceModel],
    [BlockType.WHEAT, CropModel],
    [BlockType.WHEAT_STAGE_1, CropModel],
    [BlockType.WHEAT_STAGE_2, CropModel],
    [BlockType.FARMLAND, BoxModel],
    [BlockType.LILY_PAD, PlateModel],
    [BlockType.SUGARCANE, CrossModel],
    [BlockType.TALL_GRASS, CrossModel],
    [BlockType.LANTERN, BoxModel],
    [BlockType.RED_APPLE, BoxModel],
  ];

  it('are cubes unless they used to be scaled', () => {
    const shaped = new Set(SHAPED.map(([id]) => id));
    for (const id of Object.values(BlockType).filter((v): v is BlockType => typeof v === 'number')) {
      if (shaped.has(id)) continue;
      expect(registry.model(id), BlockType[id]).toBe(CUBE_MODEL);
    }
  });

  for (const [id, Kind] of SHAPED) {
    it(`give ${BlockType[id]} a ${Kind.name}`, () => {
      expect(registry.model(id)).toBeInstanceOf(Kind);
    });
  }

  // The scale and offset World.tsx applied to each box, written out from the old file: [block, sx, sy, sz, dy].
  // The boxes that are still boxes keep these numbers, in cell coordinates (the old cube was centred on the block).
  const OLD_BOXES: Array<[BlockType, number, number, number, number]> = [
    [BlockType.SMALL_ROCK, 0.4, 0.2, 0.4, -0.4],
    [BlockType.MAGIC_CRYSTAL, 0.6, 0.8, 0.6, 0],
    [BlockType.LANTERN, 0.3, 0.4, 0.3, -0.2],
    [BlockType.RED_APPLE, 0.2, 0.2, 0.2, 0],
  ];
  for (const [id, sx, sy, sz, dy] of OLD_BOXES) {
    it(`draws ${BlockType[id]} in the old ${sx} x ${sy} x ${sz} box`, () => {
      const { min, max } = quadBounds(registry.model(id).quads(0));
      const centre = [0.5, 0.5 + dy, 0.5];
      [sx, sy, sz].forEach((size, a) => {
        expect(max[a] - min[a]).toBeCloseTo(size, 5);
        expect((max[a] + min[a]) / 2).toBeCloseTo(centre[a], 5);
      });
    });
  }

  it('keeps the fence post at the old quarter of a block wide, a block tall', () => {
    const { min, max } = quadBounds(registry.model(BlockType.WOOD_FENCE).quads(0));
    expect([max[0] - min[0], max[1] - min[1], max[2] - min[2]]).toEqual([0.25, 1, 0.25]);
  });

  it('keeps the lily pad as wide as before, a hair thicker, lying on top of its water', () => {
    const { min, max } = quadBounds(registry.model(BlockType.LILY_PAD).quads(0));
    expect(max[0] - min[0]).toBeCloseTo(0.6);
    expect(max[1] - min[1]).toBeCloseTo(1 / 16);
    expect(min[1]).toBeGreaterThan(0.95);
    expect(registry.get(BlockType.LILY_PAD).holdsWater).toBe(true);
  });

  it('makes farmland 15/16 of a cube and an opaque material that covers its base', () => {
    const { min, max } = quadBounds(registry.model(BlockType.FARMLAND).quads(0));
    expect([min[1], max[1]]).toEqual([0, 0.9375]);
    expect(registry.isOpaque(BlockType.FARMLAND)).toBe(true);
    expect(registry.isSolid(BlockType.FARMLAND)).toBe(true);
  });

  it('keeps plants walk-through and see-through', () => {
    for (const id of [BlockType.FLOWER_RED, BlockType.TALL_GRASS, BlockType.SUGARCANE, BlockType.WHEAT, BlockType.LILY_PAD]) {
      expect(registry.isSolid(id), BlockType[id]).toBe(false);
      expect(registry.isOpaque(id), BlockType[id]).toBe(false);
    }
  });
});

describe('the shaped blocks', () => {
  const shaped = registry.all().filter((d) => d.id >= SHAPED_FIRST_ID && d.id <= SHAPED_LAST_ID);

  it('are stairs and slabs for six materials and a glass pane, in 80 to 127', () => {
    expect(shaped).toHaveLength(13);
    expect(Object.values(ShapedBlock).sort((a, b) => a - b)).toEqual(shaped.map((d) => d.id));
    expect(shaped.map((d) => d.name.replace('voxelverse:', ''))).toEqual([
      'stone_brick_slab', 'stone_brick_stairs', 'cobblestone_slab', 'cobblestone_stairs', 'wood_plank_slab',
      'wood_plank_stairs', 'dark_plank_slab', 'dark_plank_stairs', 'red_roof_slab', 'red_roof_stairs',
      'blue_roof_slab', 'blue_roof_stairs', 'glass_pane',
    ]);
  });

  it('have the models their names say', () => {
    for (const d of shaped) {
      const model = registry.model(d.id);
      if (d.name.endsWith('_slab')) expect(model).toBeInstanceOf(SlabModel);
      else if (d.name.endsWith('_stairs')) expect(model).toBeInstanceOf(StairModel);
      else expect(model).toBeInstanceOf(PaneModel);
    }
  });

  it('wear the textures of the cube they are cut from and have its colour as the flat fallback', () => {
    const base: Record<string, BlockType> = {
      stone_brick: BlockType.STONE_BRICK, cobblestone: BlockType.COBBLESTONE, wood_plank: BlockType.WOOD_PLANK,
      dark_plank: BlockType.DARK_PLANK, red_roof: BlockType.ROOF_RED, blue_roof: BlockType.ROOF_BLUE,
    };
    for (const d of shaped) {
      const material = d.name.replace('voxelverse:', '').replace(/_(slab|stairs)$/, '');
      if (material === 'glass_pane') continue;
      expect(d.faces, d.name).toEqual(registry.get(base[material]).faces);
      expect(d.color).toBe(registry.get(base[material]).color);
    }
    expect(registry.get(ShapedBlock.GLASS_PANE).faces).toEqual(registry.get(BlockType.GLASS).faces);
  });

  it('are solid, and opaque except for the pane', () => {
    for (const d of shaped) {
      expect(d.solid, d.name).toBe(true);
      expect(d.opaque, d.name).toBe(d.id !== ShapedBlock.GLASS_PANE);
    }
  });
});
