// Just a helper to shorten Vec2 construction syntax
export function vec2(xv, y) {
    if (typeof xv == 'object') {
        return new Vec2(xv.x, xv.y);
    }
    else if (typeof xv == 'number') {
        return new Vec2(xv, y ?? xv);
    }
}
export default class Vec2 {
    x;
    y;
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    set(vx, y) {
        if (typeof vx == 'object') {
            this.x = vx.x;
            this.y = vx.y;
        }
        else {
            this.x = vx;
            this.y = y ?? vx;
        }
        return this;
    }
    copy() {
        return new Vec2(this.x, this.y);
    }
    floor() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        return this;
    }
    round() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        return this;
    }
    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }
    mul(v) {
        this.x *= v.x;
        this.y *= v.y;
        return this;
    }
    div(v) {
        this.x /= v.x;
        this.y /= v.y;
        return this;
    }
    scale(s) {
        this.x *= s;
        this.y *= s;
        return this;
    }
    normalize() {
        this.scale(1 / this.len());
        return this;
    }
    limit(min, max) {
        this.x = Math.max(this.x, min.x);
        this.x = Math.min(this.x, max.x);
        this.y = Math.max(this.y, min.y);
        this.y = Math.min(this.y, max.y);
        return this;
    }
    len() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    distanceTo(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    equal(v) {
        return (v && this.x == v.x && this.y == v.y);
    }
    toString() {
        return `(${this.x}, ${this.y})`;
    }
    // ###################################################
    //    STATIC FUNCTIONS - always returns a new vector
    // ###################################################
    static copy(v) {
        return new Vec2(v.x, v.y);
    }
    static floor(v) {
        return new Vec2(Math.floor(v.x), Math.floor(v.y));
    }
    static round(v) {
        return new Vec2(Math.round(v.x), Math.round(v.y));
    }
    static add(a, b) {
        return new Vec2(a.x + b.x, a.y + b.y);
    }
    static sub(a, b) {
        return new Vec2(a.x - b.x, a.y - b.y);
    }
    static mul(a, b) {
        return new Vec2(a.x * b.x, a.y * b.y);
    }
    static div(a, b) {
        return new Vec2(a.x / b.x, a.y / b.y);
    }
    static scale(a, s) {
        return new Vec2(a.x * s, a.y * s);
    }
    static len(a) {
        return Math.sqrt(a.x * a.x + a.y * a.y);
    }
    static limit(v, min, max) {
        v.x = Math.max(v.x, min.x);
        v.x = Math.min(v.x, max.x);
        v.y = Math.max(v.y, min.y);
        v.y = Math.min(v.y, max.y);
        return v;
    }
    static normalize(a) {
        const l = Vec2.len(a);
        if (l == 0) {
            return new Vec2(1, 0);
        }
        else {
            return Vec2.scale(a, 1 / l);
        }
    }
    static distance(a, b) {
        return Vec2.len(Vec2.sub(b, a));
    }
    static distanceSquared(a, b) {
        const v = Vec2.sub(b, a);
        return Vec2.dot(v, v);
    }
    static min(a, b) {
        return new Vec2(Math.min(a.x, b.x), Math.min(a.y, b.y));
    }
    static max(a, b) {
        return new Vec2(Math.max(a.x, b.x), Math.max(a.y, b.y));
    }
    // Ray from a to b
    static ray(a, b) {
        return Vec2.normalize(Vec2.sub(b, a));
    }
    static dot(a, b) {
        return a.x * b.x + a.y * b.y;
    }
    // Rotate vector v by t radians
    static rotate(v, t) {
        const ct = Math.cos(t);
        const st = Math.sin(t);
        return vec2(ct * v.x - st * v.y, st * v.x + ct * v.y);
    }
    // Angle between two normalized vectors with sign
    static angle(a, b) {
        const t = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x);
        if (t < 0) {
            return 2 * Math.PI + t;
        }
        else {
            return t;
        }
    }
    static rayFromAngle(t) {
        return vec2(Math.cos(t), Math.sin(t));
    }
    // Rotate from a towards b, by a maximum of 't' radians.
    static rotateToward(a, b, t) {
        const full = Vec2.angle(a, b);
        if (full == 0 || Math.abs(full) < t) {
            return b;
        }
        else {
            if (full > Math.PI) {
                return Vec2.rotate(a, -t);
            }
            else {
                return Vec2.rotate(a, t);
            }
        }
    }
    static interpolate(a, b, t) {
        const d = Vec2.sub(b, a);
        return Vec2.add(a, Vec2.scale(d, t));
    }
    static isEqual(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 0.000001;
    }
    static zero() {
        return vec2(0, 0);
    }
    static randomRay() {
        const t = 2 * Math.PI * Math.random();
        return Vec2.rotate(vec2(1, 0), t);
    }
}
