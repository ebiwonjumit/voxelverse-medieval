// The world renderer registers one of these so the bench and screenshot tools can ask it questions
// without knowing how it draws. Pure TypeScript on purpose: any renderer can plug in.
export interface WorldProbe {
  // True once the world around the camera has finished loading and will not change on its own.
  isReady(): boolean;
  // Renderer-specific counters, recorded next to the three.js numbers in the soak run.
  getStats?(): Record<string, number>;
}

let current: WorldProbe | null = null;

// Returns a function that unregisters the probe, for use as an effect cleanup.
export const registerWorldProbe = (probe: WorldProbe): (() => void) => {
  current = probe;
  return () => {
    if (current === probe) current = null;
  };
};

export const getWorldProbe = (): WorldProbe | null => current;

// Other parts of the game that a screenshot or a soak has to know about register here, so the world renderer's probe does not
// have to know them: the living-world effects wait for their particles to fill the air (a gate: the screenshot is not taken
// until every gate is open) and report how many particles are alive (a stats source: merged into the soak's counters).
const gates = new Set<() => boolean>();
const sources = new Set<() => Record<string, number>>();

export const addReadyGate = (gate: () => boolean): (() => void) => {
  gates.add(gate);
  return () => {
    gates.delete(gate);
  };
};

export const readyGatesOpen = (): boolean => {
  for (const gate of gates) if (!gate()) return false;
  return true;
};

export const addStatsSource = (source: () => Record<string, number>): (() => void) => {
  sources.add(source);
  return () => {
    sources.delete(source);
  };
};

// The world renderer's counters and every registered source's, or null when there is nothing to report.
export const getWorldStats = (): Record<string, number> | null => {
  const own = current?.getStats?.() ?? null;
  if (sources.size === 0) return own;
  const merged: Record<string, number> = { ...(own ?? {}) };
  for (const source of sources) Object.assign(merged, source());
  return merged;
};
