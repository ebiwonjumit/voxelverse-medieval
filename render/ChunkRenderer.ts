import {
  BufferAttribute, BufferGeometry, Group, Material, Mesh, MeshStandardMaterial, Sphere, Vector3,
} from 'three';
import { ChunkStore } from '../engine/ChunkStore';
import { BUCKET_NAMES, BucketData, MeshData } from '../meshing/ChunkMesher';
import { MeshWorkerPool, WorkerFactory, defaultPoolSize } from '../meshing/MeshWorkerPool';
import { registerWorldProbe } from '../bench/worldProbe';
import { CHUNK_SIZE, LodLevel, RENDER_DISTANCE } from '../worldConstants';
import { createMeshWorker } from './createMeshWorker';

// Chunks this close to the player (in chunks) are built with full detail, the rest without small decorations.
export const HIGH_LOD_DISTANCE = 2;

// Chunks stay loaded this far past the render distance before they are dropped, so walking back and forth
// over a border does not rebuild the same chunk over and over.
export const UNLOAD_MARGIN = 1;

// Geometries handed to the GPU per frame. Three uploads a geometry the first time it is drawn, so
// limiting how many get added limits the upload work in any one frame.
export const MAX_GEOMETRIES_PER_FRAME = 2;

// Readiness for ?shot mode: nothing has been requested or uploaded for this long.
const READY_QUIET_MS = 1000;

// The mesher's coordinates put a block at (x, y, z) in the cube from (x, y, z) to (x + 1, y + 1, z + 1).
// The old renderer centred cubes on whole numbers, so every chunk sits half a block back.
const CHUNK_OFFSET = -0.5;

// Water moves up and down by at most 0.2 + 0.15 in the wave shader.
const WAVE_PAD = 0.4;

type BucketName = (typeof BUCKET_NAMES)[number];

interface ChunkEntry {
  cx: number;
  cz: number;
  lod: LodLevel | null;          // detail of the geometry on screen, null until the first mesh arrives
  requested: LodLevel | null;    // detail asked for and not yet on screen, null when none
  meshes: Partial<Record<BucketName, Mesh>>;
}

interface UploadItem {
  mesh: MeshData;
  lod: LodLevel;
  next: number; // index into BUCKET_NAMES of the next bucket to apply
}

export interface ChunkRendererStats {
  chunks: number;          // chunks tracked: loaded, or waiting for their mesh
  meshes: number;          // meshes in the scene
  geometries: number;      // geometries created and not yet disposed
  pending: number;         // jobs not finished plus meshes waiting for upload
}

export interface ChunkRendererOptions {
  renderDistance?: number;
  workerFactory?: WorkerFactory;
  poolSize?: number;
  // Tests turn this off so they do not fight over the one registered probe.
  registerProbe?: boolean;
}

// Centre and radius that hold every vertex of a bucket. Chunk-local, so it moves with the mesh.
export const boundingSphereOf = (positions: Float32Array, pad = 0): Sphere => {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (minX > maxX) return new Sphere(new Vector3(), 0);
  const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + pad;
  return new Sphere(center, radius);
};

// Draws the world as one mesh per bucket per chunk, built in workers. It keeps the chunks inside the
// render distance, asks for the nearest first, drops the ones that fall behind and frees their GPU memory.
export class ChunkRenderer {
  readonly group = new Group();

  private readonly renderDistance: number;
  private readonly pool: MeshWorkerPool;
  private readonly chunks = new Map<number, ChunkEntry>();
  private readonly uploads = new Map<number, UploadItem>();
  private readonly unregisterProbe: (() => void) | null;

