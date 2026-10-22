import { describe, expect, it } from 'vitest';
import { BlockDef, BlockRegistry } from '../../engine/BlockRegistry';

const def = (over: Partial<BlockDef> = {}): BlockDef => ({
  id: 1, name: 'test:stone', color: '#808080', solid: true, opaque: true, emits: 0, ...over,
});

describe('BlockRegistry', () => {
  it('registers and looks up blocks by id and name', () => {
    const r = new BlockRegistry();
    r.register(def());
    expect(r.get(1).name).toBe('test:stone');
    expect(r.byName('test:stone').id).toBe(1);
    expect(r.has(1)).toBe(true);
    expect(r.has(2)).toBe(false);
    expect(r.size).toBe(1);
  });

  it('rejects duplicate ids and names', () => {
    const r = new BlockRegistry();
    r.register(def());
    expect(() => r.register(def({ name: 'test:other' }))).toThrow(/id 1/);
    expect(() => r.register(def({ id: 2 }))).toThrow(/test:stone/);
  });

  it('rejects invalid definitions', () => {
    const r = new BlockRegistry();
    expect(() => r.register(def({ id: -1 }))).toThrow(RangeError);
    expect(() => r.register(def({ id: 4096 }))).toThrow(RangeError);
    expect(() => r.register(def({ name: '' }))).toThrow();
    expect(() => r.register(def({ emits: 16 }))).toThrow(RangeError);
    expect(() => r.register(def({ emits: -1 }))).toThrow(RangeError);
    expect(() => r.register(def({ color: '#5194ffff' }))).toThrow(/color/);
    expect(() => r.register(def({ color: 'red' }))).toThrow(/color/);
  });

  it('throws for unknown ids and names', () => {
    const r = new BlockRegistry();
    expect(() => r.get(5)).toThrow(/5/);
    expect(() => r.byName('nope')).toThrow(/nope/);
  });

  it('answers solid and opaque questions from fast tables', () => {
    const r = new BlockRegistry();
    r.register(def({ id: 1, name: 'a', solid: true, opaque: true }));
    r.register(def({ id: 2, name: 'b', solid: true, opaque: false }));
    r.register(def({ id: 3, name: 'c', solid: false, opaque: false }));
    expect([r.isSolid(1), r.isSolid(2), r.isSolid(3), r.isSolid(99)]).toEqual([true, true, false, false]);
    expect([r.isOpaque(1), r.isOpaque(2), r.isOpaque(3), r.isOpaque(99)]).toEqual([true, false, false, false]);
  });

  it('lists blocks in id order', () => {
    const r = new BlockRegistry();
    r.register(def({ id: 5, name: 'e' }));
    r.register(def({ id: 2, name: 'b' }));
    expect(r.all().map((d) => d.id)).toEqual([2, 5]);
  });
});
