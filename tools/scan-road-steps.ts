import { createDefaultRegistry } from '../content/blocks';
import { createVoxelverseGenerator } from '../worldgen/VoxelverseGenerator';

// Scans a corridor round every vertex of every road for any 4-neighbour height step above a limit.
const gen = createVoxelverseGenerator(createDefaultRegistry());
const R = 24;
const bad: string[] = [];
let worst = 0;
for (const e of gen.roads.edges) {
  const seen = new Set<string>();
  for (let i = 0; i < e.x.length; i++) {
    const cx = Math.round(e.x[i]), cz = Math.round(e.z[i]);
    for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) {
      const k = `${x},${z}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const h = gen.terrainHeight(x, z);
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const d = Math.abs(h - gen.terrainHeight(x + dx, z + dz));
        if (d > worst) worst = d;
        if (d > 2) bad.push(`${e.name} ${x},${z} +${dx}${dz} step ${d} (v${i} bridge=${e.bridge[i]})`);
      }
    }
  }
}
console.log('worst', worst, 'count', bad.length);
console.log(bad.slice(0, 30).join('\n'));
