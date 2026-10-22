import { describe, expect, it } from 'vitest';
import { Chunk } from '../../engine/Chunk';
import { ChunkStore } from '../../engine/ChunkStore';
import { packCell } from '../../engine/cell';
import { CHUNK_SIZE, SECTION_COUNT, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';

describe('Chunk', () => {
  it('starts empty with no allocated sections', () => {
    const c = new Chunk(3, -2);
    expect(c.cx).toBe(3);
    expect(c.cz).toBe(-2);
    expect(c.isEmpty()).toBe(true);
    expect(c.allocatedSections()).toBe(0);
    expect(c.getCell(0, 0, 0)).toBe(0);
  });

  it('stores and returns cells across the whole height, including negative y', () => {
    const c = new Chunk(0, 0);
    const ys = [WORLD_MIN_Y, -17, -1, 0, 15, 16, 100, WORLD_MAX_Y];
    ys.forEach((y, i) => c.setCell(5, y, 7, packCell(i + 1, i % 16)));
    ys.forEach((y, i) => expect(c.getCell(5, y, 7)).toBe(packCell(i + 1, i % 16)));
    expect(c.getCell(6, 0, 7)).toBe(0);
    expect(c.isEmpty()).toBe(false);
  });

  it('allocates a section only when something non-air is written', () => {
    const c = new Chunk(0, 0);
    c.setCell(1, 20, 1, 0);
    expect(c.allocatedSections()).toBe(0);
    c.setCell(1, 20, 1, packCell(4));
    expect(c.allocatedSections()).toBe(1);
    c.setCell(1, 40, 1, packCell(4));
    expect(c.allocatedSections()).toBe(2);
  });

  it('can write air back over a block', () => {
    const c = new Chunk(0, 0);
    c.setCell(2, 2, 2, packCell(9));
    c.setCell(2, 2, 2, 0);
    expect(c.getCell(2, 2, 2)).toBe(0);
  });

  it('reads air outside the world height and refuses to write there', () => {
    const c = new Chunk(0, 0);
    expect(c.getCell(0, WORLD_MIN_Y - 1, 0)).toBe(0);
    expect(c.getCell(0, WORLD_MAX_Y + 1, 0)).toBe(0);
    expect(() => c.setCell(0, WORLD_MIN_Y - 1, 0, 1)).toThrow(RangeError);
    expect(() => c.setCell(0, WORLD_MAX_Y + 1, 0, 1)).toThrow(RangeError);
  });

  it('refuses local x or z outside the chunk', () => {
    const c = new Chunk(0, 0);
    expect(() => c.setCell(CHUNK_SIZE, 0, 0, 1)).toThrow(RangeError);
    expect(() => c.setCell(0, 0, -1, 1)).toThrow(RangeError);
    expect(() => c.getCell(-1, 0, 0)).toThrow(RangeError);
  });

  it('keeps each section independent', () => {
    const c = new Chunk(0, 0);
    c.setCell(0, -64, 0, packCell(1));
    c.setCell(0, -48, 0, packCell(2));
    expect(c.getCell(0, -64, 0)).toBe(packCell(1));
    expect(c.getCell(0, -48, 0)).toBe(packCell(2));
    expect(SECTION_COUNT).toBe(16);
  });
});

describe('ChunkStore', () => {
  it('keys every chunk coordinate uniquely, including negatives', () => {
    const keys = new Set<number>();
    for (let cx = -50; cx <= 50; cx++) for (let cz = -50; cz <= 50; cz++) keys.add(ChunkStore.keyOf(cx, cz));
    expect(keys.size).toBe(101 * 101);
    expect(ChunkStore.keyOf(100000, -100000)).not.toBe(ChunkStore.keyOf(-100000, 100000));
  });

  it('creates, finds and deletes chunks', () => {
    const s = new ChunkStore();
    expect(s.get(1, 1)).toBeUndefined();
    const a = s.getOrCreate(1, 1);
    expect(s.getOrCreate(1, 1)).toBe(a);
    expect(s.get(1, 1)).toBe(a);
    expect(s.has(1, 1)).toBe(true);
    expect(s.size).toBe(1);
    expect(s.delete(1, 1)).toBe(true);
    expect(s.delete(1, 1)).toBe(false);
    expect(s.size).toBe(0);
  });

  it('finds the chunk that holds a block coordinate', () => {
    const s = new ChunkStore();
    const c = s.getOrCreate(-1, 0);
    expect(s.chunkAtBlock(-1, 5)).toBe(c);
    expect(s.chunkAtBlock(-32, 31)).toBe(c);
    expect(s.chunkAtBlock(0, 5)).toBeUndefined();
  });

  it('iterates the loaded chunks', () => {
    const s = new ChunkStore();
    s.getOrCreate(0, 0);
    s.getOrCreate(2, -3);
    expect([...s].map((c) => `${c.cx},${c.cz}`).sort()).toEqual(['0,0', '2,-3']);
  });
});
