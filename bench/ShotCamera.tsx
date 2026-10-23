import { useEffect, useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { playerState } from '../playerState';
import { getWorldProbe } from './worldProbe';
import { Shot } from './shot';

const POLL_MS = 250;

// Replaces the Player in ?shot mode: places the camera and raises window.__SHOT_READY__
// once the registered world probe reports that loading has settled.
const ShotCamera: React.FC<{ shot: Shot }> = ({ shot }) => {
  const { camera } = useThree();

  useLayoutEffect(() => {
    const rad = Math.PI / 180;
    camera.rotation.order = 'YXZ';
    camera.position.set(shot.x, shot.y, shot.z);
    camera.rotation.set(shot.pitchDeg * rad, shot.yawDeg * rad, 0);
    playerState.x = shot.x;
    playerState.y = shot.y;
    playerState.z = shot.z;
  }, [camera, shot]);

  useEffect(() => {
    const flags = window as unknown as { __SHOT_READY__?: boolean };
    flags.__SHOT_READY__ = false;
    const timer = setInterval(() => {
      if (getWorldProbe()?.isReady()) {
        flags.__SHOT_READY__ = true;
        clearInterval(timer);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return null;
};

export default ShotCamera;
