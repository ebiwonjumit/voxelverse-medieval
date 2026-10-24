import React, { useCallback, useMemo } from 'react';
import { BlockRegistry } from '../../engine/BlockRegistry';
import { createTempestLandmarks } from '../../worldgen/tempest/landmarks';
import { TEMPEST_STYLE } from '../../worldgen/tempest/style';
import SandboxView from './SandboxView';
import { KitSky } from './kitsLayout';
import { LandmarkSandboxOptions, buildLandmarkStage, landmarkFrame, landmarkLook } from './landmarksLayout';

// ?sandbox=landmarks: the landmark viewer. One landmark (the compound, the arena, a gate...) drawn by its own builder on
// flat ground, through the game's own mesher, materials and baked light. Drag to orbit, wheel to zoom, right-drag to pan.
// See landmarksLayout.ts for the options.

const landmarks = createTempestLandmarks();

const withParam = (key: string, value: string | null): string => {
  const params = new URLSearchParams(window.location.search);
  if (value === null) params.delete(key);
  else params.set(key, value);
  return `?${params.toString()}`;
};

const chip: React.CSSProperties = {
  font: '12px ui-monospace, SFMono-Regular, Menlo, monospace', color: '#e8ebf0', background: '#1d2229cc', border: '1px solid #3b434e',
  borderRadius: 4, padding: '3px 8px', textDecoration: 'none',
};

const Overlay: React.FC<{ options: LandmarkSandboxOptions }> = ({ options }) => (
  <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 30, display: 'flex', gap: 6, alignItems: 'center' }}>
    <select
      value={options.landmark}
      onChange={(e) => { window.location.search = withParam('landmark', e.target.value); }}
      style={chip}
      aria-label="Landmark"
    >
      {landmarks.specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
    {(['noon', 'dusk', 'night'] as KitSky[]).map((s) => (
      <a key={s} href={withParam('sky', s)} style={{ ...chip, background: options.sky === s ? '#3b4a63' : chip.background }}>{s}</a>
    ))}
  </div>
);

const LandmarkSandbox: React.FC<{ options: LandmarkSandboxOptions }> = ({ options }) => {
  const look = useMemo(() => landmarkLook(options.sky), [options.sky]);
  const build = useCallback((registry: BlockRegistry) => {
    const stage = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options);
    const view = landmarkFrame(stage, options);
    return { ...stage, focused: true, azimuth: view.azimuth, elevation: view.elevation, zoom: view.zoom, cam: view.cam };
  }, [options]);
  return (
    <SandboxView
      title="Landmark viewer"
      caption="blocks, drawn by the game's own mesher, materials and light."
      build={build}
      cam={null}
      look={look}
      fov={options.fov ?? (options.view === 'eye' && !options.cam ? 62 : undefined)}
      overlay={<Overlay options={options} />}
    />
  );
};

export default LandmarkSandbox;
