import React, { Suspense, useMemo } from 'react';
import Game from './components/Game';
import { parseKitSandbox } from './components/sandbox/kitsLayout';
import { parseLandmarkSandbox } from './components/sandbox/landmarksLayout';
import { parseModelSandbox } from './components/sandbox/modelsLayout';
import { parseSandbox } from './components/sandbox/sandboxLayout';

// The sandboxes pull in their own code only when ?sandbox=blocks, models, kits or landmarks asks for it.
const BlockSandbox = React.lazy(() => import('./components/sandbox/BlockSandbox'));
const ModelSandbox = React.lazy(() => import('./components/sandbox/ModelSandbox'));
const KitSandbox = React.lazy(() => import('./components/sandbox/KitSandbox'));
const LandmarkSandbox = React.lazy(() => import('./components/sandbox/LandmarkSandbox'));

const App: React.FC = () => {
  // ?sandbox=blocks, models and kits replace the game entirely: no world, no workers, no player.
  const sandbox = useMemo(() => parseSandbox(window.location.search), []);
  const modelSandbox = useMemo(() => parseModelSandbox(window.location.search), []);
  const kitSandbox = useMemo(() => parseKitSandbox(window.location.search), []);
  const landmarkSandbox = useMemo(() => parseLandmarkSandbox(window.location.search), []);
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
      ) : kitSandbox ? (
        <Suspense fallback={null}>
          <KitSandbox options={kitSandbox} />
        </Suspense>
      ) : landmarkSandbox ? (
        <Suspense fallback={null}>
          <LandmarkSandbox options={landmarkSandbox} />
        </Suspense>
      ) : (
        <Game />
      )}
    </div>
  );
};

export default App;
