import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ChunkRenderer } from '../render/ChunkRenderer';

// The world is drawn by a ChunkRenderer that builds chunk meshes in workers. This component only owns its
// lifetime and tells it where the camera is once a frame.
const World: React.FC = () => {
  const scene = useThree((state) => state.scene);
  const renderer = useRef<ChunkRenderer | null>(null);

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
    renderer.current?.update(camera.position.x, camera.position.z, clock.elapsedTime);
  });

  return null;
};

export default World;
