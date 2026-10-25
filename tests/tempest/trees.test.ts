import { describe, expect, it } from 'vitest';
import { TREE_KINDS, VARIANTS, smallTree } from '../../worldgen/tempest/trees';

// A person is two blocks tall, so a leaf in row 1 or 2 beside the trunk would be a leaf in somebody's face.
describe('the small trees of the streets and gardens', () => {
  it('have nothing but the trunk in the two rows a person occupies', () => {
    let checked = 0;
    for (const kind of ['sakura', 'cedar', 'birch'] as const) {
      for (let variant = 0; variant < VARIANTS; variant++) {
        for (const lean of [0, 1, 2, 3, 4] as const) {
          for (const size of [1, 0.8, 0.7]) {
            const t = smallTree(kind, variant, lean, size);
            for (let i = 0; i < t.length; i++) {
              if (t.dx[i] === 0 && t.dz[i] === 0) continue;
              expect(t.dy[i], `${kind} #${variant} lean ${lean} size ${size} at ${t.dx[i]},${t.dy[i]},${t.dz[i]}`).toBeGreaterThanOrEqual(3);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(TREE_KINDS).toContain('bamboo');
  });
});
