import { Position, Size, Color, Temperature, CameraComponent, EarthTag, Orbit } from '../Components.js';
import { AppLog } from '../../AppLog.js';
import { computeSunDirWorld, earthFixedToInertialWorld, greenwichSiderealAngleRad, satelliteElevation, sunlitByteFromEarthShadow } from '../../lib/solar.js';
// Vertex shader - 3D perspective projection with billboarded quads
const VERTEX_SHADER = `#version 300 es
precision highp float;

// Per-vertex attributes (unit quad)
in vec2 a_vertex;

// Per-instance attributes
in vec3 a_position;
in float a_size;
in vec3 a_color;

// Uniforms
uniform vec2 u_resolution;
uniform mat4 u_viewMatrix;
uniform mat4 u_projMatrix;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform float u_minPixelSize;  // Minimum size in pixels (typically 1.0)
uniform float u_perspectiveSphere; // 0 or 1: inflate billboard to sphere silhouette

// Varyings to fragment shader
out vec2 v_uv;
out vec3 v_color;
out float v_depth;
out float v_viewDist;
out float v_radius;
out float v_effectiveSize;
out vec3 v_centerView;
out float v_screenDiameter;  // approximate screen-space diameter in pixels

void main() {
    // Pass to fragment shader
    v_uv = a_vertex;
    v_color = a_color;

    // Transform center to view space to get distance
    vec4 viewCenter = u_viewMatrix * vec4(a_position, 1.0);
    float viewDist = -viewCenter.z;  // Distance from camera (positive)

    // Calculate minimum world-space size for minPixelSize screen pixels
    // projMatrix[1][1] = 1 / tan(fov/2), so tan(fov/2) = 1 / projMatrix[1][1]
    // screenPixels = (worldSize / viewDist) * (resolution.y / 2) * projMatrix[1][1]
    // Solving for minWorldSize when screenPixels = minPixelSize:
    float minWorldSize = (u_minPixelSize * viewDist * 2.0) / (u_resolution.y * u_projMatrix[1][1]);

    // Use the larger of actual size or minimum size
    float effectiveSize = max(a_size, minWorldSize);

    // Billboard quads under-project large nearby spheres.
    // Inflate Earth's quad so its edge matches true perspective silhouette.
    if (u_perspectiveSphere > 0.5 && a_size > 0.0 && viewDist > a_size + 1.0) {
        float denom = max(viewDist * viewDist - a_size * a_size, 1.0);
        effectiveSize *= viewDist / sqrt(denom);
    }

    // Compute screen-space diameter for sphere/particle mode blending
    v_screenDiameter = (effectiveSize / viewDist) * u_resolution.y * u_projMatrix[1][1];

    // Billboard: offset from center using camera-aligned axes
    vec3 worldPos = a_position + u_cameraRight * a_vertex.x * effectiveSize + u_cameraUp * a_vertex.y * effectiveSize;

    // Transform to view space then clip space
    vec4 viewPos = u_viewMatrix * vec4(worldPos, 1.0);
    gl_Position = u_projMatrix * viewPos;

    // Pass depth for potential depth-based effects
    v_depth = -viewPos.z;
    v_viewDist = viewDist;
    v_radius = a_size;
    v_effectiveSize = effectiveSize;
    v_centerView = viewCenter.xyz;
}
`;
// Fragment shader - dual-mode: sphere shading when large, soft dot when small.
// Screen diameter (in pixels) is computed in the vertex shader and drives
// a smooth crossfade between the two modes for both color AND alpha.
//
// The key insight: for tiny spheres the disc-edge anti-aliasing (smoothstep
// in distSq space) spreads across the *entire* quad, creating a wide dark
// semi-transparent ring that dominates the appearance.  Dot-mode avoids this
// by using a gaussian alpha (bright center, transparent edge) with no hard
// disc boundary at all.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_color;
in float v_depth;
in float v_screenDiameter;

out vec4 fragColor;

