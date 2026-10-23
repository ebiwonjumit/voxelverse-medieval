import { describe, expect, it } from 'vitest';
import {
  FACING_NAMES, buildHouse, layoutModels, modelKind, parseModelSandbox, statesOf,
} from '../components/sandbox/modelsLayout';
import { CameraPose, defaultCamera, meshStage, parseSandbox } from '../components/sandbox/sandboxLayout';
import { createDefaultRegistry } from '../content/blocks';
import { createDefaultTextureLayout } from '../content/textures/layout';
import { cellId } from '../engine/cell';
import { SLAB_TOP, stairState } from '../engine/models';
import { Box } from '../engine/models/BlockModel';
import { BlockDef } from '../engine/BlockRegistry';
import { meshTriangleCount } from '../meshing/ChunkMesher';

const registry = createDefaultRegistry();
const textureLayout = createDefaultTextureLayout(registry);
const idOf = (name: string): number => registry.byName(`voxelverse:${name}`).id;

describe('parseModelSandbox', () => {
  it('is selected by sandbox=models and nothing else, and does not steal the blocks page', () => {
    expect(parseModelSandbox('')).toBeNull();
    expect(parseModelSandbox('?sandbox=blocks')).toBeNull();
    expect(parseModelSandbox('?bench')).toBeNull();
    expect(parseSandbox('?sandbox=models')).toBeNull();
    expect(parseModelSandbox('?sandbox=models')).toEqual({ view: 'all', cam: null });
  });

  it('reads the view and an explicit camera, and ignores a view it does not know', () => {
    expect(parseModelSandbox('?sandbox=models&view=close')?.view).toBe('close');
    expect(parseModelSandbox('?sandbox=models&view=joins')?.view).toBe('joins');
    expect(parseModelSandbox('?sandbox=models&view=house')?.view).toBe('house');
    expect(parseModelSandbox('?sandbox=models&view=nothing')?.view).toBe('all');
    expect(parseModelSandbox('?sandbox=models&cam=1,2,3,4,5,6')?.cam).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
    expect(parseModelSandbox('?sandbox=models&cam=1,2,3')?.cam).toBeNull();
  });
});

describe('modelKind', () => {
  it('names the model of every shaped block, by class', () => {
    const kinds = (names: string[]) => names.map((n) => modelKind(registry.model(idOf(n))));
    expect(kinds(['stone_brick_stairs', 'red_roof_stairs'])).toEqual(['stairs', 'stairs']);
    expect(kinds(['stone_brick_slab', 'blue_roof_slab'])).toEqual(['slab', 'slab']);
    expect(kinds(['wood_fence', 'glass_pane'])).toEqual(['fence', 'pane']);
    expect(kinds(['flower_red', 'tall_grass', 'sugarcane'])).toEqual(['cross', 'cross', 'cross']);
    expect(kinds(['wheat', 'wheat_stage_2'])).toEqual(['crop', 'crop']);
    expect(kinds(['lantern', 'small_rock', 'farmland'])).toEqual(['box', 'box', 'box']);
    expect(kinds(['lily_pad'])).toEqual(['plate']);
    expect(kinds(['stone', 'glass'])).toEqual(['cube', 'cube']);
  });

  it('counts the looks a state byte can make', () => {
    expect(statesOf('stairs')).toHaveLength(8);
    expect(statesOf('slab')).toHaveLength(2);
    expect(statesOf('fence')).toEqual([0]);
  });
});

const modelBlocks = (): BlockDef[] => registry.all().filter((d) => d.id !== 0 && d.model && !d.model.isFullCube);

