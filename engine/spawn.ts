import { PLAYER_HEIGHT } from '../worldConstants';
import { VoxelWorld } from './VoxelWorld';
import { WORLD_MAX_Y, WORLD_MIN_Y } from './coords';

// Eyes this far above the ground: enough that the box starts clear of it, so the first frame does not push it out.
const SPAWN_CLEARANCE = 0.02;
// Blocks of free air a standing player needs above the floor (the box is 1.82 tall plus head room).
const HEAD_CELLS = 3;

// The eye height of a player standing on the ground at (x, z): the first height from the surface up with room for a
// body, so a spawn on a road, a roof or beside a wall is never inside blocks and never a long drop either. Block
// (x, y, z) fills y - 0.5 to y + 0.5, so the floor's top is half a block above its cell.
export const standingEyeY = (world: Pick<VoxelWorld, 'isSolid' | 'terrainHeight'>, x: number, z: number): number => {
  let y = Math.max(world.terrainHeight(x, z), WORLD_MIN_Y);
  // Start from the ground and walk up until a solid floor has HEAD_CELLS of air above it.
  for (; y < WORLD_MAX_Y - HEAD_CELLS; y++) {
    if (!world.isSolid(x, y, z)) continue;
    let clear = true;
    for (let h = 1; h <= HEAD_CELLS; h++) if (world.isSolid(x, y + h, z)) { clear = false; break; }
    if (clear) break;
  }
  return y + 0.5 + PLAYER_HEIGHT + SPAWN_CLEARANCE;
};
