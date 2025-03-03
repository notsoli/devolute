import * as Devolute from '../../src/index.js'

window.onload = async () => {
    const c1 = document.querySelector("#c1") as HTMLCanvasElement
    c1.width = window.innerWidth / 2
    c1.height = window.innerWidth / 2

    const c1_frag = `
        @group(1) @binding(0) var<uniform> res: vec2f;
        @group(0) @binding(0) var<uniform> frame: f32;
        @fragment
        fn fragment_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
            let position = pos.xy / res;
            let size_val = min(res.x / 1000., 1.);
            let size = vec4(vec3(size_val), 1.);
            return vec4(position.x, position.y, 0.5 + sin(frame / 25.) / 2, 1.) * size;
        }
    `

    const c2 = document.querySelector("#c2") as HTMLCanvasElement
    c2.width = window.innerWidth / 1.5
    c2.height = window.innerWidth / 1.5

    const c2_frag = `
        @group(1) @binding(0) var<uniform> res: vec2f;
        @group(0) @binding(0) var<uniform> frame: f32;
        @fragment
        fn fragment_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
            let position = pos.xy / res;
            let size_val = min(res.x / 1000., 1.);
            let size = vec4(vec3(size_val), 1.);
            return vec4(0.5 - sin(frame / 25.) / 2, position.x, position.y, 1.) * size;
         }
    `

    const c3 = document.querySelector("#c3") as HTMLCanvasElement
    c3.width = window.innerWidth
    c3.height = window.innerWidth

    const c3_frag = `
        @group(1) @binding(0) var<uniform> res: vec2f;
        @group(0) @binding(0) var<uniform> frame: f32;
        @fragment
        fn fragment_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
            let position = pos.xy / res;
            let size_val = min(res.x / 1000., 1.);
            let size = vec4(vec3(size_val), 1.);
            return vec4(position.x, 0.5 - sin(frame / 25.) / 2, position.y, 1.) * size;
         }
    `

    const data = await Devolute.init({
        uniforms: {
            frame: { type: "f32", value: 0 },
        }
    })

    const p1 = await Devolute.createPass({ canvas: c1, fragment: c1_frag,
        uniforms: {
            res: { type: "vec2f", value: [ window.innerHeight/2, window.innerHeight/2 ] }
        }
    })

    const p2 = await Devolute.createPass({ canvas: c2, fragment: c2_frag,
        uniforms: {
            res: { type: "vec2f", value: [ window.innerHeight/1.5, window.innerHeight/1.5 ] }
        }
    })
    
    const p3 = await Devolute.createPass({ canvas: c3, fragment: c3_frag,
        uniforms: {
            res: { type: "vec2f", value: [ window.innerHeight, window.innerHeight ] }
        }
    })

    Devolute.run(() => {
        data.frame++
    })

    window.onresize = () => {
        p1.res = [ window.innerWidth/2, window.innerWidth/2 ]
        c1.width = window.innerWidth/2
        c1.height = window.innerWidth/2

        p2.res = [ window.innerWidth/1.5, window.innerWidth/1.5 ]
        c2.width = window.innerWidth/1.5
        c2.height = window.innerWidth/1.5

        p3.res = [ window.innerWidth, window.innerWidth ]
        c3.width = window.innerWidth
        c3.height = window.innerWidth
    }
}