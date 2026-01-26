// 3D Vector class for physics and rendering

export function vec3(v: IVec3): Vec3
export function vec3(x: number, y: number, z: number): Vec3
export function vec3(xyz: number): Vec3
export function vec3(xv: number | IVec3, y?: number, z?: number): Vec3 {
    if (typeof xv === 'object') {
        return new Vec3(xv.x, xv.y, xv.z)
    } else if (typeof xv === 'number') {
        return new Vec3(xv, y ?? xv, z ?? xv)
    }
    return new Vec3(0, 0, 0)
}

export interface IVec3 {
    x: number
    y: number
    z: number
}

export default class Vec3 implements IVec3 {
    constructor(
        public x: number,
        public y: number,
        public z: number
    ) {}

    set(x: number, y: number, z: number): Vec3
    set(v: Vec3): Vec3
    set(vx: Vec3 | number, y?: number, z?: number): Vec3 {
        if (typeof vx === 'object') {
            this.x = vx.x
            this.y = vx.y
            this.z = vx.z
        } else {
            this.x = vx
            this.y = y ?? vx
            this.z = z ?? vx
        }
        return this
    }

    copy(): Vec3 {
        return new Vec3(this.x, this.y, this.z)
    }

    floor(): Vec3 {
        this.x = Math.floor(this.x)
        this.y = Math.floor(this.y)
        this.z = Math.floor(this.z)
        return this
    }

    round(): Vec3 {
        this.x = Math.round(this.x)
        this.y = Math.round(this.y)
        this.z = Math.round(this.z)
        return this
    }

    add(v: Vec3): Vec3 {
        this.x += v.x
        this.y += v.y
        this.z += v.z
        return this
    }

    sub(v: Vec3): Vec3 {
        this.x -= v.x
        this.y -= v.y
        this.z -= v.z
        return this
    }

    mul(v: Vec3): Vec3 {
        this.x *= v.x
        this.y *= v.y
        this.z *= v.z
        return this
    }

    div(v: Vec3): Vec3 {
        this.x /= v.x
        this.y /= v.y
        this.z /= v.z
        return this
    }

    scale(s: number): Vec3 {
        this.x *= s
        this.y *= s
        this.z *= s
        return this
    }

    normalize(): Vec3 {
        const l = this.len()
        if (l > 0) {
            this.scale(1 / l)
        }
        return this
    }

    len(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
    }

    lenSq(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z
    }

    distanceTo(v: Vec3): number {
        const dx = this.x - v.x
        const dy = this.y - v.y
        const dz = this.z - v.z
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    equal(v: Vec3): boolean {
        return v && this.x === v.x && this.y === v.y && this.z === v.z
    }

    toString(): string {
        return `(${this.x}, ${this.y}, ${this.z})`
    }

    // ###################################################
    //    STATIC FUNCTIONS - always returns a new vector
    // ###################################################

    static copy(v: Vec3): Vec3 {
        return new Vec3(v.x, v.y, v.z)
    }

    static add(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(a.x + b.x, a.y + b.y, a.z + b.z)
    }

    static sub(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)
    }

    static mul(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(a.x * b.x, a.y * b.y, a.z * b.z)
    }

    static div(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(a.x / b.x, a.y / b.y, a.z / b.z)
    }

    static scale(a: Vec3, s: number): Vec3 {
        return new Vec3(a.x * s, a.y * s, a.z * s)
    }

    static len(a: Vec3): number {
        return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
    }

    static lenSq(a: Vec3): number {
        return a.x * a.x + a.y * a.y + a.z * a.z
    }

    static normalize(a: Vec3): Vec3 {
        const l = Vec3.len(a)
        if (l === 0) {
            return new Vec3(1, 0, 0)
        }
        return Vec3.scale(a, 1 / l)
    }

    static distance(a: Vec3, b: Vec3): number {
        return Vec3.len(Vec3.sub(b, a))
    }

    static distanceSquared(a: Vec3, b: Vec3): number {
        const v = Vec3.sub(b, a)
        return Vec3.dot(v, v)
    }

    static dot(a: Vec3, b: Vec3): number {
        return a.x * b.x + a.y * b.y + a.z * b.z
    }

    static cross(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(
            a.y * b.z - a.z * b.y,
            a.z * b.x - a.x * b.z,
            a.x * b.y - a.y * b.x
        )
    }

    static min(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z))
    }

    static max(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z))
    }

    static interpolate(a: Vec3, b: Vec3, t: number): Vec3 {
        const d = Vec3.sub(b, a)
        return Vec3.add(a, Vec3.scale(d, t))
    }

    static zero(): Vec3 {
        return new Vec3(0, 0, 0)
    }

    // Random unit vector (uniform distribution on sphere surface)
    static randomUnit(): Vec3 {
        // Use rejection sampling for uniform sphere distribution
        let x, y, z, lenSq
        do {
            x = Math.random() * 2 - 1
            y = Math.random() * 2 - 1
            z = Math.random() * 2 - 1
            lenSq = x * x + y * y + z * z
        } while (lenSq > 1 || lenSq === 0)
        const len = Math.sqrt(lenSq)
        return new Vec3(x / len, y / len, z / len)
    }

    // Random point inside unit sphere
    static randomInSphere(): Vec3 {
        let x, y, z, lenSq
        do {
            x = Math.random() * 2 - 1
            y = Math.random() * 2 - 1
            z = Math.random() * 2 - 1
            lenSq = x * x + y * y + z * z
        } while (lenSq > 1)
        return new Vec3(x, y, z)
    }
}
