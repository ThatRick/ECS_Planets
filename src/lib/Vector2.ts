// Just a helper to shorten Vec2 construction syntax

export function vec2(v: IVec2): Vec2
export function vec2(x: number, y: number): Vec2
export function vec2(xy: number): Vec2
export function vec2(xv: number | IVec2, y?: number): Vec2
{
  if (typeof xv == 'object') {
    return new Vec2(xv.x, xv.y)
  }
  else if (typeof xv == 'number') {
    return new Vec2(xv, y ?? xv)
  }
}

export interface IVec2
{
  x: number
  y: number
}

export default class Vec2 implements IVec2
{
  constructor(
    public x: number,
    public y: number
  ) {}

  set(x: number, y: number): Vec2
  set(v: Vec2): Vec2
  set(vx: Vec2|number, y?: number): Vec2 {
    if (typeof vx == 'object') {
      this.x = vx.x
      this.y = vx.y
    } else {
      this.x = vx
      this.y = y ?? vx
    }
    return this
  }

  copy(): Vec2 {
    return new Vec2(this.x, this.y)
  }

  floor(): Vec2 {
    this.x = Math.floor(this.x)
    this.y = Math.floor(this.y)
    return this
  }

  round(): Vec2 {
    this.x = Math.round(this.x)
    this.y = Math.round(this.y)
    return this
  }
  
  add(v: Vec2): Vec2 {
    this.x += v.x
    this.y += v.y
    return this
  }

  sub(v: Vec2): Vec2 {
    this.x -= v.x
    this.y -= v.y
    return this
  }
  
  mul(v: Vec2): Vec2 {
    this.x *= v.x
    this.y *= v.y
    return this
  }
  
  div(v: Vec2): Vec2 {
    this.x /= v.x
    this.y /= v.y
    return this
  }
    
  scale(s: number): Vec2 {
    this.x *= s
    this.y *= s
    return this
  }
  
  normalize(): Vec2 {
    this.scale(1/this.len())
    return this
  }

  limit(min: Vec2, max: Vec2) {
    this.x = Math.max(this.x, min.x)
    this.x = Math.min(this.x, max.x)
    this.y = Math.max(this.y, min.y)
    this.y = Math.min(this.y, max.y)
    return this
  }
  
  len(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  distanceTo(v: Vec2): number {
    const dx = this.x - v.x
    const dy = this.y - v.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  equal(v: Vec2): boolean {
    return (v && this.x == v.x && this.y == v.y)
  }

  toString() {
    return `(${this.x}, ${this.y})`
  }

  // ###################################################
  //    STATIC FUNCTIONS - always returns a new vector
  // ###################################################

  static copy(v: Vec2): Vec2 {
    return new Vec2(v.x, v.y)
  }

  static floor(v: Vec2) {
    return new Vec2(Math.floor(v.x), Math.floor(v.y))
  }

  static round(v: Vec2) {
    return new Vec2(Math.round(v.x), Math.round(v.y))
  }
  
  static add(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x + b.x, a.y + b.y)
  }
  
  static sub(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x - b.x, a.y - b.y)
  }
  
  static mul(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x * b.x, a.y * b.y)
  }
  
  static div(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x / b.x, a.y / b.y)
  }
  
  static scale(a: Vec2, s: number): Vec2 {
    return new Vec2(a.x * s, a.y * s)
  }
  
  static len(a: Vec2): number {
    return Math.sqrt(a.x * a.x + a.y * a.y)
  }

  static limit(v: Vec2, min: Vec2, max: Vec2) {
    v.x = Math.max(v.x, min.x)
    v.x = Math.min(v.x, max.x)
    v.y = Math.max(v.y, min.y)
    v.y = Math.min(v.y, max.y)
    return v
  }
  
  static normalize(a: Vec2): Vec2 {
    const l = Vec2.len(a)
    if (l == 0) {
      return new Vec2(1, 0)
    } else {
      return Vec2.scale(a, 1/l)
    }
  }
  
  static distance(a: Vec2, b: Vec2): number {
    return Vec2.len(Vec2.sub(b, a))
  }
  
  static distanceSquared(a: Vec2, b: Vec2): number {
    const v = Vec2.sub(b, a)
    return Vec2.dot(v, v)
  }

  static min(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(Math.min(a.x, b.x), Math.min(a.y, b.y))
  }
  
  static max(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(Math.max(a.x, b.x), Math.max(a.y, b.y))
  }
  
  // Ray from a to b
  static ray(a: Vec2, b: Vec2): Vec2 {
    return Vec2.normalize(Vec2.sub(b, a))
  }
  
  static dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y
  }
  
  // Rotate vector v by t radians
  static rotate(v: Vec2, t: number): Vec2 {
    const ct = Math.cos(t)
    const st = Math.sin(t)
    return vec2( ct*v.x - st*v.y, st*v.x + ct*v.y )
  }
  
  // Angle between two normalized vectors with sign
  static angle(a: Vec2, b: Vec2): number {
    const t = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x)
  
    if (t < 0) {
      return 2*Math.PI + t
    } else {
      return t
    }
  }
  
  static rayFromAngle(t: number): Vec2 {
    return vec2(Math.cos(t), Math.sin(t))
  }
  
  // Rotate from a towards b, by a maximum of 't' radians.
  static rotateToward(a: Vec2, b: Vec2, t: number): Vec2 {
    const full = Vec2.angle(a, b)
  
    if (full == 0 || Math.abs(full) < t) {
      return b
    } else {
      if (full > Math.PI) {
        return Vec2.rotate(a, -t)
      } else {
        return Vec2.rotate(a, t)
      }
    }
  }
  
  static interpolate(a: Vec2, b: Vec2, t: number): Vec2 {
    const d = Vec2.sub(b, a)
    return Vec2.add(a, Vec2.scale(d, t))
  }
  
  static isEqual(a: Vec2, b: Vec2): boolean {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 0.000001
  }
  
  static zero(): Vec2 {
    return vec2(0, 0)
  }
  
  static randomRay(): Vec2 {
    const t = 2 * Math.PI * Math.random()
    return Vec2.rotate(vec2(1, 0), t)
  }

}