/**
 * Simplified solar position and Earth shadow utilities.
 *
 * Sun direction is computed using a low-precision algorithm (~1 degree)
 * based on mean solar longitude, mean anomaly, and obliquity of ecliptic.
 *
 * The shadow test uses a cylindrical shadow model which is adequate for
 * LEO satellites like Starlink.
 */
const DEG_TO_RAD = Math.PI / 180;
/**
 * Compute a unit vector pointing from Earth to the Sun in the app's
 * Y-up world coordinate system.
 *
 * The coordinate mapping matches OrbitSystem: x = xEci, y = zEci, z = yEci.
 *
 * @param utcMs  Unix timestamp in milliseconds (UTC)
 * @returns      [x, y, z] unit vector in world space
 */
export function computeSunDirWorld(utcMs, out) {
    // Julian Date
    const JD = utcMs / 86_400_000 + 2_440_587.5;
    // Julian centuries from J2000.0
    const T = (JD - 2_451_545.0) / 36525;
    // Mean longitude (degrees), normalized to 0..360
    const L0 = ((280.46646 + 36000.76983 * T) % 360 + 360) % 360;
    // Mean anomaly (degrees)
    const M = ((357.52911 + 35999.05029 * T) % 360 + 360) % 360;
    const Mrad = M * DEG_TO_RAD;
    // Equation of center (degrees)
    const C = (1.9146 - 0.004817 * T) * Math.sin(Mrad)
        + 0.019993 * Math.sin(2 * Mrad)
        + 0.00029 * Math.sin(3 * Mrad);
    // Ecliptic longitude (radians)
    const lambda = (L0 + C) * DEG_TO_RAD;
    // Obliquity of ecliptic (radians)
    const epsilon = (23.439291 - 0.0130042 * T) * DEG_TO_RAD;
    // Sun direction in ECI (equatorial) coordinates
    // X toward vernal equinox, Z toward celestial north pole
    const cosLam = Math.cos(lambda);
    const sinLam = Math.sin(lambda);
    const cosEps = Math.cos(epsilon);
    const sinEps = Math.sin(epsilon);
    const xEci = cosLam;
    const yEci = cosEps * sinLam;
    const zEci = sinEps * sinLam;
    // Map ECI to app's Y-up world coords (same as OrbitSystem):
    //   world.x = xEci,  world.y = zEci,  world.z = yEci
    out[0] = xEci;
    out[1] = zEci;
    out[2] = yEci;
}
/**
 * Test whether a satellite is in Earth's cylindrical shadow.
 *
 * @param satX, satY, satZ      Satellite position (world coords, Earth at origin)
 * @param sunDirX, sunDirY, sunDirZ  Unit vector from Earth toward Sun (world coords)
 * @param earthRadius           Earth radius in meters
 * @returns true if the satellite is in shadow
 */
export function isInEarthShadow(satX, satY, satZ, sunDirX, sunDirY, sunDirZ, earthRadius) {
    // Dot product of satellite position with sun direction.
    // If positive, satellite is on the sunlit side of Earth.
    const dot = satX * sunDirX + satY * sunDirY + satZ * sunDirZ;
    if (dot >= 0)
        return false;
    // Satellite is on the dark side. Check if within shadow cylinder.
    // Perpendicular distance squared from the Earth-Sun axis:
    // |satPos x sunDir|^2
    const cx = satY * sunDirZ - satZ * sunDirY;
    const cy = satZ * sunDirX - satX * sunDirZ;
    const cz = satX * sunDirY - satY * sunDirX;
    const perpDistSq = cx * cx + cy * cy + cz * cz;
    return perpDistSq < earthRadius * earthRadius;
}
