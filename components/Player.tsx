
import React, { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, Euler } from 'three';
import { PointerLockControls } from '@react-three/drei';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { GRAVITY, JUMP_FORCE, MOVE_SPEED, PLAYER_HEIGHT, PLAYER_RADIUS, INITIAL_SPAWN, BlockType } from '../constants';
import { getBlockAt } from '../utils/terrain';

interface PlayerProps {
  setPlayerPos: (pos: Vector3) => void;
}

const Player: React.FC<PlayerProps> = ({ setPlayerPos }) => {
  const { camera } = useThree();
  const { moveForward, moveBackward, moveLeft, moveRight, jump } = useKeyboardControls();
  const velocity = useRef(new Vector3(0, 0, 0));
  const position = useRef(INITIAL_SPAWN.clone());
  const isJumping = useRef(false);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    camera.position.copy(INITIAL_SPAWN);
  }, [camera]);

  // Helper to check if a voxel is solid
  const isSolid = (x: number, y: number, z: number): boolean => {
    const block = getBlockAt(Math.round(x), Math.round(y), Math.round(z));
    return block !== BlockType.AIR && block !== BlockType.WATER && block !== BlockType.SUGARCANE && block !== BlockType.TALL_GRASS && block !== BlockType.FLOWER_RED && block !== BlockType.FLOWER_YELLOW;
  };

  // Check if the player's bounding box overlaps with any solid blocks
  const checkCollision = (pos: Vector3): boolean => {
    // Player Bounding Box
    // Height is 1.8. Camera is at top (pos). Feet are at pos.y - 1.8.
    // Radius 0.4
    
    const feetY = pos.y - PLAYER_HEIGHT;
    const headY = pos.y - 0.2; // Slightly below camera to allow looking closely at ceilings

    // Check a grid of blocks around the player
    const minX = Math.floor(pos.x - PLAYER_RADIUS);
    const maxX = Math.ceil(pos.x + PLAYER_RADIUS);
    const minZ = Math.floor(pos.z - PLAYER_RADIUS);
    const maxZ = Math.ceil(pos.z + PLAYER_RADIUS);
    const minY = Math.floor(feetY); 
    const maxY = Math.floor(headY);

    for (let x = minX; x < maxX; x++) {
      for (let z = minZ; z < maxZ; z++) {
        for (let y = minY; y <= maxY; y++) {
           if (isSolid(x, y, z)) {
             // Precise AABB overlap test
             const blockMinX = x - 0.5;
             const blockMaxX = x + 0.5;
             const blockMinY = y - 0.5;
             const blockMaxY = y + 0.5;
             const blockMinZ = z - 0.5;
             const blockMaxZ = z + 0.5;

             // Player bounds
             const playerMinX = pos.x - PLAYER_RADIUS;
             const playerMaxX = pos.x + PLAYER_RADIUS;
             const playerMinY = feetY;
             const playerMaxY = pos.y;
             const playerMinZ = pos.z - PLAYER_RADIUS;
             const playerMaxZ = pos.z + PLAYER_RADIUS;

             if (playerMinX < blockMaxX && playerMaxX > blockMinX &&
                 playerMinY < blockMaxY && playerMaxY > blockMinY &&
                 playerMinZ < blockMaxZ && playerMaxZ > blockMinZ) {
                 return true;
             }
           }
        }
      }
    }
    return false;
  };

  useFrame((state, delta) => {
    // 1. Input Handling (Using explicit vectors to fix direction issues)
    const inputVector = new Vector3(0, 0, 0);
    
    // In Three.js: Forward is -Z, Right is +X
    if (moveForward) inputVector.z -= 1;
    if (moveBackward) inputVector.z += 1;
    if (moveLeft) inputVector.x -= 1;
    if (moveRight) inputVector.x += 1;

    if (inputVector.length() > 0) {
      inputVector.normalize();

      const forward = new Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new Vector3();
      right.crossVectors(forward, new Vector3(0, 1, 0));
      right.normalize();

      const direction = new Vector3();
      direction.addScaledVector(forward, -inputVector.z); 
      direction.addScaledVector(right, inputVector.x);    
      direction.multiplyScalar(MOVE_SPEED * delta);

      velocity.current.x = direction.x;
      velocity.current.z = direction.z;
    } else {
      velocity.current.x = 0;
      velocity.current.z = 0;
    }

    // 2. Physics Loop
    
    // Apply Gravity
    velocity.current.y -= GRAVITY * delta;

    // Jump
    if (jump && !isJumping.current) {
      velocity.current.y = JUMP_FORCE;
      isJumping.current = true;
    }

    // X Movement
    const originalPos = position.current.clone();
    position.current.x += velocity.current.x;
    
    if (checkCollision(position.current)) {
      position.current.x = originalPos.x; // Revert X
      velocity.current.x *= 0.85;
    }

    // Z Movement
    position.current.z += velocity.current.z;
    
    if (checkCollision(position.current)) {
      position.current.z = originalPos.z; // Revert Z
      velocity.current.z *= 0.85;
    }

    // Y Movement
    position.current.y += velocity.current.y * delta;
    
    if (checkCollision(position.current)) {
        const falling = velocity.current.y < 0;
        
        // Revert Y
        position.current.y = originalPos.y;
        velocity.current.y = 0;

        if (falling) {
            isJumping.current = false;
        }
    }
    
    // Safety Floor (Void protection) - Fixes infinite falling
    if (position.current.y < -20) {
        position.current.y = 30; // Teleport back up to safe height
        velocity.current.set(0,0,0);
    }

    // 5. Update Camera
    camera.position.copy(position.current);
    
    // Update global state for chunk loading
    setPlayerPos(position.current.clone());
  });

  return <PointerLockControls ref={controlsRef} />;
};

export default Player;
