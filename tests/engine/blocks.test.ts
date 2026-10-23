import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { natureBlockIds } from '../../content/blocksNature';
import { SHAPED_FIRST_ID, SHAPED_LAST_ID } from '../../content/blocksShaped';
import { TEMPEST_ID_MIN } from '../../content/blocksTempest';
import { BlockType } from '../../worldConstants';

const registry = createDefaultRegistry();
const legacyTypes = Object.values(BlockType).filter((v): v is BlockType => typeof v === 'number');
const LEGACY_LAST_ID = 47;

describe('default block registry', () => {
  it('registers every legacy BlockType under its own numeric id', () => {
    // Count by range: the wilderness blocks (48..79), the shaped blocks (80..127) and the Tempest set (128..199) are registered after the legacy ones.
    expect(registry.all().filter((d) => d.id <= LEGACY_LAST_ID).length).toBe(legacyTypes.length);
    for (const type of legacyTypes) {
      expect(registry.get(type).id).toBe(type);
    }
  });

  it('names blocks after the enum', () => {
    expect(registry.get(BlockType.AIR).name).toBe('voxelverse:air');
    expect(registry.get(BlockType.STONE_BRICK).name).toBe('voxelverse:stone_brick');
    expect(registry.byName('voxelverse:wheat_stage_2').id).toBe(BlockType.WHEAT_STAGE_2);
  });

  it('makes air empty', () => {
    const air = registry.get(BlockType.AIR);
    expect(air.id).toBe(0);
    expect(air.solid).toBe(false);
    expect(air.opaque).toBe(false);
  });

  it('keeps the same solid blocks the old player collision used', () => {
    const oldNonSolid = new Set<BlockType>([
      BlockType.AIR, BlockType.WATER, BlockType.SUGARCANE, BlockType.TALL_GRASS,
      BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.WHEAT,
      BlockType.WHEAT_STAGE_1, BlockType.WHEAT_STAGE_2, BlockType.LILY_PAD,
    ]);
    for (const type of legacyTypes) {
      expect(registry.isSolid(type), BlockType[type]).toBe(!oldNonSolid.has(type));
    }
  });

  it('only lets full, solid cubes hide their neighbours', () => {
    for (const type of legacyTypes) {
      if (registry.isOpaque(type)) expect(registry.isSolid(type), BlockType[type]).toBe(true);
    }
    expect(registry.isOpaque(BlockType.STONE)).toBe(true);
    expect(registry.isOpaque(BlockType.GLASS)).toBe(false);
    expect(registry.isOpaque(BlockType.LEAVES)).toBe(false);
    expect(registry.isOpaque(BlockType.WATER)).toBe(false);
    expect(registry.isOpaque(BlockType.WOOD_FENCE)).toBe(false);
  });

  it('marks lanterns and crystals as light sources', () => {
    expect(registry.get(BlockType.LANTERN).emits).toBe(15);
    expect(registry.get(BlockType.MAGIC_CRYSTAL).emits).toBe(10);
    expect(registry.get(BlockType.STONE).emits).toBe(0);
  });

  it('dims light under the three kinds of leaves and nothing else', () => {
    const dimmed = legacyTypes.filter((t) => registry.lightDim(t) > 0).sort((a, b) => a - b);
    expect(dimmed).toEqual([BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.PINE_LEAVES].sort((a, b) => a - b));
    for (const t of dimmed) expect(registry.lightDim(t)).toBe(1);
  });

  it('gives every block a valid flat colour', () => {
    for (const def of registry.all()) expect(def.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('gives every legacy block except air texture names, all of them in the texture catalog', () => {
    const tiles = new Set(createDefaultCatalog().names());
    for (const def of registry.all()) {
      if (def.id === BlockType.AIR || def.id > 47) continue;
      expect(def.faces, def.name).toBeDefined();
      for (const key of ['top', 'bottom', 'side'] as const) {
        expect(tiles.has(def.faces![key]), `${def.name} ${key}: ${def.faces![key]}`).toBe(true);
      }
    }
  });

  it('lets blocks from other ranges go without faces, and checks the faces they do have', () => {
    // The wilderness blocks (48..79) have no textures yet and draw as flat-colour tiles. Any faces given must exist.
    const tiles = new Set(createDefaultCatalog().names());
    for (const def of registry.all()) {
      if (def.id <= 47 || !def.faces) continue;
      for (const key of ['top', 'bottom', 'side'] as const) {
        expect(tiles.has(def.faces[key]), `${def.name} ${key}: ${def.faces[key]}`).toBe(true);
      }
    }
    expect(natureBlockIds().length).toBeGreaterThan(0);
  });

  it('textures grass, logs and farmland by face', () => {
    expect(registry.get(BlockType.GRASS).faces).toEqual({ top: 'grass_top', bottom: 'dirt', side: 'grass_side' });
    expect(registry.get(BlockType.WOOD_LOG).faces).toEqual({ top: 'log_top', bottom: 'log_top', side: 'log_side' });
    expect(registry.get(BlockType.BIRCH_LOG).faces).toEqual({ top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log_side' });
    expect(registry.get(BlockType.FARMLAND).faces!.top).toBe('farmland');
  });

  it('tints only grass and oak leaves', () => {
    const tinted = registry.all().filter((d) => d.tint).map((d) => [d.id, d.tint]);
    expect(tinted).toEqual([[BlockType.GRASS, 'grass'], [BlockType.LEAVES, 'foliage']]);
  });

  it('only shares a top tile between blocks that are meant to match', () => {
    // A cheap guard against two blocks sharing a texture by accident: the pairs that do are all deliberate.
    const byTop = new Map<string, string[]>();
    for (const def of registry.all()) {
      // Stairs, slabs and panes wear the tile of the cube they are cut from, on purpose. The Tempest set (128 and up) shares
      // tiles the same way, and tests/textures/tempest.test.ts lists exactly which blocks may.
      if (!def.faces || (def.id >= SHAPED_FIRST_ID && def.id <= SHAPED_LAST_ID) || def.id >= TEMPEST_ID_MIN) continue;
      const list = byTop.get(def.faces.top) ?? [];
      list.push(def.name.replace('voxelverse:', ''));
      byTop.set(def.faces.top, list);
    }
    const shared = [...byTop.entries()].filter(([, names]) => names.length > 1).map(([tile, names]) => `${tile}: ${names.join(',')}`);
    expect(shared.sort()).toEqual([
      'cobble: cobblestone,small_rock',
      'plank: wood_plank,wood_fence',
    ].sort());
  });
});
