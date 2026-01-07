/**
 * QuadTree implementation for Barnes-Hut gravity algorithm.
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
export class QuadTree {
    root = null;
    // Theta parameter for Barnes-Hut approximation
    // Lower = more accurate, higher = faster
    theta = 0.5;
    /**
     * Build the QuadTree from an array of bodies.
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
        for (const body of bodies) {
            if (body.x < minX)
                minX = body.x;
            if (body.x > maxX)
                maxX = body.x;
            if (body.y < minY)
                minY = body.y;
            if (body.y > maxY)
                maxY = body.y;
        }
        // Make it square with some padding
        const width = maxX - minX;
        const height = maxY - minY;
        const size = Math.max(width, height) * 1.1 + 1; // Add small padding
        const halfSize = size / 2;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        // Create root node
        this.root = this.createNode(cx, cy, halfSize);
        // Insert all bodies
        for (const body of bodies) {
            this.insert(this.root, body);
        }
        // Compute mass distributions (bottom-up)
        this.computeMassDistribution(this.root);
    }
    createNode(cx, cy, halfSize) {
        return {
            cx, cy, halfSize,
            totalMass: 0,
            comX: 0,
            comY: 0,
            children: null,
            body: null,
            bodyCount: 0
        };
    }
    insert(node, body) {
        // If this is an empty leaf, store the body here
        if (node.bodyCount === 0) {
            node.body = body;
            node.bodyCount = 1;
            return;
        }
        // If this is a leaf with one body, we need to subdivide
        if (node.body !== null) {
            const existingBody = node.body;
            node.body = null;
            this.subdivide(node);
            // Re-insert the existing body
            const quadrant1 = this.getQuadrant(node, existingBody);
            this.insert(node.children[quadrant1], existingBody);
        }
        // Insert the new body into appropriate quadrant
        if (node.children === null) {
            this.subdivide(node);
        }
        const quadrant = this.getQuadrant(node, body);
        this.insert(node.children[quadrant], body);
        node.bodyCount++;
    }
    subdivide(node) {
        const hs = node.halfSize / 2; // Half of half size = quarter size
        node.children = [
            this.createNode(node.cx - hs, node.cy - hs, hs), // NW (0)
            this.createNode(node.cx + hs, node.cy - hs, hs), // NE (1)
            this.createNode(node.cx - hs, node.cy + hs, hs), // SW (2)
            this.createNode(node.cx + hs, node.cy + hs, hs) // SE (3)
        ];
    }
    getQuadrant(node, body) {
        const west = body.x < node.cx;
        const north = body.y < node.cy;
        if (north) {
            return west ? 0 : 1; // NW or NE
        }
        else {
            return west ? 2 : 3; // SW or SE
        }
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
            return;
        }
        // Internal node: aggregate from children
        let totalMass = 0;
        let comX = 0;
        let comY = 0;
        if (node.children) {
            for (const child of node.children) {
                if (child && child.bodyCount > 0) {
                    this.computeMassDistribution(child);
                    totalMass += child.totalMass;
                    comX += child.comX * child.totalMass;
                    comY += child.comY * child.totalMass;
                }
            }
        }
        if (totalMass > 0) {
            node.totalMass = totalMass;
            node.comX = comX / totalMass;
            node.comY = comY / totalMass;
        }
    }
    /**
     * Calculate force on a body using Barnes-Hut approximation.
     * Returns {fx, fy} force components (not yet divided by mass).
     */
    calculateForce(body, G, softening = 100) {
        if (!this.root) {
            return { fx: 0, fy: 0 };
        }
        let fx = 0;
        let fy = 0;
        const softeningSq = softening * softening;
        const stack = [this.root];
        while (stack.length > 0) {
            const node = stack.pop();
            if (node.bodyCount === 0)
                continue;
            // Distance from body to node's center of mass
            const dx = node.comX - body.x;
            const dy = node.comY - body.y;
            const distSq = dx * dx + dy * dy;
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
        return { fx, fy };
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
            if (node.body)
                bodyCount++;
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
