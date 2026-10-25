import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, NormalBlending, Points, ShaderMaterial, UniformsLib,
  UniformsUtils,
} from 'three';
import { BlockRegistry } from '../engine/BlockRegistry';
import { TempestBlock } from '../content/blocksTempest';
import { CloudLayer } from './CloudLayer';
import { EffectSettings } from './effectSettings';
import { EffectsFrame, EffectsSim } from './effects/EffectsSim';
import { ParticlePool } from './effects/ParticlePool';
import { SiteStore } from './effects/SiteStore';
import { windHeading } from './effects/wind';
import { SkyState } from './SkySystem';

// The living world's moving parts that are not in the chunk shaders (docs/effects.md): pooled particles (fireflies, sakura petals,
// chimney smoke, hearth embers, lamp halos) and the cloud layer. `EffectsSim` (render/effects/EffectsSim.ts) does the simulation
// without a scene and writes the arrays a vertex shader reads; this class owns the three objects around it. There are two Points,
// one blended additively (fireflies, embers, halos) and one with ordinary alpha (petals and smoke), each drawn with one
// ShaderMaterial and the whole pool's arrays as its attributes, and the cloud layer's single plane: three draw calls.
//
// Nothing here allocates per frame: the arrays are the pools' own, uploaded whole (they are a few tens of kilobytes), the draw range
// is the live count, and every uniform is set by number.

const VERTEX = `
attribute vec4 aParams;
attribute vec3 aColor;
uniform float uScale;
uniform float uMaxPoint;
varying vec4 vParams;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  float px = aParams.x * uScale / max( -mvPosition.z, 0.05 );
  // Sprites that would be under a pixel are drawn a pixel wide and faint instead of shimmering in and out.
  float size = clamp( px, 1.5, uMaxPoint );
  gl_PointSize = size;
  vParams = vec4( aParams.x, aParams.y * min( px / 1.5, 1.0 ), aParams.z, aParams.w );
  vColor = aColor;
  #include <fog_vertex>
}
`;

// The shape is the particle's kind: 0 a firefly (a bright core in a soft glow), 1 an ember (a small hot dot), 2 a petal (a turning
// ellipse), 3 a puff of smoke (a soft disc), 4 a lamp halo (a wide, soft falloff). Fog is the scene's: ordinary blending mixes the
// colour toward the fog colour, additive blending fades the glow out instead (a mix toward a bright fog colour would add a haze).
const FRAGMENT = `
varying vec4 vParams;
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length( p ) * 2.0;
  float shape = vParams.z;
  float a;
  vec3 color = vColor;
  if ( shape < 0.5 ) {
    a = exp( -r * r * 6.0 ) * 0.6 + exp( -r * r * 40.0 ) * 1.2;
  } else if ( shape < 1.5 ) {
    a = exp( -r * r * 9.0 );
  } else if ( shape < 2.5 ) {
    // A petal is a few square pixels, like the rest of the game: an ellipse snapped to a coarse grid in its own turning frame, so it
    // tumbles as a small block of pixels and not as a smooth shape. It narrows as it turns edge-on, and a paler row runs down its middle.
    float c = cos( vParams.w );
    float s = sin( vParams.w );
    vec2 q = vec2( c * p.x - s * p.y, s * p.x + c * p.y ) * 2.0;
    float turn = 0.4 + 0.6 * abs( sin( vParams.w * 0.7 ) );
    vec2 g = ( floor( q * 2.5 ) + 0.5 ) / 2.5;
    a = step( length( vec2( g.x, g.y / turn * 1.9 ) ), 0.95 );
    color = mix( color, color * 1.25, step( abs( g.y ), 0.21 ) * 0.6 );
  } else if ( shape < 3.5 ) {
    a = pow( max( 1.0 - r, 0.0 ), 1.6 );
  } else {
    a = pow( max( 1.0 - r, 0.0 ), 2.3 );
  }
  a *= vParams.y;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( color, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef ADDITIVE
    #ifdef USE_FOG
      gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
    #endif
  #else
    #include <fog_fragment>
  #endif
}
`;

const MAX_POINT_PIXELS = 220;

const makeLayer = (pool: ParticlePool, additive: boolean): { points: Points; material: ShaderMaterial; geometry: BufferGeometry } => {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(pool.position, 3);
  const params = new BufferAttribute(pool.params, 4);
  const color = new BufferAttribute(pool.color, 3);
  position.setUsage(DynamicDrawUsage);
  params.setUsage(DynamicDrawUsage);
  color.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aParams', params);
  geometry.setAttribute('aColor', color);
  geometry.setDrawRange(0, 0);
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uScale: { value: 600 }, uMaxPoint: { value: MAX_POINT_PIXELS } }]),
    defines: additive ? { ADDITIVE: '' } : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: additive ? AdditiveBlending : NormalBlending,
    fog: true,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  // After the chunks' water, which is also blended: a particle above a pond must not be covered by the water behind it.
  points.renderOrder = additive ? 11 : 10;
  return { points, material, geometry };
};

