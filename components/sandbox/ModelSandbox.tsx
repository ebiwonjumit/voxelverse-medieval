import React, { useCallback } from 'react';
import { BlockRegistry } from '../../engine/BlockRegistry';
import SandboxView from './SandboxView';
import { ModelSandboxOptions, layoutModels } from './modelsLayout';

// ?sandbox=models: every block model in every state, labelled, plus a small house built from stairs, slabs, fences and
// panes, drawn through the game's own mesher (see SandboxView).
//
//   ?sandbox=models                     everything
//   ?sandbox=models&view=close          one stair block in all 8 states and two slab blocks, close up
//   ?sandbox=models&view=joins          how a fence and a pane join their neighbours, close up
//   ?sandbox=models&view=house          the house alone, from the south east
//   ?sandbox=models&cam=px,py,pz,tx,ty,tz     explicit camera

const ModelSandbox: React.FC<{ options: ModelSandboxOptions }> = ({ options }) => {
  const build = useCallback((registry: BlockRegistry) => {
    const layout = layoutModels(registry, options.view);
    return { ...layout, count: layout.cells, focused: options.view !== 'all' };
  }, [options.view]);
  return (
    <SandboxView
      title="Model sandbox"
      caption="on show, drawn by the game's own mesher and materials."
      build={build}
      cam={options.cam}
    />
  );
};

export default ModelSandbox;