  // One material for everything solid. Opaque and cutout buckets both use it.
  private readonly solidMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
  private readonly waterMaterial = new MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.8, flatShading: true,
  });
  private readonly timeUniform = { value: 0 };

  private playerCx = 0;
  private playerCz = 0;
  private started = false;
  private dirty = true;
  private geometryCount = 0;
  private lastActivityAt = 0;
  private disposed = false;

  constructor(options: ChunkRendererOptions = {}) {
    this.renderDistance = options.renderDistance ?? RENDER_DISTANCE;
    this.group.name = 'chunks';
    this.configureWater();

    const factory = options.workerFactory ?? createMeshWorker;
    const size = options.poolSize ?? defaultPoolSize(typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency);
    this.pool = new MeshWorkerPool(factory, {
      onResult: (mesh, lod) => this.receive(mesh, lod),
      onError: (cx, cz, message) => this.fail(cx, cz, message),
    }, size);

    this.unregisterProbe = options.registerProbe === false ? null : registerWorldProbe({
      isReady: () => this.isReady(),
      getStats: () => ({ ...this.getStats() }),
    });
  }

  getStats(): ChunkRendererStats {
    let meshes = 0;
    for (const entry of this.chunks.values()) {
      for (const name of BUCKET_NAMES) if (entry.meshes[name]) meshes++;
    }
    return {
      chunks: this.chunks.size,
      meshes,
      geometries: this.geometryCount,
      pending: this.pool.pending + this.uploads.size,
    };
  }

  // True once the world around the player has been requested, built and uploaded and nothing has changed for a moment.
  isReady(): boolean {
    if (!this.started || this.pool.pending > 0 || this.uploads.size > 0) return false;
    return performance.now() - this.lastActivityAt >= READY_QUIET_MS;
  }

  // Called every frame with the camera's block position and the clock in seconds.
  update(x: number, z: number, time: number): void {
    if (this.disposed) return;
    this.timeUniform.value = time;

    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    if (!this.started || cx !== this.playerCx || cz !== this.playerCz) {
      this.started = true;
      this.playerCx = cx;
      this.playerCz = cz;
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.pool.setPlayerChunk(cx, cz);
      this.unloadFar();
      this.requestNear();
    }
    this.upload();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unregisterProbe?.();
    this.pool.dispose();
    for (const entry of this.chunks.values()) this.removeMeshes(entry);
    this.chunks.clear();
    this.uploads.clear();
    this.group.clear();
    this.solidMaterial.dispose();
    this.waterMaterial.dispose();
  }

  private distance(cx: number, cz: number): number {
    return Math.hypot(cx - this.playerCx, cz - this.playerCz);
  }

  private lodFor(cx: number, cz: number): LodLevel {
    return this.distance(cx, cz) <= HIGH_LOD_DISTANCE ? LodLevel.HIGH : LodLevel.LOW;
  }

  private unloadFar(): void {
    const keep = this.renderDistance + UNLOAD_MARGIN;
    for (const [key, entry] of this.chunks) {
      if (this.distance(entry.cx, entry.cz) <= keep) continue;
      this.pool.cancel(entry.cx, entry.cz);
      this.uploads.delete(key);
      this.removeMeshes(entry);
      this.chunks.delete(key);
      this.lastActivityAt = performance.now();
    }
  }

  private requestNear(): void {
    const r = this.renderDistance;
    const wanted: Array<{ cx: number; cz: number; dist: number }> = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const dist = Math.hypot(dx, dz);
        if (dist <= r) wanted.push({ cx: this.playerCx + dx, cz: this.playerCz + dz, dist });
      }
    }
    wanted.sort((a, b) => a.dist - b.dist);

    for (const { cx, cz } of wanted) {
      const key = ChunkStore.keyOf(cx, cz);
      const lod = this.lodFor(cx, cz);
      let entry = this.chunks.get(key);
      if (!entry) {
        entry = { cx, cz, lod: null, requested: null, meshes: {} };
        this.chunks.set(key, entry);
      } else if ((entry.requested ?? entry.lod) !== LodLevel.LOW || lod !== LodLevel.HIGH) {
        continue; // already asked for, and the only change worth a rebuild is low detail turning high
      }
      entry.requested = lod;
      this.pool.request(cx, cz, lod);
      this.lastActivityAt = performance.now();
    }
  }

  private receive(mesh: MeshData, lod: LodLevel): void {
    const key = ChunkStore.keyOf(mesh.cx, mesh.cz);
    const entry = this.chunks.get(key);
    if (!entry) return; // unloaded while the worker was busy
    this.uploads.set(key, { mesh, lod, next: 0 });
    this.lastActivityAt = performance.now();
  }

  private fail(cx: number, cz: number, message: string): void {
    console.error(`Chunk (${cx}, ${cz}) failed to mesh: ${message}`);
    const entry = this.chunks.get(ChunkStore.keyOf(cx, cz));
    if (!entry) return;
    entry.requested = null;
    if (entry.lod === null) this.chunks.delete(ChunkStore.keyOf(cx, cz)); // asked for again on the next chunk change
  }

  // Applies at most MAX_GEOMETRIES_PER_FRAME buckets, nearest chunk first. Replacing or removing a bucket
  // that already has a mesh costs nothing but the old geometry's disposal, so only new geometries count.
  private upload(): void {
    let budget = MAX_GEOMETRIES_PER_FRAME;
    while (budget > 0 && this.uploads.size > 0) {
      let bestKey = 0;
      let bestDist = Infinity;
      for (const [key, item] of this.uploads) {
        const d = this.distance(item.mesh.cx, item.mesh.cz);
        if (d < bestDist) {
          bestDist = d;
          bestKey = key;
        }
      }
      const item = this.uploads.get(bestKey)!;
      const entry = this.chunks.get(bestKey);
      if (!entry) {
        this.uploads.delete(bestKey);
        continue;
      }

      while (item.next < BUCKET_NAMES.length && budget > 0) {
        const name = BUCKET_NAMES[item.next++];
        if (this.applyBucket(entry, name, item.mesh[name])) budget--;
      }
      if (item.next >= BUCKET_NAMES.length) {
        entry.lod = item.lod;
        // A newer request for more detail may still be on its way, and stays marked.
        if (entry.requested === item.lod) entry.requested = null;
        this.uploads.delete(bestKey);
      }
      this.lastActivityAt = performance.now();
    }
  }

  // Returns true when a geometry was created.
  private applyBucket(entry: ChunkEntry, name: BucketName, data: BucketData): boolean {
    const old = entry.meshes[name];
    if (data.indices.length === 0) {
      if (old) this.removeMesh(entry, name, old);
      return false;
    }

    const geometry = this.buildGeometry(data, name === 'water' ? WAVE_PAD : 0);
    if (old) {
      this.disposeGeometry(old.geometry);
      old.geometry = geometry;
      return true;
    }

    const mesh = new Mesh(geometry, name === 'water' ? this.waterMaterial : this.solidMaterial);
    mesh.position.set(entry.cx * CHUNK_SIZE + CHUNK_OFFSET, CHUNK_OFFSET, entry.cz * CHUNK_SIZE + CHUNK_OFFSET);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    entry.meshes[name] = mesh;
    this.group.add(mesh);
    return true;
  }

  private buildGeometry(data: BucketData, pad: number): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
    geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    // Set by hand: the default would scan the positions again the first time the mesh is culled.
    geometry.boundingSphere = boundingSphereOf(data.positions, pad);
    this.geometryCount++;
    return geometry;
  }

  private disposeGeometry(geometry: BufferGeometry): void {
    geometry.dispose();
    this.geometryCount--;
  }

  private removeMesh(entry: ChunkEntry, name: BucketName, mesh: Mesh): void {
    this.group.remove(mesh);
    this.disposeGeometry(mesh.geometry);
    delete entry.meshes[name];
  }

  private removeMeshes(entry: ChunkEntry): void {
    for (const name of BUCKET_NAMES) {
      const mesh = entry.meshes[name];
      if (mesh) this.removeMesh(entry, name, mesh);
    }
  }

  // The wave used to read each instance's position. Chunk meshes have no instances, so it now reads the
  // vertex's world position, which also keeps neighbouring water faces moving together.
  private configureWater(): void {
    const material: Material = this.waterMaterial;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `
        vec3 transformed = vec3( position );
        vec4 waveOrigin = modelMatrix * vec4( position, 1.0 );
        transformed.y += sin( waveOrigin.x * 0.5 + uTime ) * 0.2 + cos( waveOrigin.z * 0.4 + uTime * 1.2 ) * 0.15;
        `,
      );
    };
  }
}
