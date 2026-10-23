import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { DataArrayTexture, DoubleSide, Group, Mesh, PerspectiveCamera } from 'three';
import { createDefaultRegistry } from '../../content/blocks';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { BUCKET_NAMES } from '../../meshing/ChunkMesher';
import { buildAtlas } from '../../render/AtlasBuilder';
import { createBlockMaterials } from '../../render/BlockMaterials';
import { bucketGeometry } from '../../render/ChunkRenderer';
import {
  CAMERA_FOV, SandboxOptions, defaultCamera, layoutBlocks, meshStage,
} from './sandboxLayout';

// ?sandbox=blocks: every registered block as a cube on a grid, under fixed neutral light, drawn with the
// game's own mesher, texture array and materials. Orbit with the mouse (drag, wheel, right-drag to pan).
//
//   ?sandbox=blocks                     every block, plus the grass and leaves under each zone's tint
//   ?sandbox=blocks&view=close          a few materials, close up
//   ?sandbox=blocks&focus=wood_plank,marble   any blocks by short name, close up
//   ?sandbox=blocks&cam=px,py,pz,tx,ty,tz     explicit camera
//
// window.__SHOT_READY__ turns true once the meshes have been drawn, like the ?shot mode of the world.

const BACKGROUND = '#2b2f36';
const FLOOR = '#30353c';

// Frames to wait after building before saying the picture is final, so the screenshot sees the textured result.
const READY_FRAMES = 4;

interface SceneProps {
  options: SandboxOptions;
  onCount: (n: number) => void;
}

const Scene: React.FC<SceneProps> = ({ options, onCount }) => {
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
    const materials = createBlockMaterials(textures, time);
    const layout = layoutBlocks(registry, options.focus);

    const meshes: Mesh[] = [];
    for (const stage of layout.stages) {
      for (const { mesh, offsetX, offsetZ } of meshStage(stage, registry, textureLayout)) {
        for (const name of BUCKET_NAMES) {
          const bucket = mesh[name];
          if (bucket.indices.length === 0) continue;
          const m = new Mesh(bucketGeometry(bucket, name === 'water' ? 0.4 : 0), materials[name]);
          m.position.set(offsetX, 0, offsetZ);
          meshes.push(m);
        }
      }
    }
    return { layout, meshes, materials, atlas, time };
  }, [options.focus]);

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    for (const m of built.meshes) node.add(m);
    onCount(built.layout.slots.length);
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
    () => options.cam ?? defaultCamera(built.layout, size.width / size.height, options.focus !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [built, options.cam],
  );
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    cam.fov = CAMERA_FOV;
    cam.near = 0.1;
    cam.far = 400;
    cam.position.set(...pose.position);
    cam.lookAt(...pose.target);
    cam.updateProjectionMatrix();
    controls.current?.target.set(...pose.target);
    controls.current?.update();
  }, [camera, pose]);

  const frames = useRef(0);
  useEffect(() => {
    (window as unknown as { __SHOT_READY__?: boolean }).__SHOT_READY__ = false;
  }, []);
  useFrame(({ clock }) => {
    built.time.value = clock.elapsedTime;
    if (++frames.current === READY_FRAMES) {
      (window as unknown as { __SHOT_READY__?: boolean }).__SHOT_READY__ = true;
    }
  });

  const { width, depth } = built.layout;
  // Large enough that the edge of the floor stays out of the picture, even when orbiting.
  const floorSize = Math.max(width, depth) + 30;

  return (
    <>
      <color attach="background" args={[BACKGROUND]} />
      {/* Fixed and neutral: white fill from everywhere, a key light from the front left above, and a weak one
          from the right so no side of a cube goes black. three's lights are physical (the Lambert term divides
          by pi), so a lit top face comes out near its own colour at ambient 1.5 plus key 1.9, and there is no
          tone mapping to wash the colours out. */}
      <ambientLight intensity={1.5} />
      <directionalLight position={[-8, 14, depth + 10]} intensity={1.9} />
      <directionalLight position={[width + 10, 6, depth + 4]} intensity={0.8} />

      <mesh rotation-x={-Math.PI / 2} position={[width / 2, -0.01, depth / 2 + 0.5]}>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color={FLOOR} roughness={1} metalness={0} side={DoubleSide} />
      </mesh>
      <gridHelper
        args={[floorSize, floorSize, '#555c67', '#444a54']}
        position={[width / 2, 0, depth / 2 + 0.5]}
      />

      <group ref={group} />

      {built.layout.labels.map((label, i) => (
        <Html key={i} position={[label.x, 0, label.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div style={labelStyle}>
            <div style={{ color: '#e8ebf0' }}>{label.text}</div>
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

const BlockSandbox: React.FC<{ options: SandboxOptions }> = ({ options }) => {
  const [count, setCount] = React.useState(0);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: BACKGROUND }}>
      <div
        style={{
          position: 'absolute', top: 12, left: 14, zIndex: 20, pointerEvents: 'none', color: '#c8cdd6',
          font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', textShadow: '0 1px 2px #000',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Block sandbox</div>
        <div>{count} blocks, drawn by the game's own mesher and materials. Drag to orbit, wheel to zoom.</div>
      </div>
      <Canvas flat camera={{ fov: CAMERA_FOV, position: [10, 14, 20] }}>
        <Scene options={options} onCount={setCount} />
      </Canvas>
    </div>
  );
};

export default BlockSandbox;
