import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// meshing/ runs in a worker, so it may not reach for three, react or the DOM.
describe('meshing layer', () => {
  const dir = join(__dirname, '..', '..', 'meshing');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it('has source files to check', () => {
    expect(files).toContain('ChunkMesher.ts');
  });

  for (const file of files) {
    it(`${file} imports nothing from three, react, the DOM layers or worldgen/content`, () => {
      const source = readFileSync(join(dir, file), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec).not.toMatch(/^(three|react|@react-three)/);
        expect(spec).not.toMatch(/(^|\/)(render|components|bench|worldgen|content)(\/|$)/);
      }
      expect(source).not.toMatch(/\b(document|window|HTMLCanvasElement|OffscreenCanvas)\b/);
    });
  }
});
