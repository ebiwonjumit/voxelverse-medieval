import { DataArrayTexture, MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';

// The three materials chunk meshes use. All of them are MeshStandardMaterial patched with onBeforeCompile, so
// the scene's lights and fog work exactly as before; the patch only replaces where the surface colour comes
// from. A fragment's colour is
//
//   texture(layer, uv)  x  vertex colour (ambient occlusion)  x  biome tint
//
// where the tint only reaches the parts of the tile that take it: all of a grass top, but only the fringe of a
// grass side. Faces with a tint overlay carry two layers: the base tile, drawn untinted, and the mask tile,
// whose alpha says where the tint colour is laid over the base.
//
// Vertex attributes (see meshing/ChunkMesher.ts): uv, texLayer (base layer, overlay layer or -1) and tint.

export interface BlockMaterials {
  /** Fully opaque tiles. No alpha test, so it keeps early depth rejection. */
  opaque: MeshStandardMaterial;
  /** Leaves, glass and shaped blocks: alpha test at one half, no sorting needed. */
  cutout: MeshStandardMaterial;
  /** Water: same texture lookup, blended, with the wave in the vertex shader. */
  water: MeshStandardMaterial;
  dispose(): void;
}

const VERTEX_DECLARATIONS = `
attribute vec3 tint;
attribute vec2 texLayer;
varying vec2 vTexUv;
varying vec3 vTint;
flat varying vec2 vTexLayer;
`;

const FRAGMENT_DECLARATIONS = `
uniform sampler2DArray uBlockTextures;
varying vec2 vTexUv;
varying vec3 vTint;
flat varying vec2 vTexLayer;
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
diffuseColor *= texel;
`;

export const patchTextureLookup = (
  shader: WebGLProgramParametersWithUniforms, textures: { value: DataArrayTexture | null },
): void => {
  shader.uniforms.uBlockTextures = textures;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', `${VERTEX_DECLARATIONS}\nvoid main() {`)
    .replace('#include <color_vertex>', '#include <color_vertex>\nvTexUv = uv;\nvTexLayer = texLayer;\nvTint = tint;');
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
 * `texture` is the shared array, `time` the clock the water wave reads. Both are uniform objects the caller
 * keeps: swapping `textures.value` changes the texture of every material without recompiling anything.
 */
export const createBlockMaterials = (
  textures: { value: DataArrayTexture | null }, time: { value: number },
): BlockMaterials => {
  const opaque = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
  opaque.onBeforeCompile = (shader) => patchTextureLookup(shader, textures);
  opaque.customProgramCacheKey = () => 'block-opaque';

  const cutout = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1, alphaTest: 0.5 });
  cutout.onBeforeCompile = (shader) => patchTextureLookup(shader, textures);
  cutout.customProgramCacheKey = () => 'block-cutout';

  const water = new MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.8, flatShading: true,
  });
  water.onBeforeCompile = (shader) => {
    patchTextureLookup(shader, textures);
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
