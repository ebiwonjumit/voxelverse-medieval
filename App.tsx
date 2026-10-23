import React, { Suspense, useMemo } from 'react';
import Game from './components/Game';
import { parseModelSandbox } from './components/sandbox/modelsLayout';
import { parseSandbox } from './components/sandbox/sandboxLayout';

// The sandboxes pull in their own code only when ?sandbox=blocks or ?sandbox=models asks for it.
const BlockSandbox = React.lazy(() => import('./components/sandbox/BlockSandbox'));
const ModelSandbox = React.lazy(() => import('./components/sandbox/ModelSandbox'));

const App: React.FC = () => {
  // ?sandbox=blocks and ?sandbox=models replace the game entirely: no world, no workers, no player.
  const sandbox = useMemo(() => parseSandbox(window.location.search), []);
  const modelSandbox = useMemo(() => parseModelSandbox(window.location.search), []);
  return (
    <div className="w-screen h-screen bg-gray-900">
      {sandbox ? (
        <Suspense fallback={null}>
          <BlockSandbox options={sandbox} />
        </Suspense>
      ) : modelSandbox ? (
        <Suspense fallback={null}>
          <ModelSandbox options={modelSandbox} />
        </Suspense>
      ) : (
        <Game />
      )}
    </div>
  );
};

export default App;
