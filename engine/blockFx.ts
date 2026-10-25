// What a block does for the living-world effects (docs/effects.md). Purely visual and purely data: the mesher reads these
// flags to note where in a chunk the effects can start from (sakura leaves that petals fall from, plants fireflies hide in,
// chimney pots, lamps, hearths), and the renderer's emitters pick their spawn points from those notes. Nothing here changes
// what is meshed, lit, culled or collided with. Flags are bits so one block can carry several.
export const BlockFx = {
  /** Petals fall from the underside of this block (sakura leaves). */
  PETALS: 1,
  /** Fireflies drift around it at dusk and night (grass, flowers, reeds, crops, lily pads). */
  HABITAT: 2,
  /** Smoke rises from it: a chimney pot, a kitchen vent. */
  SMOKE: 4,
  /** A lamp: gets a soft halo at night. */
  LAMP: 8,
  /** Embers rise from it (a hearth, a forge). */
  EMBERS: 16,
} as const;

export type BlockFxFlag = (typeof BlockFx)[keyof typeof BlockFx];

/** The kinds in bit order: the index of a kind is the position of its flag, and indexes every per-kind array of sites. */
export const FX_KINDS = ['petals', 'habitat', 'smoke', 'lamp', 'embers'] as const;
export type FxKind = (typeof FX_KINDS)[number];
export const FX_KIND_COUNT = FX_KINDS.length;
export const FX_ALL = (1 << FX_KIND_COUNT) - 1;
