import assert from "node:assert";
import { bucketFor, resolveEnabled } from "@/lib/evaluation/bucketing";

// Distribution: 50% rollout should split ~half, within +/-2%.
const N = 50000;
let on = 0;
for (let i = 0; i < N; i++) {
  if (resolveEnabled({ key: "feature-x", enabled: true, rolloutPercentage: 50 }, `user-${i}`)) {
    on++;
  }
}
const ratio = on / N;
assert(Math.abs(ratio - 0.5) < 0.02, `distribution off: ${ratio}`);

// Monotonic: raising rollout never drops an already-in-bucket identity.
for (let i = 0; i < 2000; i++) {
  const id = `id-${i}`;
  let prevOn = false;
  for (let pct = 0; pct <= 100; pct += 5) {
    const isOn = resolveEnabled({ key: "f", enabled: true, rolloutPercentage: pct }, id);
    if (prevOn) assert(isOn, `non-monotonic for ${id} at ${pct}`);
    prevOn = isOn;
  }
}

// Determinism: same inputs => same bucket.
assert(bucketFor("a", "b") === bucketFor("a", "b"));
assert(bucketFor("a", "b") >= 0 && bucketFor("a", "b") < 10000);

// Disabled flag is always off.
assert(resolveEnabled({ key: "f", enabled: false, rolloutPercentage: 100 }, "u") === false);

// Anonymous (no identity): all-or-nothing.
assert(resolveEnabled({ key: "f", enabled: true, rolloutPercentage: 100 }) === true);
assert(resolveEnabled({ key: "f", enabled: true, rolloutPercentage: 99 }) === false);
assert(resolveEnabled({ key: "f", enabled: true, rolloutPercentage: 0 }) === false);

console.log("bucketing.test.ts OK");
