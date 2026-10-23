import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { NatureBlock } from '../../content/blocksNature';
import { Chunk } from '../../engine/Chunk';
import { cellId } from '../../engine/cell';
import { CHUNK_SIZE } from '../../engine/coords';
import { BlockType, WATER_LEVEL } from '../../worldConstants';
import { Biome } from '../../worldgen/biomes/Biome';
import { RIVER_FLOOR, RiverField } from '../../worldgen/water/RiverField';
import { ZONE_INFOS } from '../../worldgen/zones/ZoneInfo';
import { clearanceFromZones } from '../../worldgen/zones/ZoneClearance';
import { createVoxelverseGenerator } from '../../worldgen/VoxelverseGenerator';
import { WORLD_SEED } from '../../worldConstants';
import { timeoutMs } from '../perf';

const gen = createVoxelverseGenerator(createDefaultRegistry());

// Columns inside a river channel, found by walking a grid over open country between the zones.
const channelColumns = (): Array<{ x: number; z: number }> => {
  const found: Array<{ x: number; z: number }> = [];
  for (let x = -2900; x < 3500; x += 8) {
    for (let z = -2900; z < 3500; z += 8) {
      const c = gen.columnAt(x, z);
      if (c.wild && c.river > 0.995 && c.edge < -0.5) found.push({ x, z });
    }
  }
  return found;
};

