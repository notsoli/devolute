import { Uniform } from './uniform.js'
import type { UniformDescriptor } from './uniform'

/**
 * Represents a single shader pass containing its own uniforms and
 * render pipeline (fragment shader, etc.) to be rendered on a single canvas.
 */
type Pass = {
    ctx: GPUCanvasContext
    renderPipeline: GPURenderPipeline
    vertexBuffer: GPUBuffer
    uniforms: {[x: string]: Uniform}
    customBindGroup?: GPUBindGroup
}

export let device: GPUDevice
let update: () => void
let defaultBindGroupLayout: GPUBindGroupLayout
let pipelineLayout: GPUPipelineLayout
let bindGroup: GPUBindGroup

let passes: Pass[] = [], globalUniforms: {[x: string]: Uniform} = {}
let running = false

/**
 * Stores the global uniforms shared between all passes in the same
 * format as local uniforms.
 */
export type GlobalConfig = {
    uniforms: {
        [x: string]: UniformDescriptor
    }
}

/**
 * Represents the name of a uniform and all of its values, but not
 * its type.
 */
export type UniformValueSet<T extends {[x: string]: UniformDescriptor}> = {
    [P in keyof T]: T[P]["value"]
}

/**
 * Initializes Devolute, allowing for new shader passes to be created.
 * 
 * @param config A `GlobalCongfig` that contains a list of uniforms with
 * their name, type, and initial values, to be shared between all passes.
 * 
 * @returns An object containing the name and values for each global uniform.
 * Directly setting its attributes will cause the respective uniform values
 * to change within each shader pass.
 */
export async function init<T extends GlobalConfig>(config: T): Promise<UniformValueSet<T["uniforms"]>> {
    // destroy the device to prevent problems on re-initialization
    if (device != undefined) device.destroy()

    // reset passes and uniforms
    passes = []
    globalUniforms = {}

    // make sure WebGPU is supported and request a device
    if (!navigator.gpu) { throw Error("WebGPU not supported.") }
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) { throw Error("Couldn't request WebGPU adapter.") }
    device = await adapter.requestDevice()

    // initialize the uniforms object that will be given back to the caller
    const valueSet: UniformValueSet<T["uniforms"]> = <UniformValueSet<T["uniforms"]>> {}

    // prepare lists of bind groups entries, one for each uniform
    const bindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = []
    const bindGroupEntries: GPUBindGroupEntry[] = []

    // iterate over each uniform
    Object.entries(config.uniforms).forEach((entry, index) => {
        const name = entry[0]
        const descriptor = entry[1]

        // make sure the bind group layout knows about our uniform
        bindGroupLayoutEntries[index] = {
            binding: index,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' }
        }

        // create a uniform, add it to the bind group, and add it to our global uniforms
        const newUniform = Uniform.create("global", index, descriptor)
        bindGroupEntries[index] = { binding: index, resource: { buffer: newUniform.buffer }}
        globalUniforms[name] = newUniform

        // add the uniform value to the uniforms object that will be modified
        valueSet[name as keyof T["uniforms"]] = newUniform.value
    })

    // use bind group entries to make a default bind group layout
    defaultBindGroupLayout = device.createBindGroupLayout({
        entries: bindGroupLayoutEntries })

    // use the default bind group layout in our pipeline layout
    pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [ defaultBindGroupLayout ] })

    // finally create a bind group for our global uniforms
    bindGroup = device.createBindGroup({
        layout: defaultBindGroupLayout,
        entries: bindGroupEntries
    })

    // track when uniform values change and make sure they go through
    // a middleman function instead
    return new Proxy(valueSet, { set: modifyUniform })
}

/**
 * Stores the canvas associated with a specific shader pass,
 * its fragment shader, and a list of modifiable uniforms with
 * their name, type, and initial values.
 */
export type PassConfig = {
    canvas: HTMLCanvasElement
    fragment: string
    uniforms: {
        [x: string]: UniformDescriptor
    }
}

/**
 * Creates a new shader pass with a given canvas, fragment shader, and list
 * of uniforms.
 * 
 * @param config A `PassConfig` that contains a canvas to render the
 * shader onto, the shader code, and a list of modifiable uniforms with
 * their name, type, and initial values.
 * 
 * @returns An object containing the name and values for each local uniform.
 * Directly setting its attributes will cause the respective uniform values
 * to change within each shader pass.
 */
