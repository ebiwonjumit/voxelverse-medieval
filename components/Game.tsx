import React, { useState, Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { Vector3, Color, DirectionalLight } from 'three';
import World from './World';
import Player from './Player';
import { INITIAL_SPAWN } from '../constants';

const DayNightCycle = () => {
  const { scene } = useThree();
  const dirLight = useRef<DirectionalLight>(null);
  const ambientLight = useRef<any>(null);
  const [sunPosition, setSunPosition] = useState(new Vector3(100, 20, 100));

  useFrame(({ clock, camera }) => {
    const time = clock.getElapsedTime();
    const dayDuration = 60; // Seconds for full day loop
    
    // Cycle: 0..1
    const cycle = (time % dayDuration) / dayDuration;
    
    // Angle: 0 to 2PI
    // We want sunrise at 0, noon at 0.25, sunset at 0.5, midnight at 0.75
    const angle = cycle * Math.PI * 2;
    
    // Sun vector relative to player (radius 100)
    const radius = 100;
    const sunX = Math.cos(angle) * radius; // East-West
    const sunY = Math.sin(angle) * radius; // Up-Down
    const sunZ = Math.sin(angle * 0.5) * 20; // Slight wobble
    
    const currentSunPos = new Vector3(sunX, sunY, sunZ);

    // Update React state for Sky component
    setSunPosition(currentSunPos);

    // Direct manipulation of lights for performance
    if (dirLight.current && ambientLight.current) {
      // Move light to follow camera so shadows work anywhere in the world
      dirLight.current.position.copy(camera.position).add(currentSunPos);
      dirLight.current.target.position.copy(camera.position);
      dirLight.current.target.updateMatrixWorld();

      const isDay = sunY > 0;
      const heightFactor = Math.max(0, sunY / radius); // 0 at horizon, 1 at zenith
      
      // Sun Intensity: High at noon, zero at night
      dirLight.current.intensity = isDay ? Math.max(0, heightFactor * 1.5) : 0;
      
      // Sun Color: Orange at horizon, White at zenith
      const sunColor = new Color(0xffffff);
      const horizonColor = new Color(0xffaa00);
      
      if (heightFactor < 0.3) {
        dirLight.current.color.lerpColors(horizonColor, sunColor, heightFactor / 0.3);
      } else {
        dirLight.current.color.copy(sunColor);
      }

      // Ambient Light logic
      // Sunrise/Sunset: Warmer, dimmer
      // Noon: Bright, neutral
      // Night: Dark, cool blue
      if (isDay) {
         if (heightFactor < 0.2) {
             // Transition from Night to Sunrise
             ambientLight.current.intensity = 0.2 + heightFactor; 
             ambientLight.current.color.setHSL(0.1, 0.5, 0.5); // Orange-ish
         } else {
             // Day
             ambientLight.current.intensity = 0.3 + heightFactor * 0.2;
             ambientLight.current.color.setHSL(0.6, 0.1, 0.6); // Neutral daylight
         }
      } else {
         // Night
         ambientLight.current.intensity = 0.1;
         ambientLight.current.color.setHSL(0.6, 0.6, 0.2); // Moonlit blue
      }
    }

    // Fog adjustment to match sky/time
    if (scene.fog) {
      const fog = scene.fog as any;
      const heightFactor = sunY / radius;

      const dayColor = new Color('#87CEEB');
      const sunsetColor = new Color('#fd5e53');
      const nightColor = new Color('#0b1026');

      if (heightFactor > 0.15) {
        fog.color.lerp(dayColor, 0.05);
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
        <DayNightCycle />
        <fog attach="fog" args={['#87CEEB', 10, 60]} /> 

        <Suspense fallback={null}>
          <World playerPosition={playerPos} />
        </Suspense>
        
        <Player setPlayerPos={setPlayerPos} />
      </Canvas>
    </div>
  );
};

export default Game;