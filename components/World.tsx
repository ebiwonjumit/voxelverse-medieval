import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ChunkRenderer } from '../render/ChunkRenderer';
import { parseDaylight, parseRenderDistance } from '../bench/shot';
import { SkySystem } from '../render/SkySystem';

// The world is drawn by a ChunkRenderer that builds chunk meshes in workers. This component only owns its
// lifetime and tells it where the camera is and what time of day it is once a frame.
const World: React.FC<{ sky: SkySystem }> = ({ sky }) => {
  const scene = useThree((state) => state.scene);
  const renderer = useRef<ChunkRenderer | null>(null);
  // The sky clock sets how much sky light the chunks show (1 at noon); ?daylight=0..1 overrides it for tests of the light.
  const daylightOverride = useMemo(() => parseDaylight(window.location.search), []);

  useEffect(() => {
    // Only screenshots (?shot=...&rd=14) change the render distance; the game and the benchmark keep the constant.
    const search = window.location.search;
    const rd = new URLSearchParams(search).has('shot') ? parseRenderDistance(search) : null;
    const created = new ChunkRenderer(rd === null ? {} : { renderDistance: rd });
    renderer.current = created;
    scene.add(created.group);
    return () => {
      scene.remove(created.group);
      created.dispose();
      renderer.current = null;
    };
  }, [scene]);

  useFrame(({ camera, clock }) => {
    const [r, g, b] = sky.state.skyLight;
    renderer.current?.setDaylight(daylightOverride ?? sky.state.daylight);
    renderer.current?.setSkyLightColor(r, g, b);
    renderer.current?.update(camera.position.x, camera.position.z, clock.elapsedTime);
  });

  return null;
};

export default World;
