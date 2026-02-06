/**
 * Simplified solar position and Earth shadow utilities.
 *
 * Sun direction is computed using a low-precision algorithm (~1 degree)
 * based on mean solar longitude, mean anomaly, and obliquity of ecliptic.
 *
 * The shadow test uses a cylindrical shadow model which is adequate for
 * LEO satellites like Starlink.
 */

const DEG_TO_RAD = Math.PI / 180
const TWO_PI = Math.PI * 2

/**
 * Compute a unit vector pointing from Earth to the Sun in the app's inertial
 * Y-up world coordinate system (ECI-like frame).
 *
 * The coordinate mapping matches OrbitSystem: x = xEci, y = zEci, z = yEci.
 *
 * @param utcMs  Unix timestamp in milliseconds (UTC)
 * @returns      [x, y, z] unit vector in world space
 */
export function computeSunDirWorld(utcMs: number, out: Float32Array): void {
    // Julian Date
    const JD = utcMs / 86_400_000 + 2_440_587.5
    // Julian centuries from J2000.0
    const T = (JD - 2_451_545.0) / 36525

    // Mean longitude (degrees), normalized to 0..360
    const L0 = ((280.46646 + 36000.76983 * T) % 360 + 360) % 360

    // Mean anomaly (degrees)
    const M = ((357.52911 + 35999.05029 * T) % 360 + 360) % 360
    const Mrad = M * DEG_TO_RAD

    // Equation of center (degrees)
    const C = (1.9146 - 0.004817 * T) * Math.sin(Mrad)
            + 0.019993 * Math.sin(2 * Mrad)
            + 0.00029 * Math.sin(3 * Mrad)

    // Ecliptic longitude (radians)
    const lambda = (L0 + C) * DEG_TO_RAD

    // Obliquity of ecliptic (radians)
    const epsilon = (23.439291 - 0.0130042 * T) * DEG_TO_RAD

    // Sun direction in ECI (equatorial) coordinates
    // X toward vernal equinox, Z toward celestial north pole
    const cosLam = Math.cos(lambda)
    const sinLam = Math.sin(lambda)
    const cosEps = Math.cos(epsilon)
    const sinEps = Math.sin(epsilon)

    const xEci = cosLam
    const yEci = cosEps * sinLam
    const zEci = sinEps * sinLam

    // Map ECI to app's Y-up world coords (same as OrbitSystem):
    //   world.x = xEci,  world.y = zEci,  world.z = yEci
    out[0] = xEci
    out[1] = zEci
    out[2] = yEci
}

/**
 * Greenwich mean sidereal angle in radians (0..2π).
 * This is the Earth rotation angle used to map inertial vectors into
 * Earth-fixed coordinates.
 */
export function greenwichSiderealAngleRad(utcMs: number): number {
    const JD = utcMs / 86_400_000 + 2_440_587.5
    const T = (JD - 2_451_545.0) / 36525
    const gmstDeg =
        280.46061837 +
        360.98564736629 * (JD - 2_451_545.0) +
        0.000387933 * T * T -
        (T * T * T) / 38_710_000
    let gmstRad = gmstDeg * DEG_TO_RAD
    gmstRad %= TWO_PI
    if (gmstRad < 0) gmstRad += TWO_PI
    return gmstRad
}

/**
 * Rotate a world-space inertial vector into Earth-fixed world coordinates.
 * Rotation axis is world +Y (Earth's spin axis in this app's coordinate map).
 */
export function inertialToEarthFixedWorld(
    utcMs: number,
    inX: number, inY: number, inZ: number,
    out: Float32Array
): void {
    const theta = greenwichSiderealAngleRad(utcMs)
    const c = Math.cos(theta)
    const s = Math.sin(theta)

    out[0] = c * inX + s * inZ
    out[1] = inY
    out[2] = -s * inX + c * inZ
}

/**
 * Rotate a world-space Earth-fixed vector into inertial world coordinates.
 * This is the inverse of inertialToEarthFixedWorld().
 */
export function earthFixedToInertialWorld(
    utcMs: number,
    inX: number, inY: number, inZ: number,
    out: Float32Array
): void {
    const theta = greenwichSiderealAngleRad(utcMs)
    const c = Math.cos(theta)
    const s = Math.sin(theta)

    out[0] = c * inX - s * inZ
    out[1] = inY
    out[2] = s * inX + c * inZ
}

