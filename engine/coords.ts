import { CHUNK_SIZE } from '../worldConstants';

export { CHUNK_SIZE };

// A chunk is a CHUNK_SIZE x CHUNK_SIZE column split into 16-high sections from WORLD_MIN_Y to WORLD_MAX_Y.
export const SECTION_HEIGHT = 16;
export const WORLD_MIN_Y = -64;
export const WORLD_MAX_Y = 191;
export const SECTION_COUNT = (WORLD_MAX_Y - WORLD_MIN_Y + 1) / SECTION_HEIGHT;
export const SECTION_VOLUME = CHUNK_SIZE * SECTION_HEIGHT * CHUNK_SIZE;

const floorMod = (a: number, n: number): number => ((a % n) + n) % n;

export const chunkCoord = (blockCoord: number): number => Math.floor(blockCoord / CHUNK_SIZE);
export const localCoord = (blockCoord: number): number => floorMod(blockCoord, CHUNK_SIZE);

export const inWorldY = (y: number): boolean => y >= WORLD_MIN_Y && y <= WORLD_MAX_Y;
export const sectionIndex = (y: number): number => Math.floor((y - WORLD_MIN_Y) / SECTION_HEIGHT);
export const localY = (y: number): number => floorMod(y - WORLD_MIN_Y, SECTION_HEIGHT);

// Index into a section's cell array. Layout is y, then z, then x.
export const cellIndex = (lx: number, ly: number, lz: number): number =>
  (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

// Terrain heights are kept inside these bounds. The ceiling leaves 70 blocks of headroom for the tallest structures,
// and the floor keeps open water and coast well above the bottom of the world.
export const TERRAIN_MIN_Y = WORLD_MIN_Y + 16;
export const TERRAIN_MAX_Y = WORLD_MAX_Y - 71;
