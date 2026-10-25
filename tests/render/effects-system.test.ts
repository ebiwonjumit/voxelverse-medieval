import { Points, ShaderMaterial } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { EffectsSystem } from '../../render/EffectsSystem';
import { CloudLayer } from '../../render/CloudLayer';
import { EffectSettings, parseEffectSettings } from '../../render/effectSettings';
import { SkyClock, SkySystem } from '../../render/SkySystem';
import { MILE } from '../../constants';

// The three half of the effects: what EffectsSystem puts in a scene from the simulation's arrays (two Points and a cloud plane),
// what it hands the shaders, and how the cloud layer and the particles react to the sky and the switches. No WebGL is needed:
// nothing here draws, it looks at the objects a renderer would be given.

const systems: Array<{ dispose(): void }> = [];
afterEach(() => {
  while (systems.length) systems.pop()!.dispose();
});

const night = (): SkySystem => {
  const sky = new SkySystem({ clock: new SkyClock({ preset: 'night' }) });
  systems.push(sky);
  sky.update(0.1, 0, 10, 0, 0, 0);
  return sky;
};

const make = () => {
  const fx = new EffectsSystem({ registry: createDefaultRegistry() });
  systems.push(fx);
  return fx;
};

const on = (): EffectSettings => parseEffectSettings('');
const pointsOf = (fx: EffectsSystem): Points[] => fx.group.children.filter((c): c is Points => (c as Points).isPoints === true);

describe('EffectsSystem', () => {
  it('puts two particle layers and a cloud plane in its group: one additive, one with ordinary blending', () => {
    const fx = make();
    expect(fx.group.children).toHaveLength(3);
    const [soft, glow] = ['effects-soft', 'effects-glow'].map((n) => pointsOf(fx).find((p) => p.name === n)!);
    expect((glow.material as ShaderMaterial).blending).toBe(2); // AdditiveBlending
    expect((soft.material as ShaderMaterial).blending).toBe(1); // NormalBlending
    expect((glow.material as ShaderMaterial).defines).toHaveProperty('ADDITIVE');
    expect((soft.material as ShaderMaterial).defines).not.toHaveProperty('ADDITIVE');
    for (const p of [soft, glow]) {
      const m = p.material as ShaderMaterial;
      expect(m.depthWrite).toBe(false);
      expect(m.depthTest).toBe(true);
      expect(m.transparent).toBe(true);
      expect(m.fog).toBe(true);
      expect(p.frustumCulled).toBe(false);
      expect(p.renderOrder).toBeGreaterThan(0); // after the blended water of the chunks
    }
    expect(fx.clouds.mesh.renderOrder).toBeLessThan(0);
  });

  it('builds the attributes of each layer on the pool arrays themselves, uploads nothing while nothing is alive, and draws only the live range', () => {
    const fx = make();
    const sky = night();
    for (const p of pointsOf(fx)) expect(p.geometry.drawRange.count).toBe(0);
    expect(pointsOf(fx).map((p) => p.geometry.getAttribute('position').array)).toEqual([fx.sim.soft.position, fx.sim.glow.position]);
    fx.sites.set(0, 0, [new Int32Array(0), Int32Array.from([5, 5, 5, 4, 8, 5, 5, 4]), Int32Array.from([10, 20, 10, 200]), Int32Array.from([6, 6, 6, 163]), new Int32Array(0)]);
    for (let i = 0; i < 400; i++) fx.update(0.05, i * 0.05, 8, 10, 8, 75, 800, sky.state, on());
    const glow = pointsOf(fx).find((p) => p.name === 'effects-glow')!;
    const soft = pointsOf(fx).find((p) => p.name === 'effects-soft')!;
    expect(glow.geometry.drawRange.count).toBe(fx.sim.glowDraw);
    expect(soft.geometry.drawRange.count).toBe(fx.sim.softDraw);
    expect(glow.geometry.drawRange.count).toBeGreaterThan(0);
    expect(soft.visible).toBe(true);
    // The size of a sprite on screen follows the viewport and the field of view.
    const scale = (glow.material as ShaderMaterial).uniforms.uScale.value as number;
    expect(scale).toBeCloseTo(800 / (2 * Math.tan((75 * Math.PI) / 360)), 3);
    fx.update(0.05, 20, 8, 10, 8, 50, 1600, sky.state, on());
    expect((glow.material as ShaderMaterial).uniforms.uScale.value).toBeGreaterThan(scale * 2);
  });

  it('is ready for a screenshot when its particles have been run up, or when no particle effect is on', () => {
    const fx = make();
    const sky = night();
    expect(fx.isReady(on())).toBe(false);
    expect(fx.isReady(parseEffectSettings('?fx=0&clouds=1&flicker=1'))).toBe(true);
    fx.sites.set(0, 0, [new Int32Array(0), Int32Array.from([5, 5, 5, 4]), new Int32Array(0), new Int32Array(0), new Int32Array(0)]);
    for (let i = 0; i < 40; i++) fx.update(0.05, i * 0.05, 8, 10, 8, 75, 800, sky.state, on());
    expect(fx.isReady(on())).toBe(true);
  });

  it('takes the particles off the screen when their switches go off', () => {
    const fx = make();
    const sky = night();
    fx.sites.set(0, 0, [new Int32Array(0), Int32Array.from([5, 5, 5, 4, 8, 5, 5, 4]), Int32Array.from([10, 20, 10, 200]), Int32Array.from([6, 6, 6, 163]), new Int32Array(0)]);
    for (let i = 0; i < 200; i++) fx.update(0.05, i * 0.05, 8, 10, 8, 75, 800, sky.state, on());
    expect(fx.sim.glowDraw + fx.sim.softDraw).toBeGreaterThan(0);
    fx.update(0.05, 11, 8, 10, 8, 75, 800, sky.state, parseEffectSettings('?fx=0'));
    expect(fx.sim.glowDraw).toBe(0);
    expect(fx.sim.softDraw).toBe(0);
    for (const p of pointsOf(fx)) expect(p.visible).toBe(false);
  });
});

