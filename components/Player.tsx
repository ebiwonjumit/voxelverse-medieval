import React, { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, Euler } from 'three';
import { PointerLockControls } from '@react-three/drei';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { GRAVITY, JUMP_FORCE, MOVE_SPEED, INITIAL_SPAWN } from '../constants';
import { voxelWorld } from '../gameWorld';
import { playerState } from '../playerState';
import { CollisionWorld, moveAABB, playerBox } from '../engine/collision';
import { Cell } from '../engine/cell';

// The main thread's world answers unloaded chunks from the generator one block at a time, which is slow enough to
// notice when asked dozens of times a frame. Blocks around the player are remembered for two seconds instead.
// (Nothing changes blocks yet; when something does, it must clear this.)
const CELL_CACHE_FRAMES = 120;
const cellCache = new Map<number, Cell>();
let cacheFrameCount = 0;

const collisionWorld: CollisionWorld = {
  registry: voxelWorld.registry,
  getCell(x, y, z) {
    // x and z within +-2^20 and y within -256..255 fit in one exact number.
    const key = ((x + 1048576) * 2097152 + (z + 1048576)) * 512 + (y + 256);
    let cell = cellCache.get(key);
    if (cell === undefined) {
      cell = voxelWorld.getCell(x, y, z);
      cellCache.set(key, cell);
    }
    return cell;
  },
};

// A long frame (a stalled tab) must not turn into one huge fall or a huge sweep.
const MAX_STEP = 0.1;
// How fast the camera catches up after the player steps up onto a stair or slab, per second.
const STEP_SMOOTHING = 14;

const Player: React.FC = () => {
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
  const stepOffset = useRef(0); // how far the camera lags below the body after a step up

  useEffect(() => {
    camera.position.copy(INITIAL_SPAWN);
  }, [camera]);

  useFrame((_state, frameDelta) => {
    cacheFrameCount++;
    if (cacheFrameCount > CELL_CACHE_FRAMES) {
      cellCache.clear();
      cacheFrameCount = 0;
    }
    const delta = Math.min(frameDelta, MAX_STEP);

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

    const moving = inputVector.length() > 0;
    if (moving) {
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

    // Store grounded state from last frame for Minecraft-style jump logic
    wasGroundedLastFrame.current = isGrounded.current;

    // Jump before moving, from what the last move found: the box sweep below is the only collision test
    const canJump = wasGroundedLastFrame.current && jumpCooldown.current === 0;
    
    if (jump && canJump && !jumpPressed.current) {
      velocity.current.y = JUMP_FORCE;
      
      // Sprint-jumping bonus (Minecraft adds 0.2 units horizontal momentum)
      if (sprint && moving) {
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
      
      jumpPressed.current = true;
      jumpCooldown.current = 30; // ~0.5 seconds at 60fps (Minecraft uses 10 ticks at 20tps)
    }
    
    // Reset jump when key is released
    if (!jump) {
      jumpPressed.current = false;
    }

    // One sweep of the player's box against the block models: it stops at slabs, stairs and fences as drawn,
    // walks up anything 0.6 high or less, and cannot tunnel however long the frame.
    const pos = position.current;
    const move = moveAABB(collisionWorld, playerBox(pos.x, pos.y, pos.z), {
      x: velocity.current.x * delta,
      y: velocity.current.y * delta,
      z: velocity.current.z * delta,
    });
    pos.x += move.dx;
    pos.y += move.dy;
    pos.z += move.dz;
    if (move.hitX) velocity.current.x = 0;
    if (move.hitZ) velocity.current.z = 0;
    if (move.hitY) velocity.current.y = 0;
    isGrounded.current = move.onGround;

    // Reset cooldown when we land (Minecraft does this)
    if (isGrounded.current && !wasGroundedLastFrame.current) {
      jumpCooldown.current = 0;
    }

    // Void protection
    if (position.current.y < -20) {
      position.current.copy(INITIAL_SPAWN);
      velocity.current.set(0, 0, 0);
      isGrounded.current = false;
      wasGroundedLastFrame.current = false;
      jumpCooldown.current = 0;
      stepOffset.current = 0;
    }

    // Update Camera. A step up is a jump of up to 0.6 in one frame for the body, so the eyes ease up after it.
    stepOffset.current = (stepOffset.current - move.stepped) * Math.exp(-STEP_SMOOTHING * delta);
    const bob = moving && isGrounded.current ? Math.sin(bobTime.current) * 0.05 : 0;
    camera.position.set(position.current.x, position.current.y + stepOffset.current + bob, position.current.z);
    
    // Publish the position for the HUD and the atmosphere. This is a plain object, so it costs no React render.
    playerState.x = position.current.x;
    playerState.y = position.current.y;
    playerState.z = position.current.z;
  });

  return <PointerLockControls ref={controlsRef} />;
};

export default Player;