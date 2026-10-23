import React, { useCallback, useMemo } from 'react';
import { BlockRegistry } from '../../engine/BlockRegistry';
import { createTempestKits } from '../../worldgen/tempest/kits';
import { TEMPEST_STYLE } from '../../worldgen/tempest/style';
import SandboxView from './SandboxView';
import { KitSandboxOptions, KitSky, buildKitStage, kitFrame, kitLook } from './kitsLayout';

// ?sandbox=kits: the kit viewer. Buildings drawn by kits, standing on flat ground, through the game's own mesher,
// materials and baked light (see kitsLayout.ts for the options). Drag to orbit, wheel to zoom, right-drag to pan.

/** The kits shown when the page is opened with no kit named: the demonstration set of step 7.1b. */
export const DEMO_KITS = ['timber-house', 'gate', 'lantern-post'] as const;

const kits = createTempestKits();

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

const Overlay: React.FC<{ options: KitSandboxOptions }> = ({ options }) => {
  const selected = options.row ? `row:${options.row}` : options.kit ? `${options.kit}:${options.variant}` : 'demo';
  const entries = useMemo(() => kits.kits.flatMap((k) => Array.from({ length: k.variants }, (_, v) => `${k.name}:${v}`)), []);
  const onKit = (value: string): void => {
    const params = new URLSearchParams(window.location.search);
    params.delete('kit'); params.delete('variant'); params.delete('row');
    if (value.startsWith('row:')) params.set('row', value.slice(4));
    else if (value !== 'demo') {
      const [name, v] = value.split(':');
      params.set('kit', name);
      params.set('variant', v);
    }
    window.location.search = params.toString();
  };
  return (
    <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 30, display: 'flex', gap: 6, alignItems: 'center' }}>
      <select value={selected} onChange={(e) => onKit(e.target.value)} style={chip} aria-label="Kit">
        <option value="demo">demo set</option>
        {kits.kits.filter((k) => k.variants > 1).map((k) => <option key={`row:${k.name}`} value={`row:${k.name}`}>{`row: ${k.name}`}</option>)}
        {entries.map((e) => <option key={e} value={e}>{e.replace(':', ' #')}</option>)}
      </select>
      {(['noon', 'dusk', 'night'] as KitSky[]).map((s) => (
        <a key={s} href={withParam('sky', s)} style={{ ...chip, background: options.sky === s ? '#3b4a63' : chip.background }}>{s}</a>
      ))}
    </div>
  );
};

const KitSandbox: React.FC<{ options: KitSandboxOptions }> = ({ options }) => {
  const look = useMemo(() => kitLook(options.sky), [options.sky]);
  const build = useCallback((registry: BlockRegistry) => {
    const stage = buildKitStage(registry, kits, TEMPEST_STYLE, options, DEMO_KITS);
    const view = kitFrame(stage, options);
    return { ...stage, focused: true, azimuth: view.azimuth, elevation: view.elevation, zoom: view.zoom, cam: view.cam };
  }, [options]);
  return (
    <SandboxView
      title="Kit viewer"
      caption="blocks, drawn by the game's own mesher, materials and light."
      build={build}
      cam={null}
      look={look}
      fov={options.fov ?? (options.view === 'eye' && !options.cam ? 62 : undefined)}
      overlay={<Overlay options={options} />}
    />
  );
};

export default KitSandbox;