/**
 * Compute the elevation angle (radians) of a satellite above the observer's
 * local horizon.
 *
 * The observer is on the Earth's surface at the position `userDir * earthRadius`.
 * The elevation is the angle between the observer-to-satellite vector and the
 * local horizon plane (perpendicular to userDir at the observer).
 *
 * @returns elevation in radians (positive = above horizon, negative = below)
 */
export function satelliteElevation(
    satX: number, satY: number, satZ: number,
    userDirX: number, userDirY: number, userDirZ: number,
    earthRadius: number
): number {
    // Observer position on Earth's surface
    const obsX = userDirX * earthRadius
    const obsY = userDirY * earthRadius
    const obsZ = userDirZ * earthRadius

    // Vector from observer to satellite
    const toSatX = satX - obsX
    const toSatY = satY - obsY
    const toSatZ = satZ - obsZ
    const dist = Math.sqrt(toSatX * toSatX + toSatY * toSatY + toSatZ * toSatZ)
    if (dist < 1) return -1  // degenerate

    // Dot product of (observer-to-satellite) with (up direction = userDir)
    // gives the sine of the elevation angle
    const sinElev = (toSatX * userDirX + toSatY * userDirY + toSatZ * userDirZ) / dist
    return Math.asin(Math.max(-1, Math.min(1, sinElev)))
}

/**
 * Test whether a satellite is in Earth's cylindrical shadow.
 *
 * @param satX, satY, satZ      Satellite position (world coords, Earth at origin)
 * @param sunDirX, sunDirY, sunDirZ  Unit vector from Earth toward Sun (world coords)
 * @param earthRadius           Earth radius in meters
 * @returns true if the satellite is in shadow
 */
export function isInEarthShadow(
    satX: number, satY: number, satZ: number,
    sunDirX: number, sunDirY: number, sunDirZ: number,
    earthRadius: number
): boolean {
    return earthShadowSignedDistance(
        satX, satY, satZ,
        sunDirX, sunDirY, sunDirZ,
        earthRadius
    ) < 0
}

/**
 * Signed distance (meters) to the boundary of the cylindrical Earth shadow model.
 * Negative = inside shadow, positive = sunlit side.
 */
export function earthShadowSignedDistance(
    satX: number, satY: number, satZ: number,
    sunDirX: number, sunDirY: number, sunDirZ: number,
    earthRadius: number
): number {
    // Half-space split at the terminator plane (dot = 0).
    // Positive values are on the sunlit side.
    const dot = satX * sunDirX + satY * sunDirY + satZ * sunDirZ

    // Distance from Earth-Sun axis minus radius (cylindrical umbra wall).
    const cx = satY * sunDirZ - satZ * sunDirY
    const cy = satZ * sunDirX - satX * sunDirZ
    const cz = satX * sunDirY - satY * sunDirX
    const perpDist = Math.sqrt(cx * cx + cy * cy + cz * cz)
    const cylinderDist = perpDist - earthRadius

    // Shadow region is intersection: dot < 0 and cylinderDist < 0.
    // For intersection SDF approximation, use max().
    return Math.max(dot, cylinderDist)
}

/**
 * Sunlit amount as byte 0..255 using a smooth transition around shadow boundary.
 *
 * @param transitionDistanceMeters  Full blend span in meters.
 *                                  A value equal to one second of orbital travel
 *                                  yields about one second color transition.
 */
export function sunlitByteFromEarthShadow(
    satX: number, satY: number, satZ: number,
    sunDirX: number, sunDirY: number, sunDirZ: number,
    earthRadius: number,
    transitionDistanceMeters: number
): number {
    const signedDist = earthShadowSignedDistance(
        satX, satY, satZ,
        sunDirX, sunDirY, sunDirZ,
        earthRadius
    )
    const halfWidth = Math.max(transitionDistanceMeters * 0.5, 0.5)
    const linear = clamp01((signedDist + halfWidth) / (2 * halfWidth))
    const smooth = linear * linear * (3 - 2 * linear)
    return Math.round(smooth * 255)
}

function clamp01(x: number): number {
    return Math.max(0, Math.min(1, x))
}
