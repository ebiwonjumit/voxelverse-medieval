import React, { useEffect } from 'react';
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
    effects.update(
      Math.min(delta, MAX_DT), clock.elapsedTime, camera.position.x, camera.position.y, camera.position.z, fov, gl.domElement.height,
      sky.state, effectSettings,
    );
  });

  return null;
};

export default EffectsRig;
