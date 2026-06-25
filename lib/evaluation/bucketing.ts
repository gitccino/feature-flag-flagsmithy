type FlagState = {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
};

// FNV-1a 32-bit hash (inline, no deps).
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash * 16777619, kept in 32-bit unsigned space.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Stable bucket in [0, 10000) for a flag+identity pair.
export function bucketFor(flagKey: string, identity: string): number {
  return fnv1a(`${flagKey}:${identity}`) % 10000;
}

// Resolve a flag state to a single boolean.
// With identity: deterministic per-identity bucketing against the rollout.
// Without identity: all-or-nothing — only fully rolled-out flags are on.
export function resolveEnabled(state: FlagState, identity?: string): boolean {
  if (!state.enabled) return false;
  if (identity === undefined || identity === "") {
    return state.rolloutPercentage === 100;
  }
  return bucketFor(state.key, identity) < state.rolloutPercentage * 100;
}
