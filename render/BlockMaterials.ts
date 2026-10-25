import { DataArrayTexture, MeshBasicMaterial, Vector2, Vector3, WebGLProgramParametersWithUniforms } from 'three';

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
// uDaylight and uSkyLight are uniforms shared by the three materials: uDaylight is 1 at noon and near 0 at night, and
// uSkyLight is the colour the sky light takes (white by day, warm at dusk, blue at night). They are the only things the
// time of day changes: sky light is baked as a level and scaled here every frame by the SkySystem (render/SkySystem.ts),
// so day and night never re-mesh a chunk.
//
// Vertex attributes (see meshing/ChunkMesher.ts): uv, texLayer (base layer, overlay layer or -1), tint and bakedLight
// (sky, block, ao, glow), and sway on the buckets that have swaying blocks.
//
// Light flickers too, in the vertex shader (docs/effects.md): a block with `flicker` (a lantern, a hearth) breathes by up to 18
// percent of its brightness in a pattern of three unrelated sines, out of step from one lamp to the next, and all block light
// shimmers by a few percent. The baked light is not touched, so nothing is re-meshed. The pattern is also computed on the CPU
// (render/effects/gating.ts) for the halo round each lamp, so a lantern and its halo breathe together.
//
// Two things move, both in the vertex shader and neither touching the baked light, the culling or the collision (see
// docs/effects.md). Foliage: the opaque and cutout materials push a vertex downwind by its `sway` weight times a gust
// pattern read from the vertex's world position and the clock. Water: the water material slides two copies of the water
// tile past each other, darkens it with depth and lightens it at a shore (both come in the water's tint channel), and
// lifts the surface in a small wave.

export interface BlockMaterials {
  /** Fully opaque tiles. No alpha test, so it keeps early depth rejection. */
  opaque: MeshBasicMaterial;
  /** Leaves, glass and shaped blocks: alpha test at one half, no sorting needed. */
  cutout: MeshBasicMaterial;
  /** Water: the tile flowed by world position and shaded by depth, blended, with a small wave in the vertex shader. */
  water: MeshBasicMaterial;
  dispose(): void;
}

/**
 * The uniforms that drive the living-world effects. Like the daylight and the clock they belong to the caller, so one
 * object serves every material and changing a value changes the next frame, with no recompile and no re-mesh.
 */
export interface EffectUniforms {
  /** 1 lets foliage sway, 0 holds it still. */
  sway: { value: number };
  /** 1 animates the water surface, 0 freezes it (and flattens the wave). */
  water: { value: number };
  /** The clock the water reads: the game's time while water is animated, 0 while it is not. */
  waterTime: { value: number };
  /** Unit vector the wind blows toward, in world x and z. */
  wind: { value: Vector2 };
  /** 1 lets lamps flicker and block light shimmer, 0 holds them steady. */
  flicker: { value: number };
}

export const createEffectUniforms = (): EffectUniforms => ({
  sway: { value: 1 },
  water: { value: 1 },
  waterTime: { value: 0 },
  wind: { value: new Vector2(0.8, 0.6) },
  flicker: { value: 1 },
});

const VERTEX_DECLARATIONS = `
attribute vec3 tint;
attribute vec2 texLayer;
attribute vec4 bakedLight;
varying vec2 vTexUv;
varying vec3 vTint;
flat varying vec2 vTexLayer;
varying vec4 vBakedLight;
varying float vFaceShade;
varying float vFlicker;
`;

// The face-direction factor: 1 on tops, 0.81 on east and west walls, 0.86 on north and south walls and 0.72 on undersides.
// Mild on purpose, the baked light and the occlusion do the real shading.
const VERTEX_LIGHT = `
vBakedLight = bakedLight;
vFaceShade = 0.86 + 0.14 * normal.y - 0.05 * abs( normal.x );
vFlicker = 1.0;
`;

