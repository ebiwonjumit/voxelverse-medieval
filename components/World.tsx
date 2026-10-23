import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ChunkRenderer } from '../render/ChunkRenderer';
import { parseDaylight } from '../bench/shot';

// The world is drawn by a ChunkRenderer that builds chunk meshes in workers. This component only owns its
// lifetime and tells it where the camera is once a frame.
const World: React.FC = () => {
  const scene = useThree((state) => state.scene);
  const renderer = useRef<ChunkRenderer | null>(null);
  // The sky light the chunks show, 1 at noon. The day/night cycle will drive this; until then ?daylight=0..1 picks it.
  const daylight = useMemo(() => parseDaylight(window.location.search) ?? 1, []);

  useEffect(() => {
    const created = new ChunkRenderer();
    renderer.current = created;
    scene.add(created.group);
    return () => {
      scene.remove(created.group);
      created.dispose();
      renderer.current = null;
    };
  }, [scene]);

  useFrame(({ camera, clock }) => {
    renderer.current?.setDaylight(daylight);
    renderer.current?.update(camera.position.x, camera.position.z, clock.elapsedTime);
  });

  return null;
};

export default World;
