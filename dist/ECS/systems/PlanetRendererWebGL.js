import { Position, Size, Temperature, CameraComponent } from '../Components.js';
// Vertex shader - transforms quad vertices and passes instance data to fragment shader
const VERTEX_SHADER = `#version 300 es
precision highp float;

// Per-vertex attributes (unit quad)
in vec2 a_vertex;

// Per-instance attributes
in vec2 a_position;
in float a_size;
in float a_temperature;

// Uniforms
uniform vec2 u_resolution;
uniform vec2 u_cameraOffset;
uniform float u_cameraZoom;

// Varyings to fragment shader
out vec2 v_uv;
out float v_temperature;

void main() {
    // Pass to fragment shader
    v_uv = a_vertex;
    v_temperature = a_temperature;

    // Transform: local -> world -> screen
    vec2 worldPos = a_position + a_vertex * a_size;
    vec2 screenPos = worldPos * u_cameraZoom + u_cameraOffset;

    // Convert to clip space (-1 to 1), flip Y for canvas coordinates
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y;

    gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;
// Fragment shader - renders circle with temperature-based coloring
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in float v_temperature;

out vec4 fragColor;

void main() {
    // Discard pixels outside unit circle
    float dist = length(v_uv);
    if (dist > 1.0) discard;

    // Smooth edge anti-aliasing
    float alpha = 1.0 - smoothstep(0.95, 1.0, dist);

    // Temperature to color using logarithmic scale
    // Matches the Canvas 2D implementation logic
    float logTemp = log(max(v_temperature, 1.0)) / log(10.0);

    float minBrightness = 80.0 / 255.0;

    // Red: ramps from log10(100)=2 to log10(500)=2.7
    float r = clamp((logTemp - 2.0) / 0.7, 0.0, 1.0);
    r = mix(minBrightness, 1.0, r);

    // Green: ramps from log10(200)=2.3 to log10(2000)=3.3
    float g = clamp((logTemp - 2.3) / 1.0, 0.0, 1.0);
    g = mix(minBrightness, 1.0, g);

    // Blue: ramps from log10(500)=2.7 to log10(5000)=3.7
    float b = clamp((logTemp - 2.7) / 1.0, 0.0, 1.0);
    b = mix(minBrightness, 1.0, b);

    fragColor = vec4(r, g, b, alpha);
}
`;
// Maximum entities we can render (pre-allocated buffer size)
const MAX_INSTANCES = 100000;
// Instance data stride: x, y, size, temperature (4 floats per instance)
const INSTANCE_STRIDE = 4;
/**
 * Factory to create a WebGL-based planet renderer.
 * Uses instanced rendering for high performance with large entity counts.
 */
export function createPlanetRendererWebGL(canvas) {
    // Initialize WebGL 2 context
    const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance'
    });
    if (!gl) {
        throw new Error('WebGL 2 not supported');
    }
    // Compile shaders
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    // Link program
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('Shader program link failed: ' + gl.getProgramInfoLog(program));
    }
    // Get attribute and uniform locations
    const attribs = {
        vertex: gl.getAttribLocation(program, 'a_vertex'),
        position: gl.getAttribLocation(program, 'a_position'),
        size: gl.getAttribLocation(program, 'a_size'),
        temperature: gl.getAttribLocation(program, 'a_temperature')
    };
    const uniforms = {
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        cameraOffset: gl.getUniformLocation(program, 'u_cameraOffset'),
        cameraZoom: gl.getUniformLocation(program, 'u_cameraZoom')
    };
    // Create VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
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
    gl.enableVertexAttribArray(attribs.vertex);
    gl.vertexAttribPointer(attribs.vertex, 2, gl.FLOAT, false, 0, 0);
    // Create instance buffer (position, size, temperature per instance)
    const instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES * INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW);
    // Set up instance attributes with divisor = 1 (per-instance)
    // a_position (vec2): offset 0
    gl.enableVertexAttribArray(attribs.position);
    gl.vertexAttribPointer(attribs.position, 2, gl.FLOAT, false, INSTANCE_STRIDE * 4, 0);
    gl.vertexAttribDivisor(attribs.position, 1);
    // a_size (float): offset 8
    gl.enableVertexAttribArray(attribs.size);
    gl.vertexAttribPointer(attribs.size, 1, gl.FLOAT, false, INSTANCE_STRIDE * 4, 8);
    gl.vertexAttribDivisor(attribs.size, 1);
    // a_temperature (float): offset 12
    gl.enableVertexAttribArray(attribs.temperature);
    gl.vertexAttribPointer(attribs.temperature, 1, gl.FLOAT, false, INSTANCE_STRIDE * 4, 12);
    gl.vertexAttribDivisor(attribs.temperature, 1);
    gl.bindVertexArray(null);
    // Pre-allocate instance data buffer on CPU side
    const instanceData = new Float32Array(MAX_INSTANCES * INSTANCE_STRIDE);
    // Enable blending for anti-aliased edges
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return {
        name: 'PlanetRendererWebGL',
        phase: 'visual',
        update(world, _dt) {
            const { width, height } = canvas;
            // Handle canvas resize
            if (canvas.width !== width || canvas.height !== height) {
                gl.viewport(0, 0, width, height);
            }
            gl.viewport(0, 0, width, height);
            // Get camera
            const cameraEntity = world.querySingle(CameraComponent);
            if (cameraEntity === undefined)
                return;
            const camera = world.getComponent(cameraEntity, CameraComponent);
            // Get renderable planets
            const planets = world.query(Position, Size, Temperature);
            const planetCount = Math.min(planets.length, MAX_INSTANCES);
            // Build instance data buffer
            let offset = 0;
            for (let i = 0; i < planetCount; i++) {
                const id = planets[i];
                const pos = world.getComponent(id, Position);
                const size = world.getComponent(id, Size);
                const temp = world.getComponent(id, Temperature);
                instanceData[offset++] = pos.x;
                instanceData[offset++] = pos.y;
                instanceData[offset++] = size;
                instanceData[offset++] = temp;
            }
            // Upload instance data to GPU
            gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, offset));
            // Clear screen
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            // Set up shader program
            gl.useProgram(program);
            gl.bindVertexArray(vao);
            // Set uniforms
            gl.uniform2f(uniforms.resolution, width, height);
            gl.uniform2f(uniforms.cameraOffset, camera.offset.x, camera.offset.y);
            gl.uniform1f(uniforms.cameraZoom, camera.zoom);
            // Draw all instances with a single draw call
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, planetCount);
            gl.bindVertexArray(null);
        }
    };
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
