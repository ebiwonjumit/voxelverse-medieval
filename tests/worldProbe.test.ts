import { describe, expect, it } from 'vitest';
import { getWorldProbe, registerWorldProbe } from '../bench/worldProbe';

describe('worldProbe', () => {
  it('returns the registered probe and clears it on cleanup', () => {
    expect(getWorldProbe()).toBeNull();
    const probe = { isReady: () => true };
    const unregister = registerWorldProbe(probe);
    expect(getWorldProbe()).toBe(probe);
    unregister();
    expect(getWorldProbe()).toBeNull();
  });

  it('a stale cleanup does not remove a newer probe', () => {
    const first = { isReady: () => false };
    const second = { isReady: () => true };
    const unregisterFirst = registerWorldProbe(first);
    const unregisterSecond = registerWorldProbe(second);
    unregisterFirst();
    expect(getWorldProbe()).toBe(second);
    unregisterSecond();
  });
});