describe('rivers', () => {
  const channel = channelColumns();

  it('run through the country as channels with the floor one block under the water level', () => {
    console.info(`${channel.length} channel columns found on the grid`);
    expect(channel.length).toBeGreaterThan(300);
    for (const { x, z } of channel) {
      const ground = gen.terrainHeight(x, z);
      expect(ground, `channel floor at ${x},${z}`).toBe(RIVER_FLOOR);
      expect(gen.sampleBlock(x, WATER_LEVEL, z)).toBe(BlockType.WATER);
      expect(gen.sampleBlock(x, WATER_LEVEL + 1, z)).not.toBe(BlockType.WATER);
    }
    expect(RIVER_FLOOR).toBe(WATER_LEVEL - 1);
  });

  it('have sand or gravel on their banks and beds', () => {
    let bank = 0, soft = 0;
    for (let x = -2900; x < 3500; x += 11) {
      for (let z = -2900; z < 3500; z += 11) {
        const c = gen.columnAt(x, z);
        if (!c.wild || c.river < 0.25 || c.ground > WATER_LEVEL + 2) continue;
        bank++;
        if (c.surface === BlockType.SAND || c.surface === NatureBlock.GRAVEL) soft++;
      }
    }
    console.info(`${soft} of ${bank} bank and bed columns are sand or gravel`);
    expect(bank).toBeGreaterThan(500);
    expect(soft / bank).toBeGreaterThan(0.95);
    // A wide stride keeps the scan fast (the bank columns still number in the tens of thousands); the timeout is for a
    // busy machine, not for this scan.
  }, timeoutMs(30000));

  it('grow reed beds along their banks', () => {
    // Look at chunks around known river columns for reeds.
    const seen = new Set<string>();
    let reeds = 0;
    for (const { x, z } of channel.filter((_, i) => i % 40 === 0).slice(0, 60)) {
      const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
      if (seen.has(`${cx},${cz}`)) continue;
      seen.add(`${cx},${cz}`);
      const chunk = new Chunk(cx, cz);
      gen.generateChunk(chunk);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const ground = gen.terrainHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
        for (let y = ground + 1; y <= ground + 5; y++) if (cellId(chunk.getCell(lx, y, lz)) === NatureBlock.REEDS) reeds++;
      }
    }
    console.info(`${reeds} reed blocks in ${seen.size} river chunks`);
    expect(reeds).toBeGreaterThan(50);
  }, timeoutMs(30000));

  it('fade out near the legacy zones, so the zone borders stay as continuous as before', () => {
    // A river's weight can never be more than the fade, which is a smoothstep of the distance to the nearest zone
    // over 140 blocks: nothing at the footprint, a quarter at 60 blocks, everything from 140.
    const fade = (d: number): number => { const t = Math.min(1, Math.max(0, d / 140)); return t * t * (3 - 2 * t); };
    let near = 0, withWater = 0;
    for (const info of ZONE_INFOS) {
      const s = info.shape;
      const r = s.kind === 'circle' ? s.radius : s.half * Math.SQRT2;
      for (let a = 0; a < 720; a++) {
        const t = (a / 720) * Math.PI * 2;
        for (const out of [2, 15, 40, 90]) {
          const x = Math.round(s.cx + Math.cos(t) * (r + out)), z = Math.round(s.cz + Math.sin(t) * (r + out));
          if (gen.zoneNameAt(x, z) !== 'Wilderness') continue;
          const d = clearanceFromZones(x, z);
          const c = gen.columnAt(x, z);
          near++;
          expect(c.river, `river at ${x},${z}`).toBeLessThanOrEqual(fade(d) + 1e-9);
          expect(c.pond, `pond at ${x},${z}`).toBeLessThanOrEqual(fade(d) + 1e-9);
          if (c.ground < WATER_LEVEL) withWater++;
        }
      }
    }
    expect(near).toBeGreaterThan(3000);
    // No water at all within 20 blocks of a zone: the fade leaves too little to dig down to the water level.
    for (const { x, z } of channel) expect(clearanceFromZones(x, z)).toBeGreaterThan(20);
    console.info(`${near} columns near zones checked, ${withWater} of them under water`);
  });

  it('widen towards the western coast', () => {
    const field = new RiverField(WORLD_SEED);
    const out = { carve: 0, edge: 0 };
    // How deep inside a channel the deepest columns are, about the channel's half width, in a strip of country.
    const halfWidth = (x0: number, x1: number): number => {
      const depth: number[] = [];
      for (let x = x0; x < x1; x += 3) {
        for (let z = -3000; z < 3000; z += 3) {
          field.sample(x, z, 8, out);
          if (out.carve > 0.99) depth.push(-out.edge);
        }
      }
      depth.sort((a, b) => a - b);
      return depth[Math.floor(depth.length * 0.99)];
    };
    const west = halfWidth(-2900, -2500);
    const middle = halfWidth(-1000, -600);
    const east = halfWidth(400, 800);
    console.info(`channel half width (99th percentile): west ${west.toFixed(1)}, middle ${middle.toFixed(1)}, east ${east.toFixed(1)}`);
    expect(west).toBeGreaterThan(2 * middle);
    expect(west).toBeGreaterThan(2 * east);
  }, timeoutMs(30000));

  it('stay out of the mountains, where the ground is high', () => {
    let river = 0;
    for (let x = 11000; x < 14000; x += 10) for (let z = -2000; z < 2000; z += 10) if (gen.columnAt(x, z).river > 0.01) river++;
    expect(river).toBe(0);
  });

  it('are the same for the same seed', () => {
    const a = new RiverField(5), b = new RiverField(5), c = new RiverField(6);
    const oa = { carve: 0, edge: 0 }, ob = { carve: 0, edge: 0 }, oc = { carve: 0, edge: 0 };
    let differ = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 13 - 5000, z = i * 7 - 3000;
      a.sample(x, z, 8, oa); b.sample(x, z, 8, ob); c.sample(x, z, 8, oc);
      expect(oa).toEqual(ob);
      if (Math.abs(oa.carve - oc.carve) > 0.1) differ++;
    }
    expect(differ).toBeGreaterThan(50);
  });
});

describe('ponds', () => {
  it('sit in wetland, with mud underneath and reeds round the edge', () => {
    let pondColumns = 0, water = 0, mud = 0, outsideWetland = 0;
    for (let x = -1000; x < 2500; x += 5) {
      for (let z = 3500; z < 6500; z += 5) {
        const c = gen.columnAt(x, z);
        if (!c.wild || c.pond < 0.3) continue;
        pondColumns++;
        if (c.biome !== Biome.WETLAND) outsideWetland++;
        if (c.ground < WATER_LEVEL) { water++; if (c.surface === NatureBlock.MUD) mud++; }
      }
    }
    console.info(`${pondColumns} pond columns, ${water} under water, ${mud} with mud, ${outsideWetland} outside wetland`);
    expect(pondColumns).toBeGreaterThan(200);
    expect(water).toBeGreaterThan(100);
    expect(mud / water).toBeGreaterThan(0.9);
    // The pond weight can reach a little past the biome edge, but not far.
    expect(outsideWetland / pondColumns).toBeLessThan(0.15);
  }, timeoutMs(30000));
});
