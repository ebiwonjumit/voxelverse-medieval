import React, { useCallback } from 'react';
import { BlockRegistry } from '../../engine/BlockRegistry';
import SandboxView from './SandboxView';
import { SandboxOptions, layoutBlocks } from './sandboxLayout';
import { buildTempestStreet } from './tempestScene';

// ?sandbox=blocks: every registered block as a cube on a grid, drawn with the game's own mesher, texture array and
// materials (see SandboxView).
//
//   ?sandbox=blocks                     every block, plus the grass and leaves under each zone's tint
//   ?sandbox=blocks&view=close          a few materials, close up
//   ?sandbox=blocks&view=nature         the 23 wilderness blocks (ids 48 to 70), six to a row
//   ?sandbox=blocks&view=tempest        the 72 Tempest blocks (ids 128 to 199), nine to a row
//   ?sandbox=blocks&view=street         a Tempest street built from the set: shops, a hall, a plaza, a garden
//   ?sandbox=blocks&night=1             any view with block light baked in, under a night sky
//   ?sandbox=blocks&fov=60              the camera's field of view, for eye-level shots with &cam=
//   ?sandbox=blocks&focus=wood_plank,marble   any blocks by short name, close up
//   ?sandbox=blocks&cols=6              columns of the grid, on any focused view
//   ?sandbox=blocks&cam=px,py,pz,tx,ty,tz     explicit camera

const BlockSandbox: React.FC<{ options: SandboxOptions }> = ({ options }) => {
  const build = useCallback((registry: BlockRegistry) => {
    if (options.scene === 'street') {
      const street = buildTempestStreet(registry);
      // The stage is meshed where the street stands in the world, so the grass wears Tempest's colour, then carried to the origin.
      return {
        stages: [{ blocks: street.blocks, shiftX: -street.worldX, shiftZ: -street.worldZ }],
        labels: [],
        count: street.blocks.length,
        focused: true,
        width: street.width,
        depth: street.depth,
        height: street.height,
        azimuth: 28,
        elevation: 38,
      };
    }
    const layout = layoutBlocks(registry, options.focus, options.cols);
    if (options.night) {
      // Light needs something to fall on: at night the grid stands on a floor of stone, one block below the cubes, so the
      // pools of light round the lanterns show.
      const stone = registry.byName('voxelverse:stone').id;
      const floor = [];
      for (let x = -3; x <= layout.width + 3; x++) for (let z = -3; z <= layout.depth + 3; z++) floor.push({ id: stone, x, y: -1, z });
      layout.stages[0] = { ...layout.stages[0], blocks: [...layout.stages[0].blocks, ...floor] };
    }
    return { ...layout, count: layout.slots.length, focused: options.focus !== null };
  }, [options.focus, options.cols, options.scene, options.night]);
  return (
    <SandboxView
      title="Block sandbox"
      caption="blocks, drawn by the game's own mesher and materials."
      build={build}
      cam={options.cam}
      night={options.night}
      fov={options.fov}
    />
  );
};

export default BlockSandbox;