// Light levels are 0 to 1 (level / 15). The curve makes the dark end darker than a straight line would, so a room
// two blocks from a window reads as dim and not as nearly day; the ambient floor keeps even a sealed room from going
// black. Block light is warm. Glow makes a light source shine: its own faces never fall below their emission and get a
// boost that can go past 1.
const FRAGMENT_DECLARATIONS = `
uniform sampler2DArray uBlockTextures;
uniform float uDaylight;
uniform vec3 uSkyLight;
varying vec2 vTexUv;
varying vec3 vTint;
flat varying vec2 vTexLayer;
varying vec4 vBakedLight;
varying float vFaceShade;
varying float vFlicker;

const float LIGHT_CURVE = 1.8;
const float AMBIENT_FLOOR = 0.04;
const float GLOW_BOOST = 0.45;
const float LIGHT_SCALE = 0.5;
const vec3 BLOCK_LIGHT_COLOR = vec3( 1.0, 0.84, 0.6 );

vec3 bakedLighting() {
  float sky = pow( vBakedLight.x, LIGHT_CURVE ) * uDaylight;
  float block = pow( max( vBakedLight.y, vBakedLight.w ), LIGHT_CURVE ) * vFlicker;
  vec3 lit = max( vec3( sky ) * uSkyLight, BLOCK_LIGHT_COLOR * block );
  lit = max( lit, vec3( AMBIENT_FLOOR ) );
  return lit * LIGHT_SCALE * ( vBakedLight.z * vFaceShade * ( 1.0 + vBakedLight.w * GLOW_BOOST * vFlicker ) );
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

// How far the wind pushes a point, in blocks, before the vertex's own weight scales it. The wind is a swell of gusts
// travelling downwind: `front` is a long sine along the wind, bent by a slower one across it so the gusts are patches and
// not straight lines, and `gust` (0 in a lull, 1 at the crest) takes the lean from a quarter of its strength to all of it.
// On top of that, a flutter that is faster and smaller and out of step from one block to the next. The flutter's phase
// comes from the block the point is in, not from the point, so a plant moves as one piece instead of rippling along its
// own width. Everything is a function of world position and time, so two faces that share a corner agree on where it goes.
const SWAY_FUNCTION = `
attribute float sway;
uniform float uTime;
uniform float uSwayOn;
uniform vec2 uWind;

vec2 windPush( vec3 wp ) {
  vec2 side = vec2( -uWind.y, uWind.x );
  float along = dot( wp.xz, uWind );
  float across = dot( wp.xz, side );
  float front = sin( along * 0.09 - uTime * 0.85 + sin( across * 0.05 + uTime * 0.17 ) * 1.7 );
  float gust = smoothstep( -0.6, 0.9, front );
  vec2 cell = floor( wp.xz + 0.5 );
  float flutterA = sin( uTime * 2.3 + dot( cell, vec2( 1.7, 2.3 ) ) );
  float flutterB = sin( uTime * 3.1 + dot( cell, vec2( -2.1, 1.3 ) ) );
  float lively = 0.4 + 0.6 * gust;
  return uWind * ( 0.2 * ( 0.25 + 0.75 * gust ) + 0.05 * flutterA * lively ) + side * ( 0.06 * flutterB * lively );
}
`;

// Lamp flicker. `flameFlicker` and `lampPhase` are the same functions, with the same constants, as render/effects/gating.ts (the
// halo round a lamp reads them there). The phase comes from the cell the vertex belongs to: the normal is pulled back a quarter
// of a block, so the vertices of a box on the edge of its cell still belong to it. `vFlicker` multiplies the block light of the
// vertex (and the glow boost): 1 where nothing flickers, a few percent either way over all lit ground, and up to 18 percent for
// the faces of a flame.
const FLICKER_FUNCTION = `
attribute float flicker;
uniform float uFlickerOn;

float flameFlicker( float t, float phase ) {
  return 0.5 * sin( t * 7.1 + phase ) + 0.3 * sin( t * 11.7 + phase * 1.7 ) + 0.2 * sin( t * 3.3 + phase * 2.3 );
}

