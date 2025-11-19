
import React, { useState, Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { Vector3, Color, DirectionalLight, Fog, Mesh } from 'three';
import World from './World';
import Player from './Player';
import { INITIAL_SPAWN, MILE } from '../constants';
import { getCurrentZoneName, getZone } from '../utils/terrain'; // Re-exported from terrain

const DayNightCycle = ({ playerX, playerZ }: { playerX: number, playerZ: number }) => {
  const { scene } = useThree();
  const dirLight = useRef<DirectionalLight>(null);
  const ambientLight = useRef<any>(null);
  const skyRef = useRef<Mesh>(null);
  
  // Fixed midday sun position
  const [sunPosition] = useState(new Vector3(50, 100, 50));
  
  const currentFogColor = useRef(new Color('#87CEEB'));

  useFrame(({ camera }) => {
    // Move Sky with camera to simulate infinite world
    if (skyRef.current) {
        skyRef.current.position.copy(camera.position);
    }

    // Constant sun position relative to camera for infinite world illusion
    const relativeSunPos = sunPosition.clone();

    // Get Target Atmosphere based on Zone
    const zone = getZone(playerX, playerZ);
    const atmosphere = zone.getAtmosphere();
    const targetFogHex = atmosphere.fogColor;

    if (dirLight.current && ambientLight.current) {
      dirLight.current.position.copy(camera.position).add(relativeSunPos);
      dirLight.current.target.position.copy(camera.position);
      dirLight.current.target.updateMatrixWorld();

      // Always Day settings
      dirLight.current.intensity = 1.5;
      dirLight.current.color.setHSL(0.1, 1, 0.95); // Bright sun

      ambientLight.current.intensity = 0.5;
      ambientLight.current.color.setHSL(0.6, 0.1, 0.6); // Neutral daylight ambient
    }

    if (scene.fog) {
      const fog = scene.fog as Fog;
      
      // Use Zone color logic
      const dayColor = new Color(targetFogHex); 

      // Smoothly interpolate current fog color towards the target Zone color
      currentFogColor.current.lerp(dayColor, 0.02);

      fog.color.copy(currentFogColor.current);
    }
  });

  return (
    <>
      {/* Fix: Cast ref to any to avoid strict Geometry type mismatch with Drei's Sky component */}
      <Sky ref={skyRef as any} sunPosition={sunPosition} turbidity={0.2} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />
      <ambientLight ref={ambientLight} intensity={0.5} />
      <directionalLight 
        ref={dirLight}
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

  const getHUDInfo = () => {
    const x = Math.round(playerPos.x);
    const z = Math.round(playerPos.z);
    
    const currentZone = getCurrentZoneName(x, z);
    
    const distSAO = (Math.sqrt(x*x + z*z) / MILE).toFixed(1);
    
    // Tempest Center (3 * MILE, 0)
    const distTempest = (Math.sqrt(Math.pow(x - 3 * MILE, 2) + Math.pow(z, 2)) / MILE).toFixed(1);
    
    // Amestris Center (-3 * MILE, 0)
    const distAmestris = (Math.sqrt(Math.pow(x - (-3 * MILE), 2) + Math.pow(z, 2)) / MILE).toFixed(1);
    
    // Bosse Center (0, -3 * MILE)
    const distBosse = (Math.sqrt(Math.pow(x, 2) + Math.pow(z - (-3 * MILE), 2)) / MILE).toFixed(1);
    
    // Fremmevilla Center (1600, -1600)
    const distFremme = (Math.sqrt(Math.pow(x - 1600, 2) + Math.pow(z - (-1600), 2)) / MILE).toFixed(1);
    
    // Magnolia Center (-1600, 1600)
    const distMagnolia = (Math.sqrt(Math.pow(x - (-1600), 2) + Math.pow(z - 1600, 2)) / MILE).toFixed(1);

    return { x, z, currentZone, distSAO, distTempest, distAmestris, distBosse, distFremme, distMagnolia };
  }

  const hud = getHUDInfo();

  return (
    <div className="relative w-full h-full">
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 z-10 p-6 text-white pointer-events-none select-none">
        <h1 className="text-4xl font-bold drop-shadow-md mb-2 font-serif">VoxelVerse</h1>
        <div className="bg-black/60 p-4 rounded-lg backdrop-blur-sm text-sm space-y-2 max-w-xs border border-white/10">
          <div className="border-b border-white/20 pb-2">
            <p className="text-xs text-gray-400">CURRENT LOCATION</p>
            <p className="text-xl font-bold text-yellow-400">{hud.currentZone}</p>
          </div>
          
          <div className="space-y-1">
             <p className="text-purple-300 flex justify-between">
              <span>Town of Beginnings (Center)</span> 
              <span className="text-white font-mono">{hud.distSAO} mi</span>
            </p>
            <p className="text-green-300 flex justify-between">
              <span>Tempest (East)</span> 
              <span className="text-white font-mono">{hud.distTempest} mi</span>
            </p>
            <p className="text-red-300 flex justify-between">
              <span>Amestris (West)</span> 
              <span className="text-white font-mono">{hud.distAmestris} mi</span>
            </p>
             <p className="text-yellow-200 flex justify-between">
              <span>Bosse (North)</span> 
              <span className="text-white font-mono">{hud.distBosse} mi</span>
            </p>
             <p className="text-blue-200 flex justify-between">
              <span>Fremmevilla (NE)</span> 
              <span className="text-white font-mono">{hud.distFremme} mi</span>
            </p>
             <p className="text-pink-200 flex justify-between">
              <span>Magnolia (SW)</span> 
              <span className="text-white font-mono">{hud.distMagnolia} mi</span>
            </p>
          </div>

          <div className="pt-2 mt-2 border-t border-white/20 text-xs text-gray-400 font-mono">
             Coordinates: {hud.x}, {hud.z}
          </div>
        </div>
      </div>
      
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 -ml-2 -mt-2 pointer-events-none z-10">
        <div className="w-full h-0.5 bg-white/80 absolute top-1/2 transform -translate-y-1/2"></div>
        <div className="h-full w-0.5 bg-white/80 absolute left-1/2 transform -translate-x-1/2"></div>
      </div>

      <Canvas shadows camera={{ fov: 75 }}>
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
