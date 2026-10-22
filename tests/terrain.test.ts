import { describe, expect, it } from 'vitest';
import { BlockType, MILE, ZONE_LOCATIONS } from '../constants';
import { getBlockAt, getCurrentZoneName, getTerrainHeight } from '../utils/terrain';
import { TERRAIN_MAX_Y, TERRAIN_MIN_Y } from '../engine/coords';

describe('zone lookup', () => {
  const cases: Array<[string, number, number, string]> = [
    ['Town of Beginnings centre', 0, 0, 'Town of Beginnings'],
    ['Greensom spawn', 0, 300, 'Greensom Village'],
    ['Tempest centre', 3 * MILE, 0, 'Federation of Tempest'],
    ['Amestris centre', -3 * MILE, 0, 'Amestris District'],
    ['Bosse centre', 0, -3 * MILE, 'Kingdom of Bosse'],
    ['Fremmevilla centre', 1600, -1600, 'Kingdom of Fremmevilla'],
    ['Magnolia centre', -1600, 1600, 'Magnolia Town'],
    ['open country', 500, 500, 'Wilderness'],
  ];

  it.each(cases)('%s', (_label, x, z, name) => {
    expect(getCurrentZoneName(x, z)).toBe(name);
  });

  it('keeps ZONE_LOCATIONS consistent with the zone files', () => {
    expect(getCurrentZoneName(ZONE_LOCATIONS.SAO.x, ZONE_LOCATIONS.SAO.z)).toBe('Town of Beginnings');
    expect(getCurrentZoneName(ZONE_LOCATIONS.GREENSOM.x, ZONE_LOCATIONS.GREENSOM.z)).toBe('Greensom Village');
    expect(getCurrentZoneName(ZONE_LOCATIONS.TEMPEST.x, ZONE_LOCATIONS.TEMPEST.z)).toBe('Federation of Tempest');
    expect(getCurrentZoneName(ZONE_LOCATIONS.AMESTRIS.x, ZONE_LOCATIONS.AMESTRIS.z)).toBe('Amestris District');
    expect(getCurrentZoneName(ZONE_LOCATIONS.BOSSE.x, ZONE_LOCATIONS.BOSSE.z)).toBe('Kingdom of Bosse');
    expect(getCurrentZoneName(ZONE_LOCATIONS.FREMMEVILLA.x, ZONE_LOCATIONS.FREMMEVILLA.z)).toBe('Kingdom of Fremmevilla');
    expect(getCurrentZoneName(ZONE_LOCATIONS.MAGNOLIA.x, ZONE_LOCATIONS.MAGNOLIA.z)).toBe('Magnolia Town');
  });
});

describe('terrain', () => {
  const samples: Array<[number, number]> = [
    [0, 0], [0, 300], [3 * MILE, 0], [-3 * MILE, 0], [0, -3 * MILE], [500, 500], [-700, 1200], [2400, -300],
  ];

  it('is deterministic', () => {
    for (const [x, z] of samples) {
      expect(getTerrainHeight(x, z)).toBe(getTerrainHeight(x, z));
      const h = getTerrainHeight(x, z);
      expect(getBlockAt(x, h, z)).toBe(getBlockAt(x, h, z));
    }
  });

  it('returns whole-number heights', () => {
    for (const [x, z] of samples) {
      expect(Number.isInteger(getTerrainHeight(x, z))).toBe(true);
    }
  });

  it('puts the spawn on a road with stone underneath', () => {
    const h = getTerrainHeight(0, 300);
    expect(getBlockAt(0, h, 300)).toBe(BlockType.PATH);
    expect(getBlockAt(0, h - 1, 300)).toBe(BlockType.STONE);
  });

  it('keeps heights inside the world, including the far coast and mountains', () => {
    const far: Array<[number, number]> = [[-4000, 0], [-9000, 500], [12000, 0], [20000, -300], [60000, 60000], [-60000, -60000]];
    for (const [x, z] of far) {
      const h = getTerrainHeight(x, z);
      expect(h).toBeGreaterThanOrEqual(TERRAIN_MIN_Y);
      expect(h).toBeLessThanOrEqual(TERRAIN_MAX_Y);
    }
  });
});
