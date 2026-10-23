import { describe, expect, it } from 'vitest';
import { voxelWorld, worldGenerator } from '../../gameWorld';
import { Cell } from '../../engine/cell';
import { CollisionWorld, moveAABB, playerBox } from '../../engine/collision';
import { standingEyeY } from '../../engine/spawn';
import { newRoadHit } from '../../worldgen/roads/RoadField';
import { RoadEdge } from '../../worldgen/roads/RoadNetwork';
import { GRAVITY, JUMP_FORCE, MOVE_SPEED, PLAYER_HEIGHT } from '../../worldConstants';

// A player walking each road from gate to gate with the game's own physics (components/Player.tsx: gravity, one
// moveAABB per frame against voxelWorld, a jump when blocked), steering for the next vertex of the road's centreline.
// It proves the new roads, their approaches, bridges, rails and the lanterns' posts can be walked end to end.
const DT = 1 / 60;
const SPRINT = MOVE_SPEED * 2;
const REACHED = 2.5;

const cells = new Map<number, Cell>();
const world: CollisionWorld = {
  registry: voxelWorld.registry,
  getCell(x, y, z) {
    const key = ((x + 1048576) * 2097152 + (z + 1048576)) * 512 + (y + 256);
    let cell = cells.get(key);
    if (cell === undefined) {
      cell = voxelWorld.getCell(x, y, z);
      cells.set(key, cell);
    }
    return cell;
  },
};

interface Walk {
  seconds: number;
  jumps: number;
  lowestEye: number;
  // Worst gap, on the vertices of a bridge, between the player's feet and the top of the deck.
  bridgeOff: number;
  bridgeVertices: number;
  stuckAt: number | null;
}

const hit = newRoadHit();

const walk = (edge: RoadEdge): Walk => {
  const out: Walk = { seconds: 0, jumps: 0, lowestEye: Infinity, bridgeOff: 0, bridgeVertices: 0, stuckAt: null };
  const last = edge.x.length - 1;
  let x = edge.x[0];
  let z = edge.z[0];
  let eye = standingEyeY(voxelWorld, Math.round(x), Math.round(z));
  let vy = 0;
  let grounded = true;
  let blocked = false;
  let next = 1;
  let sinceProgress = 0;
  let bestDist = Infinity;

  for (let frame = 0; frame < 60 * 600; frame++) {
    while (next < last && Math.hypot(edge.x[next] - x, edge.z[next] - z) < REACHED) next++;
    if (next === last && Math.hypot(edge.x[last] - x, edge.z[last] - z) < REACHED) break;

    const dx = edge.x[next] - x;
    const dz = edge.z[next] - z;
    const len = Math.hypot(dx, dz) || 1;
    vy = Math.max(vy - GRAVITY * DT, -50);
    if (grounded && blocked) {
      vy = JUMP_FORCE;
      out.jumps++;
    }
    const move = moveAABB(world, playerBox(x, eye, z), { x: (dx / len) * SPRINT * DT, y: vy * DT, z: (dz / len) * SPRINT * DT });
    x += move.dx;
    eye += move.dy;
    z += move.dz;
    if (move.hitY) vy = 0;
    grounded = move.onGround;
    blocked = move.hitX || move.hitZ;
    out.seconds += DT;
    out.lowestEye = Math.min(out.lowestEye, eye);

    // Progress is the distance still to go to the end of the road; if it has not shrunk for 5 seconds the walker is stuck.
    const dist = Math.hypot(edge.x[last] - x, edge.z[last] - z);
    if (dist < bestDist - 0.5) {
      bestDist = dist;
      sinceProgress = 0;
    } else if ((sinceProgress += DT) > 5) {
      out.stuckAt = next;
      break;
    }
    if (eye < -20) {
      out.stuckAt = next;
      break;
    }

    // Where the player really is: on a bridge when the road query says so.
    worldGenerator.roads.query(Math.round(x), Math.round(z), hit);
    if (hit.onRoad && hit.bridge && grounded) {
      out.bridgeVertices++;
      out.bridgeOff = Math.max(out.bridgeOff, Math.abs(eye - PLAYER_HEIGHT - (Math.floor(hit.level) + 0.5)));
    }
  }
  return out;
};

describe('walking the roads with the game\'s physics', () => {
  for (const edge of worldGenerator.roads.edges) {
    it(`gets from one gate of "${edge.name}" to the other without sticking or falling`, () => {
      const result = walk(edge);
      const length = edge.arc[edge.arc.length - 1];
      expect(result.stuckAt, `stuck at vertex ${result.stuckAt} of ${edge.x.length}`).toBeNull();
      // Sprinting along the centreline: no more than 30 percent slower than a straight run, however many jumps it took.
      expect(result.seconds).toBeLessThan((length / SPRINT) * 1.3 + 5);
      expect(result.lowestEye).toBeGreaterThan(-20);
      console.log(`[walk] ${edge.name}: ${length.toFixed(0)} blocks in ${result.seconds.toFixed(1)} s, ${result.jumps} jumps, ${result.bridgeVertices} frames on a bridge, off the deck by at most ${result.bridgeOff.toFixed(2)}`);
      // On a bridge the player walks on the planks or, at the first blocks of the approach, on the bank beside them, so
      // always within a block of the deck's top: never down in the river and never up on a rail.
      if (result.bridgeVertices > 0) expect(result.bridgeOff).toBeLessThanOrEqual(1);
    });
  }
});