describe('CloudLayer', () => {
  const update = (layer: CloudLayer, sky: SkySystem, enabled = true, dt = 1) =>
    layer.update(dt, 100, 20, -50, sky.state.clouds, sky.state.sunDir, sky.state.horizon, 0.8, 0.6, enabled);

  it('follows the camera at a fixed height, and is hidden by the switch', () => {
    const layer = new CloudLayer();
    systems.push(layer);
    const sky = night();
    expect(layer.mesh.visible).toBe(false);
    update(layer, sky);
    expect(layer.mesh.visible).toBe(true);
    expect(layer.mesh.position.x).toBe(100);
    expect(layer.mesh.position.z).toBe(-50);
    expect(layer.mesh.position.y).toBeGreaterThan(20 + 50);
    update(layer, sky, false);
    expect(layer.mesh.visible).toBe(false);
  });

  it('is hidden over a clear zone and comes back out of it', () => {
    const layer = new CloudLayer();
    systems.push(layer);
    const sky = new SkySystem({ clock: new SkyClock({ preset: 'noon' }) });
    systems.push(sky);
    for (let i = 0; i < 100; i++) sky.update(0.1, 0, 10, -3 * MILE, 0, -3 * MILE);
    update(layer, sky);
    expect(layer.mesh.visible).toBe(false);
    for (let i = 0; i < 100; i++) sky.update(0.1, 0, 10, 0, 0, 0);
    update(layer, sky);
    expect(layer.mesh.visible).toBe(true);
  });

  it('hands the sky\'s colours and cover to the shader and drifts downwind', () => {
    const layer = new CloudLayer();
    systems.push(layer);
    const sky = night();
    update(layer, sky);
    const material = layer.mesh.material as ShaderMaterial;
    const u = material.uniforms;
    expect(u.uCover.value).toBeCloseTo(sky.state.clouds.cover, 6);
    expect(u.uOpacity.value).toBeCloseTo(sky.state.clouds.opacity, 6);
    expect((u.uLit.value as { x: number }).x).toBeCloseTo(sky.state.clouds.lit[0], 6);
    const before = { x: (u.uOffset.value as { x: number }).x, y: (u.uOffset.value as { y: number }).y };
    update(layer, sky, true, 10);
    const after = u.uOffset.value as { x: number; y: number };
    // The clouds' offset runs against the wind, so the clouds themselves move with it.
    expect(after.x).toBeLessThan(before.x);
    expect(after.y).toBeLessThan(before.y);
    expect(material.depthWrite).toBe(false);
    expect(material.fog).toBe(false);
    expect(material.toneMapped).toBe(false);
  });

  it('does not drift while the layer is hidden', () => {
    const layer = new CloudLayer();
    systems.push(layer);
    const sky = night();
    update(layer, sky);
    const offset = (layer.mesh.material as ShaderMaterial).uniforms.uOffset.value as { x: number };
    const x = offset.x;
    update(layer, sky, false, 5);
    expect(offset.x).toBe(x);
  });
});
