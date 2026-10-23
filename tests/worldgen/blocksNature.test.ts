import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import {
  NATURE_ID_MAX, NATURE_ID_MIN, NatureBlock, natureBlockIds, registerNatureBlocks,
} from '../../content/blocksNature';
import { BlockRegistry } from '../../engine/BlockRegistry';
import { BlockType } from '../../worldConstants';

const legacyIds = Object.values(BlockType).filter((v): v is BlockType => typeof v === 'number');

describe('nature blocks', () => {
  it('have unique ids inside 48..79 and none collide with the legacy blocks', () => {
    const ids = natureBlockIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(NATURE_ID_MIN);
      expect(id).toBeLessThanOrEqual(NATURE_ID_MAX);
      expect(legacyIds).not.toContain(id);
    }
    expect(Math.max(...legacyIds)).toBeLessThan(NATURE_ID_MIN);
  });

  it('match the NatureBlock enum, so the generator and the registry cannot drift', () => {
    const enumIds = Object.values(NatureBlock).filter((v): v is NatureBlock => typeof v === 'number');
    expect([...enumIds].sort((a, b) => a - b)).toEqual([...natureBlockIds()].sort((a, b) => a - b));
    const registry = createDefaultRegistry();
    for (const id of enumIds) {
      expect(registry.get(id).name).toBe(`voxelverse:${NatureBlock[id].toLowerCase()}`);
    }
  });

  it('register on top of the legacy set without touching it', () => {
    const registry = createDefaultRegistry();
    const legacyOnly = new BlockRegistry();
    registerNatureBlocks(legacyOnly);
    expect(legacyOnly.size).toBe(natureBlockIds().length);
    expect(registry.size).toBe(legacyIds.length + natureBlockIds().length);
    // Registering twice is a mistake the registry reports.
    expect(() => registerNatureBlocks(registry)).toThrow();
  });

  it('give every block a flat #rrggbb colour and unique name', () => {
    const registry = createDefaultRegistry();
    const names = new Set<string>();
    for (const id of natureBlockIds()) {
      const def = registry.get(id);
      expect(def.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(names.has(def.name)).toBe(false);
      names.add(def.name);
      expect(def.emits).toBe(0);
    }
  });

  it('set solid and opaque correctly: plants are walk-through, only whole cubes hide faces', () => {
    const registry = createDefaultRegistry();
    const plants = [
      NatureBlock.BAMBOO, NatureBlock.BAMBOO_LEAVES, NatureBlock.FERN, NatureBlock.REEDS,
      NatureBlock.WILDFLOWER_BLUE, NatureBlock.WILDFLOWER_WHITE, NatureBlock.WILDFLOWER_PINK,
      NatureBlock.WILDFLOWER_PURPLE, NatureBlock.MUSHROOM_RED, NatureBlock.MUSHROOM_BROWN,
      NatureBlock.FALLEN_LEAVES, NatureBlock.SAKURA_PETALS,
    ];
    for (const id of plants) {
      expect(registry.isSolid(id), NatureBlock[id]).toBe(false);
      expect(registry.isOpaque(id), NatureBlock[id]).toBe(false);
    }
    const leaves = [NatureBlock.CEDAR_LEAVES, NatureBlock.SAKURA_LEAVES, NatureBlock.SNOWY_PINE_LEAVES];
    for (const id of leaves) {
      expect(registry.isSolid(id), NatureBlock[id]).toBe(true);
      expect(registry.isOpaque(id), NatureBlock[id]).toBe(false);
    }
    const cubes = [
      NatureBlock.CEDAR_LOG, NatureBlock.SAKURA_LOG, NatureBlock.PINE_LOG, NatureBlock.GRAVEL,
      NatureBlock.MOSS, NatureBlock.GRANITE, NatureBlock.MUD, NatureBlock.PODZOL,
    ];
    for (const id of cubes) {
      expect(registry.isSolid(id), NatureBlock[id]).toBe(true);
      expect(registry.isOpaque(id), NatureBlock[id]).toBe(true);
    }
    for (const id of natureBlockIds()) if (registry.isOpaque(id)) expect(registry.isSolid(id)).toBe(true);
  });
});
