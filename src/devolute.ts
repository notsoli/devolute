import { Uniform } from './uniform.js'
import type { UniformDescriptor } from './uniform.js'

class Pass {
    ctx: GPUCanvasContext
    renderPipeline: GPURenderPipeline
    vertexBuffer: GPUBuffer
    uniforms: {[x: string]: Uniform}
    customBindGroup: GPUBindGroup | null

    constructor(ctx: GPUCanvasContext, renderPipeline: GPURenderPipeline,
                vertexBuffer: GPUBuffer, uniforms: {[x: string]: Uniform} = {},
                customBindGroup: GPUBindGroup | null = null) {
        this.ctx = ctx
        this.renderPipeline = renderPipeline
        this.vertexBuffer = vertexBuffer
        this.uniforms = uniforms
        this.customBindGroup = customBindGroup
    }
}

export let device: GPUDevice
let update: () => void
let defaultBindGroupLayout: GPUBindGroupLayout
let pipelineLayout: GPUPipelineLayout
let bindGroup: GPUBindGroup

let passes: Pass[] = [], globalUniforms: {[x: string]: Uniform} = {}
let running = false

interface GlobalConfig {
    uniforms: {
        [x: string]: UniformDescriptor
    }
}

type UniformValueSet<T extends {[x: string]: UniformDescriptor}> = {
    [P in keyof T]: T[P]["value"]
}

export async function init<T extends GlobalConfig>(config: T): Promise<UniformValueSet<T["uniforms"]>> {
    if (device != undefined) device.destroy()

    passes = []
    globalUniforms = {}

    const valueSet: UniformValueSet<T["uniforms"]> = <UniformValueSet<T["uniforms"]>> {}

    // [P in keyof T["uniforms"]]: T["uniforms"][P]["value"]

    if (!navigator.gpu) { throw Error("WebGPU not supported.") }
    
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) { throw Error("Couldn't request WebGPU adapter.") }

    device = await adapter.requestDevice()

    const bindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = []
    const bindGroupEntries: GPUBindGroupEntry[] = []
    Object.entries(config.uniforms).forEach((entry, index) => {
        const name = entry[0]
        const descriptor = entry[1]

        bindGroupLayoutEntries[index] = {
            binding: index,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' }
        }

        const newUniform = Uniform.create("global", index, descriptor)
        bindGroupEntries[index] = { binding: index, resource: { buffer: newUniform.buffer }}
        globalUniforms[name] = newUniform

        // let value: UniformValue<typeof descriptor> = (typeof descriptor.size === "number") ? 
        //     Array.apply(null, Array(descriptor.size)).map(() => { return 0 }) : descriptor.value

        valueSet[name as keyof T["uniforms"]] = newUniform.value
    })

    defaultBindGroupLayout = device.createBindGroupLayout({
        entries: bindGroupLayoutEntries })
    pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [ defaultBindGroupLayout ] })

    bindGroup = device.createBindGroup({
        layout: defaultBindGroupLayout,
        entries: bindGroupEntries
    })

    return new Proxy(valueSet, { set: modifyUniform })
}

interface PassConfig {
    canvas: HTMLCanvasElement
    fragment: string
    uniforms: {
        [x: string]: UniformDescriptor
    }
}

export async function createPass<T extends PassConfig>(config: T): Promise<UniformValueSet<T["uniforms"]>> {
    const hasUniforms = (config.uniforms)

    const vertex = `
        @vertex
        fn vertex_main(@location(0) pos : vec2f) ->  @builtin(position) vec4f {
            return vec4f(pos, 0., 1.); 
        }
    `

    const shaderModule = device.createShaderModule({
        code: vertex + config.fragment })

    const ctx = config.canvas.getContext("webgpu")
    if (!ctx) throw 'Failed to get WebGPU context'
    ctx.configure({
        device: device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "premultiplied",
    })

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
            attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x2"}
            ],
            arrayStride: 8,
            stepMode: "vertex",
        },
    ]

    const valueSet: UniformValueSet<T["uniforms"]> = <UniformValueSet<T["uniforms"]>> {}

    let newPipelineLayout = pipelineLayout
    let customBindGroup, uniforms: {[x: string]: Uniform} = {}
    if (hasUniforms) {
        const bindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = [], bindGroupEntries: GPUBindGroupEntry[] = []
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

            valueSet[name as keyof T["uniforms"]] = newUniform.value
        })

        const bindGroupLayout = device.createBindGroupLayout({
            entries: bindGroupLayoutEntries })
        newPipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [ defaultBindGroupLayout, bindGroupLayout ] })

        const newBindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: bindGroupEntries
        })
        customBindGroup = newBindGroup
    }

    // configure rendering pipeline
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

    let passProxy = valueSet, pass: Pass
    if (hasUniforms) {
        pass = new Pass(ctx, renderPipeline, vertexBuffer, uniforms, customBindGroup)
        passProxy = new Proxy(valueSet, { set: createLocalUniformModifier(pass) })
    } else {
        pass = new Pass(ctx, renderPipeline, vertexBuffer)
    }

    passes.push(pass)
    return passProxy
}

export async function run(_update: () => void) {
    update = _update

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

    if (!running) {
        requestAnimationFrame(render)
        running = true
    }
}

function render() {
    passes.forEach((pass) => {
        const commandEncoder = device.createCommandEncoder()

        // background color
        const clearColor = { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }

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

        passEncoder.draw(6)
        passEncoder.end()
        device.queue.submit([commandEncoder.finish()])
    })

    update()
    requestAnimationFrame(render)
}

function modifyUniform(target: UniformValueSet<any>, key: string, value: number | number[]) {
    const uniform = globalUniforms[key]
    uniform.set(value)
    device.queue.writeBuffer(uniform.buffer, 0, uniform.array)

    target[key] = value
    return true
}

function createLocalUniformModifier(pass: Pass) {
    // creates a closure with the pass as context so the uniform
    // modifier function knows what pass the uniform is linked to
    return function(target: UniformValueSet<any>, key: string, value: number | number[]) {
        const targetUniform = pass.uniforms[key]

        targetUniform.set(value)
        device.queue.writeBuffer(targetUniform.buffer, 0, targetUniform.array)

        target[key] = value
        return true
    }
}

export function clearPasses() {
    passes = []
}