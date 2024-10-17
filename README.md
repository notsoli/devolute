# Devolute
A tiny WebGPU abstraction for creating fragment shader passes with independent and shared uniforms, written entirely in TypeScript.

## Installation
Install Devolute as a project dependency using `npm i devolute --save`

## Usage

Initialize Devolute with global uniforms, each containing a uniform type and an initial value. Supported types are `i32` and its vector forms (`vec2i`, `vec3i`, `vec4i`) and `f32` and its vector forms (`vec2f`, `vec3f`, `vec4f`).
```ts
const data = await Devolute.init({
    uniforms: {
        frame: { type: "f32", value: 0 },
    }
})
```

Create shader passes with a specified canvas, fragment shader, and local uniforms.
```ts
const can = document.querySelector("#c3") as HTMLCanvasElement
can.width = window.innerWidth
can.height = window.innerHeight

const frag = `
    @group(1) @binding(0) var<uniform> res: vec2f;
    @group(0) @binding(0) var<uniform> frame: f32;
    @fragment
    fn fragment_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
        let position = pos.xy / res;
        return vec4(position.x, 0.5 - sin(frame / 25.) / 2, position.y, 1.);
    }
`

const pass = await Devolute.createPass({
    canvas: can,
    fragment: frag,
    uniforms: {
        res: { type: "vec2f", value: [ window.innerWidth, window.innerHeight ] }
    }
})
```

Run the shader, executing code after each frame.
```ts
Devolute.run(() => {
    data.frame++
})
```

Freely manipulate uniform values as if they are regular variables, and see changes be immediately reflected in shader uniforms.
```ts
window.onresize = () => {
    pass.res = [ window.innerWidth, window.innerHeight ]
    can.width = window.innerWidth
    can.height = window.innerHeight
}
```

## Attributions
This library was inspired by [seagulls](https://github.com/charlieroberts/seagulls), which is a great WebGPU framework for working with singular but more complex fragment/compute shader pipelines.