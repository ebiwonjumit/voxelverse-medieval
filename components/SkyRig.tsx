import React, { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { SkySystem } from '../render/SkySystem';
import { playerState } from '../playerState';

// A long frame (a stalled tab) must not make the sun jump.
const MAX_DT = 0.25;

// Puts the sky dome and the fog in the scene, moves the clock once a frame and listens for the sky keys (F4 and friends,
// see SkySystem.handleKey). It has to come before <World /> in the canvas so the chunks see this frame's daylight.
const SkyRig: React.FC<{ sky: SkySystem }> = ({ sky }) => {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    scene.add(sky.group);
    scene.fog = sky.fog;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (sky.handleKey(e.code)) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      scene.remove(sky.group);
      if (scene.fog === sky.fog) scene.fog = null;
    };
  }, [scene, sky]);

  useFrame(({ camera }, delta) => {
    sky.update(Math.min(delta, MAX_DT), camera.position.x, camera.position.y, camera.position.z, playerState.x, playerState.z);
  });

  return null;
};

export default SkyRig;
