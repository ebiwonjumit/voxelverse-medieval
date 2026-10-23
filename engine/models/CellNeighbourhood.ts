import type { BlockRegistry } from '../BlockRegistry';
import { Cell } from '../cell';
import { Neighbourhood } from './BlockModel';

/** A neighbourhood over any cell source: the world for collision, a map in tests. Move it with `at`. */
export class CellNeighbourhood implements Neighbourhood {
  private x = 0;
  private y = 0;
  private z = 0;

  constructor(readonly registry: BlockRegistry, private readonly read: (x: number, y: number, z: number) => Cell) {}

  at(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  cell(dx: number, dy: number, dz: number): Cell {
    return this.read(this.x + dx, this.y + dy, this.z + dz);
  }
}
