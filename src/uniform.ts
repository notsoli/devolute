import { device } from './app.js'

export type UniformDescriptor = {
    type: UniformType
    value: number | number[]
}

type FloatTypes = "f32" | "vec2f" | "vec3f" | "vec4f"
type IntTypes = "i32" | "vec2i" | "vec3i" | "vec4i"
type UniformType = FloatTypes | IntTypes

export abstract class Uniform {
    scope: "global" | "local"
    index: number
    size: number
    abstract array: Float32Array | Int32Array
    abstract type: UniformType
    value: number | number[]
    buffer: GPUBuffer
    static create(scope: "global" | "local", index: number, descriptor: UniformDescriptor): Uniform {
        switch (descriptor.type) {
            case "f32":
                return new FloatUniform(scope, index, 1, descriptor.value, "f32")
            case "vec2f":
                return new FloatUniform(scope, index, 2, descriptor.value, "vec2f")
            case "vec3f":
                return new FloatUniform(scope, index, 3, descriptor.value, "vec3f")
            case "vec4f":
                return new FloatUniform(scope, index, 4, descriptor.value, "vec4f")
            case "i32":
                return new IntUniform(scope, index, 1, descriptor.value, "i32")
            case "vec2i":
                return new IntUniform(scope, index, 2, descriptor.value, "vec2i")
            case "vec3i":
                return new IntUniform(scope, index, 3, descriptor.value, "vec3i")
            case "vec4i":
                return new IntUniform(scope, index, 4, descriptor.value, "vec4i")
        }
    }
    set(values: number | number[]) {
        const arrayForm = (typeof values === "number") ? [values] : values
        if (this.size !== arrayForm.length)
            throw `Number of values [${arrayForm.length}] does not align with expected size [${this.size}].`

        this.value = values
        this.array.set(arrayForm)
    }
    constructor(scope: "global" | "local", index: number, size: number, value: number | number[]) {
        this.scope = scope
        this.index = index

        this.size = size
        this.value = value

        this.buffer = device.createBuffer({
            size: this.size * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })
    }
    generateImport(name: string) {
        const group = (this.scope === "global") ? 0 : 1
        return `@group(${group}) @binding(${this.index}) var<uniform> ${name}: ${this.type};\n`
    }
}

class FloatUniform extends Uniform {
    declare array: Float32Array
    declare type: FloatTypes
    constructor(scope: "global" | "local", index: number, size: number, value: number | number[], type: FloatTypes) {
        super(scope, index, size, value)
        this.type = type
        this.array = new Float32Array(size)
        this.set(value)
    }
}

class IntUniform extends Uniform {
    declare array: Int32Array
    declare type: IntTypes
    constructor(scope: "global" | "local", index: number, size: number, value: number | number[], type: IntTypes) {
        super(scope, index, size, value)
        this.array = new Int32Array(size)
        this.type = type
        this.set(value)
    }
}