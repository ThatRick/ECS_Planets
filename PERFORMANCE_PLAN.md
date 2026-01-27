# Performance Review & Improvement Plan

## Current Performance Context

- The simulation runs on a fixed-timestep ticker (100 Hz) and updates simulation systems each tick, followed by a flush that removes merged entities.【F:src/ECS/World.ts†L29-L112】【F:src/ECS/World.ts†L128-L170】
- Entity queries are cached, but `query()` returns a sliced copy of the cached array on each call to avoid caller mutation, which creates per-tick allocations when systems repeatedly query the same components.【F:src/ECS/World.ts†L229-L287】
- The “simple” gravity system uses SOA (TypedArray) scratch buffers and still performs O(n²) pair calculations each tick, plus a per-tick spatial hash allocation for collision detection.【F:src/ECS/systems/GravitySystemSimple.ts†L1-L169】【F:src/ECS/systems/GravitySystemSimple.ts†L171-L302】
- The Barnes–Hut gravity system already reuses an Octree, body pool, and spatial hash instance to reduce per-tick allocations, but it still rebuilds the tree each tick and uses Sets for merged indices tracking.【F:src/ECS/systems/GravitySystemBarnesHut.ts†L18-L126】【F:src/ECS/systems/GravitySystemBarnesHut.ts†L128-L216】
- A performance monitor exists (FPS, sim rate, gravity/collision/render times), but the gravity and collision timers are not currently wired into the systems, so detailed breakdowns are likely zeros.【F:src/PerfMonitor.ts†L1-L141】

## Immediate, Low-Risk Improvements (1–2 days)

1. **Reuse the spatial hash in the simple gravity system.**
   - The Barnes–Hut system already keeps a reusable `SpatialHash3D` and clears it per tick; the simple system allocates a new one every update. Replicating the Barnes–Hut pattern should reduce GC pressure at 3000 bodies.【F:src/ECS/systems/GravitySystemSimple.ts†L81-L118】【F:src/ECS/systems/GravitySystemBarnesHut.ts†L97-L147】

2. **Replace `mergedIndices` Sets with a typed bitset/flag array.**
   - Both gravity systems rely on `Set<number>` lookups in hot loops; a `Uint8Array` (0/1) indexed by body index would reduce hashing overhead and improve cache locality.【F:src/ECS/systems/GravitySystemSimple.ts†L120-L214】【F:src/ECS/systems/GravitySystemBarnesHut.ts†L149-L228】

3. **Add detailed timing in physics systems.**
   - `PerfMonitor` already exposes `recordGravityTime` and `recordCollisionTime`. Instrumenting the gravity/collision sections will give a real breakdown and confirm the biggest hotspot before deeper refactors.【F:src/PerfMonitor.ts†L81-L119】

4. **Reduce `query()` allocations for hot systems.**
   - Because `query()` returns a slice on every call, the gravity systems generate arrays each tick. Introduce a new `queryView()` or `queryCached()` that returns a readonly cached array to trusted systems to avoid per-tick allocations.【F:src/ECS/World.ts†L229-L287】

## Medium-Term Improvements (1–2 weeks)

1. **Unify shared scratch buffers between gravity systems.**
   - Both gravity systems maintain SOA scratch buffers. A shared, reusable buffer module reduces memory footprint and keeps tuning in one place.【F:src/ECS/systems/GravitySystemSimple.ts†L7-L58】【F:src/ECS/systems/GravitySystemBarnesHut.ts†L27-L86】

2. **Consider Float32 for positions/velocities.**
   - The scratch arrays are all `Float64Array`. If precision tolerates it, switching to `Float32Array` reduces bandwidth and may increase SIMD/vectorization opportunities.【F:src/ECS/systems/GravitySystemSimple.ts†L7-L58】【F:src/ECS/systems/GravitySystemBarnesHut.ts†L27-L86】

3. **Batch updates to ECS components.**
   - Both systems copy data out and then write back to components after simulation. Consider batching all write-backs into tight loops or adopting an “array-backed components” archetype for hot components (Position/Velocity/Mass/Size/Temperature).【F:src/ECS/systems/GravitySystemSimple.ts†L81-L99】【F:src/ECS/systems/GravitySystemBarnesHut.ts†L102-L129】【F:src/ECS/World.ts†L229-L321】

4. **Reduce octree rebuild work when stable.**
   - Barnes–Hut rebuilds the tree every tick. If many frames are near-stable, consider skipping rebuilds when max position delta is below a threshold (or rebuild every N ticks).【F:src/ECS/systems/GravitySystemBarnesHut.ts†L200-L216】

## Longer-Term Options (2–6 weeks)

1. **Move physics to a worker thread.**
   - The simulation loop runs on the main thread. Offloading physics to a Worker (plus structured cloning of typed arrays or using transferable buffers) can free rendering time and improve responsiveness on slower devices.【F:src/ECS/World.ts†L69-L112】

2. **GPU acceleration for gravity.**
   - The renderer already has a WebGL path; if staying GPU-focused, a compute approach (WebGPU or transform feedback) can push larger body counts while keeping sim steps high. This would be a larger architectural shift but aligns with the existing WebGL renderer setup in the project.【F:src/App.ts†L6-L31】

## Suggested Next Steps (Order)

1. Add PerfMonitor timing around gravity + collision to confirm the top hotspot.
2. Reuse the spatial hash + replace merged-index Sets with typed flags.
3. Add a `queryView()` (or similar) for internal systems to avoid array copies.
4. Re-test at 3000 bodies and compare sim steps/sec and frame times.

---

If you want, I can execute the first two improvements and add timing instrumentation in a follow-up change set.
