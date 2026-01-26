// 3D Vector class for physics and rendering
export function vec3(xv, y, z) {
    if (typeof xv === 'object') {
        return new Vec3(xv.x, xv.y, xv.z);
    }
    else if (typeof xv === 'number') {
        return new Vec3(xv, y ?? xv, z ?? xv);
    }
    return new Vec3(0, 0, 0);
}
export default class Vec3 {
    x;
    y;
    z;
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    set(vx, y, z) {
        if (typeof vx === 'object') {
            this.x = vx.x;
            this.y = vx.y;
            this.z = vx.z;
        }
        else {
            this.x = vx;
            this.y = y ?? vx;
            this.z = z ?? vx;
        }
        return this;
    }
    copy() {
        return new Vec3(this.x, this.y, this.z);
    }
    floor() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        this.z = Math.floor(this.z);
        return this;
    }
    round() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        this.z = Math.round(this.z);
        return this;
    }
    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    }
    mul(v) {
        this.x *= v.x;
        this.y *= v.y;
        this.z *= v.z;
        return this;
    }
    div(v) {
        this.x /= v.x;
        this.y /= v.y;
        this.z /= v.z;
        return this;
    }
    scale(s) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }
    normalize() {
        const l = this.len();
        if (l > 0) {
            this.scale(1 / l);
        }
        return this;
    }
    len() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }
    lenSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    distanceTo(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        const dz = this.z - v.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    equal(v) {
        return v && this.x === v.x && this.y === v.y && this.z === v.z;
    }
    toString() {
        return `(${this.x}, ${this.y}, ${this.z})`;
    }
    // ###################################################
    //    STATIC FUNCTIONS - always returns a new vector
    // ###################################################
    static copy(v) {
        return new Vec3(v.x, v.y, v.z);
    }
    static add(a, b) {
        return new Vec3(a.x + b.x, a.y + b.y, a.z + b.z);
    }
    static sub(a, b) {
        return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
    }
    static mul(a, b) {
        return new Vec3(a.x * b.x, a.y * b.y, a.z * b.z);
    }
    static div(a, b) {
        return new Vec3(a.x / b.x, a.y / b.y, a.z / b.z);
    }
    static scale(a, s) {
        return new Vec3(a.x * s, a.y * s, a.z * s);
    }
    static len(a) {
        return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    }
    static lenSq(a) {
        return a.x * a.x + a.y * a.y + a.z * a.z;
    }
    static normalize(a) {
        const l = Vec3.len(a);
        if (l === 0) {
            return new Vec3(1, 0, 0);
        }
        return Vec3.scale(a, 1 / l);
    }
    static distance(a, b) {
        return Vec3.len(Vec3.sub(b, a));
    }
    static distanceSquared(a, b) {
        const v = Vec3.sub(b, a);
        return Vec3.dot(v, v);
    }
    static dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
    static cross(a, b) {
        return new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    }
    static min(a, b) {
        return new Vec3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
    }
    static max(a, b) {
        return new Vec3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
    }
    static interpolate(a, b, t) {
        const d = Vec3.sub(b, a);
        return Vec3.add(a, Vec3.scale(d, t));
    }
    static zero() {
        return new Vec3(0, 0, 0);
    }
    // Random unit vector (uniform distribution on sphere surface)
    static randomUnit() {
        // Use rejection sampling for uniform sphere distribution
        let x, y, z, lenSq;
        do {
            x = Math.random() * 2 - 1;
            y = Math.random() * 2 - 1;
            z = Math.random() * 2 - 1;
            lenSq = x * x + y * y + z * z;
        } while (lenSq > 1 || lenSq === 0);
        const len = Math.sqrt(lenSq);
        return new Vec3(x / len, y / len, z / len);
    }
    // Random point inside unit sphere
    static randomInSphere() {
        let x, y, z, lenSq;
        do {
            x = Math.random() * 2 - 1;
            y = Math.random() * 2 - 1;
            z = Math.random() * 2 - 1;
            lenSq = x * x + y * y + z * z;
        } while (lenSq > 1);
        return new Vec3(x, y, z);
    }
}
