import { DataArrayTexture, MeshBasicMaterial, WebGLProgramParametersWithUniforms } from 'three';

// The three materials chunk meshes use. All of them are MeshBasicMaterial patched with onBeforeCompile: chunk geometry
// takes nothing from the scene's lights, because the light is baked into the vertices (see meshing/ChunkMesher.ts and
// docs/light.md). A fragment's colour is
//
//   texture(layer, uv)  x  biome tint  x  ao  x  max(sky * uDaylight, block light)  x  face factor
//
// with a small ambient floor under the light, a mild darkening of the sides and underside, and a glow boost on blocks
// that emit light. Fog is still the scene's. The tint only reaches the parts of the tile that take it: all of a grass
// top, but only the fringe of a grass side. Faces with a tint overlay carry two layers: the base tile, drawn untinted,
// and the mask tile, whose alpha says where the tint colour is laid over the base.
//
// uDaylight is a uniform shared by the three materials, 1 at noon and near 0 at night. It is the only thing the time of
// day changes: sky light is baked as a level and scaled here every frame, so day and night never re-mesh a chunk.
//
// Vertex attributes (see meshing/ChunkMesher.ts): uv, texLayer (base layer, overlay layer or -1), tint and bakedLight
// (sky, block, ao, glow).

export interface BlockMaterials {
  /** Fully opaque tiles. No alpha test, so it keeps early depth rejection. */
  opaque: MeshBasicMaterial;
  /** Leaves, glass and shaped blocks: alpha test at one half, no sorting needed. */
  cutout: MeshBasicMaterial;
  /** Water: same texture lookup, blended, with the wave in the vertex shader. */
  water: MeshBasicMaterial;
  dispose(): void;
}

const VERTEX_DECLARATIONS = `
attribute vec3 tint;
attribute vec2 texLayer;
attribute vec4 bakedLight;
varying vec2 vTexUv;
varying vec3 vTint;
flat varying vec2 vTexLayer;
varying vec4 vBakedLight;
varying float vFaceShade;
`;

// The face-direction factor: 1 on tops, 0.81 on east and west walls, 0.86 on north and south walls and 0.72 on undersides.
// Mild on purpose, the baked light and the occlusion do the real shading.
const VERTEX_LIGHT = `
vBakedLight = bakedLight;
vFaceShade = 0.86 + 0.14 * normal.y - 0.05 * abs( normal.x );
`;

// Light levels are 0 to 1 (level / 15). The curve makes the dark end darker than a straight line would, so a room
// two blocks from a window reads as dim and not as nearly day; the ambient floor keeps even a sealed room from going
// black. Block light is warm. Glow makes a light source shine: its own faces never fall below their emission and get a
// boost that can go past 1.
const FRAGMENT_DECLARATIONS = `
uniform sampler2DArray uBlockTextures;
uniform float uDaylight;
varying vec2 vTexUv;
varying vec3 vTint;
flat varying vec2 vTexLayer;
varying vec4 vBakedLight;
varying float vFaceShade;

const float LIGHT_CURVE = 1.8;
const float AMBIENT_FLOOR = 0.04;
const float GLOW_BOOST = 0.45;
const float LIGHT_SCALE = 0.5;
const vec3 BLOCK_LIGHT_COLOR = vec3( 1.0, 0.84, 0.6 );

vec3 bakedLighting() {
  float sky = pow( vBakedLight.x, LIGHT_CURVE ) * uDaylight;
  float block = pow( max( vBakedLight.y, vBakedLight.w ), LIGHT_CURVE );
  vec3 lit = max( vec3( sky ), BLOCK_LIGHT_COLOR * block );
  lit = max( lit, vec3( AMBIENT_FLOOR ) );
  return lit * LIGHT_SCALE * ( vBakedLight.z * vFaceShade * ( 1.0 + vBakedLight.w * GLOW_BOOST ) );
}
`;

// Gradients are taken once, outside the branch, so the mip level never depends on which side of it a pixel is.
const MAP_FRAGMENT = `
vec2 texDx = dFdx( vTexUv );
vec2 texDy = dFdy( vTexUv );
vec4 texel = textureGrad( uBlockTextures, vec3( vTexUv, floor( vTexLayer.x + 0.5 ) ), texDx, texDy );
if ( vTexLayer.y > -0.5 ) {
  vec4 overlay = textureGrad( uBlockTextures, vec3( vTexUv, floor( vTexLayer.y + 0.5 ) ), texDx, texDy );
  texel.rgb = mix( texel.rgb, overlay.rgb * vTint, overlay.a );
} else {
  texel.rgb *= vTint;
}
texel.rgb *= bakedLighting();
diffuseColor *= texel;
`;

export const patchTextureLookup = (
  shader: WebGLProgramParametersWithUniforms, textures: { value: DataArrayTexture | null },
  daylight: { value: number },
): void => {
  shader.uniforms.uBlockTextures = textures;
  shader.uniforms.uDaylight = daylight;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', `${VERTEX_DECLARATIONS}\nvoid main() {`)
    .replace('#include <color_vertex>', `#include <color_vertex>\nvTexUv = uv;\nvTexLayer = texLayer;\nvTint = tint;${VERTEX_LIGHT}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${FRAGMENT_DECLARATIONS}\nvoid main() {`)
    .replace('#include <map_fragment>', MAP_FRAGMENT);
};

// The wave used to read each instance's position. Chunk meshes have no instances, so it reads the vertex's
// world position, which also keeps neighbouring water faces moving together.
const patchWaterWave = (shader: WebGLProgramParametersWithUniforms, time: { value: number }): void => {
  shader.uniforms.uTime = time;
  shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
    '#include <begin_vertex>',
    `
    vec3 transformed = vec3( position );
    vec4 waveOrigin = modelMatrix * vec4( position, 1.0 );
    transformed.y += sin( waveOrigin.x * 0.5 + uTime ) * 0.2 + cos( waveOrigin.z * 0.4 + uTime * 1.2 ) * 0.15;
    `,
  );
};

/**
 * `textures` is the shared array, `time` the clock the water wave reads and `daylight` the sky light multiplier, 0 to 1.
 * All three are uniform objects the caller keeps: swapping `textures.value` changes the texture of every material and
 * setting `daylight.value` changes the time of day, neither recompiling anything.
 */
export const createBlockMaterials = (
  textures: { value: DataArrayTexture | null }, time: { value: number }, daylight: { value: number } = { value: 1 },
): BlockMaterials => {
  const opaque = new MeshBasicMaterial();
  opaque.onBeforeCompile = (shader) => patchTextureLookup(shader, textures, daylight);
  opaque.customProgramCacheKey = () => 'block-opaque';

  const cutout = new MeshBasicMaterial({ alphaTest: 0.5 });
  cutout.onBeforeCompile = (shader) => patchTextureLookup(shader, textures, daylight);
  cutout.customProgramCacheKey = () => 'block-cutout';

  const water = new MeshBasicMaterial({ transparent: true, opacity: 0.75 });
  water.onBeforeCompile = (shader) => {
    patchTextureLookup(shader, textures, daylight);
    patchWaterWave(shader, time);
  };
  water.customProgramCacheKey = () => 'block-water';

  return {
    opaque, cutout, water,
    dispose() {
      opaque.dispose();
      cutout.dispose();
      water.dispose();
    },
  };
};
