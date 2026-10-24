import { TempestBlock as T } from '../../content/blocksTempest';
import { NatureBlock } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';
import { hash2 } from '../noise';
import { RoadSegment, localX, localZ } from './layout';

// What the streets are paved with. The plan has fan-pattern cobbles and stone paving in the centre and packed earth in the
// outskirts, so the material depends on the kind of road and on how far from the Central Square the cell is, and the pattern
// on where it lies across the road (a fan strip down the middle of an avenue, a stone edge along each side).

/** Cells from the Central Square (the larger of |x| and |z|) beyond which an ordinary street is packed earth, and a fan strip is plain stone. */
const FAN_RANGE = 100;
const PAVED_RANGE = 150;
/** Beyond this distance the roads out are earth, with no stone at all. */
const OUTER_PAVED = 215;

const FAN = T.FAN_PAVING;
const STONE = T.STONE_PAVING;
// Packed earth is worn: mostly the pale path block, with dark soil and gravel showing through in patches.
const earth = (x: number, z: number): number => {
  const h = hash2(x >> 1, z >> 1, 0xea57) % 100;
  return h < 70 ? BlockType.PATH : h < 86 ? NatureBlock.GRAVEL : BlockType.DIRT;
};

/** Position across a road (0 at its first edge, width - 1 at the other) and along it, in cells. */
export const acrossAlong = (road: RoadSegment, x: number, z: number): { across: number; along: number } => {
  if (road.rect) {
    const r = road.rect;
    const alongX = r.x1 - r.x0 > r.z1 - r.z0;
    return alongX ? { across: z - r.z0, along: x - r.x0 } : { across: x - r.x0, along: z - r.z0 };
  }
  const l = road.line!;
  const dx = l.x1 - l.x0, dz = l.z1 - l.z0;
  const len = Math.hypot(dx, dz);
  const t = ((x - l.x0) * dx + (z - l.z0) * dz) / len;
  const side = ((x - l.x0) * -dz + (z - l.z0) * dx) / len; // signed distance to the centre-line
  return { across: Math.round(side + (road.width - 1) / 2), along: Math.round(t) };
};

/** The block a road cell is paved with. */
export const roadBlock = (road: RoadSegment, x: number, z: number): number => {
  const ring = Math.max(Math.abs(localX(x)), Math.abs(localZ(z)));
  const { across, along } = acrossAlong(road, x, z);
  const w = road.width;
  const edge = across <= 0 || across >= w - 1;
  switch (road.kind) {
    case 'avenue': {
      // Stone pavers with a fan-cobble strip five wide down the middle and a stone band across it every eleven cells.
      if (ring >= PAVED_RANGE + 30) return STONE;
      const mid = across >= 3 && across <= w - 4;
      if (mid && ring < FAN_RANGE + 50 && ((along % 11) + 11) % 11 !== 0) return FAN;
      return STONE;
    }
    case 'street':
      if (ring >= PAVED_RANGE) return edge ? STONE : earth(x, z);
      if (ring < FAN_RANGE && (across === 2 || across === 3)) return FAN;
      return STONE;
    case 'diagonal':
      if (ring >= PAVED_RANGE) return earth(x, z);
      return across === 2 && ring < FAN_RANGE ? FAN : STONE;
    case 'lane':
      return STONE;
    case 'boundary':
      return edge ? STONE : earth(x, z);
    case 'road': {
      if (ring < OUTER_PAVED) return edge ? STONE : across % 2 === 0 ? STONE : BlockType.COBBLESTONE;
      return earth(x, z);
    }
    default:
      return earth(x, z);
  }
};
