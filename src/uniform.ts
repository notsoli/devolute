import { device } from './app.js'

export type UniformDescriptor = {
    type: UniformType
    value: number | number[]
}

type UniformType = "f32" | "i32"

export abstract class Uniform {
    scope: "global" | "local"
    index: number
    size: number
    abstract array: Float32Array | Int32Array
    abstract type: UniformType
    value: number | number[]
    buffer: GPUBuffer
    static create(scope: "global" | "local", index: number, descriptor: UniformDescriptor): Uniform {
        // sets the size to the number of values
        const size = (typeof descriptor.value === "number") ? 1 : descriptor.value.length

        switch (descriptor.type) {
            case "f32":
                return new FloatUniform(scope, index, size, descriptor.value)
            case "i32":
                return new IntUniform(scope, index, size, descriptor.value)
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
        this.set(value)

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
    declare type: "f32"
    constructor(scope: "global" | "local", index: number, size: number, value: number | number[]) {
        super(scope, index, size, value)
        this.array = new Float32Array()
    }
}

class IntUniform extends Uniform {
    declare array: Int32Array
    declare type: "i32"
    constructor(scope: "global" | "local", index: number, size: number, value: number | number[]) {
        super(scope, index, size, value)
        this.array = new Int32Array()
    }
}