void main() {
    float distSq = dot(v_uv, v_uv);

    // ── Blend factor: 0 = full dot, 1 = full sphere ────────────────────
    // Below ~6px: dot.  Above ~16px: sphere.  Smooth ramp in between.
    float t = clamp((v_screenDiameter - 6.0) / 10.0, 0.0, 1.0);

    // ── Alpha models ───────────────────────────────────────────────────
    // Sphere mode: sharp anti-aliased disc edge
    float pixelSize = length(fwidth(v_uv));
    float edge = max(2.0 * pixelSize, 0.002);
    float sphereAlpha = 1.0 - smoothstep(1.0 - edge, 1.0, distSq);

    // Dot mode: soft gaussian falloff — no hard edge, no dark ring
    float dotAlpha = exp(-distSq * 3.0);

    float alpha = mix(dotAlpha, sphereAlpha, t);
    if (alpha < 0.01) discard;

    // ── Sphere shading (large on screen) ────────────────────────────────
    float z = sqrt(max(1.0 - min(distSq, 1.0), 0.0));
    vec3 normal = normalize(vec3(v_uv, z));

    vec3 lightDir = normalize(vec3(0.35, 0.25, 1.0));
    float diffuse = max(dot(normal, lightDir), 0.0);

    vec3 sphereCol = v_color * (0.30 + diffuse * 0.70);

    // Specular highlight
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(reflectDir.z, 0.0), 32.0);
    sphereCol += spec * 0.15;

    // ── Soft dot (small on screen) ──────────────────────────────────────
    // Color stays bright; the gaussian alpha handles the falloff.
    vec3 dotCol = v_color;

    // ── Final blend ─────────────────────────────────────────────────────
    vec3 col = mix(dotCol, sphereCol, t);

    // Premultiplied alpha
    fragColor = vec4(col * alpha, alpha);
}
`;
// Earth shader: parallels/meridians grid + optional texture + user-location marker.
const EARTH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_color;
in float v_depth;
in float v_viewDist;
in float v_radius;
in float v_effectiveSize;
in vec3 v_centerView;
in float v_screenDiameter;

uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraForward;
uniform mat4 u_projMatrix;
uniform float u_earthRotationRad; // inertial->earth-fixed rotation angle

uniform vec3 u_userDirWorld;      // normalized
uniform float u_hasUserLocation;  // 0 or 1

uniform sampler2D u_earthTexture;
uniform float u_hasTexture;       // 0 or 1

uniform vec3 u_sunDirWorld;       // unit vector Earth->Sun (world space)
uniform float u_sunlightMode;    // 0 or 1

out vec4 fragColor;

const float PI = 3.14159265359;

float gridLine(float coord, float stepRad, float fw) {
    float halfStep = stepRad * 0.5;
    float d = abs(mod(coord + halfStep, stepRad) - halfStep);
    return 1.0 - smoothstep(fw, fw * 1.5, d);
}

void main() {
    float distSq = dot(v_uv, v_uv);

    // Cheap conservative reject before the ray/sphere math.
    if (distSq > 1.08) discard;

    // Perspective-correct sphere intersection in view space.
    vec3 centerView = v_centerView;
    vec3 planePoint = centerView + vec3(v_uv.x * v_effectiveSize, v_uv.y * v_effectiveSize, 0.0);
    vec3 rayDir = normalize(planePoint);
    float b = dot(rayDir, centerView);
    float c = dot(centerView, centerView) - v_radius * v_radius;
    float h = b * b - c;
    if (h <= 0.0) discard;

    // Use the geometric discriminant as the limb coverage metric.
    // This tracks the true projected sphere edge and reduces shimmer versus UV-edge AA.
    float limbAA = max(fwidth(h), 1e-5);
    float alpha = smoothstep(0.0, limbAA * 1.5, h);
    if (alpha <= 0.001) discard;

    float t = b - sqrt(max(h, 0.0));
    if (t <= 0.0) discard;

    vec3 viewPos = rayDir * t;
    vec3 normalView = normalize(viewPos - centerView);

    // Write sphere depth so Earth/satellite perspective occlusion matches.
    vec4 clip = u_projMatrix * vec4(viewPos, 1.0);
    float ndcDepth = clip.z / clip.w;
    gl_FragDepth = ndcDepth * 0.5 + 0.5;

    // Inertial normal (used for physical lighting with inertial sun vector).
    vec3 normalWorld = normalize(
        u_cameraRight * normalView.x +
        u_cameraUp * normalView.y +
        u_cameraForward * normalView.z
    );

    // Earth-fixed normal (used for texture/grid/user marker so they rotate with time).
    float cRot = cos(u_earthRotationRad);
    float sRot = sin(u_earthRotationRad);
    vec3 normalEarth = vec3(
        cRot * normalWorld.x + sRot * normalWorld.z,
        normalWorld.y,
        -sRot * normalWorld.x + cRot * normalWorld.z
    );

    float lat = asin(clamp(normalEarth.y, -1.0, 1.0));
    float lon = atan(normalEarth.z, normalEarth.x);

    // Choose base color: texture or solid
    vec3 baseColor;
    if (u_hasTexture > 0.5) {
        vec2 texUV = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
        baseColor = texture(u_earthTexture, texUV).rgb;
    } else {
        baseColor = v_color;
    }

    // Lighting
    vec3 col;
    float sunlightDayFactor = 1.0;  // used to dim grid on night side
    if (u_sunlightMode > 0.5) {
        // Sun-based world-space lighting for realistic day/night
        float sunDot = dot(normalWorld, u_sunDirWorld);

        // Smooth terminator band (transition over ~6 degrees)
        float dayFactor = smoothstep(-0.05, 0.05, sunDot);
        sunlightDayFactor = dayFactor;

        // Day side: bright sunlight with diffuse shading
        float diffuse = max(sunDot, 0.0);
        vec3 dayColor = baseColor * (0.20 + diffuse * 0.80);

        // Specular highlight on day side (compute in local space for view-relative)
        vec3 sunDirLocal = normalize(vec3(
            dot(u_sunDirWorld, u_cameraRight),
            dot(u_sunDirWorld, u_cameraUp),
            dot(u_sunDirWorld, u_cameraForward)
        ));
        vec3 viewDir = normalize(-viewPos);
        vec3 reflectDir = reflect(-sunDirLocal, normalView);
        float spec = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);

        dayColor += spec * 0.2;

        // Night side: near-black with faint blue atmosphere hint
        vec3 nightColor = baseColor * 0.02 + vec3(0.003, 0.005, 0.012);

        col = mix(nightColor, dayColor, dayFactor);
    } else {
        // Original fixed view-space lighting
        vec3 lightDir = normalize(vec3(0.35, 0.25, 1.0));
        float diffuse = max(dot(normalView, lightDir), 0.0);
        vec3 viewDir = normalize(-viewPos);
        vec3 reflectDir = reflect(-lightDir, normalView);
        float spec = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);

        col = baseColor * (0.28 + diffuse * 0.72);
        col += spec * 0.15;
    }

    float latStep = radians(15.0);
    float lonStep = radians(15.0);
    float gridPx = 0.75;

    // Latitude: asin is continuous, so fwidth works directly
    float fwLat = max(fwidth(lat) * gridPx, 1e-4);

    // Longitude: compute fwidth analytically to avoid atan2 ±π seam artifact.
    // d(atan(z,x))/ds = (x·dz/ds − z·dx/ds) / (x² + z²)
    float nxz2 = normalEarth.x * normalEarth.x + normalEarth.z * normalEarth.z;
    float invNxz2 = 1.0 / max(nxz2, 1e-8);
    float dlon_dx = (normalEarth.x * dFdx(normalEarth.z) - normalEarth.z * dFdx(normalEarth.x)) * invNxz2;
    float dlon_dy = (normalEarth.x * dFdy(normalEarth.z) - normalEarth.z * dFdy(normalEarth.x)) * invNxz2;
    float fwLon = max((abs(dlon_dx) + abs(dlon_dy)) * gridPx, 1e-4);

    float grid = max(
        gridLine(lat, latStep, fwLat),
        gridLine(lon, lonStep, fwLon)
    );

    // Slightly emphasize equator and prime meridian
    float latW = fwLat;
    float lonW = fwLon;
    float eq = 1.0 - smoothstep(latW, latW * 1.5, abs(lat));
    float pm = 1.0 - smoothstep(lonW, lonW * 1.5, abs(lon));
    grid = max(grid, max(eq, pm) * 0.6);

    // Grid is more subtle over texture, more visible on solid color.
    // In sunlight mode, dim grid on the night side so it doesn't wash out the darkness.
    float gridAlpha = u_hasTexture > 0.5 ? 0.2 : 0.35;
    if (u_sunlightMode > 0.5) {
        gridAlpha *= mix(0.08, 1.0, sunlightDayFactor);
    }
    col = mix(col, vec3(0.95, 0.95, 1.0), grid * gridAlpha);

    // User location marker (blue center with a thin white ring)
    if (u_hasUserLocation > 0.5) {
        // Angular distance from user location (0 = exactly there, grows with distance)
        float markerDot = dot(normalEarth, u_userDirWorld);
        float angDist = acos(clamp(markerDot, -1.0, 1.0));
        float aaAng = max(fwidth(angDist), 1e-5);

        // Fixed angular radius scaled to 50%
        float outerR = 0.026;
        float innerR = 0.0175;
        float outer = 1.0 - smoothstep(outerR - aaAng, outerR + aaAng, angDist);
        float inner = 1.0 - smoothstep(innerR - aaAng, innerR + aaAng, angDist);
        float ring = max(0.0, outer - inner);

        col = mix(col, vec3(1.0), ring);
        col = mix(col, vec3(0.2, 0.55, 1.0), inner);
    }

    // Premultiplied alpha to avoid dark fringe at edges
    fragColor = vec4(col * alpha, alpha);
}
`;
const ORBIT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;
uniform mat4 u_viewMatrix;
uniform mat4 u_projMatrix;