float lampPhase( vec3 cell ) {
  return fract( dot( cell, vec3( 0.3183, 0.4161, 0.2713 ) ) ) * 6.2831853;
}
`;

const FLICKER_VERTEX = `
vFlicker = 1.0;
if ( uFlickerOn > 0.5 ) {
  vec4 flickerOrigin = modelMatrix * vec4( position, 1.0 );
  vFlicker = 1.0 + 0.03 * ( 0.5 * sin( uTime * 2.9 + dot( flickerOrigin.xz, vec2( 0.37, 0.29 ) ) ) + 0.5 * sin( uTime * 4.7 + dot( flickerOrigin.xz, vec2( -0.23, 0.41 ) ) ) );
  if ( flicker > 0.0 ) {
    vFlicker *= 1.0 + flicker * 0.18 * flameFlicker( uTime, lampPhase( floor( flickerOrigin.xyz + 0.5 - normal * 0.25 ) ) );
  }
}
`;

const SWAY_DISPLACEMENT = `
#include <begin_vertex>
if ( uSwayOn > 0.5 && sway > 0.0 ) {
  vec4 swayOrigin = modelMatrix * vec4( position, 1.0 );
  transformed.xz += windPush( swayOrigin.xyz ) * sway;
}
`;

// Water, fragment side. The tile is sampled from the world position instead of the face's own uv, so a river does not
// repeat the same patch every block, and twice: once at the size of a block and once about two and a half times larger,
// each sliding its own way. Where the bright ripples of the two line up the water glints, where they cross it dims. The
// derivatives are taken from the unwrapped coordinates, so `fract` leaves no seam in the mip level. vTint is not a colour on
// water: x is the depth (0 to 1) and y the shoreline (0 to 1), written by the mesher. Deep water is darker, bluer and less
// see-through; a shore is lighter, with a pale edge, and the most see-through.
const WATER_FRAGMENT = `
float waterLayer = floor( vTexLayer.x + 0.5 );
vec2 uvA = vWaterUv;
vec2 uvB = vWaterUv * 0.4 + vec2( 0.31, 0.57 );
vec2 flowA = vec2( 0.04, 0.015 ) * uWaterTime;
vec2 flowB = vec2( -0.022, 0.05 ) * uWaterTime;
vec4 waterA = textureGrad( uBlockTextures, vec3( fract( uvA + flowA ), waterLayer ), dFdx( uvA ), dFdy( uvA ) );
vec4 waterB = textureGrad( uBlockTextures, vec3( fract( uvB + flowB ), waterLayer ), dFdx( uvB ), dFdy( uvB ) );
float lumA = dot( waterA.rgb, vec3( 0.3, 0.55, 0.15 ) );
float lumB = dot( waterB.rgb, vec3( 0.3, 0.55, 0.15 ) );
float depthLevel = clamp( vTint.x, 0.0, 1.0 );
float shoreLevel = clamp( vTint.y, 0.0, 1.0 );
vec3 waterColor = mix( waterA.rgb, waterB.rgb, 0.4 );
float glint = smoothstep( 0.42, 0.62, lumA * 0.5 + lumB * 0.5 );
waterColor *= 0.86 + 0.28 * glint * ( 0.6 + 0.4 * lumA );
waterColor = mix( waterColor * vec3( 1.0, 1.02, 1.0 ), waterColor * vec3( 0.5, 0.72, 0.86 ), smoothstep( 0.0, 0.6, depthLevel ) );
waterColor = mix( waterColor, vec3( lumA + 0.35 ) * vec3( 0.8, 0.95, 1.0 ), shoreLevel * 0.25 );
float waterAlpha = mix( 0.72, 1.12, smoothstep( 0.0, 0.6, depthLevel ) ) * ( 1.0 - 0.25 * shoreLevel );
vec4 texel = vec4( waterColor * bakedLighting(), clamp( waterAlpha, 0.0, 1.0 ) );
diffuseColor *= texel;
`;

export const patchTextureLookup = (
  shader: WebGLProgramParametersWithUniforms, textures: { value: DataArrayTexture | null },
  daylight: { value: number }, skyLight: { value: Vector3 }, mapFragment: string = MAP_FRAGMENT,
): void => {
  shader.uniforms.uBlockTextures = textures;
  shader.uniforms.uDaylight = daylight;
  shader.uniforms.uSkyLight = skyLight;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', `${VERTEX_DECLARATIONS}\nvoid main() {`)
    .replace('#include <color_vertex>', `#include <color_vertex>\nvTexUv = uv;\nvTexLayer = texLayer;\nvTint = tint;${VERTEX_LIGHT}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${FRAGMENT_DECLARATIONS}\nvoid main() {`)
    .replace('#include <map_fragment>', mapFragment);
};

// Foliage: the opaque and cutout materials displace by the vertex's sway weight. A geometry with no sway attribute (a
// bucket where nothing sways) reads weight 0 from the default below, so the same program draws every bucket.
const patchSway = (shader: WebGLProgramParametersWithUniforms, time: { value: number }, effects: EffectUniforms): void => {
  shader.uniforms.uTime = time;
  shader.uniforms.uSwayOn = effects.sway;
  shader.uniforms.uWind = effects.wind;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', `${SWAY_FUNCTION}\nvoid main() {`)
    .replace('#include <begin_vertex>', SWAY_DISPLACEMENT);
};

