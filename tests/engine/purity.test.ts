import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// engine/ is the voxel core. It has to stay free of rendering and of anything that generates content,
// so the generator is always passed in.
describe('engine layer', () => {
  const dir = join(__dirname, '..', '..', 'engine');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it('has source files to check', () => {
    expect(files).toContain('WorldGenerator.ts');
  });

  for (const file of files) {
    it(`${file} imports nothing from three, react, the DOM layers, zones, worldgen or content`, () => {
      const source = readFileSync(join(dir, file), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec).not.toMatch(/^(three|react|@react-three)/);
        expect(spec).not.toMatch(/(^|\/)(render|components|bench|meshing|zones|worldgen|content)(\/|$)/);
      }
    });
  }
});