export async function createPass<T extends PassConfig>(config: T): Promise<UniformValueSet<T["uniforms"]>> {
    const hasUniforms = (config.uniforms)

    // define a boilerplate vertex shader
    const vertex = `
        @vertex
        fn vertex_main(@location(0) pos : vec2f) ->  @builtin(position) vec4f {
            return vec4f(pos, 0., 1.); 
        }
    `

    // combine the vertex and fragment shaders into a module
    const shaderModule = device.createShaderModule({
        code: vertex + config.fragment })

    // get and configure canvas context
    const ctx = config.canvas.getContext("webgpu")
    if (!ctx) throw 'Failed to get WebGPU context'
    ctx.configure({
        device: device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "premultiplied",
    })

    // create list of vertices that represent the screen
    const verts = new Float32Array([
        -1.0, -1.0,
        1.0, -1.0,
        1.0, 1.0,
        1.0, 1.0,
        -1.0, 1.0,
        -1.0, -1.0
    ])

    // create & configure vertex buffer
    const vertexBuffer = device.createBuffer({
        size: verts.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(vertexBuffer, 0, verts, 0, verts.length)

    const vertexBuffers: GPUVertexBufferLayout[] = [
        {
            attributes: [ { shaderLocation: 0, offset: 0, format: "float32x2"} ],
            arrayStride: 8,
            stepMode: "vertex",
        }
    ]

    // initialize the uniforms object that will be given back to the caller
    const valueSet: UniformValueSet<T["uniforms"]> = <UniformValueSet<T["uniforms"]>> {}

    let newPipelineLayout = pipelineLayout
    let customBindGroup
    let uniforms: {[x: string]: Uniform} = {}

    // set up a bind group for the pass if needed
    if (hasUniforms) {
        const bindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = []
        const bindGroupEntries: GPUBindGroupEntry[] = []

        // iterate over each uniform, creating a uniform and bind group entry
        Object.entries(config.uniforms).forEach((entry, index) => {
            const name = entry[0]
            const descriptor = entry[1]

            const newUniform = Uniform.create("local", index, descriptor)
            bindGroupLayoutEntries[index] = {
                binding: newUniform.index,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }

            uniforms[name] = newUniform
            bindGroupEntries[index] = { binding: newUniform.index, resource: { buffer: newUniform.buffer }}

            // add the uniform value to the uniforms object that will be modified
            valueSet[name as keyof T["uniforms"]] = newUniform.value
        })

        // prepare the bind group layout and pipeline layout
        const bindGroupLayout = device.createBindGroupLayout({
            entries: bindGroupLayoutEntries })
        newPipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [ defaultBindGroupLayout, bindGroupLayout ] })

        // create and store the new bind group
        const newBindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: bindGroupEntries
        })
        customBindGroup = newBindGroup
    }

    // configure rendering pipeline with our vertex shader, fragment shader,
    // and the format of our vertices
    const vertexState: GPUVertexState = { module: shaderModule, entryPoint: "vertex_main", buffers: vertexBuffers }
    const fragmentState: GPUFragmentState = {
        module: shaderModule, entryPoint: "fragment_main",
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
    }
    const pipelineDescriptor: GPURenderPipelineDescriptor = {
        vertex: vertexState,
        fragment: fragmentState,
        primitive: { topology: "triangle-list" },
        layout: newPipelineLayout
    }
    const renderPipeline = device.createRenderPipeline(pipelineDescriptor)

    // track when uniform values change and make sure they go through
    // a middleman function instead
    let passProxy = valueSet, pass: Pass
    if (hasUniforms) {
        pass = { ctx, renderPipeline, vertexBuffer, uniforms, customBindGroup }
        passProxy = new Proxy(valueSet, { set: createLocalUniformModifier(pass) })
    } else {
        pass = { ctx, renderPipeline, vertexBuffer, uniforms: {} }
    }

    passes.push(pass)
    return passProxy
}

/**
 * Begins running the shader program.
 * 
 * @param _update A function that runs every frame. Use this
 * function to update uniform values dependent on program
 * progress (although uniforms can be updated anywhere).
 */
export async function run(_update: () => void) {
    update = _update

    // write uniform values to buffer
    for (const key in globalUniforms) {
        const uniform = globalUniforms[key]
        device.queue.writeBuffer(uniform.buffer, 0, uniform.array)
    }

    for (const pass of passes) {
        for (const key in pass.uniforms) {
            const uniform = pass.uniforms[key]
            device.queue.writeBuffer(uniform.buffer, 0, uniform.array)
        }
    }

    // start the render loop
    if (!running) {
        requestAnimationFrame(render)
        running = true
    }
}

/**
 * Renders every shader pass and runs the update function before
 * requesting a new frame to be rendered.
 */
function render() {
    // for each pass, render its respective fragment shader
    passes.forEach((pass) => {
        const commandEncoder = device.createCommandEncoder()

        // set background color (black)
        const clearColor = { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }

        // prepare the render pass
        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                clearValue: clearColor,
                loadOp: "clear",
                storeOp: "store",
                view: pass.ctx.getCurrentTexture().createView()
            }
        ]}

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
        passEncoder.setPipeline(pass.renderPipeline)
        passEncoder.setBindGroup(0, bindGroup)
        if (pass.customBindGroup != null) {
            passEncoder.setBindGroup(1, pass.customBindGroup)
        }
        passEncoder.setVertexBuffer(0, pass.vertexBuffer)

        // draw the plane to our screen
        passEncoder.draw(6)
        passEncoder.end()
        device.queue.submit([commandEncoder.finish()])
    })

    // run the update function and start rendering a new frame
    update()
    requestAnimationFrame(render)
}

/**
 * Modifies a global uniform.
 * 
 * @param target The object that was modified
 * @param key The key of the value that was modified
 * @param value The new value
 * @returns true
 */
function modifyUniform(target: UniformValueSet<any>, key: string, value: number | number[]) {
    const uniform = globalUniforms[key]
    uniform.set(value)
    device.queue.writeBuffer(uniform.buffer, 0, uniform.array)

    target[key] = value
    return true
}

/**
 * Creates a uniform modifier with its associated pass as context,
 * so the uniform modifier function knows what pass the uniform is
 * linked to.
 * 
 * @param pass The pass associated with the uniform
 * @returns A function that modifies a local uniform, much like
 * `modifyUniform`
 */
function createLocalUniformModifier(pass: Pass) {
    return function(target: UniformValueSet<any>, key: string, value: number | number[]) {
        const targetUniform = pass.uniforms[key]

        targetUniform.set(value)
        device.queue.writeBuffer(targetUniform.buffer, 0, targetUniform.array)

        target[key] = value
        return true
    }
}

/**
 * Clears the current set of shader passes.
 */
export function clearPasses() {
    passes = []
}

/**
 * Removes a specific shader pass from the current set of shader passes.
 * 
 * @param pass The pass to be removed
 */
export function removePass(pass: Pass) {
    passes = passes.filter(p => p !== pass)
}