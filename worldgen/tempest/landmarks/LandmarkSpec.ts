import { Rng } from '../../noise';
import { Blueprint, Placement } from '../../structures/Blueprint';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { Facing, Rect, TEMPEST_GROUND, landmarkById } from '../layout';
import { TEMPEST_STYLE } from '../style';

// A landmark is one hand-authored building or set piece the layout (worldgen/tempest/layout.ts) names: the compound, the
// arena, a gate. Unlike a kit it builds for exactly one place, so it knows its footprint, and the tests check that it stays
// inside it. A spec says where, which way it looks and how to draw it; `buildLandmark` and `placeLandmark` do the rest.
//
// Two frames are in use. Most landmarks are written in the **kit frame** (front towards south, the footprint's north west
// corner at 0, 0, y = 0 the ground row) and turned to their facing by the same `Lot` the kits use, so a gate is written once
// whichever way its road runs. A few that are long or have no front (the aqueduct, the bridge, a clearing) are written in
// the **world frame**: x east, z south, the corner of the footprint at 0, 0, never turned.

export type LandmarkFrame = 'front-south' | 'world';

export interface LandmarkSpec {
  /** Stable id. Equals the layout landmark's id where there is one; the pieces the layout has no entry for have their own. */
  id: string;
  name: string;
  /** The layout landmarks this blueprint builds (the compound builds the Town Hall, the forecourt and the lodge as well). */
  covers: readonly string[];
  /** The side the front looks, as the layout says. */
  facing: Facing;
  /** The world rectangle the blueprint must stay inside: the layout shape's bounds. */
  footprint: Rect;
  frame: LandmarkFrame;
  /** A set piece the plan lists as optional. */
  optional?: boolean;
  /**
   * A set piece with no place of its own in the layout (the bell tower, the market hall, the bath house): the footprint is its
   * size at the origin and a district planner stands it on a lot of its own, with `placeOnLot`. A zone skips these.
   */
  free?: boolean;
  /** The id of the landmark that already contains this one (the Town Hall is drawn inside the compound): a zone places only the container. */
  partOf?: string;
  /** Draws the landmark in its frame. Must be deterministic: everything that varies comes from `rng`. */
  build(style: StylePack, rng: Rng): Blueprint;
}

/** The seed every landmark is drawn with unless the caller names one: the town is the same everywhere. */
export const LANDMARK_SEED = 0x7e3957;

const sizeOf = (r: Rect): { w: number; d: number } => ({ w: r.x1 - r.x0 + 1, d: r.z1 - r.z0 + 1 });

/** The footprint's size in the blueprint's own frame: along the front and in depth (a world frame landmark: along x and z). */
export const frameSize = (spec: LandmarkSpec): { frontage: number; depth: number } => {
  const { w, d } = sizeOf(spec.footprint);
  if (spec.frame === 'world') return { frontage: w, depth: d };
  return spec.facing === 0 || spec.facing === 2 ? { frontage: w, depth: d } : { frontage: d, depth: w };
};

/** A fork of the generator for one landmark, so changing one never shifts the details of another. */
export const landmarkRng = (spec: LandmarkSpec, seed = LANDMARK_SEED): Rng => {
  let h = 0x811c9dc5;
  for (let i = 0; i < spec.id.length; i++) h = Math.imul(h ^ spec.id.charCodeAt(i), 0x01000193);
  return new Rng(seed).fork(h | 0);
};

/** Draws a landmark in its own frame. */
export const buildLandmark = (spec: LandmarkSpec, style: StylePack = TEMPEST_STYLE, seed = LANDMARK_SEED): Blueprint =>
  spec.build(style, landmarkRng(spec, seed));

/** The `Lot` a landmark stands on: its footprint, turned to its facing. */
export const landmarkLot = (spec: LandmarkSpec, groundY = TEMPEST_GROUND): Lot => {
  const { w, d } = sizeOf(spec.footprint);
  return new Lot({
    id: spec.id, x: spec.footprint.x0, z: spec.footprint.z0, w, d, facing: spec.frame === 'world' ? 2 : spec.facing,
    district: 'civic', seed: LANDMARK_SEED, groundY,
  });
};

/** Stands a finished blueprint in the world: turned to the facing, the footprint on the layout's rectangle. */
export const placeBlueprint = (spec: LandmarkSpec, blueprint: Blueprint, groundY = TEMPEST_GROUND): Placement => {
  if (spec.frame === 'world') return new Placement(blueprint, { x: spec.footprint.x0, y: groundY, z: spec.footprint.z0, turns: 0 });
  return landmarkLot(spec, groundY).place(blueprint);
};

/** The footprint of a free set piece: its size at the origin. */
export const freeFootprint = (w: number, d: number): Rect => ({ x0: 0, z0: 0, x1: w - 1, z1: d - 1 });

/** Stands a free set piece on a lot (the lot's rectangle must be at least the piece's size in its own frame). */
export const placeOnLot = (spec: LandmarkSpec, lot: Lot, style: StylePack = TEMPEST_STYLE, seed = LANDMARK_SEED): Placement => {
  const { frontage, depth } = frameSize(spec);
  if (lot.frontage < frontage || lot.depth < depth) {
    throw new RangeError(`${spec.id} needs a lot of ${frontage} by ${depth}, this one is ${lot.frontage} by ${lot.depth}`);
  }
  return lot.place(buildLandmark(spec, style, seed));
};

/** Builds and places a landmark: what a zone does for each one. */
export const placeLandmark = (spec: LandmarkSpec, groundY = TEMPEST_GROUND, style: StylePack = TEMPEST_STYLE, seed = LANDMARK_SEED): Placement =>
  placeBlueprint(spec, buildLandmark(spec, style, seed), groundY);

/** The layout landmark of an id, for specs that cover it. */
export const layoutLandmark = (id: string): NonNullable<ReturnType<typeof landmarkById>> => {
  const l = landmarkById(id);
  if (!l) throw new Error(`The layout has no landmark ${id}`);
  return l;
};
