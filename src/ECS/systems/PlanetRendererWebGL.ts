import { System } from '../System.js'
import { World } from '../World.js'
import { Position, Size, Temperature, CameraComponent } from '../Components.js'

// Vertex shader - 3D perspective projection with billboarded quads
const VERTEX_SHADER = `#version 300 es
precision highp float;

// Per-vertex attributes (unit quad)
in vec2 a_vertex;

// Per-instance attributes
in vec3 a_position;
in float a_size;
in float a_temperature;

// Uniforms
uniform vec2 u_resolution;
uniform mat4 u_viewMatrix;
uniform mat4 u_projMatrix;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform float u_minPixelSize;  // Minimum size in pixels (typically 1.0)

// Varyings to fragment shader
out vec2 v_uv;
out float v_temperature;
out float v_depth;

void main() {
    // Pass to fragment shader
    v_uv = a_vertex;
    v_temperature = a_temperature;

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
`

// Fragment shader - renders circle with temperature-based coloring
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in float v_temperature;
in float v_depth;

out vec4 fragColor;

void main() {
    // Discard pixels outside unit circle
    float dist = length(v_uv);
    if (dist > 1.0) discard;

    // Smooth edge anti-aliasing
    float alpha = 1.0 - smoothstep(0.95, 1.0, dist);

    // Temperature to color using logarithmic scale
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
`

// Maximum entities we can render (pre-allocated buffer size)
const MAX_INSTANCES = 100000

// Instance data stride: x, y, z, size, temperature (5 floats per instance)
const INSTANCE_STRIDE = 5

/**
 * Factory to create a WebGL-based 3D planet renderer.
 * Uses instanced rendering with perspective projection and billboarded sprites.
 */
export function createPlanetRendererWebGL(canvas: HTMLCanvasElement): System {
    // Initialize WebGL 2 context
    const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
        depth: true
    })

    if (!gl) {
        throw new Error('WebGL 2 not supported')
    }

    // Compile shaders
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)

    // Link program
    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('Shader program link failed: ' + gl.getProgramInfoLog(program))
    }

    // Get attribute and uniform locations
    const attribs = {
        vertex: gl.getAttribLocation(program, 'a_vertex'),
        position: gl.getAttribLocation(program, 'a_position'),
        size: gl.getAttribLocation(program, 'a_size'),
        temperature: gl.getAttribLocation(program, 'a_temperature')
    }

    const uniforms = {
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        viewMatrix: gl.getUniformLocation(program, 'u_viewMatrix'),
        projMatrix: gl.getUniformLocation(program, 'u_projMatrix'),
        cameraRight: gl.getUniformLocation(program, 'u_cameraRight'),
        cameraUp: gl.getUniformLocation(program, 'u_cameraUp'),
        minPixelSize: gl.getUniformLocation(program, 'u_minPixelSize')
    }

    // Create VAO
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)

    // Create unit quad geometry (two triangles forming a square from -1 to 1)
    const quadVertices = new Float32Array([
        -1, -1,  // bottom-left
         1, -1,  // bottom-right
         1,  1,  // top-right
        -1, -1,  // bottom-left
         1,  1,  // top-right
        -1,  1   // top-left
    ])

    const quadBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW)

    gl.enableVertexAttribArray(attribs.vertex)
    gl.vertexAttribPointer(attribs.vertex, 2, gl.FLOAT, false, 0, 0)

    // Create instance buffer (position xyz, size, temperature per instance)
    const instanceBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES * INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW)

    // Set up instance attributes with divisor = 1 (per-instance)
    // a_position (vec3): offset 0
    gl.enableVertexAttribArray(attribs.position)
    gl.vertexAttribPointer(attribs.position, 3, gl.FLOAT, false, INSTANCE_STRIDE * 4, 0)
    gl.vertexAttribDivisor(attribs.position, 1)

    // a_size (float): offset 12
    gl.enableVertexAttribArray(attribs.size)
    gl.vertexAttribPointer(attribs.size, 1, gl.FLOAT, false, INSTANCE_STRIDE * 4, 12)
    gl.vertexAttribDivisor(attribs.size, 1)

    // a_temperature (float): offset 16
    gl.enableVertexAttribArray(attribs.temperature)
    gl.vertexAttribPointer(attribs.temperature, 1, gl.FLOAT, false, INSTANCE_STRIDE * 4, 16)
    gl.vertexAttribDivisor(attribs.temperature, 1)

    gl.bindVertexArray(null)

    // Pre-allocate instance data buffer on CPU side
    const instanceData = new Float32Array(MAX_INSTANCES * INSTANCE_STRIDE)

    // Pre-allocate matrix buffers
    const viewMatrix = new Float32Array(16)
    const projMatrix = new Float32Array(16)

    // Enable blending for anti-aliased edges
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // Enable depth testing for proper 3D ordering
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    return {
        name: 'PlanetRendererWebGL',
        phase: 'visual',

        update(world: World, _dt: number): void {
            const { width, height } = canvas

            // Handle canvas resize
            gl.viewport(0, 0, width, height)

            // Get camera
            const cameraEntity = world.querySingle(CameraComponent)
            if (cameraEntity === undefined) return
            const camera = world.getComponent(cameraEntity, CameraComponent)!

            // Calculate camera position from spherical coordinates
            const cosPhi = Math.cos(camera.phi)
            const sinPhi = Math.sin(camera.phi)
            const cosTheta = Math.cos(camera.theta)
            const sinTheta = Math.sin(camera.theta)

            const camX = camera.distance * cosPhi * sinTheta
            const camY = camera.distance * sinPhi
            const camZ = camera.distance * cosPhi * cosTheta

            // Camera looks at origin
            const targetX = 0, targetY = 0, targetZ = 0
            const upX = 0, upY = 1, upZ = 0

            // Calculate camera basis vectors (for billboarding)
            // Forward: camera to target (normalized)
            let fwdX = targetX - camX
            let fwdY = targetY - camY
            let fwdZ = targetZ - camZ
            let fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ)
            fwdX /= fwdLen; fwdY /= fwdLen; fwdZ /= fwdLen

            // Right: up × forward (normalized)
            let rightX = upY * fwdZ - upZ * fwdY
            let rightY = upZ * fwdX - upX * fwdZ
            let rightZ = upX * fwdY - upY * fwdX
            let rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ)
            rightX /= rightLen; rightY /= rightLen; rightZ /= rightLen

            // Actual up: forward × right
            const actualUpX = fwdY * rightZ - fwdZ * rightY
            const actualUpY = fwdZ * rightX - fwdX * rightZ
            const actualUpZ = fwdX * rightY - fwdY * rightX

            // Build view matrix (lookAt)
            viewMatrix[0] = rightX
            viewMatrix[1] = actualUpX
            viewMatrix[2] = -fwdX
            viewMatrix[3] = 0
            viewMatrix[4] = rightY
            viewMatrix[5] = actualUpY
            viewMatrix[6] = -fwdY
            viewMatrix[7] = 0
            viewMatrix[8] = rightZ
            viewMatrix[9] = actualUpZ
            viewMatrix[10] = -fwdZ
            viewMatrix[11] = 0
            viewMatrix[12] = -(rightX * camX + rightY * camY + rightZ * camZ)
            viewMatrix[13] = -(actualUpX * camX + actualUpY * camY + actualUpZ * camZ)
            viewMatrix[14] = -(-fwdX * camX + -fwdY * camY + -fwdZ * camZ)
            viewMatrix[15] = 1

            // Build perspective projection matrix
            const fov = Math.PI / 4 / camera.zoom  // Adjust FOV based on zoom
            const aspect = width / height
            const near = camera.distance * 0.01
            const far = camera.distance * 10

            const f = 1.0 / Math.tan(fov / 2)
            const rangeInv = 1.0 / (near - far)

            projMatrix[0] = f / aspect
            projMatrix[1] = 0
            projMatrix[2] = 0
            projMatrix[3] = 0
            projMatrix[4] = 0
            projMatrix[5] = f
            projMatrix[6] = 0
            projMatrix[7] = 0
            projMatrix[8] = 0
            projMatrix[9] = 0
            projMatrix[10] = (far + near) * rangeInv
            projMatrix[11] = -1
            projMatrix[12] = 0
            projMatrix[13] = 0
            projMatrix[14] = 2 * far * near * rangeInv
            projMatrix[15] = 0

            // Get renderable planets
            const planets = world.query(Position, Size, Temperature)
            const planetCount = Math.min(planets.length, MAX_INSTANCES)

            // Build instance data buffer
            let offset = 0
            for (let i = 0; i < planetCount; i++) {
                const id = planets[i]
                const pos = world.getComponent(id, Position)!
                const size = world.getComponent(id, Size)!
                const temp = world.getComponent(id, Temperature)!

                instanceData[offset++] = pos.x
                instanceData[offset++] = pos.y
                instanceData[offset++] = pos.z
                instanceData[offset++] = size
                instanceData[offset++] = temp
            }

            // Upload instance data to GPU
            gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, offset))

            // Clear screen and depth buffer
            gl.clearColor(0, 0, 0, 1)
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

            // Set up shader program
            gl.useProgram(program)
            gl.bindVertexArray(vao)

            // Set uniforms
            gl.uniform2f(uniforms.resolution, width, height)
            gl.uniformMatrix4fv(uniforms.viewMatrix, false, viewMatrix)
            gl.uniformMatrix4fv(uniforms.projMatrix, false, projMatrix)
            gl.uniform3f(uniforms.cameraRight, rightX, rightY, rightZ)
            gl.uniform3f(uniforms.cameraUp, actualUpX, actualUpY, actualUpZ)
            gl.uniform1f(uniforms.minPixelSize, 1.0)  // Minimum 1 pixel size

            // Draw all instances with a single draw call
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, planetCount)

            gl.bindVertexArray(null)
        }
    }
}

/**
 * Compile a WebGL shader from source.
 */
function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`Shader compile error: ${info}`)
    }

    return shader
}

/**
 * Check if WebGL 2 is available in the current browser.
 */
export function isWebGL2Available(): boolean {
    try {
        const canvas = document.createElement('canvas')
        return !!canvas.getContext('webgl2')
    } catch {
        return false
    }
}