void main() {
    gl_Position = u_projMatrix * u_viewMatrix * vec4(a_position, 1.0);
}
`;
const ORBIT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 u_color;
out vec4 fragColor;

void main() {
    fragColor = u_color;
}
`;
// Maximum entities we can render (pre-allocated buffer size)
const MAX_INSTANCES = 100000;
// Instance data stride: x, y, z, size, r, g, b (7 floats per instance)
const INSTANCE_STRIDE = 7;
const ORBIT_SEGMENTS = 240;
const TWO_PI = Math.PI * 2;
/**
 * Factory to create a WebGL-based 3D planet renderer.
 * Uses instanced rendering with perspective projection and billboarded sprites.
 */
export function createPlanetRendererWebGL(canvas) {
    // Initialize WebGL 2 context
    const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
        depth: true
    });
    if (!gl) {
        throw new Error('WebGL 2 not supported');
    }
    // Compile shaders
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const bodyFragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const earthFragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, EARTH_FRAGMENT_SHADER);
    const orbitVertexShader = compileShader(gl, gl.VERTEX_SHADER, ORBIT_VERTEX_SHADER);
    const orbitFragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, ORBIT_FRAGMENT_SHADER);
    // Link programs
    const bodyProgram = gl.createProgram();
    gl.attachShader(bodyProgram, vertexShader);
    gl.attachShader(bodyProgram, bodyFragmentShader);
    gl.linkProgram(bodyProgram);
    if (!gl.getProgramParameter(bodyProgram, gl.LINK_STATUS)) {
        throw new Error('Shader program link failed (body): ' + gl.getProgramInfoLog(bodyProgram));
    }
    const earthProgram = gl.createProgram();
    gl.attachShader(earthProgram, vertexShader);
    gl.attachShader(earthProgram, earthFragmentShader);
    gl.linkProgram(earthProgram);
    if (!gl.getProgramParameter(earthProgram, gl.LINK_STATUS)) {
        throw new Error('Shader program link failed (earth): ' + gl.getProgramInfoLog(earthProgram));
    }
    const orbitProgram = gl.createProgram();
    gl.attachShader(orbitProgram, orbitVertexShader);
    gl.attachShader(orbitProgram, orbitFragmentShader);
    gl.linkProgram(orbitProgram);
    if (!gl.getProgramParameter(orbitProgram, gl.LINK_STATUS)) {
        throw new Error('Shader program link failed (orbit): ' + gl.getProgramInfoLog(orbitProgram));
    }
    // Get attribute and uniform locations
    const bodyAttribs = {
        vertex: gl.getAttribLocation(bodyProgram, 'a_vertex'),
        position: gl.getAttribLocation(bodyProgram, 'a_position'),
        size: gl.getAttribLocation(bodyProgram, 'a_size'),
        color: gl.getAttribLocation(bodyProgram, 'a_color')
    };
    const bodyUniforms = {
        resolution: gl.getUniformLocation(bodyProgram, 'u_resolution'),
        viewMatrix: gl.getUniformLocation(bodyProgram, 'u_viewMatrix'),
        projMatrix: gl.getUniformLocation(bodyProgram, 'u_projMatrix'),
        cameraRight: gl.getUniformLocation(bodyProgram, 'u_cameraRight'),
        cameraUp: gl.getUniformLocation(bodyProgram, 'u_cameraUp'),
        minPixelSize: gl.getUniformLocation(bodyProgram, 'u_minPixelSize'),
        perspectiveSphere: gl.getUniformLocation(bodyProgram, 'u_perspectiveSphere')
    };
    const earthAttribs = {
        vertex: gl.getAttribLocation(earthProgram, 'a_vertex'),
        position: gl.getAttribLocation(earthProgram, 'a_position'),
        size: gl.getAttribLocation(earthProgram, 'a_size'),
        color: gl.getAttribLocation(earthProgram, 'a_color')
    };
    const earthUniforms = {
        resolution: gl.getUniformLocation(earthProgram, 'u_resolution'),
        viewMatrix: gl.getUniformLocation(earthProgram, 'u_viewMatrix'),
        projMatrix: gl.getUniformLocation(earthProgram, 'u_projMatrix'),
        cameraRight: gl.getUniformLocation(earthProgram, 'u_cameraRight'),
        cameraUp: gl.getUniformLocation(earthProgram, 'u_cameraUp'),
        cameraForward: gl.getUniformLocation(earthProgram, 'u_cameraForward'),
        earthRotationRad: gl.getUniformLocation(earthProgram, 'u_earthRotationRad'),
        minPixelSize: gl.getUniformLocation(earthProgram, 'u_minPixelSize'),
        perspectiveSphere: gl.getUniformLocation(earthProgram, 'u_perspectiveSphere'),
        userDirWorld: gl.getUniformLocation(earthProgram, 'u_userDirWorld'),
        hasUserLocation: gl.getUniformLocation(earthProgram, 'u_hasUserLocation'),
        earthTexture: gl.getUniformLocation(earthProgram, 'u_earthTexture'),
        hasTexture: gl.getUniformLocation(earthProgram, 'u_hasTexture'),
        sunDirWorld: gl.getUniformLocation(earthProgram, 'u_sunDirWorld'),
        sunlightMode: gl.getUniformLocation(earthProgram, 'u_sunlightMode')
    };
    const orbitAttribs = {
        position: gl.getAttribLocation(orbitProgram, 'a_position')
    };
    const orbitUniforms = {
        viewMatrix: gl.getUniformLocation(orbitProgram, 'u_viewMatrix'),
        projMatrix: gl.getUniformLocation(orbitProgram, 'u_projMatrix'),
        color: gl.getUniformLocation(orbitProgram, 'u_color')
    };
    // Create unit quad geometry (two triangles forming a square from -1 to 1)
    const quadVertices = new Float32Array([
        -1, -1, // bottom-left
        1, -1, // bottom-right
        1, 1, // top-right
        -1, -1, // bottom-left
        1, 1, // top-right
        -1, 1 // top-left
    ]);
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    // Create VAOs (attribute locations can differ per program)
    const vaoBody = gl.createVertexArray();
    gl.bindVertexArray(vaoBody);
    gl.enableVertexAttribArray(bodyAttribs.vertex);
    gl.vertexAttribPointer(bodyAttribs.vertex, 2, gl.FLOAT, false, 0, 0);
    // Create instance buffer (position xyz, size, temperature per instance)
    const instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES * INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW);
    // Set up instance attributes with divisor = 1 (per-instance)
    // a_position (vec3): offset 0
    gl.enableVertexAttribArray(bodyAttribs.position);
    gl.vertexAttribPointer(bodyAttribs.position, 3, gl.FLOAT, false, INSTANCE_STRIDE * 4, 0);
    gl.vertexAttribDivisor(bodyAttribs.position, 1);
    // a_size (float): offset 12
    gl.enableVertexAttribArray(bodyAttribs.size);
    gl.vertexAttribPointer(bodyAttribs.size, 1, gl.FLOAT, false, INSTANCE_STRIDE * 4, 12);
    gl.vertexAttribDivisor(bodyAttribs.size, 1);
    // a_color (vec3): offset 16
    gl.enableVertexAttribArray(bodyAttribs.color);
    gl.vertexAttribPointer(bodyAttribs.color, 3, gl.FLOAT, false, INSTANCE_STRIDE * 4, 16);
    gl.vertexAttribDivisor(bodyAttribs.color, 1);
    gl.bindVertexArray(null);
    const orbitVao = gl.createVertexArray();
    gl.bindVertexArray(orbitVao);
    const orbitBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, orbitBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, (ORBIT_SEGMENTS + 1) * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(orbitAttribs.position);
    gl.vertexAttribPointer(orbitAttribs.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const orbitData = new Float32Array((ORBIT_SEGMENTS + 1) * 3);
    const fillOrbitData = (orbit) => {
        let orbitOffset = 0;
        const e = orbit.eccentricity;
        const a = orbit.semiMajorAxis;
        const sqrtOneMinusESq = Math.sqrt(Math.max(0, 1 - e * e));
        for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
            const M = (i / ORBIT_SEGMENTS) * TWO_PI;
            let xPerif;
            let yPerif;
            if (e < 1e-6) {
                xPerif = a * Math.cos(M);
                yPerif = a * Math.sin(M);
            }
            else {
                const E = solveKeplerE(M, e);
                const cosE = Math.cos(E);
                const sinE = Math.sin(E);
                xPerif = a * (cosE - e);
                yPerif = a * (sqrtOneMinusESq * sinE);
            }
            const xEci = orbit.m11 * xPerif + orbit.m12 * yPerif;
            const yEci = orbit.m21 * xPerif + orbit.m22 * yPerif;
            const zEci = orbit.m31 * xPerif + orbit.m32 * yPerif;
            orbitData[orbitOffset++] = xEci;
            orbitData[orbitOffset++] = zEci;
            orbitData[orbitOffset++] = yEci;
        }
    };
    const drawSelectedOrbit = (world, selectedEntity) => {
        if (selectedEntity === undefined)
            return;
        const selectedOrbit = world.getComponent(selectedEntity, Orbit);
        if (!selectedOrbit)
            return;
        fillOrbitData(selectedOrbit);
        gl.bindBuffer(gl.ARRAY_BUFFER, orbitBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, orbitData);
        gl.depthMask(false);
        gl.useProgram(orbitProgram);
        gl.bindVertexArray(orbitVao);
        gl.uniformMatrix4fv(orbitUniforms.viewMatrix, false, viewMatrix);
        gl.uniformMatrix4fv(orbitUniforms.projMatrix, false, projMatrix);
        gl.uniform4f(orbitUniforms.color, 0.55, 0.7, 0.85, 0.8);
        gl.drawArrays(gl.LINE_STRIP, 0, ORBIT_SEGMENTS + 1);
        gl.depthMask(true);
    };
    const vaoEarth = gl.createVertexArray();
    gl.bindVertexArray(vaoEarth);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(earthAttribs.vertex);
    gl.vertexAttribPointer(earthAttribs.vertex, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.enableVertexAttribArray(earthAttribs.position);
    gl.vertexAttribPointer(earthAttribs.position, 3, gl.FLOAT, false, INSTANCE_STRIDE * 4, 0);
    gl.vertexAttribDivisor(earthAttribs.position, 1);
    gl.enableVertexAttribArray(earthAttribs.size);
    gl.vertexAttribPointer(earthAttribs.size, 1, gl.FLOAT, false, INSTANCE_STRIDE * 4, 12);
    gl.vertexAttribDivisor(earthAttribs.size, 1);
    gl.enableVertexAttribArray(earthAttribs.color);
    gl.vertexAttribPointer(earthAttribs.color, 3, gl.FLOAT, false, INSTANCE_STRIDE * 4, 16);
    gl.vertexAttribDivisor(earthAttribs.color, 1);
    gl.bindVertexArray(null);
    // Pre-allocate instance data buffer on CPU side
    const instanceData = new Float32Array(MAX_INSTANCES * INSTANCE_STRIDE);
    const tmpRgb = new Float32Array(3);
    // Pre-allocate matrix buffers
    const viewMatrix = new Float32Array(16);
    const projMatrix = new Float32Array(16);
    // Enable blending for anti-aliased edges (premultiplied alpha)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Enable depth testing for proper 3D ordering
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    // Sunlight mode state
    let sunlightModeEnabled = false;
    const sunDirWorld = new Float32Array([1, 0, 0]);
    let cameraOriginMode = 'earth-center';
    // Optional user-location marker (requested only when an Earth-tagged body exists)
    let userLocationRequested = false;
    let hasUserLocation = 0;
    const userDirEarthFixedWorld = new Float32Array([0, 0, 0]);
    const userDirInertialWorld = new Float32Array([0, 0, 0]);
    const requestUserLocation = () => {
        if (userLocationRequested)
            return;
        userLocationRequested = true;
        if (typeof navigator === 'undefined')
            return;
        if (!('geolocation' in navigator))
            return;
        navigator.geolocation.getCurrentPosition((pos) => {
            const latRad = (pos.coords.latitude * Math.PI) / 180;
            const lonRad = (pos.coords.longitude * Math.PI) / 180;
            const cosLat = Math.cos(latRad);
            userDirEarthFixedWorld[0] = cosLat * Math.cos(lonRad);
            userDirEarthFixedWorld[1] = Math.sin(latRad);
            userDirEarthFixedWorld[2] = cosLat * Math.sin(lonRad);
            hasUserLocation = 1;
        }, (err) => {
            AppLog.warn('User location unavailable: ' + err);
        }, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 });
    };
    // Earth texture (NASA Blue Marble, loaded asynchronously)
    let earthTextureReady = false;
    const earthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, earthTexture);
    // 1×1 placeholder while loading
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30, 90, 240, 255]));
    // Load texture via fetch + createImageBitmap for better error reporting and reliability
    fetch('earth-texture.png')
        .then(res => {
        if (!res.ok)
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return res.blob();
    })
        .then(blob => createImageBitmap(blob))
        .then(bitmap => {
        gl.bindTexture(gl.TEXTURE_2D, earthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        earthTextureReady = true;
        AppLog.info('Earth texture loaded');
    })
        .catch(err => {
        AppLog.warn('Failed to load Earth texture: ' + err);
    });
    // Last-frame canvas dimensions (for pick)
    let lastWidth = 0;
    let lastHeight = 0;
    const renderer = {
        name: 'PlanetRendererWebGL',
        phase: 'visual',
        selectedEntity: undefined,
        get hasUserLocation() { return hasUserLocation > 0; },
        get cameraOriginMode() { return cameraOriginMode; },
        set cameraOriginMode(v) { cameraOriginMode = v; },
        get sunlightMode() { return sunlightModeEnabled; },
        set sunlightMode(v) { sunlightModeEnabled = v; },
        pick(screenX, screenY, world) {
            const w = lastWidth;
            const h = lastHeight;
            if (w === 0 || h === 0)
                return undefined;
            const bodies = world.query(Position, Size);
            const EARTH_RADIUS_SQ_FACTOR = 0.97; // slightly inside surface to avoid edge misses
            // Find Earth position + radius for occlusion test
            let earthPx = 0, earthPy = 0, earthPz = 0, earthRadius = 0;
            const earthEntities = world.query(Position, Size, EarthTag);
            if (earthEntities.length > 0) {
                const ep = world.getComponent(earthEntities[0], Position);
                earthPx = ep.x;
                earthPy = ep.y;
                earthPz = ep.z;
                earthRadius = world.getComponent(earthEntities[0], Size);
            }
            // Camera world position (reconstruct from view matrix inverse)
            // viewMatrix is column-major: row 3 of columns 0-2 give -dot(axis, camPos)
            // camPos = -(R^T * t) where R is the 3x3 and t is column 3
            const cx = -(viewMatrix[0] * viewMatrix[12] + viewMatrix[1] * viewMatrix[13] + viewMatrix[2] * viewMatrix[14]);
            const cy = -(viewMatrix[4] * viewMatrix[12] + viewMatrix[5] * viewMatrix[13] + viewMatrix[6] * viewMatrix[14]);
            const cz = -(viewMatrix[8] * viewMatrix[12] + viewMatrix[9] * viewMatrix[13] + viewMatrix[10] * viewMatrix[14]);
            let bestId;
            let bestDistSq = Infinity;
            const HIT_RADIUS_PX = 20;
            for (let i = 0; i < bodies.length; i++) {
                const id = bodies[i];
                if (world.hasComponent(id, EarthTag))
                    continue;
                const size = world.getComponent(id, Size);
                if (size <= 0)
                    continue;
                const pos = world.getComponent(id, Position);
                // Project to clip space: clip = projMatrix * viewMatrix * pos
                const vx = viewMatrix[0] * pos.x + viewMatrix[4] * pos.y + viewMatrix[8] * pos.z + viewMatrix[12];
                const vy = viewMatrix[1] * pos.x + viewMatrix[5] * pos.y + viewMatrix[9] * pos.z + viewMatrix[13];
                const vz = viewMatrix[2] * pos.x + viewMatrix[6] * pos.y + viewMatrix[10] * pos.z + viewMatrix[14];
                const vw = viewMatrix[3] * pos.x + viewMatrix[7] * pos.y + viewMatrix[11] * pos.z + viewMatrix[15];
                const clipX = projMatrix[0] * vx + projMatrix[4] * vy + projMatrix[8] * vz + projMatrix[12] * vw;
                const clipY = projMatrix[1] * vx + projMatrix[5] * vy + projMatrix[9] * vz + projMatrix[13] * vw;
                const clipW = projMatrix[3] * vx + projMatrix[7] * vy + projMatrix[11] * vz + projMatrix[15] * vw;
                // Behind camera
                if (clipW <= 0)
                    continue;
                const ndcX = clipX / clipW;
                const ndcY = clipY / clipW;
                const sx = (ndcX + 1) * 0.5 * w;
                const sy = (1 - ndcY) * 0.5 * h;
                const dx = sx - screenX;
                const dy = sy - screenY;
                const dSq = dx * dx + dy * dy;
                if (dSq > HIT_RADIUS_PX * HIT_RADIUS_PX)
                    continue;
                // Occlusion: is the satellite behind the Earth?
                if (earthRadius > 0) {
                    // Vector from camera to satellite
                    const toDirX = pos.x - cx;
                    const toDirY = pos.y - cy;
                    const toDirZ = pos.z - cz;
                    // Vector from camera to earth center
                    const toEarthX = earthPx - cx;
                    const toEarthY = earthPy - cy;
                    const toEarthZ = earthPz - cz;
                    const satDist = Math.sqrt(toDirX * toDirX + toDirY * toDirY + toDirZ * toDirZ);
                    const earthDist = Math.sqrt(toEarthX * toEarthX + toEarthY * toEarthY + toEarthZ * toEarthZ);
                    // Only test occlusion if satellite is farther than Earth center
                    if (satDist > earthDist) {
                        // Project satellite onto line from camera to Earth center
                        // Find closest approach of the camera→satellite ray to Earth center
                        const rayDirX = toDirX / satDist;
                        const rayDirY = toDirY / satDist;
                        const rayDirZ = toDirZ / satDist;
                        const dot = toEarthX * rayDirX + toEarthY * rayDirY + toEarthZ * rayDirZ;
                        const perpX = toEarthX - dot * rayDirX;
                        const perpY = toEarthY - dot * rayDirY;
                        const perpZ = toEarthZ - dot * rayDirZ;
                        const perpDistSq = perpX * perpX + perpY * perpY + perpZ * perpZ;
                        if (perpDistSq < earthRadius * earthRadius * EARTH_RADIUS_SQ_FACTOR) {
                            continue; // occluded by Earth
                        }
                    }
                }
                // Prefer the closest entity to the click; break ties by depth (closer to camera)
                if (dSq < bestDistSq || (dSq === bestDistSq && clipW < Infinity)) {
                    bestDistSq = dSq;
                    bestId = id;
                }
            }
            return bestId;
        },
        update(world, _dt) {
            const { width, height } = canvas;
            lastWidth = width;
            lastHeight = height;
            // Handle canvas resize
            gl.viewport(0, 0, width, height);
            // Get camera
            const cameraEntity = world.querySingle(CameraComponent);
            if (cameraEntity === undefined)
                return;
            const camera = world.getComponent(cameraEntity, CameraComponent);
            const earthEntities = world.query(Position, Size, EarthTag);
            const earthCount = Math.min(earthEntities.length, MAX_INSTANCES);
            let earthX = 0;
            let earthY = 0;
            let earthZ = 0;
            let earthRadius = 0;
            const earthRotationRad = greenwichSiderealAngleRad(world.simTimeMs);
            if (earthEntities.length > 0) {
                const earthPos = world.getComponent(earthEntities[0], Position);
                earthX = earthPos.x;
                earthY = earthPos.y;
                earthZ = earthPos.z;
                earthRadius = world.getComponent(earthEntities[0], Size) ?? 0;
                if (cameraOriginMode === 'user-location') {
                    requestUserLocation();
                }
            }
            if (hasUserLocation) {
                earthFixedToInertialWorld(world.simTimeMs, userDirEarthFixedWorld[0], userDirEarthFixedWorld[1], userDirEarthFixedWorld[2], userDirInertialWorld);
            }
            let targetX = 0;
            let targetY = 0;
            let targetZ = 0;
            if (cameraOriginMode === 'selected-satellite' &&
                renderer.selectedEntity !== undefined &&
                world.hasComponent(renderer.selectedEntity, Position)) {
                const selectedPos = world.getComponent(renderer.selectedEntity, Position);
                targetX = selectedPos.x;
                targetY = selectedPos.y;
                targetZ = selectedPos.z;
            }
            else if (earthEntities.length > 0) {
                if (cameraOriginMode === 'user-location' && hasUserLocation && earthRadius > 0) {
                    targetX = earthX + userDirInertialWorld[0] * earthRadius;
                    targetY = earthY + userDirInertialWorld[1] * earthRadius;
                    targetZ = earthZ + userDirInertialWorld[2] * earthRadius;
                }
                else {
                    targetX = earthX;
                    targetY = earthY;
                    targetZ = earthZ;
                }
            }
            // Calculate camera position from spherical coordinates
            const cosPhi = Math.cos(camera.phi);
            const sinPhi = Math.sin(camera.phi);
            const cosTheta = Math.cos(camera.theta);
            const sinTheta = Math.sin(camera.theta);
            const camX = targetX + camera.distance * cosPhi * sinTheta;
            const camY = targetY + camera.distance * sinPhi;
            const camZ = targetZ + camera.distance * cosPhi * cosTheta;
            const upX = 0, upY = 1, upZ = 0;
            // Calculate camera basis vectors (for billboarding)
            // Forward: camera to target (normalized)
            let fwdX = targetX - camX;
            let fwdY = targetY - camY;
            let fwdZ = targetZ - camZ;
            let fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
            fwdX /= fwdLen;
            fwdY /= fwdLen;
            fwdZ /= fwdLen;
            // Right: up × forward (normalized)
            let rightX = upY * fwdZ - upZ * fwdY;
            let rightY = upZ * fwdX - upX * fwdZ;
            let rightZ = upX * fwdY - upY * fwdX;
            let rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
            rightX /= rightLen;
            rightY /= rightLen;
            rightZ /= rightLen;
            // Actual up: forward × right
            const actualUpX = fwdY * rightZ - fwdZ * rightY;
            const actualUpY = fwdZ * rightX - fwdX * rightZ;
            const actualUpZ = fwdX * rightY - fwdY * rightX;
            // Build view matrix (lookAt)
            viewMatrix[0] = rightX;
            viewMatrix[1] = actualUpX;
            viewMatrix[2] = -fwdX;
            viewMatrix[3] = 0;
            viewMatrix[4] = rightY;
            viewMatrix[5] = actualUpY;
            viewMatrix[6] = -fwdY;
            viewMatrix[7] = 0;
            viewMatrix[8] = rightZ;
            viewMatrix[9] = actualUpZ;
            viewMatrix[10] = -fwdZ;
            viewMatrix[11] = 0;
            viewMatrix[12] = -(rightX * camX + rightY * camY + rightZ * camZ);
            viewMatrix[13] = -(actualUpX * camX + actualUpY * camY + actualUpZ * camZ);
            viewMatrix[14] = -(-fwdX * camX + -fwdY * camY + -fwdZ * camZ);
            viewMatrix[15] = 1;
            // Build perspective projection matrix
            const fov = Math.PI / 4 / camera.zoom; // Adjust FOV based on zoom
            const aspect = width / height;
            const near = camera.distance * 0.01;
            const far = camera.distance * 10;
            const f = 1.0 / Math.tan(fov / 2);
            const rangeInv = 1.0 / (near - far);
            projMatrix[0] = f / aspect;
            projMatrix[1] = 0;
            projMatrix[2] = 0;
            projMatrix[3] = 0;
            projMatrix[4] = 0;
            projMatrix[5] = f;
            projMatrix[6] = 0;
            projMatrix[7] = 0;
            projMatrix[8] = 0;
            projMatrix[9] = 0;
            projMatrix[10] = (far + near) * rangeInv;
            projMatrix[11] = -1;
            projMatrix[12] = 0;
            projMatrix[13] = 0;
            projMatrix[14] = 2 * far * near * rangeInv;
            projMatrix[15] = 0;
            // Get renderable planets
            const bodies = world.query(Position, Size);
            const bodyCount = Math.min(bodies.length, MAX_INSTANCES);
            // Clear screen and depth buffer
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            const minPixelSize = 1.0;
            // If an Earth-tagged body exists, render it last with the Earth shader (grid + marker),
            // so satellites fade cleanly at the horizon (no black alpha-edge halo).
            if (earthCount > 0) {
                // Compute sun direction and earth radius for shadow testing
                let shadowEarthRadius = 0;
                const cosRot = Math.cos(earthRotationRad);
                const sinRot = Math.sin(earthRotationRad);
                if (sunlightModeEnabled) {
                    computeSunDirWorld(world.simTimeMs, sunDirWorld);
                    shadowEarthRadius = earthRadius;
                }
                // Draw non-Earth bodies first
                let offset = 0;
                for (let i = 0; i < bodyCount; i++) {
                    const id = bodies[i];
                    if (world.hasComponent(id, EarthTag))
                        continue;
                    const pos = world.getComponent(id, Position);
                    const size = world.getComponent(id, Size);
                    if (size <= 0)
                        continue;
                    const color = world.getComponent(id, Color);
                    const temp = world.getComponent(id, Temperature);
                    let r = 1, g = 1, b = 1;
                    if (sunlightModeEnabled && shadowEarthRadius > 0) {
                        // Sunlight mode: monochrome base with smooth shadow transition.
                        // Transition span is one second of orbital travel distance.
                        const orbit = world.getComponent(id, Orbit);
                        const speedMps = orbit ? estimateOrbitalSpeedApproxMps(orbit) : 0;
                        const transitionSpanMeters = Math.max(speedMps * 1.0, 1.0);
                        const sunlitByte = sunlitByteFromEarthShadow(pos.x, pos.y, pos.z, sunDirWorld[0], sunDirWorld[1], sunDirWorld[2], shadowEarthRadius, transitionSpanMeters);
                        const sunlitT = sunlitByte / 255;
                        // In shadow: very dim. Sunlit: monochrome grey.
                        r = lerp(0.06, 0.5, sunlitT);
                        g = lerp(0.06, 0.5, sunlitT);
                        b = lerp(0.08, 0.5, sunlitT);
                        // Check if visible from user location (above horizon)
                        if (hasUserLocation) {
                            const satXEarthFixed = cosRot * pos.x + sinRot * pos.z;
                            const satYEarthFixed = pos.y;
                            const satZEarthFixed = -sinRot * pos.x + cosRot * pos.z;
                            const MIN_ELEVATION_RAD = 0.175; // ~10 degrees above horizon
                            const elev = satelliteElevation(satXEarthFixed, satYEarthFixed, satZEarthFixed, userDirEarthFixedWorld[0], userDirEarthFixedWorld[1], userDirEarthFixedWorld[2], shadowEarthRadius);
                            if (elev > MIN_ELEVATION_RAD) {
                                // Highlight: bright yellow, scaled by sunlit blend for smooth handoff.
                                r = lerp(r, 1.0, sunlitT);
                                g = lerp(g, 0.9, sunlitT);
                                b = lerp(b, 0.2, sunlitT);
                            }
                        }
                    }
                    else {
                        // Normal mode: use status colors
                        if (color) {
                            r = color.x;
                            g = color.y;
                            b = color.z;
                        }
                        else if (temp !== undefined) {
                            temperatureToRGB(temp, tmpRgb);
                            r = tmpRgb[0];
                            g = tmpRgb[1];
                            b = tmpRgb[2];
                        }
                    }
                    if (renderer.selectedEntity !== undefined && id === renderer.selectedEntity) {
                        r = 1.0;
                        g = 1.0;
                        b = 1.0;
                    }
                    instanceData[offset++] = pos.x;
                    instanceData[offset++] = pos.y;
                    instanceData[offset++] = pos.z;
                    instanceData[offset++] = size;
                    instanceData[offset++] = r;
                    instanceData[offset++] = g;
                    instanceData[offset++] = b;
                }
                const nonEarthCount = offset / INSTANCE_STRIDE;
                if (nonEarthCount > 0) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, offset));
                    gl.useProgram(bodyProgram);
                    gl.bindVertexArray(vaoBody);
                    gl.uniform2f(bodyUniforms.resolution, width, height);
                    gl.uniformMatrix4fv(bodyUniforms.viewMatrix, false, viewMatrix);
                    gl.uniformMatrix4fv(bodyUniforms.projMatrix, false, projMatrix);
                    gl.uniform3f(bodyUniforms.cameraRight, rightX, rightY, rightZ);
                    gl.uniform3f(bodyUniforms.cameraUp, actualUpX, actualUpY, actualUpZ);
                    gl.uniform1f(bodyUniforms.minPixelSize, minPixelSize);
                    gl.uniform1f(bodyUniforms.perspectiveSphere, 0.0);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, nonEarthCount);
                }
                // Draw Earth-tagged bodies last (grid + user marker)
                requestUserLocation();
                offset = 0;
                for (let i = 0; i < earthCount; i++) {
                    const id = earthEntities[i];
                    const pos = world.getComponent(id, Position);
                    const size = world.getComponent(id, Size);
                    const color = world.getComponent(id, Color);
                    const temp = world.getComponent(id, Temperature);
                    let r = 1, g = 1, b = 1;
                    if (color) {
                        r = color.x;
                        g = color.y;
                        b = color.z;
                    }
                    else if (temp !== undefined) {
                        temperatureToRGB(temp, tmpRgb);
                        r = tmpRgb[0];
                        g = tmpRgb[1];
                        b = tmpRgb[2];
                    }
                    instanceData[offset++] = pos.x;
                    instanceData[offset++] = pos.y;
                    instanceData[offset++] = pos.z;
                    instanceData[offset++] = size;
                    instanceData[offset++] = r;
                    instanceData[offset++] = g;
                    instanceData[offset++] = b;
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, offset));
                gl.useProgram(earthProgram);
                gl.bindVertexArray(vaoEarth);
                gl.uniform2f(earthUniforms.resolution, width, height);
                gl.uniformMatrix4fv(earthUniforms.viewMatrix, false, viewMatrix);
                gl.uniformMatrix4fv(earthUniforms.projMatrix, false, projMatrix);
                gl.uniform3f(earthUniforms.cameraRight, rightX, rightY, rightZ);
                gl.uniform3f(earthUniforms.cameraUp, actualUpX, actualUpY, actualUpZ);
                gl.uniform3f(earthUniforms.cameraForward, -fwdX, -fwdY, -fwdZ);
                gl.uniform1f(earthUniforms.earthRotationRad, earthRotationRad);
                gl.uniform1f(earthUniforms.minPixelSize, minPixelSize);
                gl.uniform1f(earthUniforms.perspectiveSphere, 1.0);
                gl.uniform3f(earthUniforms.userDirWorld, userDirEarthFixedWorld[0], userDirEarthFixedWorld[1], userDirEarthFixedWorld[2]);
                gl.uniform1f(earthUniforms.hasUserLocation, hasUserLocation);
                // Sunlight mode uniforms
                gl.uniform3f(earthUniforms.sunDirWorld, sunDirWorld[0], sunDirWorld[1], sunDirWorld[2]);
                gl.uniform1f(earthUniforms.sunlightMode, sunlightModeEnabled ? 1.0 : 0.0);
                // Bind earth texture
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, earthTexture);
                gl.uniform1i(earthUniforms.earthTexture, 0);
                gl.uniform1f(earthUniforms.hasTexture, earthTextureReady ? 1.0 : 0.0);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, earthCount);
                drawSelectedOrbit(world, renderer.selectedEntity);
                gl.bindVertexArray(null);
                return;
            }
            // No Earth-tagged body: draw the largest body last to reduce alpha-edge halos.
            if (bodyCount === 0) {
                gl.bindVertexArray(null);
                return;
            }
            let largestId = undefined;
            let largestSize = -Infinity;
            for (let i = 0; i < bodyCount; i++) {
                const id = bodies[i];
                const size = world.getComponent(id, Size);
                if (size > largestSize) {
                    largestSize = size;
                    largestId = id;
                }
            }
            // Build instance data for non-largest bodies
            let offset = 0;
            for (let i = 0; i < bodyCount; i++) {
                const id = bodies[i];
                if (id === largestId)
                    continue;
                const pos = world.getComponent(id, Position);
                const size = world.getComponent(id, Size);
                const color = world.getComponent(id, Color);
                const temp = world.getComponent(id, Temperature);
                let r = 1, g = 1, b = 1;
                if (color) {
                    r = color.x;
                    g = color.y;
                    b = color.z;
                }
                else if (temp !== undefined) {
                    temperatureToRGB(temp, tmpRgb);
                    r = tmpRgb[0];
                    g = tmpRgb[1];
                    b = tmpRgb[2];
                }
                if (renderer.selectedEntity !== undefined && id === renderer.selectedEntity) {
                    r = 1.0;
                    g = 1.0;
                    b = 1.0;
                }
                instanceData[offset++] = pos.x;
                instanceData[offset++] = pos.y;
                instanceData[offset++] = pos.z;
                instanceData[offset++] = size;
                instanceData[offset++] = r;
                instanceData[offset++] = g;
                instanceData[offset++] = b;
            }
            const nonLargestCount = offset / INSTANCE_STRIDE;
            if (nonLargestCount > 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, offset));
                gl.useProgram(bodyProgram);
                gl.bindVertexArray(vaoBody);
                gl.uniform2f(bodyUniforms.resolution, width, height);
                gl.uniformMatrix4fv(bodyUniforms.viewMatrix, false, viewMatrix);
                gl.uniformMatrix4fv(bodyUniforms.projMatrix, false, projMatrix);
                gl.uniform3f(bodyUniforms.cameraRight, rightX, rightY, rightZ);
                gl.uniform3f(bodyUniforms.cameraUp, actualUpX, actualUpY, actualUpZ);
                gl.uniform1f(bodyUniforms.minPixelSize, minPixelSize);
                gl.uniform1f(bodyUniforms.perspectiveSphere, 0.0);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, nonLargestCount);
            }
            if (largestId !== undefined) {
                const pos = world.getComponent(largestId, Position);
                const size = world.getComponent(largestId, Size);
                const color = world.getComponent(largestId, Color);
                const temp = world.getComponent(largestId, Temperature);
                let r = 1, g = 1, b = 1;
                if (color) {
                    r = color.x;
                    g = color.y;
                    b = color.z;
                }
                else if (temp !== undefined) {
                    temperatureToRGB(temp, tmpRgb);
                    r = tmpRgb[0];
                    g = tmpRgb[1];
                    b = tmpRgb[2];
                }
                if (renderer.selectedEntity !== undefined && largestId === renderer.selectedEntity) {
                    r = 1.0;
                    g = 1.0;
                    b = 1.0;
                }
                instanceData[0] = pos.x;
                instanceData[1] = pos.y;
                instanceData[2] = pos.z;
                instanceData[3] = size;
                instanceData[4] = r;
                instanceData[5] = g;
                instanceData[6] = b;
                gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, INSTANCE_STRIDE));
                gl.useProgram(bodyProgram);
                gl.bindVertexArray(vaoBody);
                gl.uniform2f(bodyUniforms.resolution, width, height);
                gl.uniformMatrix4fv(bodyUniforms.viewMatrix, false, viewMatrix);
                gl.uniformMatrix4fv(bodyUniforms.projMatrix, false, projMatrix);
                gl.uniform3f(bodyUniforms.cameraRight, rightX, rightY, rightZ);
                gl.uniform3f(bodyUniforms.cameraUp, actualUpX, actualUpY, actualUpZ);
                gl.uniform1f(bodyUniforms.minPixelSize, minPixelSize);
                gl.uniform1f(bodyUniforms.perspectiveSphere, 0.0);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1);
            }
            drawSelectedOrbit(world, renderer.selectedEntity);
            gl.bindVertexArray(null);
        }
    };
    return renderer;
}
/**
 * Compile a WebGL shader from source.
 */
