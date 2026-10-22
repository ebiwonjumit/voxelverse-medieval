import { describe, expect, it } from 'vitest';
import { AIR_CELL, MAX_BLOCK_ID, MAX_BLOCK_STATE, cellId, cellState, packCell } from '../../engine/cell';

describe('cell packing', () => {
  it('uses 12 bits for the id and 4 bits for the state', () => {
    expect(MAX_BLOCK_ID).toBe(4095);
    expect(MAX_BLOCK_STATE).toBe(15);
    expect(packCell(MAX_BLOCK_ID, MAX_BLOCK_STATE)).toBe(0xffff);
  });

  it('treats zero as air', () => {
    expect(AIR_CELL).toBe(0);
    expect(packCell(0, 0)).toBe(0);
  });

  it('round-trips every id with every state', () => {
    for (let id = 0; id <= MAX_BLOCK_ID; id++) {
      for (let state = 0; state <= MAX_BLOCK_STATE; state++) {
        const cell = packCell(id, state);
        expect(cellId(cell)).toBe(id);
        expect(cellState(cell)).toBe(state);
      }
    }
  });

  it('defaults the state to zero', () => {
    expect(packCell(7)).toBe(7);
  });

  it('rejects out-of-range or fractional values', () => {
    expect(() => packCell(-1)).toThrow(RangeError);
    expect(() => packCell(MAX_BLOCK_ID + 1)).toThrow(RangeError);
    expect(() => packCell(1, -1)).toThrow(RangeError);
    expect(() => packCell(1, MAX_BLOCK_STATE + 1)).toThrow(RangeError);
    expect(() => packCell(1.5)).toThrow(RangeError);
  });
});
