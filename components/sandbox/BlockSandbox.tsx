import React, { useCallback } from 'react';
import { BlockRegistry } from '../../engine/BlockRegistry';
import SandboxView from './SandboxView';
import { SandboxOptions, layoutBlocks } from './sandboxLayout';

// ?sandbox=blocks: every registered block as a cube on a grid, drawn with the game's own mesher, texture array and
// materials (see SandboxView).
//
//   ?sandbox=blocks                     every block, plus the grass and leaves under each zone's tint
//   ?sandbox=blocks&view=close          a few materials, close up
//   ?sandbox=blocks&view=nature         the 23 wilderness blocks (ids 48 to 70), six to a row
//   ?sandbox=blocks&focus=wood_plank,marble   any blocks by short name, close up
//   ?sandbox=blocks&cols=6              columns of the grid, on any focused view
//   ?sandbox=blocks&cam=px,py,pz,tx,ty,tz     explicit camera

const BlockSandbox: React.FC<{ options: SandboxOptions }> = ({ options }) => {
  const build = useCallback((registry: BlockRegistry) => {
    const layout = layoutBlocks(registry, options.focus, options.cols);
    return { ...layout, count: layout.slots.length, focused: options.focus !== null };
  }, [options.focus, options.cols]);
  return (
    <SandboxView
      title="Block sandbox"
      caption="blocks, drawn by the game's own mesher and materials."
      build={build}
      cam={options.cam}
    />
  );
};

export default BlockSandbox;
