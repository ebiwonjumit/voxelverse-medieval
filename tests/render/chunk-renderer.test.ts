import { DataArrayTexture, Mesh, MeshBasicMaterial } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorldProbe } from '../../bench/worldProbe';
import { MeshData } from '../../meshing/ChunkMesher';
import { SiteStore } from '../../render/effects/SiteStore';
import {
  ChunkRenderer, HIGH_LOD_DISTANCE, MAX_GEOMETRIES_PER_FRAME, boundingSphereOf,
} from '../../render/ChunkRenderer';
import { CHUNK_SIZE, LodLevel, RENDER_DISTANCE } from '../../worldConstants';
import { FakeWorker, fakeWorkerFactory, quadMesh } from '../meshing/fakeWorkers';

const make = (options: { renderDistance?: number; poolSize?: number; registerProbe?: boolean } = {}) => {
  const { factory, workers } = fakeWorkerFactory();
  const renderer = new ChunkRenderer({ workerFactory: factory, registerProbe: false, ...options });
  return { renderer, workers };
};

// The renderer takes the camera's block position, so this puts the camera in the middle of a chunk.
const inChunk = (cx: number, cz: number): [number, number] => [cx * CHUNK_SIZE + 16, cz * CHUNK_SIZE + 16];

// Answers every job the workers have been given, and the ones that answering starts, until nothing is left.
const drain = (workers: FakeWorker[], build?: (cx: number, cz: number) => MeshData) => {
  for (let progress = true; progress;) {
    progress = false;
    for (const w of workers) {
      while (w.unanswered > 0) {
        w.answer(build ? (job) => ({ id: job.id, mesh: build(job.cx, job.cz) }) : undefined);
        progress = true;
      }
    }
  }
};

const frames = (renderer: ChunkRenderer, x: number, z: number, n: number) => {
  for (let i = 0; i < n; i++) renderer.update(x, z, i / 60);
};

// What three hands onBeforeCompile, cut down to the chunks the patches look for.
const patchedShader = () => ({
  uniforms: {} as Record<string, { value: unknown }>,
  vertexShader: 'void main() {\n#include <begin_vertex>\n#include <color_vertex>\n}',
  fragmentShader: 'void main() {\n#include <map_fragment>\n}',
});

const meshesIn = (renderer: ChunkRenderer): Mesh[] => renderer.group.children as Mesh[];

const renderers: ChunkRenderer[] = [];
afterEach(() => {
  while (renderers.length) renderers.pop()!.dispose();
});
const track = <T extends { renderer: ChunkRenderer }>(r: T): T => {
  renderers.push(r.renderer);
  return r;
};

