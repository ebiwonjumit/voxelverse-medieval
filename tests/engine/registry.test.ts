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

  it('carries the light rules: emission and lightDim, defaulting to none', () => {
    const r = new BlockRegistry();
    r.register(def({ id: 1, name: 'test:lamp', emits: 12 }));
    r.register(def({ id: 2, name: 'test:leaf', opaque: false, lightDim: 1 }));
    r.register(def({ id: 3, name: 'test:plain' }));
    expect(r.emission(1)).toBe(12);
    expect(r.emission(3)).toBe(0);
    expect(r.lightDim(2)).toBe(1);
    expect(r.lightDim(3)).toBe(0);
    expect(r.emission(999)).toBe(0); // unknown ids emit nothing and dim nothing
    expect(r.lightDim(999)).toBe(0);
    expect(() => r.register(def({ id: 4, name: 'test:bad', lightDim: 16 }))).toThrow(RangeError);
    expect(() => r.register(def({ id: 5, name: 'test:bad2', lightDim: 0.5 }))).toThrow(RangeError);
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

  it('keeps texture faces and tint with the block, frozen', () => {
    const r = new BlockRegistry();
    const faces = { top: 'grass_top', bottom: 'dirt', side: 'grass_side' };
    r.register(def({ faces, tint: 'grass' }));
    expect(r.get(1).faces).toEqual(faces);
    expect(r.get(1).tint).toBe('grass');
    expect(Object.isFrozen(r.get(1).faces)).toBe(true);
    faces.top = 'changed';
    expect(r.get(1).faces!.top).toBe('grass_top'); // a copy, not the caller's object
  });

  it('leaves faces and tint empty for a block that has none', () => {
    const r = new BlockRegistry();
    r.register(def());
    expect(r.get(1).faces).toBeUndefined();
    expect(r.get(1).tint).toBeUndefined();
  });

  it('rejects faces with a missing name and unknown tints', () => {
    const r = new BlockRegistry();
    expect(() => r.register(def({ faces: { top: 'a', bottom: '', side: 'c' } }))).toThrow(/bottom/);
    expect(() => r.register(def({ faces: { top: 'a', bottom: 'b' } as never }))).toThrow(/side/);
    expect(() => r.register(def({ tint: 'water' as never }))).toThrow(/tint/);
  });
});
