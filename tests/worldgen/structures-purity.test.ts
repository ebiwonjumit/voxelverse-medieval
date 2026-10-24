import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// worldgen/structures and worldgen/tempest are pure data code, like the rest of worldgen: they draw blueprints and answer
// layout questions in workers and on the main thread, so they may not reach for three, react, the DOM or the layers above.
// The viewer that shows them lives in components/sandbox.
const roots = ['structures', 'tempest'];

for (const root of roots) {
  describe(`worldgen/${root}`, () => {
    const dir = join(__dirname, '..', '..', 'worldgen', root);
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));

    it('has source files to check', () => {
      expect(files.length).toBeGreaterThan(3);
    });

    for (const file of files) {
      it(`${file} imports nothing from three, react, the DOM layers, meshing or the viewer`, () => {
        const source = readFileSync(join(dir, file), 'utf8');
        const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
        for (const spec of imports) {
          expect(spec).not.toMatch(/^(three|react|@react-three)/);
          expect(spec).not.toMatch(/(^|\/)(render|components|bench|meshing)(\/|$)/);
        }
        // Global use of the DOM (a comment may say "window"): `window.`, `document.` and the canvas types.
        expect(source).not.toMatch(/\b(document|window|globalThis\.document)\.|\b(HTMLCanvasElement|OffscreenCanvas)\b/);
      });
    }
  });
}

describe('the engine and content stay clear of the structures', () => {
  for (const layer of ['engine', 'content']) {
    it(`${layer}/ does not import worldgen/structures or worldgen/tempest`, () => {
      const dir = join(__dirname, '..', '..', layer);
      const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
      for (const file of files) {
        const source = readFileSync(join(dir, file), 'utf8');
        expect(source, file).not.toMatch(/from\s+'[^']*worldgen\/(structures|tempest)/);
      }
    });
  }
});
