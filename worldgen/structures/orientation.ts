import { ShapedBlock } from '../../content/blocksShaped';
import { TempestBlock } from '../../content/blocksTempest';
import { Cell, cellId, cellState, packCell } from '../../engine/cell';

// How a cell's state turns when a blueprint is turned or mirrored. Most blocks have no direction (their state is zero,
// or a half bit that is the same whichever way the building faces), so only the blocks that stand a way need telling.
// The kinds follow the models' own state layouts (docs/models.md):
//   stair   bits 0-1 the facing (north, east, south, west), bit 2 upside down
//   ridge   an OrientedBoxModel written with its horn at the east end; the plain cap is the same at both ends
//   awning  an OrientedBoxModel written with its high edge against the north wall
//   plane   an OrientedBoxModel that is the same at both ends (a curtain, a sign, washing): only the axis matters
// A test checks this table against the registry, so a new stair or oriented block cannot be forgotten.
export type OrientKind = 'stair' | 'ridge' | 'ridgeHorn' | 'awning' | 'plane';

const ORIENTED: ReadonlyMap<number, OrientKind> = new Map<number, OrientKind>([
  [ShapedBlock.STONE_BRICK_STAIRS, 'stair'],
  [ShapedBlock.COBBLESTONE_STAIRS, 'stair'],
  [ShapedBlock.WOOD_PLANK_STAIRS, 'stair'],
  [ShapedBlock.DARK_PLANK_STAIRS, 'stair'],
  [ShapedBlock.RED_ROOF_STAIRS, 'stair'],
  [ShapedBlock.BLUE_ROOF_STAIRS, 'stair'],
  [TempestBlock.PLASTER_STAIRS, 'stair'],
  [TempestBlock.TERRACOTTA_ROOF_STAIRS, 'stair'],
  [TempestBlock.DARK_TILE_ROOF_STAIRS, 'stair'],
  [TempestBlock.GREEN_TILE_ROOF_STAIRS, 'stair'],
  [TempestBlock.TEAL_ROOF_STAIRS, 'stair'],
  [TempestBlock.THATCH_ROOF_STAIRS, 'stair'],
  [TempestBlock.MOSSY_STONE_STAIRS, 'stair'],
  [TempestBlock.TERRACOTTA_RIDGE, 'ridge'],
  [TempestBlock.DARK_RIDGE, 'ridge'],
  [TempestBlock.TERRACOTTA_RIDGE_HORN, 'ridgeHorn'],
  [TempestBlock.DARK_RIDGE_HORN, 'ridgeHorn'],
  [TempestBlock.AWNING_RED, 'awning'],
  [TempestBlock.AWNING_INDIGO, 'awning'],
  [TempestBlock.SIGNBOARD, 'plane'],
  [TempestBlock.NOREN_INDIGO, 'plane'],
  [TempestBlock.NOREN_RED, 'plane'],
  [TempestBlock.NOREN_WHITE, 'plane'],
  [TempestBlock.LAUNDRY_POLE, 'plane'],
]);

export const orientKind = (id: number): OrientKind | undefined => ORIENTED.get(id);

/** Every block id whose state turns with the building. */
export const orientedBlockIds = (): number[] => [...ORIENTED.keys()].sort((a, b) => a - b);

export type MirrorAxis = 'x' | 'z';

const swap = (turn: number, a: number, b: number): number => (turn === a ? b : turn === b ? a : turn);

/** The cell turned `turns` quarter turns clockwise seen from above (east becomes south). */
export const turnCell = (cell: Cell, turns: number): Cell => {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return cell;
  const id = cellId(cell);
  const kind = ORIENTED.get(id);
  if (!kind) return cell;
  const state = cellState(cell);
  // Stairs keep their half bit; the others only use bits 0 and 1.
  return packCell(id, (state & ~3) | (((state & 3) + t) & 3));
};

/**
 * The cell mirrored across the plane x = 0 (axis 'x': east and west swap) or z = 0 (axis 'z': north and south swap).
 * Where the model is the same at both ends a mirror changes nothing.
 */
export const mirrorCell = (cell: Cell, axis: MirrorAxis): Cell => {
  const id = cellId(cell);
  const kind = ORIENTED.get(id);
  if (!kind) return cell;
  const state = cellState(cell);
  const turn = state & 3;
  let next = turn;
  switch (kind) {
    case 'stair':
      // Facing 0 north, 1 east, 2 south, 3 west.
      next = axis === 'x' ? swap(turn, 1, 3) : swap(turn, 0, 2);
      break;
    case 'ridgeHorn':
      // Written with the horn east; turn 1 puts it south, 2 west, 3 north.
      next = axis === 'x' ? swap(turn, 0, 2) : swap(turn, 1, 3);
      break;
    case 'awning':
      // Written with the wall north; turn 1 puts it east, 2 south, 3 west.
      next = axis === 'x' ? swap(turn, 1, 3) : swap(turn, 0, 2);
      break;
    default:
      break;
  }
  return packCell(id, (state & ~3) | next);
};
