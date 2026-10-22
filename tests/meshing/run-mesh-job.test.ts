import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { MeshData, meshTriangleCount } from '../../meshing/ChunkMesher';
import { runMeshJob } from '../../meshing/runMeshJob';
import { createWorkerGenerator } from '../../worldgen/createWorkerGenerator';
import { LegacyZoneAdapter } from '../../worldgen/LegacyZoneAdapter';
import { LodLevel } from '../../worldConstants';

const registry = createDefaultRegistry();
const generator = createWorkerGenerator(registry);

describe('createWorkerGenerator', () => {
  it('gives the workers the legacy zones for now', () => {
    expect(generator).toBeInstanceOf(LegacyZoneAdapter);
  });
});

describe('runMeshJob', () => {
  it('meshes the requested chunk', () => {
    const mesh = runMeshJob(0, 9, LodLevel.HIGH, generator, registry);
    expect(mesh.cx).toBe(0);
    expect(mesh.cz).toBe(9);
    expect(meshTriangleCount(mesh)).toBeGreaterThan(1000);
  });

  it('gives the same mesh for the same job', () => {
    const a = runMeshJob(0, 9, LodLevel.HIGH, generator, registry);
    const b = runMeshJob(0, 9, LodLevel.HIGH, generator, registry);
    const same = (x: MeshData, y: MeshData) =>
      (['opaque', 'cutout', 'water'] as const).every((k) =>
        x[k].positions.length === y[k].positions.length && x[k].positions.every((v, i) => v === y[k].positions[i]));
    expect(same(a, b)).toBe(true);
  });

  it('leaves the small decorations out at low detail', () => {
    // Greensom's farms, fences and crops are cutout shapes that only exist at HIGH.
    const high = runMeshJob(0, 9, LodLevel.HIGH, generator, registry);
    const low = runMeshJob(0, 9, LodLevel.LOW, generator, registry);
    expect(meshTriangleCount(low)).toBeLessThan(meshTriangleCount(high));
    expect(low.cutout.indices.length).toBeLessThan(high.cutout.indices.length);
    // The ground itself does not change with detail.
    expect(low.opaque.indices.length).toBe(high.opaque.indices.length);
  });
});
