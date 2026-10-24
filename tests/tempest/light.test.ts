import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { TempestBlock as T } from '../../content/blocksTempest';
import { Chunk } from '../../engine/Chunk';
import { cellId } from '../../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y, chunkCoord } from '../../engine/coords';
import { ChunkCache } from '../../meshing/ChunkCache';
import { ChunkGrid, LIGHT_MAX, computeChunkLight } from '../../meshing/LightEngine';
import { createWorkerGenerator } from '../../worldgen/createWorkerGenerator';
import { LodLevel } from '../../worldConstants';

// The light of the town as the mesh workers bake it: paper lanterns along the streets, lit shoji in the houses, ore lamps in the
// square. A neighbourhood of nine real chunks, the light engine, and what it says next to each kind of source.

const registry = createDefaultRegistry();
const cache = new ChunkCache(createWorkerGenerator(registry), 64);

const lightAround = (px: number, pz: number): { grid: Chunk[]; cx: number; cz: number; light: ReturnType<typeof computeChunkLight>; chunk: Chunk } => {
  const cx = chunkCoord(px), cz = chunkCoord(pz);
  const grid: Chunk[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) grid.push(cache.get(cx + dx, cz + dz, LodLevel.HIGH));
  return { grid, cx, cz, light: computeChunkLight(new ChunkGrid(grid), cx, cz, registry), chunk: cache.get(cx, cz, LodLevel.HIGH) };
};

const find = (chunk: Chunk, ids: number[], limit = 40): Array<[number, number, number]> => {
  const out: Array<[number, number, number]> = [];
  for (let lz = 0; lz < CHUNK_SIZE && out.length < limit; lz++) for (let lx = 0; lx < CHUNK_SIZE && out.length < limit; lx++) {
    for (let y = 0; y <= 40; y++) if (ids.includes(cellId(chunk.getCell(lx, y, lz)))) out.push([lx, y, lz]);
  }
  return out;
};

describe('the light of the town', () => {
  it('bakes the red lanterns of the streets: full strength at the lantern, a pool of light on the paving below', () => {
    // The Central Square and the avenues leaving it are lined with lamp posts that hang red and striped lanterns.
    const { chunk, light } = lightAround(1500, 0);
    const lanterns = find(chunk, [T.PAPER_LANTERN_RED, T.PAPER_LANTERN_STRIPED]);
    expect(lanterns.length).toBeGreaterThan(3);
    for (const [lx, y, lz] of lanterns) {
      expect(light.block(lx, y, lz), `lantern ${lx},${y},${lz}`).toBe(registry.get(cellId(chunk.getCell(lx, y, lz))).emits);
      // The cell under it has lost one step of the light (paper lets it through, and a lantern hangs over air, a bench or a flower).
      expect(light.block(lx, y - 1, lz)).toBeGreaterThanOrEqual(registry.get(cellId(chunk.getCell(lx, y, lz))).emits - 2);
    }
    // And the glow reaches the paving: some street cell next to a lantern reads at least 8.
    const lit = lanterns.filter(([lx, y, lz]) => light.block(lx + 1, y - 3, lz) >= 8 || light.block(lx - 1, y - 3, lz) >= 8 || light.block(lx, y - 3, lz + 1) >= 8 || light.block(lx, y - 3, lz - 1) >= 8);
    expect(lit.length).toBeGreaterThan(0);
  });

  it('bakes the ore lamps of the Central Square at 15 and 13, and the lit shoji of houses at 8, glowing into their rooms', () => {
    const square = lightAround(1500, 0);
    const ore = find(square.chunk, [T.BLUE_ORE_LAMP, T.GREEN_ORE_LAMP]);
    expect(ore.length).toBeGreaterThan(0);
    for (const [lx, y, lz] of ore) {
      const id = cellId(square.chunk.getCell(lx, y, lz));
      expect(square.light.block(lx, y, lz)).toBe(id === T.BLUE_ORE_LAMP ? 15 : 13);
    }
    // A commercial block of the avenue: many houses, lit screens in their fronts.
    const street = lightAround(1440, -20);
    const shoji = find(street.chunk, [T.SHOJI_PANE_LIT], 200);
    expect(shoji.length).toBeGreaterThan(5);
    let reachingIn = 0;
    for (const [lx, y, lz] of shoji) {
      // A lit screen is a lamp of 8: at least 7 on a cell of air beside it, on one side or the other (street or room).
      expect(street.light.block(lx, y, lz)).toBeGreaterThanOrEqual(8);
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => street.light.block(lx + dx, y, lz + dz));
      if (Math.max(...around) >= 7) reachingIn++;
    }
    expect(reachingIn).toBeGreaterThan(shoji.length / 2);
  });

  it('is dark where there is nothing to light it: the forest at night, the sky aside', () => {
    const { chunk, light } = lightAround(1200, 400);
    let lit = 0, air = 0;
    for (let lz = 0; lz < CHUNK_SIZE; lz += 3) for (let lx = 0; lx < CHUNK_SIZE; lx += 3) for (let y = 12; y < 20; y++) {
      if (cellId(chunk.getCell(lx, y, lz)) !== 0) continue;
      air++;
      if (light.block(lx, y, lz) > 0) lit++;
    }
    expect(air).toBeGreaterThan(100);
    expect(lit).toBe(0);
    expect(LIGHT_MAX).toBe(15);
    expect(WORLD_MIN_Y).toBeLessThan(WORLD_MAX_Y);
  });
});
