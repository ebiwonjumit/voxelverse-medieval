import React, { useMemo, useRef, useLayoutEffect, useEffect, useState } from 'react';
import { InstancedMesh, Object3D, Color, Vector3, CanvasTexture, NearestFilter, RepeatWrapping } from 'three';
import { BlockType, COLORS, RENDER_DISTANCE, CHUNK_SIZE, MILE } from '../constants';
import { getBlockAt } from '../utils/terrain';

interface WorldProps {
  playerPosition: Vector3;
}

const tempObject = new Object3D();
const tempColor = new Color();

// Predefined colors for biome blending
const C_SAO = new Color(COLORS.GRASS_SAO);
const C_TEMPEST = new Color(COLORS.GRASS_TEMPEST);
const C_AMESTRIS = new Color(COLORS.GRASS_AMESTRIS);
const C_BOSSE = new Color(COLORS.GRASS_BOSSE);
const C_DEFAULT = new Color(COLORS.GRASS);

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

const Chunk: React.FC<{ chunkX: number; chunkZ: number }> = React.memo(({ chunkX, chunkZ }) => {
  const meshRef = useRef<InstancedMesh>(null);
  
  const { instances, count } = useMemo(() => {
    const data: { x: number; y: number; z: number; type: BlockType }[] = [];
    const startX = chunkX * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = startX + x;
        const worldZ = startZ + z;
        
        // Optimization: Scan relevant heights
        // In real app, you'd query heightmap first
        for (let y = -5; y < 80; y++) {
           const block = getBlockAt(worldX, y, worldZ);
           if (block !== BlockType.AIR) {
               data.push({ x: worldX, y, z: worldZ, type: block });
           }
        }
      }
    }
    return { instances: data, count: data.length };
  }, [chunkX, chunkZ]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;

    let index = 0;
    for (const instance of instances) {
      tempObject.scale.set(1, 1, 1);
      tempObject.position.set(instance.x, instance.y, instance.z);
      tempObject.rotation.set(0, 0, 0);

      // Decoration Scaling
      if (instance.type === BlockType.FLOWER_YELLOW || instance.type === BlockType.FLOWER_RED) {
          tempObject.scale.set(0.3, 0.4, 0.3);
          tempObject.position.set(instance.x, instance.y - 0.3, instance.z);
      } else if (instance.type === BlockType.SMALL_ROCK) {
          tempObject.scale.set(0.4, 0.2, 0.4);
          tempObject.position.set(instance.x, instance.y - 0.4, instance.z);
      } else if (instance.type === BlockType.MAGIC_CRYSTAL) {
          tempObject.scale.set(0.6, 0.8, 0.6);
          tempObject.rotation.y = Math.random() * Math.PI;
      } else if (instance.type === BlockType.WOOD_FENCE) {
          tempObject.scale.set(0.25, 1, 0.25); 
      } else if (instance.type === BlockType.WHEAT) {
          tempObject.scale.set(0.8, 0.5, 0.8);
          tempObject.position.set(instance.x, instance.y - 0.25, instance.z);
      } else if (instance.type === BlockType.FARMLAND) {
          tempObject.scale.set(1, 0.9, 1);
          tempObject.position.set(instance.x, instance.y - 0.05, instance.z);
      }

      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(index, tempObject.matrix);

      // Color Handling with Biome Blending
      if (instance.type === BlockType.GRASS || instance.type === BlockType.LEAVES) {
        // Calculate distance to zone centers
        const dSAO = Math.sqrt(instance.x*instance.x + instance.z*instance.z);
        const dTempest = Math.sqrt(Math.pow(instance.x - 3 * MILE, 2) + Math.pow(instance.z, 2));
        const dAmestris = Math.sqrt(Math.pow(instance.x - (-3 * MILE), 2) + Math.pow(instance.z, 2));
        const dBosse = Math.sqrt(Math.pow(instance.x, 2) + Math.pow(instance.z - (-3 * MILE), 2));

        // Simple weighted blending based on inverse distance
        // Using epsilon to prevent division by zero
        const eps = 1;
        const wSAO = 1 / (dSAO + eps);
        const wTempest = 1 / (dTempest + eps);
        const wAmestris = 1 / (dAmestris + eps);
        const wBosse = 1 / (dBosse + eps);
        
        const totalW = wSAO + wTempest + wAmestris + wBosse;
        
        // Start with black and accumulate
        tempColor.setRGB(0,0,0);
        
        const c1 = C_SAO.clone().multiplyScalar(wSAO / totalW);
        const c2 = C_TEMPEST.clone().multiplyScalar(wTempest / totalW);
        const c3 = C_AMESTRIS.clone().multiplyScalar(wAmestris / totalW);
        const c4 = C_BOSSE.clone().multiplyScalar(wBosse / totalW);

        tempColor.add(c1).add(c2).add(c3).add(c4);

        // Slightly darken leaves relative to the biome grass color
        if (instance.type === BlockType.LEAVES) {
          tempColor.multiplyScalar(0.7); 
        }
        
        meshRef.current.setColorAt(index, tempColor);

      } else {
        // Standard Colors
        let colorHex = '#ffffff';
        switch (instance.type) {
            case BlockType.DIRT: colorHex = COLORS.DIRT; break;
            case BlockType.STONE: colorHex = COLORS.STONE; break;
            case BlockType.SAND: colorHex = COLORS.SAND; break;
            case BlockType.WATER: colorHex = COLORS.WATER; break;
            case BlockType.SNOW: colorHex = COLORS.SNOW; break;
            
            case BlockType.STONE_BRICK: colorHex = COLORS.STONE_BRICK; break;
            case BlockType.RED_BRICK: colorHex = COLORS.RED_BRICK; break;
            case BlockType.WOOD_LOG: colorHex = COLORS.WOOD_LOG; break;
            case BlockType.WOOD_PLANK: colorHex = COLORS.WOOD_PLANK; break;
            case BlockType.DARK_PLANK: colorHex = COLORS.DARK_PLANK; break;
            case BlockType.PLASTER: colorHex = COLORS.PLASTER; break;
            case BlockType.ROOF_RED: colorHex = COLORS.ROOF_RED; break;
            case BlockType.ROOF_BLUE: colorHex = COLORS.ROOF_BLUE; break;
            case BlockType.GLASS: colorHex = COLORS.GLASS; break;
            case BlockType.COBBLESTONE: colorHex = COLORS.COBBLESTONE; break;
            case BlockType.MOSSY_COBBLESTONE: colorHex = COLORS.MOSSY_COBBLESTONE; break;
            case BlockType.PATH: colorHex = COLORS.PATH; break;
            // Note: Leaves handled above, specific trees below
            
            case BlockType.FACTORY_BRICK: colorHex = COLORS.FACTORY_BRICK; break;
            case BlockType.IRON_BLOCK: colorHex = COLORS.IRON_BLOCK; break;
            case BlockType.OBSIDIAN: colorHex = COLORS.OBSIDIAN; break;
            case BlockType.BASALT: colorHex = COLORS.BASALT; break;
            case BlockType.SLIME_BLOCK: colorHex = COLORS.SLIME_BLOCK; break;
            case BlockType.MAGIC_CRYSTAL: colorHex = COLORS.MAGIC_CRYSTAL; break;
            
            case BlockType.MARBLE: colorHex = COLORS.MARBLE; break;
            case BlockType.GOLD_BLOCK: colorHex = COLORS.GOLD_BLOCK; break;

            case BlockType.FLOWER_YELLOW: colorHex = COLORS.FLOWER_YELLOW; break;
            case BlockType.FLOWER_RED: colorHex = COLORS.FLOWER_RED; break;
            case BlockType.SMALL_ROCK: colorHex = COLORS.SMALL_ROCK; break;
            
            case BlockType.BIRCH_LOG: colorHex = COLORS.BIRCH_LOG; break;
            case BlockType.BIRCH_LEAVES: colorHex = COLORS.BIRCH_LEAVES; break;
            case BlockType.PINE_LEAVES: colorHex = COLORS.PINE_LEAVES; break;

            case BlockType.WOOD_FENCE: colorHex = COLORS.WOOD_FENCE; break;
            case BlockType.FARMLAND: colorHex = COLORS.FARMLAND; break;
            case BlockType.WHEAT: colorHex = COLORS.WHEAT; break;
        }
        
        tempColor.set(colorHex);
        meshRef.current.setColorAt(index, tempColor);
      }
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
        roughness={0.8} 
        metalness={0.1} 
      />
    </instancedMesh>
  );
});

const World: React.FC<WorldProps> = ({ playerPosition }) => {
  const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
  const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

  const chunks = [];
  for (let cx = playerChunkX - RENDER_DISTANCE; cx <= playerChunkX + RENDER_DISTANCE; cx++) {
    for (let cz = playerChunkZ - RENDER_DISTANCE; cz <= playerChunkZ + RENDER_DISTANCE; cz++) {
      chunks.push(<Chunk key={`${cx}-${cz}`} chunkX={cx} chunkZ={cz} />);
    }
  }

  return <group>{chunks}</group>;
};

export default World;