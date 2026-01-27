/**
 * Octree implementation for 3D Barnes-Hut gravity algorithm.
 * Optimized version with node pooling and reduced allocations.
 *
 * The Barnes-Hut algorithm reduces N-body gravity from O(n²) to O(n log n)
 * by approximating the gravitational effect of distant body groups as a
 * single body at their center of mass.
 *
 * The "theta" parameter controls accuracy vs speed tradeoff:
 * - theta = 0: exact calculation (same as direct summation)
 * - theta = 0.5: good balance of accuracy and speed
 * - theta = 0.7: faster, still reasonably accurate (default)
 * - theta = 1.0: fastest but less accurate
 */
// Pre-allocated node pool for zero-allocation tree building
const NODE_POOL_SIZE = 8192;
let nodePool = [];
let nodePoolIndex = 0;
function initNodePool() {
    if (nodePool.length === 0) {
        nodePool = new Array(NODE_POOL_SIZE);
        for (let i = 0; i < NODE_POOL_SIZE; i++) {
            nodePool[i] = {
                cx: 0, cy: 0, cz: 0, halfSize: 0,
                totalMass: 0, comX: 0, comY: 0, comZ: 0,
                children: null, body: null, bodyCount: 0
            };
        }
    }
}
function resetNodePool() {
    nodePoolIndex = 0;
}
function allocNode(cx, cy, cz, halfSize) {
    if (nodePoolIndex >= nodePool.length) {
        // Expand pool if needed
        const newSize = nodePool.length * 2;
        for (let i = nodePool.length; i < newSize; i++) {
            nodePool[i] = {
                cx: 0, cy: 0, cz: 0, halfSize: 0,
                totalMass: 0, comX: 0, comY: 0, comZ: 0,
                children: null, body: null, bodyCount: 0
            };
        }
    }
    const node = nodePool[nodePoolIndex++];
    node.cx = cx;
    node.cy = cy;
    node.cz = cz;
    node.halfSize = halfSize;
    node.totalMass = 0;
    node.comX = 0;
    node.comY = 0;
    node.comZ = 0;
    node.children = null;
    node.body = null;
    node.bodyCount = 0;
    return node;
}
// Pre-allocated children array pool
const CHILDREN_POOL_SIZE = 1024;
let childrenPool = [];
let childrenPoolIndex = 0;
function initChildrenPool() {
    if (childrenPool.length === 0) {
        childrenPool = new Array(CHILDREN_POOL_SIZE);
        for (let i = 0; i < CHILDREN_POOL_SIZE; i++) {
            childrenPool[i] = [null, null, null, null, null, null, null, null];
        }
    }
}
function resetChildrenPool() {
    childrenPoolIndex = 0;
}
function allocChildren() {
    if (childrenPoolIndex >= childrenPool.length) {
        const newSize = childrenPool.length * 2;
        for (let i = childrenPool.length; i < newSize; i++) {
            childrenPool[i] = [null, null, null, null, null, null, null, null];
        }
    }
    const arr = childrenPool[childrenPoolIndex++];
    arr[0] = arr[1] = arr[2] = arr[3] = arr[4] = arr[5] = arr[6] = arr[7] = null;
    return arr;
}
// Pre-allocated stack for iterative tree traversal
const traversalStack = new Array(256);
export class Octree {
    root = null;
    // Theta parameter for Barnes-Hut approximation
    // Lower = more accurate, higher = faster
    theta = 0.7; // Optimized default
    // Theta squared for avoiding sqrt in criterion check
    thetaSq = 0.49;
    // Maximum tree depth to prevent infinite recursion for coincident bodies
    static MAX_DEPTH = 50;
    constructor() {
        initNodePool();
        initChildrenPool();
    }
    /**
     * Build the Octree from an array of bodies.
     * Call this once per frame before computing forces.
     */
    build(bodies) {
        // Reset pools for reuse
        resetNodePool();
        resetChildrenPool();
        // Update thetaSq when theta might have changed
        this.thetaSq = this.theta * this.theta;
        if (bodies.length === 0) {
            this.root = null;
            return;
        }
        // Find bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            const z = body.z ?? 0;
            if (body.x < minX)
                minX = body.x;
            if (body.x > maxX)
                maxX = body.x;
            if (body.y < minY)
                minY = body.y;
            if (body.y > maxY)
                maxY = body.y;
            if (z < minZ)
                minZ = z;
            if (z > maxZ)
                maxZ = z;
        }
        // Make it a cube with some padding
        const width = maxX - minX;
        const height = maxY - minY;
        const depth = maxZ - minZ;
        const size = Math.max(width, height, depth, 1) * 1.1 + 1;
        const halfSize = size / 2;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        // Create root node from pool
        this.root = allocNode(cx, cy, cz, halfSize);
        // Insert all bodies
        for (let i = 0; i < bodies.length; i++) {
            this.insert(this.root, bodies[i], 0);
        }
        // Compute mass distributions (bottom-up)
        this.computeMassDistribution(this.root);
    }
    insert(node, body, depth) {
        // If this is an empty leaf, store the body here
        if (node.bodyCount === 0) {
            node.body = body;
            node.bodyCount = 1;
            return;
        }
        // If at max depth, just aggregate the body into this node
        if (depth >= Octree.MAX_DEPTH) {
            node.bodyCount++;
            return;
        }
        // If this is a leaf with one body, we need to subdivide
        if (node.body !== null) {
            const existingBody = node.body;
            node.body = null;
            this.subdivide(node);
            // Re-insert the existing body
            const octant1 = this.getOctant(node, existingBody);
            this.insert(node.children[octant1], existingBody, depth + 1);
        }
        // Insert the new body into appropriate octant
        if (node.children === null) {
            this.subdivide(node);
        }
        const octant = this.getOctant(node, body);
        this.insert(node.children[octant], body, depth + 1);
        node.bodyCount++;
    }
    subdivide(node) {
        const hs = node.halfSize / 2;
        // Use pooled children array
        node.children = allocChildren();
        // 8 octants: indexed by (z << 2) | (y << 1) | x
        node.children[0] = allocNode(node.cx - hs, node.cy - hs, node.cz - hs, hs);
        node.children[1] = allocNode(node.cx + hs, node.cy - hs, node.cz - hs, hs);
        node.children[2] = allocNode(node.cx - hs, node.cy + hs, node.cz - hs, hs);
        node.children[3] = allocNode(node.cx + hs, node.cy + hs, node.cz - hs, hs);
        node.children[4] = allocNode(node.cx - hs, node.cy - hs, node.cz + hs, hs);
        node.children[5] = allocNode(node.cx + hs, node.cy - hs, node.cz + hs, hs);
        node.children[6] = allocNode(node.cx - hs, node.cy + hs, node.cz + hs, hs);
        node.children[7] = allocNode(node.cx + hs, node.cy + hs, node.cz + hs, hs);
    }
    getOctant(node, body) {
        const z = body.z ?? 0;
        const xPos = body.x >= node.cx ? 1 : 0;
        const yPos = body.y >= node.cy ? 1 : 0;
        const zPos = z >= node.cz ? 1 : 0;
        return (zPos << 2) | (yPos << 1) | xPos;
    }
    computeMassDistribution(node) {
        if (node.bodyCount === 0) {
            return;
        }
        // Leaf node with single body
        if (node.body !== null) {
            node.totalMass = node.body.mass;
            node.comX = node.body.x;
            node.comY = node.body.y;
            node.comZ = node.body.z ?? 0;
            return;
        }
        // Internal node: aggregate from children
        let totalMass = 0;
        let comX = 0;
        let comY = 0;
        let comZ = 0;
        if (node.children) {
            for (let i = 0; i < 8; i++) {
                const child = node.children[i];
                if (child && child.bodyCount > 0) {
                    this.computeMassDistribution(child);
                    totalMass += child.totalMass;
                    comX += child.comX * child.totalMass;
                    comY += child.comY * child.totalMass;
                    comZ += child.comZ * child.totalMass;
                }
            }
        }
        if (totalMass > 0) {
            node.totalMass = totalMass;
            node.comX = comX / totalMass;
            node.comY = comY / totalMass;
            node.comZ = comZ / totalMass;
        }
    }
    /**
     * Calculate force on a body using Barnes-Hut approximation.
     * Returns {fx, fy, fz} acceleration components.
     * Optimized with squared distance comparisons.
     */
    calculateForce(body, G, softening = 100) {
        if (!this.root) {
            return { fx: 0, fy: 0, fz: 0 };
        }
        let fx = 0;
        let fy = 0;
        let fz = 0;
        const softeningSq = softening * softening;
        const bodyX = body.x;
        const bodyY = body.y;
        const bodyZ = body.z ?? 0;
        const bodyIndex = body.index;
        const thetaSq = this.thetaSq;
        // Use pre-allocated stack for iterative traversal
        let stackTop = 0;
        traversalStack[stackTop++] = this.root;
        while (stackTop > 0) {
            const node = traversalStack[--stackTop];
            if (node.bodyCount === 0)
                continue;
            // Distance from body to node's center of mass
            const dx = node.comX - bodyX;
            const dy = node.comY - bodyY;
            const dz = node.comZ - bodyZ;
            const distSq = dx * dx + dy * dy + dz * dz;
            // If this is a leaf with a single body
            if (node.body !== null) {
                // Don't compute self-interaction
                if (node.body.index === bodyIndex)
                    continue;
                // Direct force calculation
                const softDistSq = distSq + softeningSq;
                const dist = Math.sqrt(softDistSq);
                const invDistCubed = 1 / (softDistSq * dist);
                const forceMag = G * node.body.mass * invDistCubed;
                fx += dx * forceMag;
                fy += dy * forceMag;
                fz += dz * forceMag;
                continue;
            }
            // Barnes-Hut criterion using squared values: (s/d)² < θ²
            // Equivalent to: s² < θ² * d²
            const nodeSizeSq = node.halfSize * node.halfSize * 4; // (2*halfSize)²
            if (nodeSizeSq < thetaSq * distSq) {
                // Node is far enough - use center of mass approximation
                const softDistSq = distSq + softeningSq;
                const dist = Math.sqrt(softDistSq);
                const invDistCubed = 1 / (softDistSq * dist);
                const forceMag = G * node.totalMass * invDistCubed;
                fx += dx * forceMag;
                fy += dy * forceMag;
                fz += dz * forceMag;
            }
            else {
                // Node is too close - recurse into children
                if (node.children) {
                    for (let i = 0; i < 8; i++) {
                        const child = node.children[i];
                        if (child && child.bodyCount > 0) {
                            traversalStack[stackTop++] = child;
                        }
                    }
                }
            }
        }
        return { fx, fy, fz };
    }
    /**
     * Calculate forces for all bodies at once, writing directly to acceleration arrays.
     * This avoids object allocation overhead of individual calculateForce calls.
     */
    calculateAllForces(bodies, activeCount, G, softening, accX, accY, accZ, skip // Indices to skip (e.g., merged bodies)
    ) {
        if (!this.root)
            return;
        const softeningSq = softening * softening;
        const thetaSq = this.thetaSq;
        for (let bi = 0; bi < activeCount; bi++) {
            if (skip?.has(bi))
                continue;
            const body = bodies[bi];
            const bodyX = body.x;
            const bodyY = body.y;
            const bodyZ = body.z ?? 0;
            const bodyIndex = body.index;
            let fx = 0;
            let fy = 0;
            let fz = 0;
            // Use pre-allocated stack for iterative traversal
            let stackTop = 0;
            traversalStack[stackTop++] = this.root;
            while (stackTop > 0) {
                const node = traversalStack[--stackTop];
                if (node.bodyCount === 0)
                    continue;
                // Distance from body to node's center of mass
                const dx = node.comX - bodyX;
                const dy = node.comY - bodyY;
                const dz = node.comZ - bodyZ;
                const distSq = dx * dx + dy * dy + dz * dz;
                // If this is a leaf with a single body
                if (node.body !== null) {
                    // Don't compute self-interaction
                    if (node.body.index === bodyIndex)
                        continue;
                    // Direct force calculation
                    const softDistSq = distSq + softeningSq;
                    const dist = Math.sqrt(softDistSq);
                    const invDistCubed = 1 / (softDistSq * dist);
                    const forceMag = G * node.body.mass * invDistCubed;
                    fx += dx * forceMag;
                    fy += dy * forceMag;
                    fz += dz * forceMag;
                    continue;
                }
                // Barnes-Hut criterion using squared values
                const nodeSizeSq = node.halfSize * node.halfSize * 4;
                if (nodeSizeSq < thetaSq * distSq) {
                    // Node is far enough - use center of mass approximation
                    const softDistSq = distSq + softeningSq;
                    const dist = Math.sqrt(softDistSq);
                    const invDistCubed = 1 / (softDistSq * dist);
                    const forceMag = G * node.totalMass * invDistCubed;
                    fx += dx * forceMag;
                    fy += dy * forceMag;
                    fz += dz * forceMag;
                }
                else {
                    // Node is too close - recurse into children
                    if (node.children) {
                        for (let i = 0; i < 8; i++) {
                            const child = node.children[i];
                            if (child && child.bodyCount > 0) {
                                traversalStack[stackTop++] = child;
                            }
                        }
                    }
                }
            }
            accX[bi] = fx;
            accY[bi] = fy;
            accZ[bi] = fz;
        }
    }
    /**
     * Get statistics about the tree for debugging
     */
    getStats() {
        if (!this.root) {
            return { nodeCount: 0, maxDepth: 0, bodyCount: 0 };
        }
        let nodeCount = 0;
        let maxDepth = 0;
        let bodyCount = 0;
        const traverse = (node, depth) => {
            nodeCount++;
            if (depth > maxDepth)
                maxDepth = depth;
            if (!node.children) {
                bodyCount += node.bodyCount;
            }
            if (node.children) {
                for (let i = 0; i < 8; i++) {
                    const child = node.children[i];
                    if (child)
                        traverse(child, depth + 1);
                }
            }
        };
        traverse(this.root, 0);
        return { nodeCount, maxDepth, bodyCount };
    }
}
// Alias for backward compatibility
export { Octree as QuadTree };
