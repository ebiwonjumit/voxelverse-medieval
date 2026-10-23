import React, { useState, Suspense, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import World from './World';
import SkyRig from './SkyRig';
import Player from './Player';
import { MILE } from '../constants';
import { SkyClock, SkySystem, parseSkyOptions } from '../render/SkySystem';
import { voxelWorld } from '../gameWorld';
import { playerState } from '../playerState';
import Benchmark, { BenchMode, BenchResult } from '../bench/Benchmark';
import BenchResults from '../bench/BenchResults';
import ShotCamera from '../bench/ShotCamera';
import { getWorldProbe } from '../bench/worldProbe';
import { parseShot } from '../bench/shot';

// How often the HUD and the atmosphere look at playerState. The player moves every frame, but nothing
// on screen needs React to hear about it that often.
const PLAYER_POLL_MS = 100;

const Game: React.FC = () => {
  // ?shot=x,y,z,yawDeg,pitchDeg parks the camera for screenshots, hides the HUD and replaces the Player.
  const shot = useMemo(() => parseShot(window.location.search), []);
  const [playerPos, setPlayerPos] = useState(() => ({ x: playerState.x, y: playerState.y, z: playerState.z }));
  const [loadedChunks, setLoadedChunks] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showStats, setShowStats] = useState(false);

  // ?bench runs a scripted flythrough instead of the player; ?bench=quick is a short smoke run
  // and ?bench=soak walks a closed loop for 90 s while recording geometry counts.
  const benchMode = useMemo((): BenchMode | null => {
    if (shot) return null;
    const value = new URLSearchParams(window.location.search).get('bench');
    return value === null ? null : value === 'quick' || value === 'soak' ? value : 'full';
  }, [shot]);
  const [benchLeg, setBenchLeg] = useState<string | null>(null);
  const [benchResult, setBenchResult] = useState<BenchResult | null>(null);

  // The sky owns the clock, the dome, the fog and the daylight the chunks show. A screenshot gets noon unless the address
  // says otherwise (?sky=dawn, ?time=18:30, see parseSkyOptions), so the shots of one viewpoint can be compared.
  const sky = useMemo(
    () => new SkySystem({ clock: new SkyClock(parseSkyOptions(window.location.search, shot !== null)) }),
    [shot],
  );
  useEffect(() => () => sky.dispose(), [sky]);
  const [skyInfo, setSkyInfo] = useState(() => sky.clock.describe());

  // Copy playerState into React state about 10 times a second, and only when the rounded position changed.
  useEffect(() => {
    const timer = setInterval(() => {
      const x = Math.round(playerState.x);
      const y = Math.round(playerState.y);
      const z = Math.round(playerState.z);
      setPlayerPos((prev) => (prev.x === x && prev.y === y && prev.z === z ? prev : { x, y, z }));
      setLoadedChunks(getWorldProbe()?.getStats?.().chunks ?? 0);
      setSkyInfo(sky.clock.describe());
    }, PLAYER_POLL_MS);
    return () => clearInterval(timer);
  }, [sky]);

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
    
    const currentZone = voxelWorld.zoneNameAt(x, z);
    
    // Calculate distance to zone EDGE (distance to center - radius)
    // If negative (inside zone), show 0.0
    const distToCenter_SAO = Math.sqrt(x*x + z*z);
    const distSAO = (Math.max(0, distToCenter_SAO - 200) / MILE).toFixed(1);
    
    const distToCenter_Tempest = Math.sqrt(Math.pow(x - 3 * MILE, 2) + Math.pow(z, 2));
    const distTempest = (Math.max(0, distToCenter_Tempest - 700) / MILE).toFixed(1);
    
    const distToCenter_Amestris = Math.sqrt(Math.pow(x - (-3 * MILE), 2) + Math.pow(z, 2));
    const distAmestris = (Math.max(0, distToCenter_Amestris - 700) / MILE).toFixed(1);
    
    const distToCenter_Bosse = Math.sqrt(Math.pow(x, 2) + Math.pow(z - (-3 * MILE), 2));
    const distBosse = (Math.max(0, distToCenter_Bosse - 700) / MILE).toFixed(1);
    
    const distToCenter_Fremme = Math.sqrt(Math.pow(x - 1600, 2) + Math.pow(z - (-1600), 2));
    const distFremme = (Math.max(0, distToCenter_Fremme - 250) / MILE).toFixed(1);
    
    const distToCenter_Magnolia = Math.sqrt(Math.pow(x - (-1600), 2) + Math.pow(z - 1600, 2));
    const distMagnolia = (Math.max(0, distToCenter_Magnolia - 250) / MILE).toFixed(1);

    return { x, y, z, currentZone, distSAO, distTempest, distAmestris, distBosse, distFremme, distMagnolia };
  }

  const hud = getHUDInfo();

  return (
    <div className="relative w-full h-full">
      {!shot && <>
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
            <div>XYZ: {hud.x}, {hud.y}, {hud.z}</div>
            <div>Time: {skyInfo}</div>
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
              <div><span className="text-gray-400">F4</span> Sky preset</div>
              <div><span className="text-gray-400">[ ]</span> Time -1h / +1h</div>
              <div><span className="text-gray-400">- =</span> Time slower / faster</div>
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
            <div>Chunks Loaded: {loadedChunks}</div>
            <div>Time: {skyInfo}</div>
            <div className="text-gray-400 text-xs mt-2">Press F3 to toggle</div>
          </div>
        </div>
      )}
      
      {benchMode && <BenchResults running={benchLeg} result={benchResult} />}

      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 -ml-2 -mt-2 pointer-events-none z-10">
        <div className="w-full h-0.5 bg-white/80 absolute top-1/2 transform -translate-y-1/2"></div>
        <div className="h-full w-0.5 bg-white/80 absolute left-1/2 transform -translate-x-1/2"></div>
      </div>
      </>}

      <Canvas camera={{ fov: 75 }}>
        {/* Show FPS stats in corner when debug is on */}
        {showStats && !shot && <Stats className="!left-auto !right-4 !top-32" />}
        
        <SkyRig sky={sky} />

        <Suspense fallback={null}>
          <World sky={sky} />
        </Suspense>
        
        {shot ? (
          <ShotCamera shot={shot} />
        ) : benchMode ? (
          <Benchmark
            mode={benchMode}
            onProgress={setBenchLeg}
            onDone={setBenchResult}
          />
        ) : (
          <Player />
        )}
      </Canvas>
    </div>
  );
};

export default Game;