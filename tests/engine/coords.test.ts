import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, SECTION_VOLUME, WORLD_MAX_Y, WORLD_MIN_Y,
  cellIndex, chunkCoord, inWorldY, localCoord, localY, sectionIndex,
} from '../../engine/coords';

describe('world dimensions', () => {
  it('spans y -64 to 191 in 16 sections of 16', () => {
    expect(WORLD_MIN_Y).toBe(-64);
    expect(WORLD_MAX_Y).toBe(191);
    expect(SECTION_HEIGHT).toBe(16);
    expect(SECTION_COUNT).toBe(16);
    expect(SECTION_VOLUME).toBe(CHUNK_SIZE * SECTION_HEIGHT * CHUNK_SIZE);
  });
});

describe('chunk coordinates', () => {
  it.each([
    [0, 0], [31, 0], [32, 1], [63, 1], [64, 2], [-1, -1], [-32, -1], [-33, -2], [-64, -2], [-65, -3],
  ])('block %i is in chunk %i', (x, c) => {
    expect(chunkCoord(x)).toBe(c);
  });

  it.each([
    [0, 0], [31, 31], [32, 0], [33, 1], [-1, 31], [-32, 0], [-33, 31],
  ])('block %i is at local %i', (x, l) => {
    expect(localCoord(x)).toBe(l);
  });

  it('round-trips chunk and local back to the block coordinate', () => {
    for (const x of [-1000, -65, -33, -32, -1, 0, 1, 31, 32, 33, 1500, 100000]) {
      expect(chunkCoord(x) * CHUNK_SIZE + localCoord(x)).toBe(x);
    }
  });
});

describe('vertical coordinates', () => {
  it('maps y to a section and a local height', () => {
    expect(sectionIndex(WORLD_MIN_Y)).toBe(0);
    expect(localY(WORLD_MIN_Y)).toBe(0);
    expect(sectionIndex(WORLD_MIN_Y + 15)).toBe(0);
    expect(localY(WORLD_MIN_Y + 15)).toBe(15);
    expect(sectionIndex(WORLD_MIN_Y + 16)).toBe(1);
    expect(localY(WORLD_MIN_Y + 16)).toBe(0);
    expect(sectionIndex(0)).toBe(4);
    expect(localY(0)).toBe(0);
    expect(sectionIndex(WORLD_MAX_Y)).toBe(SECTION_COUNT - 1);
    expect(localY(WORLD_MAX_Y)).toBe(15);
  });

  it('knows the world bounds', () => {
    expect(inWorldY(WORLD_MIN_Y)).toBe(true);
    expect(inWorldY(WORLD_MAX_Y)).toBe(true);
    expect(inWorldY(WORLD_MIN_Y - 1)).toBe(false);
    expect(inWorldY(WORLD_MAX_Y + 1)).toBe(false);
  });
});

describe('cellIndex', () => {
  it('is dense and unique within a section', () => {
    expect(cellIndex(0, 0, 0)).toBe(0);
    expect(cellIndex(CHUNK_SIZE - 1, SECTION_HEIGHT - 1, CHUNK_SIZE - 1)).toBe(SECTION_VOLUME - 1);
    const seen = new Set<number>();
    for (let y = 0; y < SECTION_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) seen.add(cellIndex(x, y, z));
      }
    }
    expect(seen.size).toBe(SECTION_VOLUME);
  });
});
