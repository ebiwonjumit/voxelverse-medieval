import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { Chunk } from '../../engine/Chunk';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { LegacyZoneAdapter } from '../../worldgen/LegacyZoneAdapter';
import { BlockType, LodLevel } from '../../worldConstants';

const adapter = new LegacyZoneAdapter(createDefaultRegistry());

const cellsOf = (chunk: Chunk): number[] => {
  const out: number[] = [];
  for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) out.push(chunk.getCell(x, y, z));
  }
  return out;
};

const generate = (cx: number, cz: number, lod?: LodLevel): Chunk => {
  const chunk = new Chunk(cx, cz);
  adapter.generateChunk(chunk, lod === undefined ? undefined : { lod });
  return chunk;
};

// Greensom, where the zone adds crops, fences and lanterns only at high detail.
const [CX, CZ] = [0, 9];

describe('generateChunk detail level', () => {
  it('defaults to HIGH, so existing callers and the parity tests are unchanged', () => {
    const none = cellsOf(generate(CX, CZ));
    expect(none).toEqual(cellsOf(generate(CX, CZ, LodLevel.HIGH)));
    expect(none).toEqual(cellsOf(generate(CX, CZ, undefined)));
  });

  it('passes LOW through to the zones', () => {
    const high = cellsOf(generate(CX, CZ, LodLevel.HIGH));
    const low = cellsOf(generate(CX, CZ, LodLevel.LOW));
    expect(low).not.toEqual(high);
    const filled = (cells: number[]) => cells.reduce((n, c) => n + (c !== 0 ? 1 : 0), 0);
    expect(filled(low)).toBeLessThan(filled(high));
  });

  it('leaves the ground alone: the stone under the village is the same at both levels', () => {
    const count = (cells: number[], id: number) => cells.reduce((n, c) => n + (c === id ? 1 : 0), 0);
    const high = cellsOf(generate(CX, CZ, LodLevel.HIGH));
    const low = cellsOf(generate(CX, CZ, LodLevel.LOW));
    expect(count(low, BlockType.STONE)).toBe(count(high, BlockType.STONE));
    expect(count(low, BlockType.STONE)).toBeGreaterThan(10000);
  });
});
