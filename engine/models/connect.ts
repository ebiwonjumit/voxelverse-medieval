import { cellId } from '../cell';
import { Neighbourhood } from './BlockModel';

/**
 * Whether the block one step along x or z joins a fence or pane of `group`: another of the group, or a solid full
 * cube. Glass-like cubes (solid but see-through) only count when `glass` is set, which is how panes differ from fences.
 */
export const joins = (nb: Neighbourhood, dx: number, dz: number, group: string, glass: boolean): boolean => {
  const id = cellId(nb.cell(dx, 0, dz));
  const model = nb.registry.model(id);
  if (model.connectGroup === group) return true;
  if (!model.isFullCube || !nb.registry.isSolid(id)) return false;
  return glass || nb.registry.isOpaque(id);
};
