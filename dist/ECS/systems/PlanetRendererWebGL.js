import { Position, Size, Color, Temperature, CameraComponent, EarthTag } from '../Components.js';
import { AppLog } from '../../AppLog.js';
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

// Varyings to fragment shader
out vec2 v_uv;
out vec3 v_color;
out float v_depth;

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

    // Billboard: offset from center using camera-aligned axes
    vec3 worldPos = a_position + u_cameraRight * a_vertex.x * effectiveSize + u_cameraUp * a_vertex.y * effectiveSize;

    // Transform to view space then clip space
    vec4 viewPos = u_viewMatrix * vec4(worldPos, 1.0);
    gl_Position = u_projMatrix * viewPos;

    // Pass depth for potential depth-based effects
    v_depth = -viewPos.z;
}
`;
// Fragment shader - renders sphere-like shading with per-instance color
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_color;
in float v_depth;

out vec4 fragColor;

void main() {
    float distSq = dot(v_uv, v_uv);

    // AA using fwidth(v_uv) which is perfectly stable (linear interpolant).
    // Work in distSq-space: the smoothstep upper bound is exactly 1.0,
    // so nothing outside the unit circle ever receives any alpha.
    float pixelSize = length(fwidth(v_uv));
    float edge = max(2.0 * pixelSize, 0.002);
    float alpha = 1.0 - smoothstep(1.0 - edge, 1.0, distSq);
    if (alpha < 0.01) discard;

    // Reconstruct a sphere normal from the projected disc (billboarded sphere)
    float z = sqrt(1.0 - distSq);  // safe: distSq < 1.0 after discard
    vec3 normal = normalize(vec3(v_uv, z));

    // Fixed view-space light direction for a simple 3D look
    vec3 lightDir = normalize(vec3(0.35, 0.25, 1.0));

    float ambient = 0.28;
    float diffuse = max(dot(normal, lightDir), 0.0);
    vec3 col = v_color * (ambient + diffuse * 0.72);

    // Subtle specular highlight
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);
    col += spec * 0.15;

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

uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraForward;

uniform vec3 u_userDirWorld;      // normalized
uniform float u_hasUserLocation;  // 0 or 1

uniform sampler2D u_earthTexture;
uniform float u_hasTexture;       // 0 or 1

out vec4 fragColor;

const float PI = 3.14159265359;

float gridLine(float coord, float stepRad, float fw) {
    float halfStep = stepRad * 0.5;
    float d = abs(mod(coord + halfStep, stepRad) - halfStep);
    return 1.0 - smoothstep(fw, fw * 1.5, d);
}

void main() {
    float distSq = dot(v_uv, v_uv);

    // AA using fwidth(v_uv) – stable linear interpolant, no sqrt derivatives.
    // Smoothstep upper bound is exactly 1.0 so nothing outside the circle gets alpha.
    float pixelSize = length(fwidth(v_uv));
    float edge = max(2.0 * pixelSize, 0.002);
    float alpha = 1.0 - smoothstep(1.0 - edge, 1.0, distSq);
    if (alpha < 0.01) discard;

    float z = sqrt(1.0 - distSq);
    vec3 normalLocal = normalize(vec3(v_uv, z));

    // Lighting factors (computed before choosing base color)
    vec3 lightDir = normalize(vec3(0.35, 0.25, 1.0));
    float ambient = 0.28;
    float diffuse = max(dot(normalLocal, lightDir), 0.0);

    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 reflectDir = reflect(-lightDir, normalLocal);
    float spec = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);

    // Map the visible hemisphere to world directions so the grid is anchored to world axes.
    vec3 normalWorld = normalize(
        u_cameraRight * normalLocal.x +
        u_cameraUp * normalLocal.y +
        u_cameraForward * normalLocal.z
    );

    float lat = asin(clamp(normalWorld.y, -1.0, 1.0));
    float lon = atan(normalWorld.z, normalWorld.x);

    // Choose base color: texture or solid
    vec3 baseColor;
    if (u_hasTexture > 0.5) {
        vec2 texUV = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
        baseColor = texture(u_earthTexture, texUV).rgb;
    } else {
        baseColor = v_color;
    }

    // Apply lighting to base color
    vec3 col = baseColor * (ambient + diffuse * 0.72);
    col += spec * 0.15;

    float latStep = radians(15.0);
    float lonStep = radians(15.0);
    float gridPx = 0.75;

    // Latitude: asin is continuous, so fwidth works directly
    float fwLat = max(fwidth(lat) * gridPx, 1e-4);

    // Longitude: compute fwidth analytically to avoid atan2 ±π seam artifact.
    // d(atan(z,x))/ds = (x·dz/ds − z·dx/ds) / (x² + z²)
    float nxz2 = normalWorld.x * normalWorld.x + normalWorld.z * normalWorld.z;
    float invNxz2 = 1.0 / max(nxz2, 1e-8);
    float dlon_dx = (normalWorld.x * dFdx(normalWorld.z) - normalWorld.z * dFdx(normalWorld.x)) * invNxz2;
    float dlon_dy = (normalWorld.x * dFdy(normalWorld.z) - normalWorld.z * dFdy(normalWorld.x)) * invNxz2;
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

    // Grid is more subtle over texture, more visible on solid color
    float gridAlpha = u_hasTexture > 0.5 ? 0.2 : 0.35;
    col = mix(col, vec3(0.95, 0.95, 1.0), grid * gridAlpha);

    // User location marker (red with a thin white ring)
    if (u_hasUserLocation > 0.5) {
        // Angular distance from user location (0 = exactly there, grows with distance)
        float markerDot = dot(normalWorld, u_userDirWorld);
        float angDist = acos(clamp(markerDot, -1.0, 1.0));
        float aaAng = max(fwidth(angDist), 1e-5);

        // Fixed angular radius (~3 degrees outer, ~2 degrees inner)
        float outerR = 0.052;
        float innerR = 0.035;
        float outer = 1.0 - smoothstep(outerR - aaAng, outerR + aaAng, angDist);
        float inner = 1.0 - smoothstep(innerR - aaAng, innerR + aaAng, angDist);
        float ring = max(0.0, outer - inner);

        col = mix(col, vec3(1.0), ring);
        col = mix(col, vec3(1.0, 0.2, 0.15), inner);
    }

    // Premultiplied alpha to avoid dark fringe at edges
    fragColor = vec4(col * alpha, alpha);
}
`;
// Maximum entities we can render (pre-allocated buffer size)
const MAX_INSTANCES = 100000;
// Instance data stride: x, y, z, size, r, g, b (7 floats per instance)
const INSTANCE_STRIDE = 7;
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
        minPixelSize: gl.getUniformLocation(bodyProgram, 'u_minPixelSize')
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
        minPixelSize: gl.getUniformLocation(earthProgram, 'u_minPixelSize'),
        userDirWorld: gl.getUniformLocation(earthProgram, 'u_userDirWorld'),
        hasUserLocation: gl.getUniformLocation(earthProgram, 'u_hasUserLocation'),
        earthTexture: gl.getUniformLocation(earthProgram, 'u_earthTexture'),
        hasTexture: gl.getUniformLocation(earthProgram, 'u_hasTexture')
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
    // Optional user-location marker (requested only when an Earth-tagged body exists)
    let userLocationRequested = false;
    let hasUserLocation = 0;
    const userDirWorld = new Float32Array([0, 0, 0]);
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
            userDirWorld[0] = cosLat * Math.cos(lonRad);
            userDirWorld[1] = Math.sin(latRad);
            userDirWorld[2] = cosLat * Math.sin(lonRad);
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
            // Calculate camera position from spherical coordinates
            const cosPhi = Math.cos(camera.phi);
            const sinPhi = Math.sin(camera.phi);
            const cosTheta = Math.cos(camera.theta);
            const sinTheta = Math.sin(camera.theta);
            const camX = camera.distance * cosPhi * sinTheta;
            const camY = camera.distance * sinPhi;
            const camZ = camera.distance * cosPhi * cosTheta;
            // Camera looks at origin
            const targetX = 0, targetY = 0, targetZ = 0;
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
            const earthEntities = world.query(Position, Size, EarthTag);
            const earthCount = Math.min(earthEntities.length, MAX_INSTANCES);
            const minPixelSize = 1.0;
            // If an Earth-tagged body exists, render it last with the Earth shader (grid + marker),
            // so satellites fade cleanly at the horizon (no black alpha-edge halo).
            if (earthCount > 0) {
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
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, nonEarthCount);
                }
                // Draw selection highlight ring (drawn after satellites, before Earth)
                if (renderer.selectedEntity !== undefined && world.hasComponent(renderer.selectedEntity, Position)) {
                    const selPos = world.getComponent(renderer.selectedEntity, Position);
                    const selSize = world.getComponent(renderer.selectedEntity, Size);
                    if (selSize !== undefined && selSize > 0) {
                        // Ring: larger billboard with bright color, rendered with blending
                        const ringScale = 4.0;
                        instanceData[0] = selPos.x;
                        instanceData[1] = selPos.y;
                        instanceData[2] = selPos.z;
                        instanceData[3] = selSize * ringScale;
                        instanceData[4] = 1.0; // bright white
                        instanceData[5] = 1.0;
                        instanceData[6] = 1.0;
                        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, INSTANCE_STRIDE));
                        gl.useProgram(bodyProgram);
                        gl.bindVertexArray(vaoBody);
                        gl.uniform2f(bodyUniforms.resolution, width, height);
                        gl.uniformMatrix4fv(bodyUniforms.viewMatrix, false, viewMatrix);
                        gl.uniformMatrix4fv(bodyUniforms.projMatrix, false, projMatrix);
                        gl.uniform3f(bodyUniforms.cameraRight, rightX, rightY, rightZ);
                        gl.uniform3f(bodyUniforms.cameraUp, actualUpX, actualUpY, actualUpZ);
                        gl.uniform1f(bodyUniforms.minPixelSize, 8.0); // ensure ring is visible
                        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1);
                    }
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
                gl.uniform1f(earthUniforms.minPixelSize, minPixelSize);
                gl.uniform3f(earthUniforms.userDirWorld, userDirWorld[0], userDirWorld[1], userDirWorld[2]);
                gl.uniform1f(earthUniforms.hasUserLocation, hasUserLocation);
                // Bind earth texture
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, earthTexture);
                gl.uniform1i(earthUniforms.earthTexture, 0);
                gl.uniform1f(earthUniforms.hasTexture, earthTextureReady ? 1.0 : 0.0);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, earthCount);
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
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1);
            }
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