function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile error: ${info}`);
    }
    return shader;
}
/**
 * Check if WebGL 2 is available in the current browser.
 */
export function isWebGL2Available() {
    try {
        const canvas = document.createElement('canvas');
        return !!canvas.getContext('webgl2');
    }
    catch {
        return false;
    }
}
function temperatureToRGB(temp, out) {
    const minBrightness = 80 / 255;
    const logTemp = Math.log10(Math.max(temp, 1));
    // Matches the old shader mapping (log-scale ramps)
    const r = clamp01((logTemp - 2.0) / 0.7);
    const g = clamp01((logTemp - 2.3) / 1.0);
    const b = clamp01((logTemp - 2.7) / 1.0);
    out[0] = lerp(minBrightness, 1, r);
    out[1] = lerp(minBrightness, 1, g);
    out[2] = lerp(minBrightness, 1, b);
}
function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function solveKeplerE(M, e) {
    let E = M;
    for (let i = 0; i < 6; i++) {
        const f = E - e * Math.sin(E) - M;
        const fp = 1 - e * Math.cos(E);
        E -= f / fp;
    }
    return E;
}
function estimateOrbitalSpeedApproxMps(orbit) {
    const a = orbit.semiMajorAxis;
    const n = orbit.meanMotionRadPerSec;
    if (!(a > 0) || !(n > 0))
        return 0;
    // Circular approximation for orbital speed: v ≈ n * a
    return n * a;
}
