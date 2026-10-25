import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { EffectsSystem } from '../render/EffectsSystem';
import { SkySystem } from '../render/SkySystem';
import { effectSettings } from '../render/effectSettings';
import { addReadyGate, addStatsSource } from '../bench/worldProbe';

// A long frame (a stalled tab) must not throw particles across the map; the sim clamps again on its own.
const MAX_DT = 0.1;

// Puts the effects (particles and clouds) in the scene and moves them once a frame, from the camera, the game's clock, the
// sky and the switches of the debug panel (see render/EffectsSystem.ts and docs/effects.md). It comes after the sky, so the
// sky it reads is this frame's, and after the player or the screenshot camera, so the camera it reads is too.
const EffectsRig: React.FC<{ effects: EffectsSystem; sky: SkySystem }> = ({ effects, sky }) => {
  const scene = useThree((state) => state.scene);
  // What the effects cost the main thread (their update, not the GPU), for the soak's counters: total milliseconds and frames.
  const cost = useRef({ ms: 0, frames: 0, max: 0 });

  useEffect(() => {
    scene.add(effects.group);
    // For tools and a look in the console: the system the page is running.
    (window as unknown as { __EFFECTS__?: EffectsSystem }).__EFFECTS__ = effects;
    // A screenshot waits for the particles to fill the air, and the soak records how many there are.
    const removeGate = addReadyGate(() => effects.isReady(effectSettings));
    const removeStats = addStatsSource(() => ({
      fxGlow: effects.sim.glowDraw,
      fxSoft: effects.sim.softDraw,
      fxSites: effects.sites.size,
      fxUpdateMs: cost.current.frames ? Math.round((cost.current.ms / cost.current.frames) * 1000) / 1000 : 0,
      fxUpdateMaxMs: Math.round(cost.current.max * 1000) / 1000,
    }));
    return () => {
      removeGate();
      removeStats();
      delete (window as unknown as { __EFFECTS__?: EffectsSystem }).__EFFECTS__;
      scene.remove(effects.group);
    };
  }, [scene, effects]);

  useFrame(({ camera, clock, gl }, delta) => {
    const fov = (camera as PerspectiveCamera).fov ?? 75;
    const t0 = performance.now();
    effects.update(
      Math.min(delta, MAX_DT), clock.elapsedTime, camera.position.x, camera.position.y, camera.position.z, fov, gl.domElement.height,
      sky.state, effectSettings,
    );
    const took = performance.now() - t0;
    cost.current.ms += took;
    cost.current.frames++;
    if (took > cost.current.max) cost.current.max = took;
  });

  return null;
};

export default EffectsRig;
