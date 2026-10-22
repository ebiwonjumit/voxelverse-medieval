import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// meshing/ runs in a worker, so it may not reach for three, react or the DOM.
// mesh.worker.ts is the worker's entry point: it builds the registry and the generator the worker uses,
// so it is the one file allowed to import content/ and worldgen/. It still may not touch three, react or the DOM.
const WORKER_ENTRY = 'mesh.worker.ts';

describe('meshing layer', () => {
  const dir = join(__dirname, '..', '..', 'meshing');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it('has source files to check', () => {
    expect(files).toContain('ChunkMesher.ts');
    expect(files).toContain(WORKER_ENTRY);
  });

  for (const file of files) {
    it(`${file} imports nothing from three, react, the DOM layers${file === WORKER_ENTRY ? '' : ' or worldgen/content'}`, () => {
      const source = readFileSync(join(dir, file), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec).not.toMatch(/^(three|react|@react-three)/);
        expect(spec).not.toMatch(/(^|\/)(render|components|bench)(\/|$)/);
        if (file !== WORKER_ENTRY) expect(spec).not.toMatch(/(^|\/)(worldgen|content)(\/|$)/);
      }
      expect(source).not.toMatch(/\b(document|window|HTMLCanvasElement|OffscreenCanvas)\b/);
    });
  }
});