describe('ChunkRenderer', () => {
  it('renders 8 chunks out by default', () => {
    expect(RENDER_DISTANCE).toBe(8);
  });

  describe('which chunks it asks for', () => {
    it('requests every chunk within a circle of the render distance, and no others', () => {
      const { renderer, workers } = track(make({ renderDistance: 4, poolSize: 1 }));
      renderer.update(...inChunk(10, -20), 0);
      drain(workers);
      const asked = workers[0].posted.map((j) => [j.cx, j.cz]);
      const expected: number[][] = [];
      for (let dx = -4; dx <= 4; dx++) {
        for (let dz = -4; dz <= 4; dz++) if (Math.hypot(dx, dz) <= 4) expected.push([10 + dx, -20 + dz]);
      }
      expect(asked).toHaveLength(expected.length);
      expect(new Set(asked.map(String))).toEqual(new Set(expected.map(String)));
      expect(renderer.getStats().chunks).toBe(expected.length);
    });

    it('asks for the nearest chunks first', () => {
      const { renderer, workers } = track(make({ renderDistance: 5, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      const dists = workers[0].posted.map((j) => Math.hypot(j.cx, j.cz));
      expect(dists[0]).toBe(0);
      for (let i = 1; i < dists.length; i++) expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1]);
    });

    it('builds full detail within HIGH_LOD_DISTANCE and low detail beyond', () => {
      const { renderer, workers } = track(make({ renderDistance: 5, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      for (const job of workers[0].posted) {
        const dist = Math.hypot(job.cx, job.cz);
        expect(job.lod).toBe(dist <= HIGH_LOD_DISTANCE ? LodLevel.HIGH : LodLevel.LOW);
      }
    });

    it('asks for nothing new while the player stays in the same chunk', () => {
      const { renderer, workers } = track(make({ renderDistance: 3, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      const first = workers[0].posted.length + 0;
      drain(workers);
      const total = workers[0].posted.length;
      renderer.update(5, 5, 0.1);
      renderer.update(20, 20, 0.2);
      drain(workers);
      expect(workers[0].posted.length).toBe(total);
      expect(first).toBeGreaterThan(0);
    });

    it('does not ask again for chunks it already has when the player steps over a border', () => {
      const { renderer, workers } = track(make({ renderDistance: 3, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      frames(renderer, ...inChunk(0, 0), 20);
      const before = workers[0].posted.length;
      renderer.update(...inChunk(1, 0), 1);
      drain(workers);
      // Never the same chunk at the same detail twice. What is new is the strip at the edge of the circle,
      // plus the few chunks that moved close enough to need full detail.
      const keys = workers[0].posted.map((j) => `${j.cx},${j.cz},${j.lod}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(workers[0].posted.length - before).toBeLessThan(before / 2);
    });

    it('upgrades a low-detail chunk when the player comes close', () => {
      const { renderer, workers } = track(make({ renderDistance: 6, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      frames(renderer, ...inChunk(0, 0), 60);
      const far = workers[0].posted.filter((j) => j.cx === 5 && j.cz === 0);
      expect(far.map((j) => j.lod)).toEqual([LodLevel.LOW]);

      renderer.update(...inChunk(4, 0), 1); // chunk (5, 0) is now one chunk away
      drain(workers);
      const again = workers[0].posted.filter((j) => j.cx === 5 && j.cz === 0);
      expect(again.map((j) => j.lod)).toEqual([LodLevel.LOW, LodLevel.HIGH]);
    });
  });

  describe('unloading', () => {
    it('keeps chunks one past the render distance and drops them beyond that', () => {
      const { renderer, workers } = track(make({ renderDistance: 3, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      frames(renderer, ...inChunk(0, 0), 200);
      expect(renderer.getStats().chunks).toBeGreaterThan(0);
      const has = (cx: number, cz: number) => meshesIn(renderer).some((m) => m.position.x === cx * CHUNK_SIZE - 0.5 && m.position.z === cz * CHUNK_SIZE - 0.5);
      expect(has(-3, 0)).toBe(true);

      // Move one chunk east: (-3, 0) is now 4 away, which is the render distance plus the one-chunk margin.
      renderer.update(...inChunk(1, 0), 1);
      drain(workers);
      frames(renderer, ...inChunk(1, 0), 200);
      expect(has(-3, 0)).toBe(true);

      // Two chunks east it is 5 away and goes.
      renderer.update(...inChunk(2, 0), 2);
      drain(workers);
      frames(renderer, ...inChunk(2, 0), 200);
      expect(has(-3, 0)).toBe(false);
      expect(has(-2, 0)).toBe(true);
    });

    it('disposes the geometry of every chunk it unloads', () => {
      const { renderer, workers } = track(make({ renderDistance: 3, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      frames(renderer, ...inChunk(0, 0), 200);

      const geometries = new Map<Mesh, ReturnType<typeof vi.fn>>();
      for (const mesh of meshesIn(renderer)) {
        const spy = vi.fn();
        mesh.geometry.addEventListener('dispose', spy);
        geometries.set(mesh, spy);
      }
      const before = renderer.getStats();
      expect(before.geometries).toBe(before.meshes);

      renderer.update(...inChunk(100, 100), 1); // far away: everything goes
      expect(meshesIn(renderer)).toHaveLength(0);
      for (const spy of geometries.values()) expect(spy).toHaveBeenCalledTimes(1);
      expect(renderer.getStats().geometries).toBe(0);
      expect(renderer.getStats().meshes).toBe(0);
    });

    it('cancels jobs that have not started for chunks that fall out of range', () => {
      const { renderer, workers } = track(make({ renderDistance: 3, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0); // one job running, the rest queued
      const started = workers[0].posted.length;
      expect(started).toBe(1);
      renderer.update(...inChunk(50, 0), 1); // none of the old queue is wanted any more
      workers[0].answer(); // the running one finishes, and is dropped
      const next = workers[0].posted[1];
      expect(next.cx).toBeGreaterThanOrEqual(50 - 3);
      expect(renderer.getStats().geometries).toBe(0);
    });

    it('drops a result that arrives after its chunk was unloaded', () => {
      const { renderer, workers } = track(make({ renderDistance: 2, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      renderer.update(...inChunk(40, 0), 1);
      workers[0].answer(); // the job for the old position
      frames(renderer, ...inChunk(40, 0), 5);
      expect(meshesIn(renderer)).toHaveLength(0);
    });

    it('keeps the geometry count equal to the meshes in the scene after a long walk', () => {
      const { renderer, workers } = track(make({ renderDistance: 3, poolSize: 2 }));
      for (let step = 0; step < 40; step++) {
        const [x, z] = inChunk(step, step % 7);
        renderer.update(x, z, step);
        drain(workers, (cx, cz) => quadMesh(cx, cz, ['opaque', 'water']));
        frames(renderer, x, z, 20);
        const stats = renderer.getStats();
        expect(stats.geometries).toBe(meshesIn(renderer).length);
        expect(stats.geometries).toBe(stats.meshes);
      }
      // A disc of radius 3 plus the margin holds at most 49 chunks (radius 4 gives 49 cells), two buckets each.
      expect(renderer.getStats().geometries).toBeLessThanOrEqual(2 * 49);
    });
  });

  describe('uploading', () => {
    it('adds at most MAX_GEOMETRIES_PER_FRAME geometries per frame', () => {
      const { renderer, workers } = track(make({ renderDistance: 3, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers, (cx, cz) => quadMesh(cx, cz, ['opaque', 'cutout', 'water']));
      let last = renderer.getStats().geometries;
      expect(last).toBeLessThanOrEqual(MAX_GEOMETRIES_PER_FRAME);
      for (let i = 0; i < 30; i++) {
        renderer.update(...inChunk(0, 0), i);
        const now = renderer.getStats().geometries;
        expect(now - last).toBeLessThanOrEqual(MAX_GEOMETRIES_PER_FRAME);
        last = now;
      }
      expect(MAX_GEOMETRIES_PER_FRAME).toBe(2);
      expect(last).toBeGreaterThan(MAX_GEOMETRIES_PER_FRAME);
    });

    it('uploads the nearest finished chunk first', () => {
      const { renderer, workers } = track(make({ renderDistance: 4, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      const order: number[] = [];
      const seen = new Set<Mesh>();
      for (let i = 0; i < 400 && order.length < 20; i++) {
        renderer.update(...inChunk(0, 0), i);
        for (const mesh of meshesIn(renderer)) {
          if (seen.has(mesh)) continue;
          seen.add(mesh);
          order.push(Math.hypot((mesh.position.x + 0.5) / CHUNK_SIZE, (mesh.position.z + 0.5) / CHUNK_SIZE));
        }
      }
      expect(order.length).toBe(20);
      for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1] - 1e-9);
    });

    it('replaces a chunk\'s geometry when a better mesh arrives, and disposes the old one', () => {
      const { renderer, workers } = track(make({ renderDistance: 6, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      frames(renderer, ...inChunk(0, 0), 100);
      const target = meshesIn(renderer).find((m) => m.position.x === 5 * CHUNK_SIZE - 0.5 && m.position.z === -0.5)!;
      expect(target).toBeDefined();
      const oldGeometry = target.geometry;
      const disposed = vi.fn();
      oldGeometry.addEventListener('dispose', disposed);
      const before = renderer.getStats().geometries;

      renderer.update(...inChunk(4, 0), 1);
      drain(workers);
      frames(renderer, ...inChunk(4, 0), 60);
      expect(target.geometry).not.toBe(oldGeometry);
      expect(disposed).toHaveBeenCalledOnce();
      expect(meshesIn(renderer)).toContain(target);
      expect(renderer.getStats().geometries).toBe(renderer.getStats().meshes);
      expect(renderer.getStats().geometries).toBeGreaterThanOrEqual(before - 8); // unloads on the far side, but no leak
    });

    it('removes a mesh when its chunk comes back with that bucket empty', () => {
      const { renderer, workers } = track(make({ renderDistance: 6, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      drain(workers, (cx, cz) => quadMesh(cx, cz, ['opaque', 'water']));
      frames(renderer, ...inChunk(0, 0), 200);
      const at = (m: Mesh) => m.position.x === 5 * CHUNK_SIZE - 0.5 && m.position.z === -0.5;
      expect(meshesIn(renderer).filter(at)).toHaveLength(2);

      renderer.update(...inChunk(4, 0), 1);
      drain(workers, (cx, cz) => quadMesh(cx, cz, ['opaque']));
      frames(renderer, ...inChunk(4, 0), 100);
      expect(meshesIn(renderer).filter(at)).toHaveLength(1);
    });
  });

  describe('meshes', () => {
    const upload = (buckets: Array<'opaque' | 'cutout' | 'water'>) => {
      const ctx = track(make({ renderDistance: 1, poolSize: 1 }));
      ctx.renderer.update(...inChunk(3, -2), 0);
      drain(ctx.workers, (cx, cz) => quadMesh(cx, cz, buckets));
      frames(ctx.renderer, ...inChunk(3, -2), 60);
      return ctx;
    };

    it('places each chunk at its origin, half a block back, with chunk-local vertices', () => {
      const { renderer } = upload(['opaque']);
      const mesh = meshesIn(renderer).find((m) => m.position.x === 3 * CHUNK_SIZE - 0.5 && m.position.z === -2 * CHUNK_SIZE - 0.5)!;
      expect(mesh).toBeDefined();
      expect(mesh.position.y).toBe(-0.5);
      expect(mesh.matrixAutoUpdate).toBe(false);
      expect(mesh.matrix.elements[12]).toBe(3 * CHUNK_SIZE - 0.5);
      const positions = mesh.geometry.getAttribute('position');
      expect(positions.getX(0)).toBe(0); // still local, not shifted by the chunk's world position
    });

    it('sets the bounding sphere by hand so it covers the mesh', () => {
      const { renderer } = upload(['opaque']);
      for (const mesh of meshesIn(renderer)) {
        const sphere = mesh.geometry.boundingSphere!;
        expect(sphere).not.toBeNull();
        const p = mesh.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const d = Math.hypot(p.getX(i) - sphere.center.x, p.getY(i) - sphere.center.y, p.getZ(i) - sphere.center.z);
          expect(d).toBeLessThanOrEqual(sphere.radius + 1e-6);
        }
      }
    });

    it('computes a tight bounding sphere, with padding when asked', () => {
      const positions = new Float32Array([0, 0, 0, 4, 0, 0, 4, 6, 0, 0, 6, 0]);
      const sphere = boundingSphereOf(positions);
      expect(sphere.center.toArray()).toEqual([2, 3, 0]);
      expect(sphere.radius).toBeCloseTo(Math.hypot(4, 6) / 2);
      expect(boundingSphereOf(positions, 0.5).radius).toBeCloseTo(Math.hypot(4, 6) / 2 + 0.5);
      expect(boundingSphereOf(new Float32Array(0)).radius).toBe(0);
    });

    it('uses one shared material per bucket, whatever the chunk', () => {
      const { renderer } = upload(['opaque', 'cutout', 'water']);
      const meshes = meshesIn(renderer);
      expect(meshes.length).toBeGreaterThan(3);
      expect(new Set(meshes.map((m) => m.material)).size).toBe(3);

      const solid = meshes.filter((m) => !(m.material as MeshBasicMaterial).transparent);
      const water = meshes.filter((m) => (m.material as MeshBasicMaterial).transparent);
      const opaque = solid.filter((m) => (m.material as MeshBasicMaterial).alphaTest === 0);
      const cutout = solid.filter((m) => (m.material as MeshBasicMaterial).alphaTest > 0);
      for (const group of [opaque, cutout, water]) {
        expect(group.length).toBeGreaterThan(0);
        expect(new Set(group.map((m) => m.material)).size).toBe(1);
      }

      // Unlit materials: the light is baked into the vertices, so chunks read nothing from the scene's lights.
      for (const m of meshes) expect((m.material as MeshBasicMaterial).isMeshBasicMaterial).toBe(true);
      const o = opaque[0].material as MeshBasicMaterial;
      expect(o.vertexColors).toBe(false);
      expect(o.transparent).toBe(false);
      const c = cutout[0].material as MeshBasicMaterial;
      expect(c.alphaTest).toBe(0.5);
      const w = water[0].material as MeshBasicMaterial;
      expect(w.opacity).toBe(0.75);
    });

    it('reads sky light through one daylight uniform that setDaylight moves for every material', () => {
      const { renderer } = upload(['opaque', 'cutout', 'water']);
      const uniforms = new Set<{ value: unknown }>();
      const skyLights = new Set<{ value: unknown }>();
      for (const mesh of meshesIn(renderer)) {
        const shader = patchedShader();
        (mesh.material as MeshBasicMaterial).onBeforeCompile(shader as never, null as never);
        expect(shader.fragmentShader).toContain('uniform float uDaylight');
        expect(shader.fragmentShader).toContain('max( vec3( sky ) * uSkyLight, BLOCK_LIGHT_COLOR * block )');
        uniforms.add(shader.uniforms.uDaylight);
        skyLights.add(shader.uniforms.uSkyLight);
      }
      expect(uniforms.size).toBe(1);
      const daylight = [...uniforms][0];
      expect(daylight.value).toBe(1);
      renderer.setDaylight(0.25);
      expect(daylight.value).toBe(0.25);
      renderer.setDaylight(-3);
      expect(daylight.value).toBe(0);
      renderer.setDaylight(7);
      expect(daylight.value).toBe(1);

      // The colour of the sky light is shared the same way and starts neutral.
      expect(skyLights.size).toBe(1);
      const skyLight = [...skyLights][0].value as { x: number; y: number; z: number };
      expect([skyLight.x, skyLight.y, skyLight.z]).toEqual([1, 1, 1]);
      renderer.setSkyLightColor(0.5, 0.75, 1.1);
      expect([skyLight.x, skyLight.y, skyLight.z]).toEqual([0.5, 0.75, 1.1]);
    });

    it('does not rebuild any geometry when the daylight changes', () => {
      const { renderer } = upload(['opaque']);
      const before = renderer.getStats().geometries;
      const geometries = meshesIn(renderer).map((m) => m.geometry);
      renderer.setDaylight(0);
      frames(renderer, ...inChunk(3, -2), 5);
      renderer.setDaylight(1);
      frames(renderer, ...inChunk(3, -2), 5);
      expect(renderer.getStats().geometries).toBe(before);
      expect(meshesIn(renderer).map((m) => m.geometry)).toEqual(geometries);
    });

    it('gives each geometry the texture attributes the mesher wrote', () => {
      const { renderer } = upload(['opaque']);
      for (const mesh of meshesIn(renderer)) {
        const g = mesh.geometry;
        expect(g.getAttribute('bakedLight').itemSize).toBe(4);
        expect(g.getAttribute('bakedLight').count).toBe(g.getAttribute('position').count);
        expect(g.getAttribute('color')).toBeUndefined();
        expect(g.getAttribute('tint').itemSize).toBe(3);
        expect(g.getAttribute('uv').itemSize).toBe(2);
        expect(g.getAttribute('texLayer').itemSize).toBe(2);
        expect(g.getAttribute('tint').count).toBe(g.getAttribute('position').count);
        expect(g.getAttribute('uv').count).toBe(g.getAttribute('position').count);
        expect(g.getAttribute('texLayer').count).toBe(g.getAttribute('position').count);
      }
    });

    it('feeds every material the one texture array', () => {
      const { renderer } = upload(['opaque', 'cutout', 'water']);
      const textures = new Set<unknown>();
      for (const mesh of meshesIn(renderer)) {
        const shader = patchedShader();
        (mesh.material as MeshBasicMaterial).onBeforeCompile(shader as never, null as never);
        expect(shader.fragmentShader).toContain('textureGrad');
        expect(shader.vertexShader).toContain('attribute vec2 texLayer');
        textures.add(shader.uniforms.uBlockTextures.value);
      }
      expect(textures.size).toBe(1);
      expect([...textures][0]).toBeInstanceOf(DataArrayTexture);
    });

    it('builds the atlas itself unless given one, and only disposes its own', () => {
      const own = make({ renderDistance: 1, poolSize: 1 });
      const disposed = vi.fn();
      const texture = ((): DataArrayTexture => {
        const t = new DataArrayTexture(new Uint8Array(1024), 16, 16, 1);
        t.addEventListener('dispose', disposed);
        return t;
      })();
      const given = new ChunkRenderer({
        workerFactory: fakeWorkerFactory().factory, registerProbe: false, poolSize: 1,
        atlas: { texture, layout: null as never, layerOf: () => 0, dispose: () => texture.dispose() },
      });
      given.dispose();
      expect(disposed).not.toHaveBeenCalled();
      own.renderer.dispose();
    });

    it('moves the water wave into a vertex shader that reads the vertex world position and the water clock', () => {
      const { renderer } = upload(['water']);
      const water = meshesIn(renderer)[0].material as MeshBasicMaterial;
      const shader = patchedShader();
      water.onBeforeCompile(shader as never, null as never);
      expect(shader.vertexShader).toContain('uniform float uWaterTime');
      expect(shader.vertexShader).toContain('modelMatrix');
      expect(shader.vertexShader).not.toContain('instanceMatrix');
      expect(shader.vertexShader).not.toContain('USE_INSTANCING');
      expect(shader.vertexShader).toContain('vTexUv = uv'); // and still samples the water texture

      renderer.update(...inChunk(3, -2), 12.5);
      expect(shader.uniforms.uWaterTime.value).toBe(12.5);
    });
  });

  describe('living-world effects', () => {
    const upload = (buckets: Array<'opaque' | 'cutout' | 'water'>) => {
      const ctx = track(make({ renderDistance: 1, poolSize: 1 }));
      ctx.renderer.update(...inChunk(3, -2), 0);
      drain(ctx.workers, (cx, cz) => quadMesh(cx, cz, buckets));
      frames(ctx.renderer, ...inChunk(3, -2), 60);
      return ctx;
    };
    const shaderOf = (mesh: Mesh) => {
      const shader = patchedShader();
      (mesh.material as MeshBasicMaterial).onBeforeCompile(shader as never, null as never);
      return shader;
    };

    it('displaces opaque and cutout vertices by their sway weight from world position and the clock', () => {
      const { renderer } = upload(['opaque', 'cutout']);
      for (const mesh of meshesIn(renderer)) {
        const shader = shaderOf(mesh);
        expect(shader.vertexShader).toContain('attribute float sway');
        expect(shader.vertexShader).toContain('modelMatrix * vec4( position, 1.0 )');
        expect(shader.vertexShader).toContain('transformed.xz += windPush');
        expect(shader.vertexShader).toContain('uTime');
        // The light, the culling and the collision never see it: the baked light attribute is passed on untouched.
        expect(shader.vertexShader).toContain('vBakedLight = bakedLight');
      }
    });

    it('does not sway water, and gives it no sway code', () => {
      const { renderer } = upload(['water']);
      const shader = shaderOf(meshesIn(renderer)[0]);
      expect(shader.vertexShader).not.toContain('windPush');
      expect(shader.vertexShader).not.toContain('attribute float sway');
    });

    it('shares one switch, one wind and one clock between the opaque and cutout materials', () => {
      const { renderer } = upload(['opaque', 'cutout']);
      const shaders = meshesIn(renderer).map(shaderOf);
      expect(new Set(shaders.map((s) => s.uniforms.uSwayOn)).size).toBe(1);
      expect(new Set(shaders.map((s) => s.uniforms.uWind)).size).toBe(1);
      expect(new Set(shaders.map((s) => s.uniforms.uTime)).size).toBe(1);
    });

    it('switches the sway off and on without touching a mesh or a geometry', () => {
      const { renderer } = upload(['cutout']);
      const geometries = renderer.getStats().geometries;
      const shader = shaderOf(meshesIn(renderer)[0]);
      expect(renderer.isSwayEnabled()).toBe(true);
      expect(shader.uniforms.uSwayOn.value).toBe(1);
      renderer.setSwayEnabled(false);
      expect(renderer.isSwayEnabled()).toBe(false);
      expect(shader.uniforms.uSwayOn.value).toBe(0);
      renderer.setSwayEnabled(true);
      expect(shader.uniforms.uSwayOn.value).toBe(1);
      expect(renderer.getStats().geometries).toBe(geometries);
    });

    it('turns the wind slowly, as a unit vector', () => {
      const { renderer } = upload(['cutout']);
      const wind = shaderOf(meshesIn(renderer)[0]).uniforms.uWind.value as { x: number; y: number };
      const seen: Array<[number, number]> = [];
      for (const t of [0, 5, 20, 60, 200]) {
        renderer.update(...inChunk(3, -2), t);
        expect(Math.hypot(wind.x, wind.y)).toBeCloseTo(1, 6);
        seen.push([wind.x, wind.y]);
      }
      expect(new Set(seen.map(String)).size).toBeGreaterThan(1);
      // One second later it has hardly moved.
      renderer.update(...inChunk(3, -2), 10);
      const before = [wind.x, wind.y];
      renderer.update(...inChunk(3, -2), 11);
      expect(Math.hypot(wind.x - before[0], wind.y - before[1])).toBeLessThan(0.05);
    });

    it('gives only a bucket that has weights a sway attribute, and pads its bounds for the movement', () => {
      const ctx = track(make({ renderDistance: 1, poolSize: 1 }));
      ctx.renderer.update(...inChunk(3, -2), 0);
      drain(ctx.workers, (cx, cz) => {
        const m = quadMesh(cx, cz, ['opaque', 'cutout']);
        m.opaque.sway = new Float32Array(0); // nothing in it sways
        return m;
      });
      frames(ctx.renderer, ...inChunk(3, -2), 60);
      const [opaque, cutout] = meshesIn(ctx.renderer).filter((m) => m.geometry.getAttribute('position').count === 8);
      expect(opaque.geometry.getAttribute('sway')).toBeUndefined();
      expect(cutout.geometry.getAttribute('sway').count).toBe(8);
      expect(cutout.geometry.boundingSphere!.radius).toBeGreaterThan(opaque.geometry.boundingSphere!.radius + 0.3);
    });

    it('reads a missing sway attribute as zero', () => {
      const { renderer } = upload(['opaque']);
      const material = meshesIn(renderer)[0].material as unknown as { defaultAttributeValues: Record<string, number[]> };
      expect(material.defaultAttributeValues.sway).toEqual([0]);
    });

    it('flickers lamps in the vertex shader of the opaque and cutout materials, from a per-vertex weight and the clock', () => {
      const { renderer } = upload(['opaque', 'cutout']);
      for (const mesh of meshesIn(renderer)) {
        const shader = shaderOf(mesh);
        expect(shader.vertexShader).toContain('attribute float flicker');
        expect(shader.vertexShader).toContain('flameFlicker( uTime');
        expect(shader.vertexShader).toContain('uFlickerOn');
        // One multiplier, written per vertex: the fragment shader applies it to block light and the glow boost, and never to the baked
        // attribute itself, so nothing is re-meshed.
        expect(shader.vertexShader).toContain('vBakedLight = bakedLight');
        expect(shader.fragmentShader).toContain('varying float vFlicker');
        expect(shader.fragmentShader).toMatch(/pow\( max\( vBakedLight\.y, vBakedLight\.w \), LIGHT_CURVE \) \* vFlicker/);
      }
    });

    it('gives water no flicker code and leaves its light steady', () => {
      const { renderer } = upload(['water']);
      const shader = shaderOf(meshesIn(renderer)[0]);
      expect(shader.vertexShader).not.toContain('attribute float flicker');
      expect(shader.vertexShader).not.toContain('flameFlicker');
      expect(shader.vertexShader).toContain('vFlicker = 1.0');
    });

    it('shares one flicker switch, which setFlickerEnabled flips without touching a mesh or a geometry', () => {
      const { renderer } = upload(['opaque', 'cutout']);
      const geometries = renderer.getStats().geometries;
      const shaders = meshesIn(renderer).map(shaderOf);
      expect(new Set(shaders.map((s) => s.uniforms.uFlickerOn)).size).toBe(1);
      expect(renderer.isFlickerEnabled()).toBe(true);
      expect(shaders[0].uniforms.uFlickerOn.value).toBe(1);
      renderer.setFlickerEnabled(false);
      expect(renderer.isFlickerEnabled()).toBe(false);
      expect(shaders[0].uniforms.uFlickerOn.value).toBe(0);
      renderer.setFlickerEnabled(true);
      expect(shaders[1].uniforms.uFlickerOn.value).toBe(1);
      expect(renderer.getStats().geometries).toBe(geometries);
    });

    it('gives only a bucket that has flicker weights the attribute, and reads a missing one as zero', () => {
      const ctx = track(make({ renderDistance: 1, poolSize: 1 }));
      ctx.renderer.update(...inChunk(3, -2), 0);
      drain(ctx.workers, (cx, cz) => {
        const m = quadMesh(cx, cz, ['opaque', 'cutout']);
        m.cutout.flicker = new Float32Array(8).fill(0.5);
        return m;
      });
      frames(ctx.renderer, ...inChunk(3, -2), 60);
      const [opaque, cutout] = meshesIn(ctx.renderer).filter((m) => m.geometry.getAttribute('position').count === 8);
      expect(opaque.geometry.getAttribute('flicker')).toBeUndefined();
      expect(cutout.geometry.getAttribute('flicker').count).toBe(8);
      const material = opaque.material as unknown as { defaultAttributeValues: Record<string, number[]> };
      expect(material.defaultAttributeValues.flicker).toEqual([0]);
    });

    it('drives the water by its own clock, which stops and flattens the wave when the animation is off', () => {
      const { renderer } = upload(['water']);
      const shader = shaderOf(meshesIn(renderer)[0]);
      renderer.update(...inChunk(3, -2), 30);
      expect(renderer.isWaterAnimated()).toBe(true);
      expect(shader.uniforms.uWaterTime.value).toBe(30);
      expect(shader.uniforms.uWaterOn.value).toBe(1);
      renderer.setWaterAnimated(false);
      expect(renderer.isWaterAnimated()).toBe(false);
      expect(shader.uniforms.uWaterOn.value).toBe(0);
      expect(shader.uniforms.uWaterTime.value).toBe(0);
      renderer.update(...inChunk(3, -2), 45);
      expect(shader.uniforms.uWaterTime.value).toBe(0); // still frozen
      renderer.setWaterAnimated(true);
      renderer.update(...inChunk(3, -2), 46);
      expect(shader.uniforms.uWaterTime.value).toBe(46);
    });

    it('shades water from depth and shoreline in its tint channel, flows it by world position, and still lights it', () => {
      const { renderer } = upload(['water']);
      const shader = shaderOf(meshesIn(renderer)[0]);
      expect(shader.fragmentShader).toContain('vTint.x'); // depth
      expect(shader.fragmentShader).toContain('vTint.y'); // shoreline
      expect(shader.fragmentShader).toContain('uWaterTime');
      expect(shader.fragmentShader).toContain('bakedLighting()');
      expect(shader.fragmentShader).toContain('textureGrad');
    });
  });

  describe('effect sites', () => {
    const withSites = (cx: number, cz: number): MeshData => {
      const m = quadMesh(cx, cz, ['opaque']);
      m.sites = [new Int32Array(0), new Int32Array(0), Int32Array.from([cx * 32 + 1, 5, cz * 32 + 2, 200]), new Int32Array(0), new Int32Array(0)];
      return m;
    };

    it('hands the sites of a chunk to the store as soon as its mesh arrives, and takes them back when the chunk is dropped', () => {
      const sites = new SiteStore();
      const { factory, workers } = fakeWorkerFactory();
      const renderer = new ChunkRenderer({ workerFactory: factory, registerProbe: false, renderDistance: 1, poolSize: 1, sites });
      renderers.push(renderer);
      renderer.update(...inChunk(0, 0), 0);
      drain(workers, withSites);
      expect(sites.size).toBeGreaterThan(0);
      sites.refresh(16, 16);
      expect(sites.nearTotals[2]).toBe(sites.size);
      // Walk far enough that the first chunks fall out of range: their sites go with them.
      frames(renderer, ...inChunk(0, 0), 5);
      renderer.update(...inChunk(40, 0), 1);
      drain(workers, withSites);
      expect(sites.get(0, 0)).toBeUndefined();
      expect(sites.get(40, 0)).toBeDefined();
    });

    it('empties the store of its chunks on dispose, and works without one', () => {
      const sites = new SiteStore();
      const { factory, workers } = fakeWorkerFactory();
      const renderer = new ChunkRenderer({ workerFactory: factory, registerProbe: false, renderDistance: 1, poolSize: 1, sites });
      renderer.update(...inChunk(0, 0), 0);
      drain(workers, withSites);
      expect(sites.size).toBeGreaterThan(0);
      renderer.dispose();
      expect(sites.size).toBe(0);
      const plain = track(make({ renderDistance: 1, poolSize: 1 }));
      plain.renderer.update(...inChunk(0, 0), 0);
      expect(() => drain(plain.workers, withSites)).not.toThrow();
    });

    it('ignores a mesh that carries no sites', () => {
      const sites = new SiteStore();
      const { factory, workers } = fakeWorkerFactory();
      const renderer = new ChunkRenderer({ workerFactory: factory, registerProbe: false, renderDistance: 1, poolSize: 1, sites });
      renderers.push(renderer);
      renderer.update(...inChunk(0, 0), 0);
      drain(workers); // quadMesh has `sites: []`
      expect(sites.size).toBe(0);
    });
  });

  describe('stats and readiness', () => {
    it('counts chunks, meshes, geometries and pending work', () => {
      const { renderer, workers } = track(make({ renderDistance: 2, poolSize: 1 }));
      renderer.update(...inChunk(0, 0), 0);
      let stats = renderer.getStats();
      expect(stats.chunks).toBe(13); // a disc of radius 2
      expect(stats.pending).toBe(13);
      expect(stats.meshes).toBe(0);

      drain(workers);
      frames(renderer, ...inChunk(0, 0), 100);
      stats = renderer.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.meshes).toBe(13);
      expect(stats.geometries).toBe(13);
    });

    it('registers the world probe, which is ready once everything is built and quiet, and unregisters on dispose', () => {
      vi.useFakeTimers();
      try {
        const { factory, workers } = fakeWorkerFactory();
        const renderer = new ChunkRenderer({ renderDistance: 2, workerFactory: factory, poolSize: 1 });
        const probe = getWorldProbe()!;
        expect(probe).not.toBeNull();
        expect(probe.isReady()).toBe(false); // nothing has started

        renderer.update(...inChunk(0, 0), 0);
        expect(probe.isReady()).toBe(false); // jobs pending
        drain(workers);
        frames(renderer, ...inChunk(0, 0), 100);
        expect(probe.isReady()).toBe(false); // just finished: wait for it to settle
        vi.advanceTimersByTime(1500);
        expect(probe.isReady()).toBe(true);
        expect(probe.getStats!().chunks).toBe(13);

        renderer.dispose();
        expect(getWorldProbe()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('dispose', () => {
    it('disposes every geometry and both materials and stops the workers', () => {
      const { renderer, workers } = make({ renderDistance: 2, poolSize: 2 });
      renderer.update(...inChunk(0, 0), 0);
      drain(workers);
      frames(renderer, ...inChunk(0, 0), 100);
      const solid = meshesIn(renderer)[0].material as MeshBasicMaterial;
      const onSolid = vi.fn();
      solid.addEventListener('dispose', onSolid);
      expect(renderer.getStats().geometries).toBe(13);

      renderer.dispose();
      expect(renderer.getStats().geometries).toBe(0);
      expect(meshesIn(renderer)).toHaveLength(0);
      expect(onSolid).toHaveBeenCalledOnce();
      expect(workers.every((w) => w.terminated)).toBe(true);
    });

    it('ignores updates afterwards', () => {
      const { renderer, workers } = make({ renderDistance: 2, poolSize: 1 });
      renderer.dispose();
      renderer.update(...inChunk(0, 0), 0);
      expect(workers[0].posted).toHaveLength(0);
    });
  });
});
