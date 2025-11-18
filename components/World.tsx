import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { InstancedMesh, Object3D, Color, Vector3 } from 'three';
import { BlockType, COLORS, RENDER_DISTANCE, CHUNK_SIZE } from '../constants';
import { getBlockAt } from '../utils/terrain';

interface WorldProps {
  playerPosition: Vector3;
}

const tempObject = new Object3D();
const tempColor = new Color();

const World: React.FC<WorldProps> = ({ playerPosition }) => {
  const meshRef = useRef<InstancedMesh>(null);

  // Calculate chunk coordinates of player
  const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
  const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

  // Determine total visible blocks count for buffer allocation
  // (Chunks * Width * Depth * Height) approx
  // For a simple demo, we'll just generate a fixed area around 0,0 if we don't do dynamic chunk loading
  // or we re-calculate the instances when player moves across chunk boundaries.
  // For smooth React performance, let's memoize the data generation based on chunk coords.
  
  const { instances, count } = useMemo(() => {
    const data: { x: number; y: number; z: number; type: BlockType }[] = [];
    
    // Iterate chunks within render distance
    for (let cx = playerChunkX - RENDER_DISTANCE; cx <= playerChunkX + RENDER_DISTANCE; cx++) {
      for (let cz = playerChunkZ - RENDER_DISTANCE; cz <= playerChunkZ + RENDER_DISTANCE; cz++) {
        
        const startX = cx * CHUNK_SIZE;
        const startZ = cz * CHUNK_SIZE;

        // Iterate blocks in chunk
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = startX + x;
            const worldZ = startZ + z;
            
            // Optimization: Only check relevant height range or simplified columns
            // For this demo, we scan a reasonable vertical range.
            // To optimize: find ground height, then render slightly below and above.
            
            // We can't easily import getHeight here without circular deps or re-import.
            // We will accept the cost of `getBlockAt` logic for now.
            // Scan from Y= -5 to Y= 35
            for (let y = -2; y < 35; y++) {
               const block = getBlockAt(worldX, y, worldZ);
               
               // Culling: Don't render if completely surrounded (simple check)
               // For this demo, we skip strict face culling for simplicity of code
               // and just skip AIR.
               if (block !== BlockType.AIR) {
                   data.push({ x: worldX, y, z: worldZ, type: block });
               }
            }
          }
        }
      }
    }
    return { instances: data, count: data.length };
  }, [playerChunkX, playerChunkZ]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;

    let index = 0;
    for (const instance of instances) {
      // Position
      tempObject.position.set(instance.x, instance.y, instance.z);
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(index, tempObject.matrix);

      // Color
      let colorHex = '#ffffff';
      switch (instance.type) {
        case BlockType.GRASS: colorHex = COLORS.GRASS; break;
        case BlockType.DIRT: colorHex = COLORS.DIRT; break;
        case BlockType.STONE: colorHex = COLORS.STONE; break;
        case BlockType.SAND: colorHex = COLORS.SAND; break;
        case BlockType.WATER: colorHex = COLORS.WATER; break;
        case BlockType.WOOD: colorHex = COLORS.WOOD; break;
        case BlockType.LEAVES: colorHex = COLORS.LEAVES; break;
        case BlockType.SNOW: colorHex = COLORS.SNOW; break;
        case BlockType.ROOF: colorHex = COLORS.ROOF; break;
        case BlockType.PATH: colorHex = COLORS.PATH; break;
      }
      
      tempColor.set(colorHex);
      // Simple fake Ambient Occlusion / Lighting variation based on height
      // tempColor.multiplyScalar(0.8 + (instance.y / 40) * 0.2); 
      
      meshRef.current.setColorAt(index, tempColor);
      index++;
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

  }, [instances]);

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined, undefined, count]} 
      castShadow 
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial attach="material" roughness={0.8} metalness={0.1} />
    </instancedMesh>
  );
};

export default World;
