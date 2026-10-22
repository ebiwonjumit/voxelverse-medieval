import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { grassTint, leavesTint } from '../../meshing/biomeTint';
import { hexToLinear } from '../../meshing/color';
import { meshChunk } from '../../meshing/ChunkMesher';
import { BlockType, COLORS, MILE } from '../../worldConstants';
import { MapReader, quadsOf, registry } from './helpers';

// The blend as World.tsx wrote it, with three.js doing the colour maths.
const OLD = {
  SAO: new Color(COLORS.GRASS_SAO),
  TEMPEST: new Color(COLORS.GRASS_TEMPEST),
  AMESTRIS: new Color(COLORS.GRASS_AMESTRIS),
  BOSSE: new Color(COLORS.GRASS_BOSSE),
  FREMMEVILLA: new Color(COLORS.GRASS_FREMMEVILLA),
  MAGNOLIA: new Color(COLORS.GRASS_MAGNOLIA),
};

const oldTint = (x: number, z: number, leaves: boolean): Color => {
  const tempColor = new Color();
  const dSAO = Math.sqrt(x * x + z * z);
  const dTempest = Math.sqrt(Math.pow(x - 3 * MILE, 2) + Math.pow(z, 2));
  const dAmestris = Math.sqrt(Math.pow(x - (-3 * MILE), 2) + Math.pow(z, 2));
  const dBosse = Math.sqrt(Math.pow(x, 2) + Math.pow(z - (-3 * MILE), 2));
  const dFremme = Math.sqrt(Math.pow(x - 1600, 2) + Math.pow(z - (-1600), 2));
  const dMagnolia = Math.sqrt(Math.pow(x - (-1600), 2) + Math.pow(z - 1600, 2));
  const eps = 1;
  const wSAO = 1 / (dSAO + eps);
  const wTempest = 1 / (dTempest + eps);
  const wAmestris = 1 / (dAmestris + eps);
  const wBosse = 1 / (dBosse + eps);
  const wFremme = 1 / (dFremme + eps);
  const wMagnolia = 1 / (dMagnolia + eps);
  const totalW = wSAO + wTempest + wAmestris + wBosse + wFremme + wMagnolia;
  tempColor.setRGB(0, 0, 0);
  tempColor.add(OLD.SAO.clone().multiplyScalar(wSAO / totalW));
  tempColor.add(OLD.TEMPEST.clone().multiplyScalar(wTempest / totalW));
  tempColor.add(OLD.AMESTRIS.clone().multiplyScalar(wAmestris / totalW));
  tempColor.add(OLD.BOSSE.clone().multiplyScalar(wBosse / totalW));
  tempColor.add(OLD.FREMMEVILLA.clone().multiplyScalar(wFremme / totalW));
  tempColor.add(OLD.MAGNOLIA.clone().multiplyScalar(wMagnolia / totalW));
  if (leaves) tempColor.multiplyScalar(0.7);
  return tempColor;
};

const SAMPLES: Array<[number, number]> = [
  [0, 0], [5, -3], [0, 300], [-1, -1], [123, 456], [1380, 0], [1499, 12], [3 * MILE, 0], [-3 * MILE, 7],
  [0, -1400], [1600, -1600], [-1600, 1600], [-5000, 0], [12000, 12000], [-700, 2500],
];

describe('hexToLinear', () => {
  it('matches the conversion three.js does for a hex colour', () => {
    for (const hex of ['#4ade80', '#5D4037', '#000000', '#ffffff', '#64748b', '#d500f9', '#0a3d0f']) {
      const c = new Color(hex);
      const out = [0, 0, 0];
      hexToLinear(hex, out);
      expect(out[0]).toBeCloseTo(c.r, 6);
      expect(out[1]).toBeCloseTo(c.g, 6);
      expect(out[2]).toBeCloseTo(c.b, 6);
    }
  });
});

describe('biomeTint', () => {
  it('gives the same grass colour as the old blend at sample points', () => {
    for (const [x, z] of SAMPLES) {
      const want = oldTint(x, z, false);
      const got = [0, 0, 0];
      grassTint(x, z, got);
      expect(got[0]).toBeCloseTo(want.r, 6);
      expect(got[1]).toBeCloseTo(want.g, 6);
      expect(got[2]).toBeCloseTo(want.b, 6);
    }
  });

  it('gives the same leaf colour, grass times 0.7', () => {
    for (const [x, z] of SAMPLES) {
      const want = oldTint(x, z, true);
      const got = [0, 0, 0];
      leavesTint(x, z, got);
      expect(got[0]).toBeCloseTo(want.r, 6);
      expect(got[1]).toBeCloseTo(want.g, 6);
      expect(got[2]).toBeCloseTo(want.b, 6);
    }
  });

  it('is almost exactly the zone colour at a zone centre', () => {
    const got = [0, 0, 0];
    grassTint(3 * MILE, 0, got);
    const tempest = new Color(COLORS.GRASS_TEMPEST);
    expect(got[0]).toBeCloseTo(tempest.r, 2);
    expect(got[1]).toBeCloseTo(tempest.g, 2);
  });
});

describe('mesher colours', () => {
  const topFace = (id: number, x: number, z: number, cx: number, cz: number) => {
    const m = meshChunk(new MapReader([[x, 5, z, id]]), cx, cz, registry);
    const b = id === BlockType.LEAVES ? m.cutout : m.opaque;
    return quadsOf(b).find((q) => q.normal[1] === 1)!.corners[0].rgb;
  };

  it('uses the registry colour for plain blocks, in linear space', () => {
    const rgb = topFace(BlockType.STONE, 3, 3, 0, 0);
    const want = new Color(COLORS.STONE);
    expect(rgb[0]).toBeCloseTo(want.r, 5);
    expect(rgb[1]).toBeCloseTo(want.g, 5);
    expect(rgb[2]).toBeCloseTo(want.b, 5);
  });

  it('tints grass by where the block is in the world', () => {
    // Block at world (-100, -200) in chunk (-4, -7), local (28, 24).
    const rgb = topFace(BlockType.GRASS, -100, -200, -4, -7);
    const want = oldTint(-100, -200, false);
    expect(rgb[0]).toBeCloseTo(want.r, 5);
    expect(rgb[1]).toBeCloseTo(want.g, 5);
    expect(rgb[2]).toBeCloseTo(want.b, 5);
  });

  it('tints leaves like grass, darkened', () => {
    const rgb = topFace(BlockType.LEAVES, 1540, 3, 48, 0);
    const want = oldTint(1540, 3, true);
    expect(rgb[0]).toBeCloseTo(want.r, 5);
    expect(rgb[1]).toBeCloseTo(want.g, 5);
    expect(rgb[2]).toBeCloseTo(want.b, 5);
  });

  it('colours other leaf types from the registry', () => {
    const m = meshChunk(new MapReader([[3, 3, 3, BlockType.PINE_LEAVES]]), 0, 0, registry);
    const want = new Color(COLORS.PINE_LEAVES);
    expect(m.cutout.colors[0]).toBeCloseTo(want.r, 5);
    expect(m.cutout.colors[1]).toBeCloseTo(want.g, 5);
  });
});
