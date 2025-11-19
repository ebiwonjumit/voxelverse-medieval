import React, { useMemo, useRef, useLayoutEffect, useEffect, useState } from 'react';
import { InstancedMesh, Object3D, Color, Vector3, CanvasTexture, NearestFilter, RepeatWrapping, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { useFrame } from '@react-three/fiber';
import { BlockType, COLORS, RENDER_DISTANCE, CHUNK_SIZE, MILE } from '../constants';
import { getBlockOptimized, getTerrainHeight } from '../utils/terrain';
import { LodLevel } from '../zones/Zone';

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
const C_FREMMEVILLA = new Color(COLORS.GRASS_FREMMEVILLA);
const C_MAGNOLIA = new Color(COLORS.GRASS_MAGNOLIA);

// --- TEXTURE GENERATION ---
// Create a pixelated noise texture on the fly to give blocks grain/detail
const createVoxelTexture = () => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    for (let i = 0; i < 800; i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      const opacity = Math.random() * 0.15; // Subtle noise
      ctx.fillStyle = `rgba(0,0,0,${opacity})`;
      ctx.fillRect(x, y, 2, 2); // 2x2 pixels for "chunkier" noise
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter; // Keep it pixelated
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const voxelTexture = createVoxelTexture();

// --- SOLID MATERIAL CONFIGURATION ---
// Using a shared material for all solid blocks with custom shader logic
const solidMaterial = new MeshStandardMaterial({
  map: voxelTexture,
  roughness: 0.8,
  metalness: 0.1,
  vertexColors: true, // Vital for instanced color tinting
});

solidMaterial.onBeforeCompile = (shader) => {
  // Pass the texture map (though map is handled by default, we want to mix it specifically)
  // We need access to vNormal to detect sides vs top
  shader.vertexShader = `
    varying vec3 vWorldNormal;
    ${shader.vertexShader}
  `.replace(
    '#include <begin_vertex>',
    `
    #include <begin_vertex>
    // Calculate world normal for the fragment shader (simplified approach)
    vWorldNormal = normalize( mat3( instanceMatrix ) * normal );
    `
  );

  shader.fragmentShader = `
    varying vec3 vWorldNormal;
    ${shader.fragmentShader}
  `.replace(
    '#include <map_fragment>',
    `
    #include <map_fragment>
    
    // 1. TEXTURE NOISE MIX
    // The map_fragment sets 'diffuseColor' based on the texture. 
    // We want to blend the noise texture subtly over the vertex color.
    // Since we set map, 'diffuseColor' already has the texture.
    
    // 2. EDGE DARKENING (Fake Ambient Occlusion)
    // BoxGeometry UVs go 0->1. Edges are near 0 or 1.
    float edgeWidth = 0.05;
    float edgeX = step(edgeWidth, vMapUv.x) * step(vMapUv.x, 1.0 - edgeWidth);
    float edgeY = step(edgeWidth, vMapUv.y) * step(vMapUv.y, 1.0 - edgeWidth);
    float centerMask = edgeX * edgeY;
    
    // Darken edges by 20%
    float edgeFactor = 0.8 + (0.2 * centerMask);
    diffuseColor.rgb *= edgeFactor;

    // 3. GRASS SIDE LOGIC (Minecraft Style)
    // Heuristic: If the block is predominantly green (Grass), but we are looking at the side, make it Dirt.
    // vColor comes from the vertex shader (instanceColor).
    // We access it via 'diffuseColor' or 'vColor' depending on THREE version, but diffuseColor has it multiplied.
    
    // Let's calculate based on the vertex color passed into the material (before texture)
    // We can't easily access raw instanceColor here without re-declaring varying.
    // However, standard material mixes vertex color into diffuseColor before map_fragment.
    
    // Check if "Green-ish" (High Green, lower Red/Blue)
    // This detects Biome Blended Grass
    bool isGreen = diffuseColor.g > diffuseColor.r * 1.2 && diffuseColor.g > diffuseColor.b * 1.2;
    
    // Check if looking at side (Normal Y is near 0)
    bool isSide = abs(vWorldNormal.y) < 0.5;

    if (isGreen && isSide) {
        // Replace color with Dirt Brown, preserving the noise texture intensity
        vec3 dirtColor = vec3(0.36, 0.25, 0.22); // #5D4037 converted roughly to linear
        
        // Keep the texture variation (luminance)
        float luminance = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        // Apply dirt color
        diffuseColor.rgb = dirtColor * edgeFactor; 
        
        // Re-apply a bit of the original texture noise
        diffuseColor.rgb *= (texelColor.rgb + 0.2); 
    }
    `
  );
};

// --- WATER MATERIAL CONFIGURATION ---
const waterMaterial = new MeshStandardMaterial({
  color: 0xffffff, 
  transparent: true,
  opacity: 0.75,
  roughness: 0.1,
  metalness: 0.8,
  flatShading: true
});

waterMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = { value: 0 };
  waterMaterial.userData.shader = shader;

  shader.vertexShader = `
    uniform float uTime;
    ${shader.vertexShader}
  `;

  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `
    vec3 transformed = vec3( position );
    #ifdef USE_INSTANCING
      float wx = instanceMatrix[3][0];
      float wz = instanceMatrix[3][2];
      float wave = sin(wx * 0.5 + uTime) * 0.2 + cos(wz * 0.4 + uTime * 1.2) * 0.15;
      transformed.y += wave;
    #endif
    `
  );
};

