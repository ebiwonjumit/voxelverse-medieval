// A cell is one Uint16: the low 12 bits are the block id, the high 4 bits are the block state
// (facing, half and the like). What the state means is defined by the block's model, see engine/models.

export type Cell = number;

export const ID_BITS = 12;
export const MAX_BLOCK_ID = (1 << ID_BITS) - 1;
export const MAX_BLOCK_STATE = 15;
export const AIR_CELL: Cell = 0;

export const packCell = (id: number, state: number = 0): Cell => {
  if (!Number.isInteger(id) || id < 0 || id > MAX_BLOCK_ID) {
    throw new RangeError(`Block id ${id} is outside 0..${MAX_BLOCK_ID}`);
  }
  if (!Number.isInteger(state) || state < 0 || state > MAX_BLOCK_STATE) {
    throw new RangeError(`Block state ${state} is outside 0..${MAX_BLOCK_STATE}`);
  }
  return (state << ID_BITS) | id;
};

export const cellId = (cell: Cell): number => cell & MAX_BLOCK_ID;
export const cellState = (cell: Cell): number => cell >> ID_BITS;