describe('layoutModels', () => {
  const layout = layoutModels(registry, 'all');
  const cellsAt = (id: number) => layout.stages[0].blocks.filter((b) => b.id === id);

  it('shows every block that has a model, so blocks other branches give one appear by themselves', () => {
    for (const def of modelBlocks()) {
      expect(cellsAt(def.id).length, def.name).toBeGreaterThan(0);
    }
  });

  it('shows every stair block in all 8 states and every slab block in both', () => {
    // Read from the sections, not the stage, since the house uses some of these blocks too.
    const shown = layout.sections.flatMap((section) => section.cells.flatMap((cell) => cell.blocks));
    for (const def of modelBlocks()) {
      const kind = modelKind(def.model!);
      if (kind !== 'stairs' && kind !== 'slab') continue;
      const states = shown.filter((b) => b.id === def.id).map((b) => b.state ?? 0).sort();
      expect(states, def.name).toEqual(statesOf(kind));
    }
  });

  it('labels each state with the facing and half its model gives it', () => {
    const stairId = idOf('stone_brick_stairs');
    const model = registry.model(stairId);
    const tall = (state: number): Box => {
      // The back is the tall box: the one that reaches the top (or the bottom, upside down) of the cell.
      const boxes = model.collisionBoxes(state);
      return boxes.reduce((a, b) => (b[4] - b[1] > a[4] - a[1] ? b : a));
    };
    for (let state = 0; state < 8; state++) {
      const text = `${FACING_NAMES[state & 3]}${state & 4 ? ' \u25BC' : ''}`;
      const label = layout.labels.find((l) => l.text === text && l.sub === `${state === 0 ? `#${stairId} ` : ''}s${state}`);
      expect(label, text).toBeDefined();
      // The tall back lies on the side the label says: north is -z, east +x, south +z, west -x.
      const box = tall(state);
      const centre = [(box[0] + box[3]) / 2, (box[2] + box[5]) / 2];
      const expected = [[0.5, 0.25], [0.75, 0.5], [0.5, 0.75], [0.25, 0.5]][state & 3];
      expect(centre).toEqual(expected);
    }
    for (const state of [0, SLAB_TOP]) {
      const slab = idOf('wood_plank_slab');
      const box = registry.model(slab).collisionBoxes(state)[0];
      expect(box[1]).toBe(state === SLAB_TOP ? 0.5 : 0);
      expect(layout.labels.some((l) => l.text === (state ? 'top' : 'bottom') && l.sub === `${state ? '' : `#${slab} `}s${state}`)).toBe(true);
    }
  });

  it('puts every block in its own cell, labels every cell and keeps sections apart', () => {
    const seen = new Set<string>();
    for (const b of layout.stages[0].blocks) {
      const key = `${b.x},${b.y},${b.z}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      // Sections sit on the block grid; a fractional position would put the block in no cell at all.
      expect([b.x, b.y, b.z].every(Number.isInteger), key).toBe(true);
      expect(b.state ?? 0).toBeGreaterThanOrEqual(0);
      expect(b.state ?? 0).toBeLessThanOrEqual(15);
    }
    // Every cell has a caption, and each section and the house a heading.
    expect(layout.labels.filter((l) => l.heading).length).toBeGreaterThanOrEqual(6);
    expect(layout.cells).toBe(layout.labels.filter((l) => !l.heading).length + 1);
  });

  it('shows how fences and panes join, including what they refuse', () => {
    const fence = idOf('wood_fence');
    const pane = idOf('glass_pane');
    const stone = idOf('stone_brick');
    const glass = idOf('glass');
    // The joins view has no house, which uses fences and glass panes of its own.
    const close = layoutModels(registry, 'joins');
    const blocks = close.stages[0].blocks;
    for (const text of ['alone', 'pair', 'line', 'corner', 'T', 'cross', 'stone', 'glass']) {
      expect(close.labels.filter((l) => l.text === text)).toHaveLength(2);
    }
    expect(blocks.filter((b) => b.id === fence)).toHaveLength(1 + 2 + 3 + 3 + 4 + 5 + 1 + 1);
    expect(blocks.filter((b) => b.id === pane)).toHaveLength(1 + 2 + 3 + 3 + 4 + 5 + 1 + 1);
    expect(blocks.filter((b) => b.id === stone)).toHaveLength(2);
    expect(blocks.filter((b) => b.id === glass)).toHaveLength(2);
  });

  it('makes a close view smaller than the whole page, and a house view of the house alone', () => {
    const close = layoutModels(registry, 'close');
    const house = layoutModels(registry, 'house');
    expect(close.stages[0].blocks.length).toBeLessThan(layout.stages[0].blocks.length);
    const stairBlocks = close.stages[0].blocks.filter((b) => modelKind(registry.model(b.id)) === 'stairs');
    expect(new Set(stairBlocks.map((b) => b.id)).size).toBe(1);
    expect(stairBlocks).toHaveLength(8);
    const joins = layoutModels(registry, 'joins');
    expect(joins.sections.map((section) => section.title.split(':')[0])).toEqual(['fence', 'pane']);
    expect(house.stages[0].blocks.length).toBe(buildHouse(registry).blocks.length);
    expect(house.height).toBeGreaterThan(5);
  });

  it('is built from the registry: a block with a model added later shows up with its own caption', () => {
    const extended = createDefaultRegistry();
    extended.register({
      id: 3999, name: 'test:stairs_again', color: '#808080', solid: true, opaque: true, emits: 0,
      model: registry.model(idOf('stone_brick_stairs')),
    });
    const l = layoutModels(extended, 'all');
    expect(l.stages[0].blocks.filter((b) => b.id === 3999)).toHaveLength(8);
    expect(l.cells).toBe(layout.cells + 8);
  });
});

describe('meshing the models page', () => {
  it('draws every cell with real tiles, not the unknown block colour', () => {
    const l = layoutModels(registry, 'all');
    const names = new Set<string>();
    let triangles = 0;
    for (const { mesh } of meshStage(l.stages[0], registry, textureLayout)) {
      triangles += meshTriangleCount(mesh);
      for (const bucket of [mesh.opaque, mesh.cutout, mesh.water]) {
        for (let i = 0; i < bucket.layers.length; i += 2) names.add(textureLayout.layerNames[bucket.layers[i]]);
      }
    }
    expect(triangles).toBeGreaterThan(1000);
    expect(names.has('stone_brick')).toBe(true);
    expect(names.has('roof_red')).toBe(true);
    expect(names.has('glass')).toBe(true);
    expect([...names].filter((n) => n.startsWith('flat:#ff00ff'))).toEqual([]);
  });

  it('hides the faces that touch at the ridge: two stairs back to back lose exactly their two backs', () => {
    const stairs = idOf('red_roof_stairs');
    const count = (blocks: Array<{ id: number; x: number; y: number; z: number; state: number }>) =>
      meshStage({ blocks, shiftX: 0, shiftZ: 0 }, registry, textureLayout)
        .reduce((n, { mesh }) => n + mesh.opaque.indices.length, 0);
    const north = { id: stairs, x: 4, y: 3, z: 4, state: stairState(2) };  // tall back on its south side
    const south = { id: stairs, x: 4, y: 3, z: 5, state: stairState(0) };  // tall back on its north side
    const one = count([north]);
    const apart = count([north, { ...south, z: 7 }]);
    const together = count([north, south]);
    expect(apart).toBe(2 * one);
    // The backs lie flat against each other: one quad (6 indices) each is gone.
    expect(together).toBe(apart - 12);
  });
});

describe('buildHouse', () => {
  const house = buildHouse(registry);
  const at = new Map(house.blocks.map((b) => [`${b.x},${b.y},${b.z}`, b]));
  const name = (x: number, y: number, z: number): string | null => {
    const b = at.get(`${x},${y},${z}`);
    return b ? registry.get(b.id).name.replace('voxelverse:', '') : null;
  };

  it('never puts two blocks in one cell and stays inside its box', () => {
    expect(at.size).toBe(house.blocks.length);
    for (const b of house.blocks) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThan(house.width);
      expect(b.z).toBeGreaterThanOrEqual(0);
      expect(b.z).toBeLessThan(house.depth);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThan(house.height);
    }
  });

  it('moves as one when placed elsewhere', () => {
    const moved = buildHouse(registry, 30, 12);
    expect(moved.blocks).toHaveLength(house.blocks.length);
    moved.blocks.forEach((b, i) => {
      expect([b.x - 30, b.y, b.z - 12, b.id, b.state]).toEqual([house.blocks[i].x, house.blocks[i].y, house.blocks[i].z, house.blocks[i].id, house.blocks[i].state]);
    });
  });

  it('has a roof of stairs that every climb towards the ridge, level on both slopes', () => {
    const roof = house.blocks.filter((b) => b.id === idOf('red_roof_stairs'));
    expect(roof.length).toBe(6 * 9);
    // The ridge is between z = 4 and 5 (local 3 and 2, one block in from the yard).
    const ridgeZ = 3.0;
    for (const b of roof) {
      const facing = (b.state ?? 0) & 3;
      expect(b.state ?? 0).toBeLessThan(4); // none upside down
      // A stair at the south end of the roof must face north (0), one at the north end south (2).
      const centre = b.z + 0.5;
      expect(facing).toBe(centre > ridgeZ ? 0 : 2);
    }
    // Each slope rises one block for each block it moves towards the ridge, and the two slopes are mirror images.
    for (let x = 0; x < house.width; x++) {
      const heights = (zs: number[]) => zs.map((z) => roof.find((b) => b.x === x && b.z === z)!.y);
      expect(heights([0, 1, 2])).toEqual([4, 5, 6]);
      expect(heights([5, 4, 3])).toEqual([4, 5, 6]);
    }
  });

  it('has a doorway with a top slab lintel, a floor of bottom slabs and a porch of fences under a slab roof', () => {
    // Local door at x 3 -> placed x 4, front wall z 5.
    const door = (y: number) => name(4, y, 5);
    expect(door(0)).toBe('wood_plank_slab');
    expect(door(1)).toBeNull();
    expect(door(2)).toBe('wood_plank_slab');
    const slabs = house.blocks.filter((b) => registry.get(b.id).name.endsWith('wood_plank_slab'));
    expect(slabs.find((b) => b.x === 4 && b.y === 2 && b.z === 5)!.state).toBe(SLAB_TOP);
    const floor = slabs.filter((b) => b.y === 0);
    expect(floor.length).toBe(5 * 4 + 2);
    expect(floor.every((b) => b.state === 0)).toBe(true);
    for (const x of [3, 5]) {
      expect([0, 1, 2].map((y) => name(x, y, 6))).toEqual(['wood_fence', 'wood_fence', 'wood_fence']);
    }
    expect([3, 4, 5].map((x) => name(x, 3, 6))).toEqual(['wood_plank_slab', 'wood_plank_slab', 'wood_plank_slab']);
  });

  it('puts every window pane between solid blocks of the wall, so each one joins the wall on both sides', () => {
    const pane = idOf('glass_pane');
    const panes = house.blocks.filter((b) => b.id === pane);
    expect(panes).toHaveLength(6 * 2);
    for (const b of panes) {
      const along = b.z === 5 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      for (const [dx, dz] of along) {
        const n = at.get(`${b.x + dx},${b.y},${b.z + dz}`);
        expect(n, `pane at ${b.x},${b.y},${b.z}`).toBeDefined();
        const joins = n!.id === pane || (registry.model(n!.id).isFullCube && registry.isSolid(n!.id));
        expect(joins).toBe(true);
      }
    }
  });

  it('has a fence that reaches the corner posts of the house and leaves a gap for the gate', () => {
    const fence = idOf('wood_fence');
    const yard = house.blocks.filter((b) => b.id === fence && b.y === 0 && b.z >= 5 && b.z !== 6);
    expect(yard.some((b) => b.z === 8 && b.x === 4)).toBe(false); // the gate
    expect(yard.filter((b) => b.z === 8)).toHaveLength(8);
    // The side runs end against the dark plank corner posts.
    for (const [x, post] of [[0, 1], [8, 7]]) {
      expect(name(x, 0, 5)).toBe('wood_fence');
      expect(name(post, 0, 5)).toBe('dark_plank');
    }
  });

  it('meshes into opaque and cutout geometry, with the walls and the roof showing real tiles', () => {
    let opaque = 0;
    let cutout = 0;
    const names = new Set<string>();
    for (const { mesh } of meshStage({ blocks: house.blocks, shiftX: 0, shiftZ: 0 }, registry, textureLayout)) {
      opaque += mesh.opaque.indices.length;
      cutout += mesh.cutout.indices.length;
      for (const bucket of [mesh.opaque, mesh.cutout]) {
        for (let i = 0; i < bucket.layers.length; i += 2) names.add(textureLayout.layerNames[bucket.layers[i]]);
      }
    }
    expect(opaque).toBeGreaterThan(0);
    expect(cutout).toBeGreaterThan(0);
    for (const tile of ['cobble', 'stone_brick', 'plank', 'dark_plank', 'roof_red', 'glass', 'lantern']) {
      expect(names.has(tile), tile).toBe(true);
    }
    // Only the used ids are cell ids of the stage (a stray state bit would change one).
    for (const b of house.blocks) expect(cellId(b.id)).toBe(b.id);
  });
});

describe('defaultCamera for tall content', () => {
  it('backs off further for a taller box and looks at its middle', () => {
    const flat: { width: number; depth: number; height?: number } = { width: 9, depth: 9 };
    const tall = { width: 9, depth: 9, height: 7 };
    const dist = (p: CameraPose) => Math.hypot(...p.position.map((v, i) => v - p.target[i]));
    expect(dist(defaultCamera(tall, 1.6, true))).toBeGreaterThan(dist(defaultCamera(flat, 1.6, true)));
    expect(defaultCamera(tall, 1.6, true).target[1]).toBeGreaterThan(defaultCamera(flat, 1.6, true).target[1]);
  });

  it('swings round to the side with the azimuth', () => {
    const front = defaultCamera({ width: 9, depth: 9, height: 7 }, 1.6, true);
    const side = defaultCamera({ width: 9, depth: 9, height: 7, azimuth: 30 }, 1.6, true);
    expect(front.position[0]).toBeCloseTo(front.target[0]);
    expect(side.position[0]).toBeGreaterThan(side.target[0] + 1);
  });
});
