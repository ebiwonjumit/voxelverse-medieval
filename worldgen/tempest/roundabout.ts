// The Central Square as a roundabout: the rings it is made of, from the fountain out. One table, used twice: by the landmark that draws
// the square with its fountain, lamps and bollards, and by the zone, which paves the same rings where the landmark is not built (and
// under it, so the corners the landmark does not draw are paved alike).
//
//   d <= 2.4        the basin: water round a pillar of ore
//   <= 3.2          its rim, a wall of stone with a slab on it
//   <= 4.2          the island: fan cobbles in wedges, a ring of bollards
//   <= 4.9          the inner kerb, raised half a block
//   <= 6.3          the ring road: dark cobbles, flush with the avenues
//   <= 7.0          the outer kerb, raised, bollards beside each entry, open where an avenue enters (five wide, the avenue's fan strip)
//   <= 8.4          the splitters: the kerb carries on across the avenue's edge lanes, three to five cells off its middle, so the ring is
//                   closed in a circle of kerb with four mouths, whatever the width of the avenues (11) round it
//
// `d` is the distance in cells from the middle of the middle cell. Beyond that the avenues' own paving begins, so it stops at the ring.

export const RING_RADIUS = 7;
/** The splitters' reach: where the kerb's last cells are. */
export const SPLITTER_RADIUS = 8.4;

export type RingZone = 'water' | 'rim' | 'island' | 'kerbIn' | 'road' | 'kerbOut' | 'entry' | 'splitter' | 'outside';

export const RADII = { water: 2.4, rim: 3.2, island: 4.2, kerbIn: 4.9, road: 6.3, kerbOut: RING_RADIUS } as const;

/** Half the width of an avenue's entry through the outer kerb, in cells: the fan strip of an avenue is five wide. */
export const ENTRY_HALF = 2;

export const ringZone = (dx: number, dz: number): RingZone => {
  const d = Math.hypot(dx, dz);
  if (d <= RADII.water) return 'water';
  if (d <= RADII.rim) return 'rim';
  if (d <= RADII.island) return 'island';
  if (d <= RADII.kerbIn) return 'kerbIn';
  if (d <= RADII.road) return 'road';
  const side = Math.min(Math.abs(dx), Math.abs(dz));
  if (d <= RADII.kerbOut) return side <= ENTRY_HALF ? 'entry' : 'kerbOut';
  // Across the avenue's edge lanes: not in an entry (the five middle cells) and not in the corner apron (6 or more off both axes).
  if (d <= SPLITTER_RADIUS && side > ENTRY_HALF && side <= 5) return 'splitter';
  return 'outside';
};

/** Which sixteenth of a turn the cell is in, for the wedges of fan cobbles (0 at east, towards south). */
export const wedgeOf = (dx: number, dz: number): number => {
  const a = Math.atan2(dz, dx) / (2 * Math.PI);
  return Math.floor((a < 0 ? a + 1 : a) * 16);
};

/** True where a bollard stands on the island: twelve of them on a ring of 3.7, none in an avenue's way. */
export const islandBollard = (dx: number, dz: number): boolean => {
  const d = Math.hypot(dx, dz);
  if (d < 3.45 || d > 4.0) return false;
  // Twelve spokes, thirty degrees apart, each marked by the one cell of the ring nearest to it.
  const a = Math.atan2(dz, dx);
  const spoke = Math.round(a / (Math.PI / 6));
  const sx = Math.cos(spoke * (Math.PI / 6)) * 3.7;
  const sz = Math.sin(spoke * (Math.PI / 6)) * 3.7;
  return Math.round(sx) === dx && Math.round(sz) === dz;
};

/** True where a bollard stands on the outer kerb: the cells beside each entry, so a post marks both sides of every avenue's mouth. */
export const kerbBollard = (dx: number, dz: number): boolean => ringZone(dx, dz) === 'kerbOut' && Math.min(Math.abs(dx), Math.abs(dz)) === 3;

/**
 * The apron: the four clipped corners of the blocks round the square (nine cells off each, so they stand 15 away along the avenues) are
 * paved as part of it, in fan wedges that carry on from the island, with a line of bollards along the diagonal edge where the houses'
 * verges begin. True for the cells of the corner notch (the caller knows that no block, road or compound is there).
 */
export const apronCell = (dx: number, dz: number): boolean => Math.abs(dx) >= 6 && Math.abs(dz) >= 6 && Math.abs(dx) + Math.abs(dz) <= 20;

/** A bollard on the apron's edge: every second cell of its outermost diagonal. */
export const apronBollard = (dx: number, dz: number): boolean => apronCell(dx, dz) && Math.abs(dx) + Math.abs(dz) === 20 && (Math.abs(dx) & 1) === 0;
