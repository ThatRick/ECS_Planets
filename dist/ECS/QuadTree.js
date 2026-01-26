/**
 * Octree implementation for 3D Barnes-Hut gravity algorithm.
 *
 * The Barnes-Hut algorithm reduces N-body gravity from O(n²) to O(n log n)
 * by approximating the gravitational effect of distant body groups as a
 * single body at their center of mass.
 *
 * The "theta" parameter controls accuracy vs speed tradeoff:
 * - theta = 0: exact calculation (same as direct summation)
 * - theta = 0.5: good balance of accuracy and speed
 * - theta = 1.0: faster but less accurate
 */
export class Octree {
    root = null;
    // Theta parameter for Barnes-Hut approximation
    // Lower = more accurate, higher = faster
    theta = 0.5;
    // Maximum tree depth to prevent infinite recursion for coincident bodies
    static MAX_DEPTH = 50;
    /**
     * Build the Octree from an array of bodies.
     * Call this once per frame before computing forces.
     */
    build(bodies) {
        if (bodies.length === 0) {
            this.root = null;
            return;
        }
        // Find bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const body of bodies) {
            if (body.x < minX)
                minX = body.x;
            if (body.x > maxX)
                maxX = body.x;
            if (body.y < minY)
                minY = body.y;
            if (body.y > maxY)
                maxY = body.y;
            if (body.z < minZ)
                minZ = body.z;
            if (body.z > maxZ)
                maxZ = body.z;
        }
        // Make it a cube with some padding
        const width = maxX - minX;
        const height = maxY - minY;
        const depth = maxZ - minZ;
        const size = Math.max(width, height, depth) * 1.1 + 1; // Add small padding
        const halfSize = size / 2;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        // Create root node
        this.root = this.createNode(cx, cy, cz, halfSize);
        // Insert all bodies
        for (const body of bodies) {
            this.insert(this.root, body, 0);
        }
        // Compute mass distributions (bottom-up)
        this.computeMassDistribution(this.root);
    }
    createNode(cx, cy, cz, halfSize) {
        return {
            cx, cy, cz, halfSize,
            totalMass: 0,
            comX: 0,
            comY: 0,
            comZ: 0,
            children: null,
            body: null,
            bodyCount: 0
        };
    }
    insert(node, body, depth) {
        // If this is an empty leaf, store the body here
        if (node.bodyCount === 0) {
            node.body = body;
            node.bodyCount = 1;
            return;
        }
        // If at max depth, just aggregate the body into this node
        // (handles coincident bodies without infinite recursion)
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
        const hs = node.halfSize / 2; // Half of half size = quarter size
        // 8 octants: indexed by (z << 2) | (y << 1) | x
        // where x,y,z are 0 for negative, 1 for positive
        node.children = [
            this.createNode(node.cx - hs, node.cy - hs, node.cz - hs, hs), // 0: ---
            this.createNode(node.cx + hs, node.cy - hs, node.cz - hs, hs), // 1: +--
            this.createNode(node.cx - hs, node.cy + hs, node.cz - hs, hs), // 2: -+-
            this.createNode(node.cx + hs, node.cy + hs, node.cz - hs, hs), // 3: ++-
            this.createNode(node.cx - hs, node.cy - hs, node.cz + hs, hs), // 4: --+
            this.createNode(node.cx + hs, node.cy - hs, node.cz + hs, hs), // 5: +-+
            this.createNode(node.cx - hs, node.cy + hs, node.cz + hs, hs), // 6: -++
            this.createNode(node.cx + hs, node.cy + hs, node.cz + hs, hs) // 7: +++
        ];
    }
    getOctant(node, body) {
        const xPos = body.x >= node.cx ? 1 : 0;
        const yPos = body.y >= node.cy ? 1 : 0;
        const zPos = body.z >= node.cz ? 1 : 0;
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
            node.comZ = node.body.z;
            return;
        }
        // Internal node: aggregate from children
        let totalMass = 0;
        let comX = 0;
        let comY = 0;
        let comZ = 0;
        if (node.children) {
            for (const child of node.children) {
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
     * Returns {fx, fy, fz} force components (not yet divided by mass).
     */
    calculateForce(body, G, softening = 100) {
        if (!this.root) {
            return { fx: 0, fy: 0, fz: 0 };
        }
        let fx = 0;
        let fy = 0;
        let fz = 0;
        const softeningSq = softening * softening;
        const stack = [this.root];
        while (stack.length > 0) {
            const node = stack.pop();
            if (node.bodyCount === 0)
                continue;
            // Distance from body to node's center of mass
            const dx = node.comX - body.x;
            const dy = node.comY - body.y;
            const dz = node.comZ - body.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            const dist = Math.sqrt(distSq);
            // If this is a leaf with a single body
            if (node.body !== null) {
                // Don't compute self-interaction
                if (node.body.index === body.index)
                    continue;
                // Direct force calculation
                const softDistSq = distSq + softeningSq;
                const invDist = 1 / Math.sqrt(softDistSq);
                const invDistCubed = invDist * invDist * invDist;
                const forceMag = G * node.body.mass * invDistCubed;
                fx += dx * forceMag;
                fy += dy * forceMag;
                fz += dz * forceMag;
                continue;
            }
            // Barnes-Hut criterion: s/d < theta
            // s = node size (2 * halfSize), d = distance to center of mass
            const nodeSize = node.halfSize * 2;
            const ratio = nodeSize / (dist + 0.001); // Avoid division by zero
            if (ratio < this.theta) {
                // Node is far enough - use center of mass approximation
                const softDistSq = distSq + softeningSq;
                const invDist = 1 / Math.sqrt(softDistSq);
                const invDistCubed = invDist * invDist * invDist;
                const forceMag = G * node.totalMass * invDistCubed;
                fx += dx * forceMag;
                fy += dy * forceMag;
                fz += dz * forceMag;
            }
            else {
                // Node is too close - recurse into children
                if (node.children) {
                    for (const child of node.children) {
                        if (child && child.bodyCount > 0) {
                            stack.push(child);
                        }
                    }
                }
            }
        }
        return { fx, fy, fz };
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
            // Count bodies: leaf nodes have bodyCount > 0 and no children
            if (!node.children) {
                bodyCount += node.bodyCount;
            }
            if (node.children) {
                for (const child of node.children) {
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
