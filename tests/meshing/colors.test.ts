import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { grassTint, leavesTint } from '../../meshing/biomeTint';
import { hexToLinear } from '../../meshing/color';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { createTextureLayout } from '../../engine/TextureLayout';
import { meshChunk } from '../../meshing/ChunkMesher';
import { buildAtlasPixels } from '../../render/AtlasBuilder';
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
  const layout = createDefaultTextureLayout(registry);
  const face = (id: number, x: number, z: number, cx: number, cz: number, normalY: number, withLayout = true) => {
    const m = meshChunk(new MapReader([[x, 5, z, id]]), cx, cz, registry, withLayout ? { layout } : {});
    const b = [m.opaque, m.cutout].find((bucket) => bucket.indices.length > 0)!;
    return quadsOf(b).find((q) => q.normal[1] === normalY)!;
  };
  const nearly = (got: ArrayLike<number>, want: Color) => {
    expect(got[0]).toBeCloseTo(want.r, 5);
    expect(got[1]).toBeCloseTo(want.g, 5);
    expect(got[2]).toBeCloseTo(want.b, 5);
  };

  it('leaves the vertex colour white now that colour comes from the texture', () => {
    for (const id of [BlockType.STONE, BlockType.GRASS, BlockType.LEAVES]) {
      for (const c of face(id, 3, 3, 0, 0, 1).corners) expect(c.rgb).toEqual([1, 1, 1]);
    }
  });

  it('draws a block without faces as a flat tile of its registry colour', () => {
    const quad = face(BlockType.STONE, 3, 3, 0, 0, 1, false);
    const flat = createTextureLayout([], registry);
    expect(flat.layerNames[quad.layer]).toBe(`flat:${COLORS.STONE.toLowerCase()}`);
    // The same pixels the atlas puts in that layer: the registry colour, opaque.
    const pixels = buildAtlasPixels(createDefaultCatalog(), flat);
    const want = new Color(COLORS.STONE).convertLinearToSRGB();
    expect(Array.from(pixels.slice(quad.layer * 1024, quad.layer * 1024 + 4)))
      .toEqual([Math.round(want.r * 255), Math.round(want.g * 255), Math.round(want.b * 255), 255]);
    for (const c of quad.corners) expect(c.tint).toEqual([1, 1, 1]);
  });

  it('tints grass by where the block is in the world', () => {
    // Block at world (-100, -200) in chunk (-4, -7), local (28, 24).
    for (const c of face(BlockType.GRASS, -100, -200, -4, -7, 1).corners) nearly(c.tint, oldTint(-100, -200, false));
  });

  it('tints the grass side fringe with the same biome colour as the top', () => {
    const side = quadsOf(meshChunk(new MapReader([[-100, 5, -200, BlockType.GRASS]]), -4, -7, registry, { layout }).opaque)
      .find((q) => q.normal[0] === 1)!;
    expect(side.overlay).toBeGreaterThanOrEqual(0);
    for (const c of side.corners) nearly(c.tint, oldTint(-100, -200, false));
  });

  it('tints leaves like grass, darkened', () => {
    for (const c of face(BlockType.LEAVES, 1540, 3, 48, 0, 1).corners) nearly(c.tint, oldTint(1540, 3, true));
  });

  it('gives leaves their pattern from the texture and not from a flat colour', () => {
    const quad = face(BlockType.LEAVES, 1540, 3, 48, 0, 1);
    expect(layout.layerNames[quad.layer]).toBe('leaves_oak');
  });

  it('takes other leaf types, which the old renderer did not tint, from their own tile', () => {
    const m = meshChunk(new MapReader([[3, 3, 3, BlockType.PINE_LEAVES]]), 0, 0, registry, { layout });
    for (const q of quadsOf(m.cutout)) {
      expect(layout.layerNames[q.layer]).toBe('leaves_pine');
      for (const c of q.corners) expect(c.tint).toEqual([1, 1, 1]);
    }
  });
});
