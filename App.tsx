import React, { Suspense, useMemo } from 'react';
import Game from './components/Game';
import { parseSandbox } from './components/sandbox/sandboxLayout';

// The sandbox pulls in its own code only when ?sandbox=blocks asks for it.
const BlockSandbox = React.lazy(() => import('./components/sandbox/BlockSandbox'));

const App: React.FC = () => {
  // ?sandbox=blocks replaces the game entirely: no world, no workers, no player.
  const sandbox = useMemo(() => parseSandbox(window.location.search), []);
  return (
    <div className="w-screen h-screen bg-gray-900">
      {sandbox ? (
        <Suspense fallback={null}>
          <BlockSandbox options={sandbox} />
        </Suspense>
      ) : (
        <Game />
      )}
    </div>
  );
};

export default App;
