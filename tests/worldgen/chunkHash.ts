import { Chunk } from '../../engine/Chunk';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { WorldGenerator } from '../../engine/WorldGenerator';

// FNV-1a over every cell of a freshly generated chunk, so two runs can be compared with one number.
export const chunkHash = (gen: WorldGenerator, cx: number, cz: number): number => {
  const chunk = new Chunk(cx, cz);
  gen.generateChunk(chunk);
  let h = 2166136261;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) h = Math.imul(h ^ chunk.getCell(lx, y, lz), 16777619);
    }
  }
  return h >>> 0;
};
