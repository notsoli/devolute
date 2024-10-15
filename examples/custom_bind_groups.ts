import * as Devolute from '../src/app.js'

window.onload = async () => {
    const c1 = document.querySelector("#c1") as HTMLCanvasElement
    c1.width = window.innerWidth / 2
    c1.height = window.innerHeight / 2

    const c1_frag = `
        @group(1) @binding(0) var<uniform> res: vec2f;
        @group(0) @binding(0) var<uniform> frame: f32;
        @fragment
        fn fragment_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
            let position = pos.xy / res;
            return vec4(position.x, position.y, 0.5 + sin(frame / 25.) / 2, 1.);
        }
    `

    const c2 = document.querySelector("#c2") as HTMLCanvasElement
    c2.width = window.innerWidth / 1.5
    c2.height = window.innerHeight / 1.5

    const c2_frag = `
        @group(1) @binding(0) var<uniform> res: vec2f;
        @group(0) @binding(0) var<uniform> frame: f32;
        @fragment
        fn fragment_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
            let position = pos.xy / res;
            return vec4(0.5 - sin(frame / 25.) / 2, position.x, position.y, 1.);
         }
    `

    const c3 = document.querySelector("#c3") as HTMLCanvasElement
    c3.width = window.innerWidth
    c3.height = window.innerHeight

    const c3_frag = `
        @group(1) @binding(0) var<uniform> res: vec2f;
        @group(0) @binding(0) var<uniform> frame: f32;
        @fragment
        fn fragment_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
            let position = pos.xy / res;
            return vec4(position.x, 0.5 - sin(frame / 25.) / 2, position.y, 1.);
         }
    `

    const data = await Devolute.init({
        uniforms: {
            frame: { type: "i32", value: 0 },
        }
    })

    const p1 = await Devolute.createPass({ canvas: c1, fragment: c1_frag,
        uniforms: { res: { type: "i32", value: [ window.innerWidth/2, window.innerHeight/2 ] } } })
    const p2 = await Devolute.createPass({ canvas: c2, fragment: c2_frag,
        uniforms: { res: { type: "i32", value: [ window.innerWidth/1.5, window.innerHeight/1.5 ] } } })
    const p3 = await Devolute.createPass({ canvas: c3, fragment: c3_frag,
        uniforms: { res: { type: "i32", value: [ window.innerWidth, window.innerHeight ] } } })

    Devolute.run(() => {
        data.frame++
    })

    window.onresize = () => {
        p1.res = [ window.innerWidth/2, window.innerHeight/2 ]
        c1.width = window.innerWidth/2
        c1.height = window.innerHeight/2

        p2.res = [ window.innerWidth/1.5, window.innerHeight/1.5 ]
        c2.width = window.innerWidth/1.5
        c2.height = window.innerHeight/1.5

        p3.res = [ window.innerWidth, window.innerHeight ]
        c3.width = window.innerWidth
        c3.height = window.innerHeight
    }
}