import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { VoxelWorld } from '../../engine/VoxelWorld';
import { WorldGenerator } from '../../engine/WorldGenerator';
import { Chunk } from '../../engine/Chunk';
import { packCell } from '../../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { BlockType } from '../../worldConstants';

// A flat world: stone up to y 10, grass at 10, with a recognisable block at one spot.
class FlatGenerator implements WorldGenerator {
  generated: Array<[number, number]> = [];

  generateChunk(chunk: Chunk): void {
    this.generated.push([chunk.cx, chunk.cz]);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let y = WORLD_MIN_Y; y < 10; y++) chunk.setCell(lx, y, lz, packCell(BlockType.STONE));
        chunk.setCell(lx, 10, lz, packCell(BlockType.GRASS));
      }
    }
    if (chunk.cx === -1 && chunk.cz === 0) chunk.setCell(31, 11, 0, packCell(BlockType.GOLD_BLOCK, 5));
  }

  sampleBlock(_x: number, y: number): number {
    // Deliberately different from generateChunk at one point so tests can tell which path was used.
    if (y < 10) return BlockType.STONE;
    if (y === 10) return BlockType.GRASS;
    return BlockType.AIR;
  }

  terrainHeight(): number { return 10; }
  zoneNameAt(x: number): string { return x < 0 ? 'West' : 'East'; }
}

const makeWorld = () => {
  const generator = new FlatGenerator();
  return { generator, world: new VoxelWorld(createDefaultRegistry(), generator) };
};

describe('VoxelWorld', () => {
  it('generates a chunk once and reuses it', () => {
    const { world, generator } = makeWorld();
    const a = world.loadChunk(2, 3);
    expect(world.loadChunk(2, 3)).toBe(a);
    expect(generator.generated).toEqual([[2, 3]]);
    expect(world.hasChunk(2, 3)).toBe(true);
    expect(world.loadedChunks).toBe(1);
  });

  it('reads blocks across chunk borders, including negative coordinates', () => {
    const { world } = makeWorld();
    world.loadChunk(-1, 0);
    world.loadChunk(0, 0);
    expect(world.getBlock(-1, 11, 0)).toBe(BlockType.GOLD_BLOCK);
    expect(world.getState(-1, 11, 0)).toBe(5);
    expect(world.getBlock(0, 11, 0)).toBe(BlockType.AIR);
    expect(world.getBlock(-32, 10, 5)).toBe(BlockType.GRASS);
    expect(world.getBlock(31, 10, 31)).toBe(BlockType.GRASS);
  });

  it('falls back to the generator for chunks that are not loaded', () => {
    const { world, generator } = makeWorld();
    expect(world.getBlock(-1, 11, 0)).toBe(BlockType.AIR); // sampleBlock, not the chunk data
    expect(world.getBlock(500, 5, 500)).toBe(BlockType.STONE);
    expect(generator.generated).toEqual([]);
    expect(world.hasChunk(-1, 0)).toBe(false);
  });

  it('falls back to the generator outside the world height', () => {
    const { world } = makeWorld();
    world.loadChunk(0, 0);
    expect(world.getBlock(0, WORLD_MIN_Y - 20, 0)).toBe(BlockType.STONE);
    expect(world.getBlock(0, WORLD_MAX_Y + 20, 0)).toBe(BlockType.AIR);
  });

  it('unloads chunks and returns to the fallback', () => {
    const { world } = makeWorld();
    world.loadChunk(-1, 0);
    expect(world.unloadChunk(-1, 0)).toBe(true);
    expect(world.unloadChunk(-1, 0)).toBe(false);
    expect(world.getBlock(-1, 11, 0)).toBe(BlockType.AIR);
  });

  it('answers solidity from the registry', () => {
    const { world } = makeWorld();
    world.loadChunk(0, 0);
    expect(world.isSolid(3, 10, 3)).toBe(true);
    expect(world.isSolid(3, 11, 3)).toBe(false);
    expect(world.isSolid(3, 5, 3)).toBe(true);
  });

  it('passes terrain and zone questions to the generator', () => {
    const { world } = makeWorld();
    expect(world.terrainHeight(4, 4)).toBe(10);
    expect(world.zoneNameAt(-5, 0)).toBe('West');
    expect(world.zoneNameAt(5, 0)).toBe('East');
  });
});
