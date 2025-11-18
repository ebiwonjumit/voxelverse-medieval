import React, { useMemo, useRef, useLayoutEffect, useEffect, useState } from 'react';
import { InstancedMesh, Object3D, Color, Vector3, CanvasTexture, NearestFilter, RepeatWrapping } from 'three';
import { BlockType, COLORS, RENDER_DISTANCE, CHUNK_SIZE } from '../constants';
import { getBlockAt } from '../utils/terrain';

interface WorldProps {
  playerPosition: Vector3;
}

const tempObject = new Object3D();
const tempColor = new Color();

// Helper to create a procedural noise texture
const createNoiseTexture = () => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const val = 200 + Math.random() * 55; // Light noise
    data[i] = val;     // R
    data[i + 1] = val; // G
    data[i + 2] = val; // B
    data[i + 3] = 255; // Alpha
  }

  ctx.putImageData(imageData, 0, 0);
  return new CanvasTexture(canvas);
};

const World: React.FC<WorldProps> = ({ playerPosition }) => {
  const meshRef = useRef<InstancedMesh>(null);
  const [texture, setTexture] = useState<CanvasTexture | null>(null);

  useEffect(() => {
    const tex = createNoiseTexture();
    if (tex) {
        tex.magFilter = NearestFilter;
        tex.minFilter = NearestFilter;
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        setTexture(tex);
    }
  }, []);

  // Calculate chunk coordinates
  const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
  const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

  const { instances, count } = useMemo(() => {
    const data: { x: number; y: number; z: number; type: BlockType }[] = [];
    
    for (let cx = playerChunkX - RENDER_DISTANCE; cx <= playerChunkX + RENDER_DISTANCE; cx++) {
      for (let cz = playerChunkZ - RENDER_DISTANCE; cz <= playerChunkZ + RENDER_DISTANCE; cz++) {
        
        const startX = cx * CHUNK_SIZE;
        const startZ = cz * CHUNK_SIZE;

        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = startX + x;
            const worldZ = startZ + z;
            
            // Expanded height scan for buildings
            for (let y = -2; y < 45; y++) {
               const block = getBlockAt(worldX, y, worldZ);
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
      tempObject.position.set(instance.x, instance.y, instance.z);
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(index, tempObject.matrix);

      let colorHex = '#ffffff';
      switch (instance.type) {
        case BlockType.GRASS: colorHex = COLORS.GRASS; break;
        case BlockType.DIRT: colorHex = COLORS.DIRT; break;
        case BlockType.STONE: colorHex = COLORS.STONE; break;
        case BlockType.SAND: colorHex = COLORS.SAND; break;
        case BlockType.WATER: colorHex = COLORS.WATER; break;
        case BlockType.SNOW: colorHex = COLORS.SNOW; break;
        // Architecture
        case BlockType.STONE_BRICK: colorHex = COLORS.STONE_BRICK; break;
        case BlockType.WOOD_LOG: colorHex = COLORS.WOOD_LOG; break;
        case BlockType.WOOD_PLANK: colorHex = COLORS.WOOD_PLANK; break;
        case BlockType.PLASTER: colorHex = COLORS.PLASTER; break;
        case BlockType.ROOF_RED: colorHex = COLORS.ROOF_RED; break;
        case BlockType.ROOF_BLUE: colorHex = COLORS.ROOF_BLUE; break;
        case BlockType.GLASS: colorHex = COLORS.GLASS; break;
        case BlockType.COBBLESTONE: colorHex = COLORS.COBBLESTONE; break;
        case BlockType.PATH: colorHex = COLORS.PATH; break;
        case BlockType.LEAVES: colorHex = COLORS.LEAVES; break;
      }
      
      tempColor.set(colorHex);
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
      <meshStandardMaterial 
        attach="material" 
        roughness={0.9} 
        metalness={0.1} 
        map={texture}
      />
    </instancedMesh>
  );
};

export default World;