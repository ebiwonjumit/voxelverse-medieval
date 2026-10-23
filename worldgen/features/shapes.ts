import { Rng } from '../noise';
import { BlockList, Place } from './BlockList';

// A flat disc of radius r at height dy. `ragged` is the chance a block on the rim is left out.
export const disc = (out: BlockList, dy: number, r: number, id: number, rng: Rng, ragged = 0.2): void => {
  const lim = r * r + 0.5;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > lim) continue;
      if (d2 > (r - 1) * (r - 1) + 0.5 && rng.chance(ragged)) continue;
      out.add(dx, dy, dz, id);
    }
  }
};

// An ellipsoid of leaves centred at (cx, cy, cz), rx wide and ry tall, with a ragged skin.
export const blob = (out: BlockList, cx: number, cy: number, cz: number, rx: number, ry: number, id: number, rng: Rng): void => {
  const ex = Math.ceil(rx), ey = Math.ceil(ry);
  for (let dz = -ex; dz <= ex; dz++) {
    for (let dy = -ey; dy <= ey; dy++) {
      for (let dx = -ex; dx <= ex; dx++) {
        const d = (dx * dx + dz * dz) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d > 1 + 0.25 * rng.next() - 0.1) continue;
        out.add(cx + dx, cy + dy, cz + dz, id);
      }
    }
  }
};

export const trunk = (out: BlockList, from: number, to: number, id: number, dx = 0, dz = 0): void => {
  for (let dy = from; dy <= to; dy++) out.add(dx, dy, dz, id);
};

// Scatters `id` over the ground around the origin, a bit denser in the middle. Only on soil.
export const scatter = (out: BlockList, r: number, chance: number, id: number, rng: Rng, place: Place = Place.SOIL): void => {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > r) continue;
      if (rng.chance(chance * (1 - 0.6 * (d / r)))) out.add(dx, 1, dz, id, place);
    }
  }
};
