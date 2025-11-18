import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { Vector3, FogExp2 } from 'three';
import World from './World';
import Player from './Player';
import { INITIAL_SPAWN } from '../constants';

const Game: React.FC = () => {
  const [playerPos, setPlayerPos] = useState<Vector3>(INITIAL_SPAWN);

  return (
    <div className="relative w-full h-full">
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 z-10 p-6 text-white pointer-events-none select-none">
        <h1 className="text-4xl font-bold drop-shadow-md mb-2 font-serif">VoxelVerse</h1>
        <div className="bg-black/50 p-4 rounded-lg backdrop-blur-sm text-sm space-y-1 max-w-xs">
          <h2 className="font-bold text-yellow-400 mb-2 border-b border-white/20 pb-1">Medieval Origins</h2>
          <p><span className="font-bold text-green-300">W A S D</span> to Walk</p>
          <p><span className="font-bold text-green-300">SPACE</span> to Jump</p>
          <p><span className="font-bold text-green-300">MOUSE</span> to Look</p>
          <p className="text-gray-300 text-xs italic pt-2">Click anywhere to capture mouse</p>
          <div className="pt-2 mt-2 border-t border-white/20 grid grid-cols-2 gap-2 text-xs">
            <span className="text-blue-300">West: Coast</span>
            <span className="text-gray-300">East: Mountains</span>
            <span className="text-green-300">South: Forest</span>
            <span className="text-yellow-300">Center: Village</span>
          </div>
        </div>
      </div>

      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 -ml-2 -mt-2 pointer-events-none z-10">
        <div className="w-full h-0.5 bg-white/80 absolute top-1/2 transform -translate-y-1/2"></div>
        <div className="h-full w-0.5 bg-white/80 absolute left-1/2 transform -translate-x-1/2"></div>
      </div>

      {/* 3D Scene */}
      <Canvas shadows camera={{ fov: 75 }}>
        {/* Lighting & Atmosphere */}
        <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.4} />
        <pointLight position={[100, 100, 100]} intensity={1} castShadow />
        <fog attach="fog" args={['#87CEEB', 10, 50]} /> 

        <Suspense fallback={null}>
          <World playerPosition={playerPos} />
        </Suspense>
        
        <Player setPlayerPos={setPlayerPos} />
      </Canvas>
    </div>
  );
};

export default Game;
