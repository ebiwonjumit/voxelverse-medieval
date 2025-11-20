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

// Cache for collision checks to avoid repeated getBlockAt calls
const collisionCache = new Map<string, boolean>();
let cacheFrameCount = 0;

const Player: React.FC<PlayerProps> = ({ setPlayerPos }) => {
  const { camera } = useThree();
  const { moveForward, moveBackward, moveLeft, moveRight, jump, sprint } = useKeyboardControls();
  const velocity = useRef(new Vector3(0, 0, 0));
  const position = useRef(INITIAL_SPAWN.clone());
  const isGrounded = useRef(false);
  const controlsRef = useRef<any>(null);
  const bobTime = useRef(0);
  const jumpPressed = useRef(false);
  const jumpCooldown = useRef(0); 
  const wasGroundedLastFrame = useRef(false); // Track if we were grounded last frame

  useEffect(() => {
    camera.position.copy(INITIAL_SPAWN);
  }, [camera]);

  // Cached solid check
  const isSolid = (x: number, y: number, z: number): boolean => {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    
    // Clear cache every 120 frames (2 seconds at 60fps) - reduced frequency
    if (cacheFrameCount > 120) {
      collisionCache.clear();
      cacheFrameCount = 0;
    }
    
    if (collisionCache.has(key)) {
      return collisionCache.get(key)!;
    }
    
    const block = getBlockAt(Math.round(x), Math.round(y), Math.round(z));
    const solid = block !== BlockType.AIR && 
           block !== BlockType.WATER && 
           block !== BlockType.SUGARCANE && 
           block !== BlockType.TALL_GRASS && 
           block !== BlockType.FLOWER_RED && 
           block !== BlockType.FLOWER_YELLOW &&
           block !== BlockType.WHEAT &&
           block !== BlockType.WHEAT_STAGE_1 &&
           block !== BlockType.WHEAT_STAGE_2 &&
           block !== BlockType.LILY_PAD;
    
    collisionCache.set(key, solid);
    return solid;
  };

  // Optimized collision check - only check likely collision points
  const checkCollision = (pos: Vector3, isVertical: boolean = false): boolean => {
    const feetY = pos.y - PLAYER_HEIGHT;
    const headY = pos.y - 0.2;

    if (isVertical) {
      // For vertical movement, only check head and feet positions
      const checkPoints = [
        { x: pos.x, y: feetY, z: pos.z },
        { x: pos.x, y: headY, z: pos.z },
      ];
      
      for (const point of checkPoints) {
        if (isSolid(point.x, point.y, point.z)) {
          return true;
        }
      }
    } else {
      // For horizontal movement, check 4 cardinal points (reduced from 8)
      const angles = 4;
      for (let i = 0; i < angles; i++) {
        const angle = (i / angles) * Math.PI * 2;
        const x = pos.x + Math.cos(angle) * PLAYER_RADIUS;
        const z = pos.z + Math.sin(angle) * PLAYER_RADIUS;
        
        // Check at fewer heights (2 instead of 4+)
        if (isSolid(x, feetY, z) || isSolid(x, headY, z)) {
          return true;
        }
      }
    }
    
    return false;
  };

  // Check if player is on ground
  const checkGrounded = (pos: Vector3): boolean => {
    const feetY = pos.y - PLAYER_HEIGHT - 0.1; // Slightly below feet
    
    // Check center and 2 corner points (reduced from 5)
    const points = [
      { x: pos.x, z: pos.z },
      { x: pos.x + PLAYER_RADIUS * 0.7, z: pos.z + PLAYER_RADIUS * 0.7 },
      { x: pos.x - PLAYER_RADIUS * 0.7, z: pos.z - PLAYER_RADIUS * 0.7 },
    ];
    
    for (const point of points) {
      if (isSolid(point.x, feetY, point.z)) {
        return true;
      }
    }
    return false;
  };

  // Auto step-up for single blocks
  const tryStepUp = (pos: Vector3, originalPos: Vector3): boolean => {
    const stepHeight = 0.6; // Can step up 0.6 blocks
    const testPos = pos.clone();
    testPos.y += stepHeight;
    
    if (!checkCollision(testPos, false)) {
      // Check if there's a block to step on
      const feetY = pos.y - PLAYER_HEIGHT;
      if (isSolid(pos.x, feetY, pos.z)) {
        position.current.y = originalPos.y + stepHeight;
        return true;
      }
    }
    return false;
  };

  useFrame((state, delta) => {
    cacheFrameCount++;
    
    // Decrement jump cooldown 
    // At 60fps, we need ~30 frames for 0.5s
    if (jumpCooldown.current > 0) {
      jumpCooldown.current--;
    }
    
    // 1. Input Handling
    const inputVector = new Vector3(0, 0, 0);
    
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
      
      // Sprint modifier
      const speed = sprint ? MOVE_SPEED * 2 : MOVE_SPEED;
      const targetVelocityX = direction.x * speed;
      const targetVelocityZ = direction.z * speed;
      
      // Smooth acceleration using lerp
      const acceleration = 0.15;
      velocity.current.x += (targetVelocityX - velocity.current.x) * acceleration;
      velocity.current.z += (targetVelocityZ - velocity.current.z) * acceleration;
      
      // Camera bobbing when moving
      if (isGrounded.current) {
        bobTime.current += delta * 10;
        const bobAmount = 0.05;
        const bob = Math.sin(bobTime.current) * bobAmount;
        camera.position.y = position.current.y + bob;
      }
    } else {
      // Smooth deceleration
      velocity.current.x *= 0.85;
      velocity.current.z *= 0.85;
      bobTime.current = 0;
    }

    // 2. Physics
    
    // Apply Gravity (Minecraft uses -0.08 per tick with 0.98 drag)
    velocity.current.y -= GRAVITY * delta;
    
    // Terminal velocity
    velocity.current.y = Math.max(velocity.current.y, -50);

    const originalPos = position.current.clone();
    
    // Store grounded state from last frame for Minecraft-style jump logic
    wasGroundedLastFrame.current = isGrounded.current;
    
    // Y Movement first (so we can check grounded state after)
    position.current.y += velocity.current.y * delta;
    if (checkCollision(position.current, true)) {
      position.current.y = originalPos.y;
      velocity.current.y = 0;
      // Only set grounded when we hit something from above (falling down)
      isGrounded.current = true;
    } else {
      // In air, check if we're actually on ground
      isGrounded.current = checkGrounded(position.current);
    }
    
   
    const canJump = (wasGroundedLastFrame.current || isGrounded.current) && 
                    jumpCooldown.current === 0;
    
    if (jump && canJump && !jumpPressed.current) {
      velocity.current.y = JUMP_FORCE;
      
      // Sprint-jumping bonus (Minecraft adds 0.2 units horizontal momentum)
      if (sprint && inputVector.length() > 0) {
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
        direction.normalize();
        
        // Add sprint-jump boost (scaled appropriately for our game)
        velocity.current.x += direction.x * 0.2;
        velocity.current.z += direction.z * 0.2;
      }
      
      isGrounded.current = false;
      jumpPressed.current = true;
      jumpCooldown.current = 30; // ~0.5 seconds at 60fps (Minecraft uses 10 ticks at 20tps)
    }
    
    // Reset jump when key is released
    if (!jump) {
      jumpPressed.current = false;
    }
    
    // Reset cooldown when we land (Minecraft does this)
    if (isGrounded.current && !wasGroundedLastFrame.current) {
      jumpCooldown.current = 0;
    }
    
    // X Movement
    position.current.x += velocity.current.x * delta;
    if (checkCollision(position.current, false)) {
      // Try step-up
      if (!tryStepUp(position.current, originalPos)) {
        position.current.x = originalPos.x;
        velocity.current.x = 0;
      }
    }

    // Z Movement  
    position.current.z += velocity.current.z * delta;
    if (checkCollision(position.current, false)) {
      // Try step-up
      if (!tryStepUp(position.current, originalPos)) {
        position.current.z = originalPos.z;
        velocity.current.z = 0;
      }
    }
    
    // Void protection
    if (position.current.y < -20) {
      position.current.copy(INITIAL_SPAWN);
      velocity.current.set(0, 0, 0);
      isGrounded.current = false;
      wasGroundedLastFrame.current = false;
      jumpCooldown.current = 0;
    }

    // Update Camera (with smooth following)
    if (!inputVector.length()) {
      camera.position.copy(position.current);
    } else {
      camera.position.x = position.current.x;
      camera.position.z = position.current.z;
      // Y is set by bobbing or directly
      if (!isGrounded.current) {
        camera.position.y = position.current.y;
      }
    }
    
    // Update global state
    setPlayerPos(position.current.clone());
  });

  return <PointerLockControls ref={controlsRef} />;
};

export default Player;