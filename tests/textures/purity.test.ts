import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Texture recipes are pure data code so a worker (or the node contact-sheet script) can run them.
const root = join(__dirname, '..', '..', 'content', 'textures');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

describe('content/textures layer', () => {
  const sources = files(root);

  it('has source files to check', () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  for (const file of sources) {
    it(`${file.slice(root.length + 1)} imports no three, react, DOM layer, node module or engine code, and never calls Math.random`, () => {
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec).not.toMatch(/^(three|react|@react-three|node:)/);
        expect(spec).not.toMatch(/(^|\/)(render|components|bench|meshing|worldgen|zones)(\/|$)/);
      }
      expect(source).not.toMatch(/\b(document|window|HTMLCanvasElement|OffscreenCanvas|Buffer)\b/);
      expect(source).not.toMatch(/Math\.random/);
    });
  }
});
