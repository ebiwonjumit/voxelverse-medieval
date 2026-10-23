import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { natureBlockIds } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';

const registry = createDefaultRegistry();
const legacyTypes = Object.values(BlockType).filter((v): v is BlockType => typeof v === 'number');

describe('default block registry', () => {
  it('registers every legacy BlockType under its own numeric id', () => {
    // The wilderness blocks (ids 48..79) are registered after the legacy ones.
    expect(registry.size).toBe(legacyTypes.length + natureBlockIds().length);
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

  it('gives every block a valid flat colour', () => {
    for (const def of registry.all()) expect(def.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
