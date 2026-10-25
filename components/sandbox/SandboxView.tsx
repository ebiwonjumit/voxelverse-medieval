import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { DataArrayTexture, DoubleSide, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { createDefaultRegistry } from '../../content/blocks';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { BUCKET_NAMES } from '../../meshing/ChunkMesher';
import { buildAtlas } from '../../render/AtlasBuilder';
import { createBlockMaterials, createEffectUniforms } from '../../render/BlockMaterials';
import { effectSettings } from '../../render/effectSettings';
import { bucketGeometry } from '../../render/ChunkRenderer';
import { BlockRegistry } from '../../engine/BlockRegistry';
import {
  CAMERA_FOV, CameraPose, FrameBox, SandboxLabel, Stage, defaultCamera, meshStage,
} from './sandboxLayout';

// The page shared by ?sandbox=blocks and ?sandbox=models: stages of blocks meshed by the game's own mesher, shown
// at noon with the game's texture array and materials. Orbit with the mouse (drag, wheel,
// right-drag to pan). What is shown comes from `build`, which BlockSandbox and ModelSandbox supply.
//
// window.__SHOT_READY__ turns true once the meshes have been drawn, like the ?shot mode of the world.

const BACKGROUND = '#2b2f36';
const FLOOR = '#30353c';

// ?night=1: the same page with the block light baked into the meshes and the sky light turned down to the game's night
// values (render/SkySystem.ts: NIGHT_DAYLIGHT and the first palette key's sky light colour), so lanterns and lit screens
// show what they do in the world after dark.
const NIGHT_DAYLIGHT = 0.15;
const NIGHT_SKY_LIGHT: [number, number, number] = [0.55, 0.72, 1.15];
const NIGHT_BACKGROUND = '#070b18';
const NIGHT_FLOOR = '#0c1018';

// Frames to wait after building before saying the picture is final, so the screenshot sees the textured result.
const READY_FRAMES = 4;

/**
 * How a sandbox page is lit and what is behind it. The default looks are the plain noon of the block sandboxes and the
 * night of `?night=1`; the kit viewer passes the game's own dusk and night (render/SkySystem.ts) through here.
 */
export interface SandboxLook {
  /** The shader's `uDaylight`: how much of the baked sky light shows. */
  daylight: number;
  /** The shader's `uSkyLight` colour multipliers. */
  skyLight: [number, number, number];
  /** Bake block light into the meshes (lanterns, lit screens). */
  lit: boolean;
  background: string;
  floor: string;
  /** Intensity of the ambient and key lights that shade the floor plane only. */
  ambient: number;
  sun: number;
  /** Show the grid helper (the block pages) or not (a scene with a real ground). */
  grid: boolean;
}

export const NOON_LOOK: SandboxLook = { daylight: 1, skyLight: [1, 1, 1], lit: false, background: BACKGROUND, floor: FLOOR, ambient: 1.5, sun: 1.9, grid: true };
export const NIGHT_LOOK: SandboxLook = { daylight: NIGHT_DAYLIGHT, skyLight: NIGHT_SKY_LIGHT, lit: true, background: NIGHT_BACKGROUND, floor: NIGHT_FLOOR, ambient: 0.12, sun: 0.1, grid: true };

/** Everything a sandbox page puts on the stage. */
export interface SandboxContent extends FrameBox {
  stages: Stage[];
  labels: SandboxLabel[];
  /** The number the page's caption counts (blocks, or cells). */
  count: number;
  /** Close views sit lower and nearer. */
  focused: boolean;
  /** An explicit camera for this content, used when the page's own `cam` is null. */
  cam?: CameraPose | null;
}

interface SceneProps {
  /** Builds the content from the registry. Must be stable between renders (the page calls it once). */
  build: (registry: BlockRegistry) => SandboxContent;
  cam: CameraPose | null;
  onCount: (n: number) => void;
  look: SandboxLook;
  fov: number;
}

const Scene: React.FC<SceneProps> = ({ build, cam, onCount, look, fov }) => {
  const { camera, size } = useThree();
  const group = useRef<Group>(null);
  const controls = useRef<any>(null);

  // Everything below is built once: the sandbox has no moving parts besides the water wave.
  const built = useMemo(() => {
    const registry = createDefaultRegistry();
    const catalog = createDefaultCatalog();
    const textureLayout = createDefaultTextureLayout(registry, catalog);
    const atlas = buildAtlas(catalog, textureLayout);
    const textures: { value: DataArrayTexture | null } = { value: atlas.texture };
    const time = { value: 0 };
    // The sandboxes show the sway and the water too, so a plant or a pond can be looked at up close (?sway=0 and ?waterfx=0 stop them).
    const effects = createEffectUniforms();
    effects.sway.value = effectSettings.sway ? 1 : 0;
    effects.water.value = effectSettings.waterAnimation ? 1 : 0;
    const materials = createBlockMaterials(
      textures, time, { value: look.daylight }, { value: new Vector3(...look.skyLight) }, effects,
    );
    const layout = build(registry);

    const meshes: Mesh[] = [];
    for (const stage of layout.stages) {
      for (const { mesh, offsetX, offsetZ } of meshStage(stage, registry, textureLayout, look.lit)) {
        for (const name of BUCKET_NAMES) {
          const bucket = mesh[name];
          if (bucket.indices.length === 0) continue;
          const m = new Mesh(bucketGeometry(bucket, name === 'water' ? 0.4 : bucket.sway.length > 0 ? 0.4 : 0), materials[name]);
          m.position.set(offsetX, 0, offsetZ);
          meshes.push(m);
        }
      }
    }
    return { layout, meshes, materials, atlas, time, effects };
  }, [build, look]);

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    for (const m of built.meshes) node.add(m);
    onCount(built.layout.count);
    return () => {
      for (const m of built.meshes) {
        node.remove(m);
        m.geometry.dispose();
      }
      built.materials.dispose();
      built.atlas.dispose();
    };
  }, [built, onCount]);

  // The camera is placed once, from the canvas aspect. After that OrbitControls owns it. size is read once on
  // purpose: resizing the window must not throw away the user's orbit.
  const pose = useMemo(
    () => cam ?? built.layout.cam ?? defaultCamera(built.layout, size.width / size.height, built.layout.focused),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [built, cam],
  );
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    cam.fov = fov;
    cam.near = 0.1;
    cam.far = 400;
    cam.position.set(...pose.position);
    cam.lookAt(...pose.target);
    cam.updateProjectionMatrix();
    controls.current?.target.set(...pose.target);
    controls.current?.update();
  }, [camera, pose, fov]);

  const frames = useRef(0);
  useEffect(() => {
    (window as unknown as { __SHOT_READY__?: boolean }).__SHOT_READY__ = false;
  }, []);
  useFrame(({ clock }) => {
    built.time.value = clock.elapsedTime;
    if (built.effects.water.value > 0.5) built.effects.waterTime.value = clock.elapsedTime;
    if (++frames.current === READY_FRAMES) {
      (window as unknown as { __SHOT_READY__?: boolean }).__SHOT_READY__ = true;
    }
  });

  const { width, depth } = built.layout;
  // Large enough that the edge of the floor stays out of the picture, even when orbiting.
  const floorSize = Math.max(width, depth) + 30;

  return (
    <>
      <color attach="background" args={[look.background]} />
      {/* The blocks take no light from the scene: their materials shade from the baked light in the vertices (here open sky,
          daylight 1), so every block shows the way it does at noon. These lights are for the floor plane only. */}
      <ambientLight intensity={look.ambient} />
      <directionalLight position={[-8, 14, depth + 10]} intensity={look.sun} />
      <directionalLight position={[width + 10, 6, depth + 4]} intensity={look.sun * 0.42} />

      <mesh rotation-x={-Math.PI / 2} position={[width / 2, -0.01, depth / 2 + 0.5]}>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color={look.floor} roughness={1} metalness={0} side={DoubleSide} />
      </mesh>
      {look.grid && (
        <gridHelper
          args={[floorSize, floorSize, look === NIGHT_LOOK ? '#1d2433' : '#555c67', look === NIGHT_LOOK ? '#151b28' : '#444a54']}
          position={[width / 2, 0, depth / 2 + 0.5]}
        />
      )}

      <group ref={group} />

      {built.layout.labels.map((label, i) => (
        <Html key={i} position={[label.x, 0, label.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div style={label.heading ? headingStyle : labelStyle}>
            <div style={{ color: label.heading ? '#fff' : '#e8ebf0' }}>{label.text}</div>
            {label.sub && <div style={{ color: '#8a929e' }}>{label.sub}</div>}
          </div>
        </Html>
      ))}

      <OrbitControls ref={controls} makeDefault target={pose.target} maxPolarAngle={Math.PI / 2 - 0.02} />
    </>
  );
};

const labelStyle: React.CSSProperties = {
  font: '500 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  textShadow: '0 1px 2px #000, 0 0 4px #000',
  userSelect: 'none',
};

const headingStyle: React.CSSProperties = { ...labelStyle, fontSize: 12, fontWeight: 600 };

export interface SandboxViewProps {
  title: string;
  /** The caption after the count, e.g. "blocks, drawn by the game's own mesher". */
  caption: string;
  build: (registry: BlockRegistry) => SandboxContent;
  cam: CameraPose | null;
  /** Bake block light and show a night sky (?night=1). */
  night?: boolean;
  /** The lighting and background, overriding `night`. */
  look?: SandboxLook;
  /** Extra DOM drawn over the canvas (the kit viewer's selector). */
  overlay?: React.ReactNode;
  /** Vertical field of view in degrees (?fov=), CAMERA_FOV when left out. The default camera is framed for CAMERA_FOV. */
  fov?: number;
}

const SandboxView: React.FC<SandboxViewProps> = ({ title, caption, build, cam, night = false, look, overlay, fov = CAMERA_FOV }) => {
  const [count, setCount] = React.useState(0);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: BACKGROUND }}>
      <div
        style={{
          position: 'absolute', top: 12, left: 14, zIndex: 20, pointerEvents: 'none', color: '#c8cdd6',
          font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', textShadow: '0 1px 2px #000',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{title}</div>
        <div>{count} {caption} Drag to orbit, wheel to zoom.</div>
      </div>
      <Canvas flat camera={{ fov, position: [10, 14, 20] }}>
        <Scene build={build} cam={cam} onCount={setCount} look={look ?? (night ? NIGHT_LOOK : NOON_LOOK)} fov={fov} />
      </Canvas>
      {overlay}
    </div>
  );
};

export default SandboxView;
