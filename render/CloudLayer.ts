import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from 'three';
import { CLOUD_MIN_COVER, CloudState, Rgb, Vec3 } from './SkySystem';

// The cloud layer: one big horizontal plane that follows the camera at a fixed height, with the clouds made by a fragment shader
// from the world position, so they hold still in the world while the camera moves under them and drift downwind with the clock
// (docs/effects.md). It is one draw call with no textures. Where the plane is not covered by a cloud the pixel is discarded by
// alpha, and it is hidden entirely when the cover is clear (a zone with `clouds: 0`) or the switch is off.
//
// What the clouds look like comes from the sky system (SkyState.clouds): the cover, the lit and shaded colours of a cloud and
// its opacity, all derived from the time of day and the zone. The shader never knows the hour; it is handed colours.
//
// Like the sky dome the clouds are written straight to the screen (no tone mapping, no fog): their colours are in output colour
// space, and they fade into the horizon colour with distance instead of into the scene's fog.

/** How high above the camera the layer is, in blocks, and how far it reaches. */
export const CLOUD_HEIGHT = 110;
export const CLOUD_RADIUS = 700;
/** How fast the clouds drift in blocks a second (the wind direction is the one the foliage sways to). */
export const CLOUD_SPEED = 2.4;

const VERTEX = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// Value noise on a hashed lattice, five octaves. The density is thresholded by the cover (a cover of 0.45 is about two fifths of the
// sky), then lit by comparing the density here with the density a few blocks toward the sun: lower toward the sun means this
// is the sunward edge of a cloud and it is bright, higher means it is in the cloud's shadow. Thick cores darken a little.
const FRAGMENT = `
uniform vec2 uOffset;
uniform vec3 uCamera;
uniform float uCover;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHorizon;
uniform float uOpacity;
uniform vec2 uSun;
varying vec3 vWorld;

float hash( vec2 p ) {
  p = fract( p * vec2( 0.1031, 0.1030 ) );
  p += dot( p, p.yx + 33.33 );
  return fract( ( p.x + p.y ) * p.x );
}

float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = hash( i );
  float b = hash( i + vec2( 1.0, 0.0 ) );
  float c = hash( i + vec2( 0.0, 1.0 ) );
  float d = hash( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

float fbm( vec2 p ) {
  float sum = 0.0;
  float amp = 0.5;
  for ( int i = 0; i < 5; i++ ) {
    sum += amp * vnoise( p );
    p = p * 2.03 + vec2( 17.3, 9.1 );
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 p = ( vWorld.xz + uOffset ) / 150.0;
  float d = fbm( p );
  float threshold = mix( 0.70, 0.30, uCover );
  float density = smoothstep( threshold, threshold + 0.15, d );
  if ( density < 0.01 ) discard;

  float toward = fbm( p + uSun * 0.04 );
  float lit = clamp( 0.5 + ( d - toward ) * 7.0, 0.0, 1.0 );
  vec3 color = mix( uShade, uLit, lit );
  color *= 1.0 - 0.16 * smoothstep( threshold + 0.1, threshold + 0.4, d );

  float dist = length( vWorld.xz - uCamera.xz );
  color = mix( color, uHorizon, smoothstep( 160.0, 520.0, dist ) * 0.65 );
  float far = 1.0 - smoothstep( 300.0, 660.0, dist );
  gl_FragColor = vec4( color, density * uOpacity * far );
}
`;

export class CloudLayer {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly offset = new Vector2();

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uOffset: { value: this.offset },
        uCamera: { value: new Vector3() },
        uCover: { value: 0.45 },
        uLit: { value: new Vector3(1, 1, 1) },
        uShade: { value: new Vector3(0.75, 0.8, 0.9) },
        uHorizon: { value: new Vector3(0.6, 0.8, 0.95) },
        uOpacity: { value: 0.9 },
        uSun: { value: new Vector2(1, 0) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const geometry = new PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.scale.setScalar(CLOUD_RADIUS);
    // Before the water and the particles, after the sky dome.
    this.mesh.renderOrder = -50;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'clouds';
    this.mesh.visible = false;
  }

  /**
   * One frame: moves the layer under the camera, lets the clouds drift downwind (`windX`, `windZ` the wind's unit vector) and
   * hands the sky's look to the shader. Allocates nothing.
   */
  update(
    dt: number, camX: number, camY: number, camZ: number, clouds: CloudState, sunDir: Vec3, horizon: Rgb,
    windX: number, windZ: number, enabled: boolean,
  ): void {
    const visible = enabled && clouds.cover > CLOUD_MIN_COVER;
    this.mesh.visible = visible;
    if (!visible) return;
    // The clouds' offset is the integral of the wind, so a turn of the wind bends their course instead of jumping them.
    this.offset.x -= windX * CLOUD_SPEED * dt;
    this.offset.y -= windZ * CLOUD_SPEED * dt;
    this.mesh.position.set(camX, camY + CLOUD_HEIGHT, camZ);
    const u = this.material.uniforms;
    (u.uCamera.value as Vector3).set(camX, camY, camZ);
    u.uCover.value = clouds.cover;
    (u.uLit.value as Vector3).set(clouds.lit[0], clouds.lit[1], clouds.lit[2]);
    (u.uShade.value as Vector3).set(clouds.shade[0], clouds.shade[1], clouds.shade[2]);
    (u.uHorizon.value as Vector3).set(horizon[0], horizon[1], horizon[2]);
    u.uOpacity.value = clouds.opacity;
    // The sun's direction along the ground, for the lighting of the clouds; the sun at the zenith lights them from nowhere in particular.
    const sx = sunDir[0];
    const sz = sunDir[2];
    const len = Math.hypot(sx, sz);
    (u.uSun.value as Vector2).set(len > 1e-3 ? sx / len : 1, len > 1e-3 ? sz / len : 0);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
