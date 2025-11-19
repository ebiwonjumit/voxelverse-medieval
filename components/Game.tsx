import React, { useState, Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Stats } from '@react-three/drei';
import { Vector3, Color, DirectionalLight, Fog, Mesh, Object3D } from 'three';
import World from './World';
import Player from './Player';
import { INITIAL_SPAWN, MILE } from '../constants';
import { getCurrentZoneName, getZone } from '../utils/terrain';

const DayNightCycle = ({ playerX, playerZ }: { playerX: number, playerZ: number }) => {
  const { scene } = useThree();
  const dirLight = useRef<DirectionalLight>(null);
  const ambientLight = useRef<any>(null);
  const skyRef = useRef<Mesh>(null);
  
  // Create a persistent target object for the directional light
  const lightTarget = useMemo(() => {
    const obj = new Object3D();
    scene.add(obj); // Critical: Add target to scene for updates to work
    return obj;
  }, [scene]);

  useEffect(() => {
    return () => {
      scene.remove(lightTarget);
    };
  }, [scene, lightTarget]);
  
  const [sunPosition] = useState(new Vector3(50, 100, 50));
  const currentFogColor = useRef(new Color('#87CEEB'));

  useFrame(({ camera }) => {
    if (skyRef.current) {
        skyRef.current.position.copy(camera.position);
    }

    const relativeSunPos = sunPosition.clone();

    const zone = getZone(playerX, playerZ);
    const atmosphere = zone.getAtmosphere();
    const targetFogHex = atmosphere.fogColor;

    if (dirLight.current && ambientLight.current) {
      dirLight.current.position.copy(camera.position).add(relativeSunPos);
      
      // Update the target position to follow camera but stay grounded relative to light direction
      lightTarget.position.copy(camera.position);
      lightTarget.updateMatrixWorld();

      dirLight.current.intensity = 1.5;
      dirLight.current.color.setHSL(0.1, 1, 0.95);

      ambientLight.current.intensity = 0.6; // Increased base brightness
      ambientLight.current.color.setHSL(0.6, 0.1, 0.6);
    }

    if (scene.fog) {
      const fog = scene.fog as Fog;
      const dayColor = new Color(targetFogHex); 
      currentFogColor.current.lerp(dayColor, 0.02);
      fog.color.copy(currentFogColor.current);
    }
  });

  return (
    <>
      <Sky ref={skyRef as any} sunPosition={sunPosition} turbidity={0.2} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />
      <ambientLight ref={ambientLight} intensity={0.5} />
      <directionalLight 
        ref={dirLight}
        target={lightTarget}
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
      >
         <orthographicCamera attach="shadow-camera" args={[-50, 50, 50, -50]} />
      </directionalLight>
    </>
  );
};