// Lamp flicker: the opaque and cutout materials give each vertex a brightness multiplier (see FLICKER_VERTEX). Water has none
// and keeps the 1.0 the shared lighting writes. A bucket with no `flicker` attribute reads 0 from the default below.
const patchFlicker = (shader: WebGLProgramParametersWithUniforms, effects: EffectUniforms): void => {
  shader.uniforms.uFlickerOn = effects.flicker;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', `${FLICKER_FUNCTION}\nvoid main() {`)
    .replace('vFlicker = 1.0;', FLICKER_VERTEX);
};

// Water, vertex side: a small wave that reads each vertex's world position (so neighbouring faces move together), and the
// world position and whether the face is a top, for the fragment shader to flow the tile by. The wave is a few hundredths
// of a block: it breaks the line of the surface without opening gaps against the banks.
const patchWaterWave = (shader: WebGLProgramParametersWithUniforms, effects: EffectUniforms): void => {
  shader.uniforms.uWaterTime = effects.waterTime;
  shader.uniforms.uWaterOn = effects.water;
  shader.vertexShader = `uniform float uWaterTime;\nuniform float uWaterOn;\nvarying vec2 vWaterUv;\n${shader.vertexShader}`.replace(
    '#include <begin_vertex>',
    `
    vec3 transformed = vec3( position );
    vec4 waveOrigin = modelMatrix * vec4( position, 1.0 );
    transformed.y += uWaterOn * ( sin( waveOrigin.x * 0.5 + uWaterTime ) * 0.06 + cos( waveOrigin.z * 0.4 + uWaterTime * 1.2 ) * 0.045 );
    // A top face is flowed by world x and z; a wall by distance along it and height.
    vWaterUv = normal.y > 0.5 ? waveOrigin.xz : vec2( waveOrigin.x + waveOrigin.z, waveOrigin.y );
    `,
  );
  shader.fragmentShader = `uniform float uWaterTime;\nvarying vec2 vWaterUv;\n${shader.fragmentShader}`;
};

/**
 * `textures` is the shared array, `time` the clock the foliage reads, `daylight` the sky light multiplier, 0 to 1, and
 * `skyLight` the colour that light takes (white unless the sky system says otherwise). `effects` drives the sway and the
 * water (see EffectUniforms). All of them are uniform objects the caller keeps: swapping `textures.value` changes the
 * texture of every material and setting `daylight.value` or `skyLight.value` changes the time of day, none of it
 * recompiling anything.
 */
export const createBlockMaterials = (
  textures: { value: DataArrayTexture | null }, time: { value: number }, daylight: { value: number } = { value: 1 },
  skyLight: { value: Vector3 } = { value: new Vector3(1, 1, 1) }, effects: EffectUniforms = createEffectUniforms(),
): BlockMaterials => {
  // A bucket with nothing swaying has no `sway` attribute; this makes it read 0 instead of whatever the GPU last held.
  const noSway = { sway: [0], flicker: [0] };

  const opaque = new MeshBasicMaterial();
  opaque.onBeforeCompile = (shader) => {
    patchTextureLookup(shader, textures, daylight, skyLight);
    patchSway(shader, time, effects);
    patchFlicker(shader, effects);
  };
  opaque.customProgramCacheKey = () => 'block-opaque';
  (opaque as unknown as { defaultAttributeValues: typeof noSway }).defaultAttributeValues = noSway;

  const cutout = new MeshBasicMaterial({ alphaTest: 0.5 });
  cutout.onBeforeCompile = (shader) => {
    patchTextureLookup(shader, textures, daylight, skyLight);
    patchSway(shader, time, effects);
    patchFlicker(shader, effects);
  };
  cutout.customProgramCacheKey = () => 'block-cutout';
  (cutout as unknown as { defaultAttributeValues: typeof noSway }).defaultAttributeValues = noSway;

  const water = new MeshBasicMaterial({ transparent: true, opacity: 0.75 });
  water.onBeforeCompile = (shader) => {
    patchTextureLookup(shader, textures, daylight, skyLight, WATER_FRAGMENT);
    patchWaterWave(shader, effects);
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