export interface EffectsSystemOptions {
  seed?: number;
  /** The registry lamps' flicker strength is read from. */
  registry?: BlockRegistry;
}

// The colours of the halos the ore lamps give, by block id; every other lamp is the warm of a flame.
const HALO_COLORS = new Map<number, readonly [number, number, number]>([
  [TempestBlock.BLUE_ORE_LAMP, [0.25, 0.62, 1.0]],
  [TempestBlock.GREEN_ORE_LAMP, [0.3, 1.0, 0.55]],
]);

export class EffectsSystem {
  readonly group = new Group();
  readonly sim: EffectsSim;
  readonly clouds = new CloudLayer();
  private readonly frame = new EffectsFrame();
  private readonly glow: ReturnType<typeof makeLayer>;
  private readonly soft: ReturnType<typeof makeLayer>;

  constructor(options: EffectsSystemOptions = {}) {
    const registry = options.registry;
    this.sim = new EffectsSim({
      seed: options.seed,
      flickerOf: registry ? (id) => registry.flicker(id) : undefined,
      haloColor: (id, out) => {
        const c = HALO_COLORS.get(id);
        out[0] = c ? c[0] : 1;
        out[1] = c ? c[1] : 0.72;
        out[2] = c ? c[2] : 0.4;
      },
    });
    this.group.name = 'effects';
    this.glow = makeLayer(this.sim.glow, true);
    this.soft = makeLayer(this.sim.soft, false);
    this.glow.points.name = 'effects-glow';
    this.soft.points.name = 'effects-soft';
    this.group.add(this.clouds.mesh, this.soft.points, this.glow.points);
  }

  /** The places effects start from; hand it to the ChunkRenderer so each chunk's mesh feeds it. */
  get sites(): SiteStore {
    return this.sim.sites;
  }

  /**
   * True when a screenshot taken now would show the effects at their steady state: the particles have been run up (see
   * EffectsSim.update) or no particle effect is switched on at all.
   */
  isReady(settings: EffectSettings): boolean {
    return this.sim.warm || !(settings.fireflies || settings.petals || settings.smoke || settings.embers || settings.halos);
  }

  /**
   * One frame. `time` is the game's clock (the one the foliage reads), `fov` the camera's vertical field of view in degrees and
   * `heightPx` the height of the drawing buffer in pixels, for the size of a sprite on screen.
   */
  update(
    dt: number, time: number, camX: number, camY: number, camZ: number, fov: number, heightPx: number,
    sky: SkyState, settings: EffectSettings,
  ): void {
    const f = this.frame;
    f.dt = dt;
    f.time = time;
    f.x = camX;
    f.y = camY;
    f.z = camZ;
    const heading = windHeading(time);
    f.windX = Math.cos(heading);
    f.windZ = Math.sin(heading);
    f.elevation = sky.elevation;
    f.daylight = sky.daylight;
    f.skyR = sky.skyLight[0];
    f.skyG = sky.skyLight[1];
    f.skyB = sky.skyLight[2];
    f.fireflies = settings.fireflies;
    f.petals = settings.petals;
    f.smoke = settings.smoke;
    f.embers = settings.embers;
    f.halos = settings.halos;
    this.sim.update(f);

    const scale = heightPx / (2 * Math.tan((fov * Math.PI) / 360));
    this.upload(this.glow, this.sim.glowDraw, scale);
    this.upload(this.soft, this.sim.softDraw, scale);

    this.clouds.update(dt, camX, camY, camZ, sky.clouds, sky.sunDir, sky.horizon, f.windX, f.windZ, settings.clouds);
  }

  private upload(layer: ReturnType<typeof makeLayer>, count: number, scale: number): void {
    layer.points.visible = count > 0;
    layer.geometry.setDrawRange(0, count);
    if (count === 0) return;
    layer.geometry.attributes.position.needsUpdate = true;
    layer.geometry.attributes.aParams.needsUpdate = true;
    layer.geometry.attributes.aColor.needsUpdate = true;
    layer.material.uniforms.uScale.value = scale;
  }

  dispose(): void {
    this.glow.geometry.dispose();
    this.glow.material.dispose();
    this.soft.geometry.dispose();
    this.soft.material.dispose();
    this.clouds.dispose();
  }
}
