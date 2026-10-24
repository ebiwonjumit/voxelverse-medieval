// Prints a kit's blueprint layer by layer as characters, for reading a building without a browser:
//   npx vite-node tools/dump-kit.ts -- townhouse 0 [seed] [w] [d] [floors] [layers y0-y1]
import { createDefaultRegistry } from '../content/blocks';
import { cellId } from '../engine/cell';
import { NO_CELL } from '../worldgen/structures/Blueprint';
import { buildWithKit } from '../worldgen/structures/BuildingKit';
import { Lot } from '../worldgen/structures/Lot';
import { registerTempestKits } from '../worldgen/kits/tempest';
import { KitRegistry } from '../worldgen/structures/KitRegistry';
import { TEMPEST_STYLE } from '../worldgen/tempest/style';

const args = process.argv.slice(2).filter((a) => a !== '--');
const [name, variantArg, seedArg, wArg, dArg, floorsArg, layerArg] = args;
const registry = createDefaultRegistry();
const kits = registerTempestKits(new KitRegistry(), TEMPEST_STYLE);
const kit = kits.get(name);
if (!kit) throw new Error(`no kit ${name}: ${kits.kits.map((k) => k.name).join(', ')}`);
const variant = Number(variantArg ?? 0);
const size = kit.preferredSize(variant);
const lot = new Lot({
  id: 'dump', x: 0, z: 0, w: Number(wArg) || size.frontage, d: Number(dArg) || size.depth, facing: 2, district: 'residential',
  seed: Number(seedArg ?? 1), floors: Number(floorsArg) || size.floors, family: process.env.FAMILY ?? 'timber-terracotta',
});
const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
const bounds = bp.bounds()!;
const names = new Map<number, string>();
const chars = new Map<number, string>();
const used = new Set<string>();
const charFor = (id: number): string => {
  if (chars.has(id)) return chars.get(id)!;
  const n = registry.get(id).name.replace('voxelverse:', '');
  names.set(id, n);
  let c = n[0].toUpperCase();
  for (const cand of [n[0], n[0].toUpperCase(), ...n.replace(/[^a-z]/g, '').split(''), ...'0123456789!@#$%&*+=?~'.split('')]) {
    if (!used.has(cand)) { c = cand; break; }
  }
  used.add(c);
  chars.set(id, c);
  return c;
};
let y0 = bounds.minY;
let y1 = bounds.maxY;
if (layerArg) { const [a, b] = layerArg.split('-').map(Number); y0 = a; y1 = b ?? a; }
console.log(`${name} #${variant} ${lot.frontage}x${lot.depth} blocks ${bp.size} bounds ${JSON.stringify(bounds)} hash ${bp.hash()}`);
for (let y = y1; y >= y0; y--) {
  console.log(`--- y=${y}`);
  for (let z = 0; z < lot.depth; z++) {
    let row = '';
    for (let x = 0; x < lot.frontage; x++) {
      const c = bp.get(x, y, z);
      row += c === NO_CELL ? '.' : cellId(c) === 0 ? ' ' : charFor(cellId(c));
    }
    console.log(row);
  }
}
console.log([...chars.entries()].map(([id, c]) => `${c}=${names.get(id)}`).join('  '));
