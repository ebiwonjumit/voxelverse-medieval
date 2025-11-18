import React, { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { PointerLockControls } from '@react-three/drei';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { GRAVITY, JUMP_FORCE, MOVE_SPEED, PLAYER_HEIGHT, INITIAL_SPAWN } from '../constants';
import { getTerrainHeight } from '../utils/terrain';

interface PlayerProps {
  setPlayerPos: (pos: Vector3) => void;
}

const Player: React.FC<PlayerProps> = ({ setPlayerPos }) => {
  const { camera } = useThree();
  const { moveForward, moveBackward, moveLeft, moveRight, jump } = useKeyboardControls();
  const velocity = useRef(new Vector3(0, 0, 0));
  const position = useRef(INITIAL_SPAWN.clone());
  const isJumping = useRef(false);

  useEffect(() => {
    camera.position.copy(INITIAL_SPAWN);
  }, [camera]);

  useFrame((state, delta) => {
    // 1. Input Handling
    const direction = new Vector3();
    const frontVector = new Vector3(
      0,
      0,
      Number(moveBackward) - Number(moveForward)
    );
    const sideVector = new Vector3(
      Number(moveLeft) - Number(moveRight),
      0,
      0
    );

    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(MOVE_SPEED * delta);

    // Apply direction to camera rotation
    // We only want the yaw (Y-axis rotation) of the camera for movement
    const euler = camera.rotation.clone();
    euler.x = 0;
    euler.z = 0;
    direction.applyEuler(euler);

    // 2. Physics (Velocity)
    velocity.current.x = direction.x;
    velocity.current.z = direction.z;

    // Gravity
    velocity.current.y -= GRAVITY * delta;

    // Jump
    if (jump && !isJumping.current) {
      velocity.current.y = JUMP_FORCE;
      isJumping.current = true;
    }

    // 3. Tentative Movement
    const nextX = position.current.x + velocity.current.x;
    const nextZ = position.current.z + velocity.current.z;
    const nextY = position.current.y + velocity.current.y * delta;

    // 4. Terrain Collision / Ground Clamp
    // Get ground height at the NEXT position
    const groundHeight = getTerrainHeight(Math.round(nextX), Math.round(nextZ));
    const playerFloor = groundHeight + PLAYER_HEIGHT;

    if (nextY < playerFloor) {
      // Land on ground
      position.current.y = playerFloor;
      velocity.current.y = 0;
      isJumping.current = false;
    } else {
      // In air
      position.current.y = nextY;
    }

    position.current.x = nextX;
    position.current.z = nextZ;

    // 5. Update Camera
    camera.position.copy(position.current);
    
    // Update global state for chunk loading
    setPlayerPos(position.current.clone());
  });

  return <PointerLockControls />;
};

export default Player;