const Game: React.FC = () => {
  const [playerPos, setPlayerPos] = useState<Vector3>(INITIAL_SPAWN);
  const [showControls, setShowControls] = useState(true);
  const [showStats, setShowStats] = useState(false);

  // Hide controls after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowControls(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  // Toggle stats with F3
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setShowStats(prev => !prev);
      }
      if (e.key === 'h' || e.key === 'H') {
        setShowControls(prev => !prev);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getHUDInfo = () => {
    const x = Math.round(playerPos.x);
    const y = Math.round(playerPos.y);
    const z = Math.round(playerPos.z);
    
    const currentZone = getCurrentZoneName(x, z);
    
    const distSAO = (Math.sqrt(x*x + z*z) / MILE).toFixed(1);
    const distTempest = (Math.sqrt(Math.pow(x - 3 * MILE, 2) + Math.pow(z, 2)) / MILE).toFixed(1);
    const distAmestris = (Math.sqrt(Math.pow(x - (-3 * MILE), 2) + Math.pow(z, 2)) / MILE).toFixed(1);
    const distBosse = (Math.sqrt(Math.pow(x, 2) + Math.pow(z - (-3 * MILE), 2)) / MILE).toFixed(1);
    const distFremme = (Math.sqrt(Math.pow(x - 1600, 2) + Math.pow(z - (-1600), 2)) / MILE).toFixed(1);
    const distMagnolia = (Math.sqrt(Math.pow(x - (-1600), 2) + Math.pow(z - 1600, 2)) / MILE).toFixed(1);

    return { x, y, z, currentZone, distSAO, distTempest, distAmestris, distBosse, distFremme, distMagnolia };
  }

  const hud = getHUDInfo();

  return (
    <div className="relative w-full h-full">
      {/* Main HUD */}
      <div className="absolute top-0 left-0 z-10 p-6 text-white pointer-events-none select-none">
        <h1 className="text-4xl font-bold drop-shadow-md mb-2 font-serif">VoxelVerse</h1>
        <div className="bg-black/60 p-4 rounded-lg backdrop-blur-sm text-sm space-y-2 max-w-xs border border-white/10">
          <div className="border-b border-white/20 pb-2">
            <p className="text-xs text-gray-400">CURRENT LOCATION</p>
            <p className="text-xl font-bold text-yellow-400">{hud.currentZone}</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-purple-300 flex justify-between">
              <span>Town of Beginnings</span> 
              <span className="text-white font-mono">{hud.distSAO} mi</span>
            </p>
            <p className="text-green-300 flex justify-between">
              <span>Tempest</span> 
              <span className="text-white font-mono">{hud.distTempest} mi</span>
            </p>
            <p className="text-red-300 flex justify-between">
              <span>Amestris</span> 
              <span className="text-white font-mono">{hud.distAmestris} mi</span>
            </p>
            <p className="text-yellow-200 flex justify-between">
              <span>Bosse</span> 
              <span className="text-white font-mono">{hud.distBosse} mi</span>
            </p>
            <p className="text-blue-200 flex justify-between">
              <span>Fremmevilla</span> 
              <span className="text-white font-mono">{hud.distFremme} mi</span>
            </p>
            <p className="text-pink-200 flex justify-between">
              <span>Magnolia</span> 
              <span className="text-white font-mono">{hud.distMagnolia} mi</span>
            </p>
          </div>

          <div className="pt-2 mt-2 border-t border-white/20 text-xs text-gray-400 font-mono">
            XYZ: {hud.x}, {hud.y}, {hud.z}
          </div>
        </div>
      </div>

      {/* Controls (bottom left) */}
      {showControls && (
        <div className="absolute bottom-4 left-4 z-10 text-white pointer-events-none select-none">
          <div className="bg-black/60 p-3 rounded-lg backdrop-blur-sm text-xs space-y-1 border border-white/10">
            <div className="font-bold text-yellow-400 mb-1">CONTROLS</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <div><span className="text-gray-400">W/A/S/D</span> Move</div>
              <div><span className="text-gray-400">Mouse</span> Look</div>
              <div><span className="text-gray-400">Space</span> Jump</div>
              <div><span className="text-gray-400">Shift</span> Sprint</div>
              <div><span className="text-gray-400">Click</span> Lock Cursor</div>
              <div><span className="text-gray-400">F3</span> Debug</div>
            </div>
            <div className="text-xs text-gray-500 mt-2 pt-1 border-t border-white/10">
              Press H to toggle this help
            </div>
          </div>
        </div>
      )}

      {/* Debug Info (top right) */}
      {showStats && (
        <div className="absolute top-4 right-4 z-10 text-white pointer-events-none select-none">
          <div className="bg-black/80 p-3 rounded-lg text-xs font-mono space-y-1 border border-white/10">
            <div className="text-yellow-400">DEBUG INFO</div>
            <div>Position: {hud.x}, {hud.y}, {hud.z}</div>
            <div>Zone: {hud.currentZone}</div>
            <div>Chunks Loaded: ~{Math.pow(9, 2)}</div>
            <div className="text-gray-400 text-xs mt-2">Press F3 to toggle</div>
          </div>
        </div>
      )}
      
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 -ml-2 -mt-2 pointer-events-none z-10">
        <div className="w-full h-0.5 bg-white/80 absolute top-1/2 transform -translate-y-1/2"></div>
        <div className="h-full w-0.5 bg-white/80 absolute left-1/2 transform -translate-x-1/2"></div>
      </div>

      <Canvas shadows camera={{ fov: 75 }}>
        {/* Show FPS stats in corner when debug is on */}
        {showStats && <Stats className="!left-auto !right-4 !top-32" />}
        
        <DayNightCycle playerX={playerPos.x} playerZ={playerPos.z} />
        <fog attach="fog" args={['#87CEEB', 20, 80]} /> 

        <Suspense fallback={null}>
          <World playerPosition={playerPos} />
        </Suspense>
        
        <Player setPlayerPos={setPlayerPos} />
      </Canvas>
    </div>
  );
};

export default Game;