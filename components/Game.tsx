import React, { useState, Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { Vector3, Color, DirectionalLight, Fog } from 'three';
import World from './World';
import Player from './Player';
import { INITIAL_SPAWN, MILE } from '../constants';
import { getCurrentZoneName, getZone } from '../utils/terrain'; // Re-exported from terrain

const DayNightCycle = ({ playerX, playerZ }: { playerX: number, playerZ: number }) => {
  const { scene } = useThree();
  const dirLight = useRef<DirectionalLight>(null);
  const ambientLight = useRef<any>(null);
  const [sunPosition, setSunPosition] = useState(new Vector3(100, 20, 100));
  
  // Refs for smooth transition
  const currentFogColor = useRef(new Color('#87CEEB'));

  useFrame(({ clock, camera }) => {
    const time = clock.getElapsedTime();
    const dayDuration = 120; 
    const cycle = (time % dayDuration) / dayDuration;
    const angle = cycle * Math.PI * 2;
    
    const radius = 100;
    const sunX = Math.cos(angle) * radius; 
    const sunY = Math.sin(angle) * radius; 
    const sunZ = Math.sin(angle * 0.5) * 20; 
    
    const currentSunPos = new Vector3(sunX, sunY, sunZ);
    setSunPosition(currentSunPos);

    // Get Target Atmosphere based on Zone
    const zone = getZone(playerX, playerZ);
    const atmosphere = zone.getAtmosphere();
    const targetFogHex = atmosphere.fogColor;

    if (dirLight.current && ambientLight.current) {
      dirLight.current.position.copy(camera.position).add(currentSunPos);
      dirLight.current.target.position.copy(camera.position);
      dirLight.current.target.updateMatrixWorld();

      const isDay = sunY > 0;
      const heightFactor = Math.max(0, sunY / radius); 
      
      dirLight.current.intensity = isDay ? Math.max(0, heightFactor * 1.5) : 0;
      
      const sunColor = new Color(0xffffff);
      const horizonColor = new Color(0xffaa00);
      
      if (heightFactor < 0.3) {
        dirLight.current.color.lerpColors(horizonColor, sunColor, heightFactor / 0.3);
      } else {
        dirLight.current.color.copy(sunColor);
      }

      if (isDay) {
         if (heightFactor < 0.2) {
             ambientLight.current.intensity = 0.2 + heightFactor; 
             ambientLight.current.color.setHSL(0.1, 0.5, 0.5); 
         } else {
             ambientLight.current.intensity = 0.3 + heightFactor * 0.2;
             ambientLight.current.color.setHSL(0.6, 0.1, 0.6); 
         }
      } else {
         ambientLight.current.intensity = 0.1;
         ambientLight.current.color.setHSL(0.6, 0.6, 0.2); 
      }
    }

    if (scene.fog) {
      const fog = scene.fog as Fog;
      const heightFactor = sunY / radius;

      // Base Day/Night colors
      const dayColor = new Color(targetFogHex); // Dynamic Zone Color
      const sunsetColor = new Color('#fd5e53');
      const nightColor = new Color('#0b1026');

      // Interpolate current fog color towards the target Zone color slowly
      currentFogColor.current.lerp(dayColor, 0.01);

      // Apply time of day logic to the already interpolated zone color
      const finalColor = currentFogColor.current.clone();

      if (heightFactor > 0.15) {
         // Use the zone color directly
         fog.color.lerp(finalColor, 0.05);
      } else if (heightFactor > -0.15) {
         fog.color.lerp(sunsetColor, 0.05);
      } else {
         fog.color.lerp(nightColor, 0.05);
      }
    }
  });

  return (
    <>
      <Sky sunPosition={sunPosition} turbidity={0.5} rayleigh={0.5} />
      <ambientLight ref={ambientLight} intensity={0.4} />
      <directionalLight 
        ref={dirLight}
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
      >
         <orthographicCamera attach="shadow-camera" args={[-50, 50, 50, -50]} />
      </directionalLight>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
    </>
  );
};

const Game: React.FC = () => {
  const [playerPos, setPlayerPos] = useState<Vector3>(INITIAL_SPAWN);

  const getHUDInfo = () => {
    const x = Math.round(playerPos.x);
    const z = Math.round(playerPos.z);
    
    const currentZone = getCurrentZoneName(x, z);
    
    const distTempest = ((3 * MILE - x) / MILE).toFixed(1); // East
    const distAmestris = ((x - (-3 * MILE)) / MILE).toFixed(1); // West
    const distBosse = ((z - (-3 * MILE)) / MILE).toFixed(1); // North (Negative Z)
    const distFremme = (Math.sqrt(Math.pow(x - 3200, 2) + Math.pow(z - (-3200), 2)) / MILE).toFixed(1);
    const distMagnolia = (Math.sqrt(Math.pow(x - (-3200), 2) + Math.pow(z - 3200, 2)) / MILE).toFixed(1);

    return { x, z, currentZone, distTempest, distAmestris, distBosse, distFremme, distMagnolia };
  }

  const hud = getHUDInfo();

  return (
    <div className="relative w-full h-full">
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 z-10 p-6 text-white pointer-events-none select-none">
        <h1 className="text-4xl font-bold drop-shadow-md mb-2 font-serif">VoxelVerse: Anime Worlds</h1>
        <div className="bg-black/60 p-4 rounded-lg backdrop-blur-sm text-sm space-y-2 max-w-xs border border-white/10">
          <div className="border-b border-white/20 pb-2">
            <p className="text-xs text-gray-400">CURRENT LOCATION</p>
            <p className="text-xl font-bold text-yellow-400">{hud.currentZone}</p>
          </div>
          
          <div className="space-y-1">
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