const Chunk: React.FC<{ chunkX: number; chunkZ: number; lodLevel: LodLevel }> = React.memo(({ chunkX, chunkZ, lodLevel }) => {
  const solidMeshRef = useRef<InstancedMesh>(null);
  const waterMeshRef = useRef<InstancedMesh>(null);
  
  const { solidInstances, waterInstances } = useMemo(() => {
    const solid: { x: number; y: number; z: number; type: BlockType }[] = [];
    const water: { x: number; y: number; z: number; type: BlockType }[] = [];
    
    const startX = chunkX * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = startX + x;
        const worldZ = startZ + z;
        
        const groundH = getTerrainHeight(worldX, worldZ);
        
        const minScan = -30; 
        const maxScan = groundH + 65; 

        for (let y = minScan; y < maxScan; y++) {
           const block = getBlockOptimized(worldX, y, worldZ, groundH, lodLevel);
           if (block !== BlockType.AIR) {
               if (block === BlockType.WATER) {
                   water.push({ x: worldX, y, z: worldZ, type: block });
               } else {
                   solid.push({ x: worldX, y, z: worldZ, type: block });
               }
           }
        }
      }
    }
    return { solidInstances: solid, waterInstances: water };
  }, [chunkX, chunkZ, lodLevel]);

  const updateMesh = (mesh: InstancedMesh, data: typeof solidInstances) => {
      if (!mesh || data.length === 0) return;
      
      let index = 0;
      for (const instance of data) {
        tempObject.scale.set(1, 1, 1);
        tempObject.position.set(instance.x, instance.y, instance.z);
        tempObject.rotation.set(0, 0, 0);

        // Decoration Scaling & Positioning
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
        } else if (instance.type === BlockType.LILY_PAD) {
            tempObject.scale.set(0.6, 0.05, 0.6);
            tempObject.position.set(instance.x, instance.y - 0.48, instance.z);
            tempObject.rotation.y = Math.random() * Math.PI;
        } else if (instance.type === BlockType.SUGARCANE) {
            tempObject.scale.set(0.2, 1, 0.2);
            tempObject.rotation.y = Math.random() * Math.PI;
        } else if (instance.type === BlockType.TALL_GRASS) {
            tempObject.scale.set(0.6, 0.6, 0.6);
            tempObject.position.set(instance.x, instance.y - 0.2, instance.z);
        } else if (instance.type === BlockType.LANTERN) {
            tempObject.scale.set(0.3, 0.4, 0.3);
            tempObject.position.set(instance.x, instance.y - 0.2, instance.z);
        } else if (instance.type === BlockType.RED_APPLE) {
            tempObject.scale.set(0.2, 0.2, 0.2);
        }

        tempObject.updateMatrix();
        mesh.setMatrixAt(index, tempObject.matrix);

        // Color Handling with Biome Blending
        if (instance.type === BlockType.GRASS || instance.type === BlockType.LEAVES) {
            const dSAO = Math.sqrt(instance.x*instance.x + instance.z*instance.z);
            const dTempest = Math.sqrt(Math.pow(instance.x - 3 * MILE, 2) + Math.pow(instance.z, 2));
            const dAmestris = Math.sqrt(Math.pow(instance.x - (-3 * MILE), 2) + Math.pow(instance.z, 2));
            const dBosse = Math.sqrt(Math.pow(instance.x, 2) + Math.pow(instance.z - (-3 * MILE), 2));
            const dFremme = Math.sqrt(Math.pow(instance.x - 1600, 2) + Math.pow(instance.z - (-1600), 2));
            const dMagnolia = Math.sqrt(Math.pow(instance.x - (-1600), 2) + Math.pow(instance.z - 1600, 2));

            const eps = 1;
            const wSAO = 1 / (dSAO + eps);
            const wTempest = 1 / (dTempest + eps);
            const wAmestris = 1 / (dAmestris + eps);
            const wBosse = 1 / (dBosse + eps);
            const wFremme = 1 / (dFremme + eps);
            const wMagnolia = 1 / (dMagnolia + eps);
            
            const totalW = wSAO + wTempest + wAmestris + wBosse + wFremme + wMagnolia;
            
            tempColor.setRGB(0,0,0);
            
            tempColor.add(C_SAO.clone().multiplyScalar(wSAO / totalW));
            tempColor.add(C_TEMPEST.clone().multiplyScalar(wTempest / totalW));
            tempColor.add(C_AMESTRIS.clone().multiplyScalar(wAmestris / totalW));
            tempColor.add(C_BOSSE.clone().multiplyScalar(wBosse / totalW));
            tempColor.add(C_FREMMEVILLA.clone().multiplyScalar(wFremme / totalW));
            tempColor.add(C_MAGNOLIA.clone().multiplyScalar(wMagnolia / totalW));

            if (instance.type === BlockType.LEAVES) {
              tempColor.multiplyScalar(0.7); 
            }
            
            mesh.setColorAt(index, tempColor);

        } else {
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
                
                case BlockType.FACTORY_BRICK: colorHex = COLORS.FACTORY_BRICK; break;
                case BlockType.IRON_BLOCK: colorHex = COLORS.IRON_BLOCK; break;
                case BlockType.OBSIDIAN: colorHex = COLORS.OBSIDIAN; break;
                case BlockType.BASALT: colorHex = COLORS.BASALT; break;
                case BlockType.SLIME_BLOCK: colorHex = COLORS.SLIME_BLOCK; break;
                case BlockType.MAGIC_CRYSTAL: colorHex = COLORS.MAGIC_CRYSTAL; break;
                
                case BlockType.MARBLE: colorHex = COLORS.MARBLE; break;
                case BlockType.GOLD_BLOCK: colorHex = COLORS.GOLD_BLOCK; break;
                case BlockType.STEEL_BEAM: colorHex = COLORS.STEEL_BEAM; break;
                case BlockType.HANGAR_WALL: colorHex = COLORS.HANGAR_WALL; break;
                case BlockType.GUILD_WOOD: colorHex = COLORS.GUILD_WOOD; break;
                case BlockType.MAGIC_STONE: colorHex = COLORS.MAGIC_STONE; break;

                case BlockType.FLOWER_YELLOW: colorHex = COLORS.FLOWER_YELLOW; break;
                case BlockType.FLOWER_RED: colorHex = COLORS.FLOWER_RED; break;
                case BlockType.SMALL_ROCK: colorHex = COLORS.SMALL_ROCK; break;
                
                case BlockType.BIRCH_LOG: colorHex = COLORS.BIRCH_LOG; break;
                case BlockType.BIRCH_LEAVES: colorHex = COLORS.BIRCH_LEAVES; break;
                case BlockType.PINE_LEAVES: colorHex = COLORS.PINE_LEAVES; break;

                case BlockType.WOOD_FENCE: colorHex = COLORS.WOOD_FENCE; break;
                case BlockType.FARMLAND: colorHex = COLORS.FARMLAND; break;
                case BlockType.WHEAT: colorHex = COLORS.WHEAT; break;
                
                case BlockType.LILY_PAD: colorHex = COLORS.LILY_PAD; break;
                case BlockType.SUGARCANE: colorHex = COLORS.SUGARCANE; break;
                case BlockType.TALL_GRASS: colorHex = COLORS.TALL_GRASS; break;
                case BlockType.LANTERN: colorHex = COLORS.LANTERN; break;
                case BlockType.RED_APPLE: colorHex = COLORS.RED_APPLE; break;
            }
            
            tempColor.set(colorHex);
            mesh.setColorAt(index, tempColor);
        }
        index++;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  useLayoutEffect(() => {
    if (solidMeshRef.current) updateMesh(solidMeshRef.current, solidInstances);
    if (waterMeshRef.current) updateMesh(waterMeshRef.current, waterInstances);
  }, [solidInstances, waterInstances]);

  return (
    <group>
      {solidInstances.length > 0 && (
        <instancedMesh 
            ref={solidMeshRef} 
            args={[undefined, undefined, solidInstances.length]} 
            castShadow 
            receiveShadow
            material={solidMaterial}
        >
            <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {waterInstances.length > 0 && (
        <instancedMesh 
            ref={waterMeshRef} 
            args={[undefined, undefined, waterInstances.length]} 
            receiveShadow
            material={waterMaterial} 
        >
            <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
    </group>
  );
});

const World: React.FC<WorldProps> = ({ playerPosition }) => {
  const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
  const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

  useFrame(({ clock }) => {
    if (waterMaterial.userData.shader) {
        waterMaterial.userData.shader.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  const chunks = [];
  for (let cx = playerChunkX - RENDER_DISTANCE; cx <= playerChunkX + RENDER_DISTANCE; cx++) {
    for (let cz = playerChunkZ - RENDER_DISTANCE; cz <= playerChunkZ + RENDER_DISTANCE; cz++) {
        const dist = Math.sqrt(Math.pow(cx - playerChunkX, 2) + Math.pow(cz - playerChunkZ, 2));
        const lod = dist < 2 ? LodLevel.HIGH : LodLevel.LOW;
        chunks.push(<Chunk key={`${cx}-${cz}`} chunkX={cx} chunkZ={cz} lodLevel={lod} />);
    }
  }

  return <group>{chunks}</group>;
};

export default World;