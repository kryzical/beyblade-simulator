export const vsc = "attribute vec2 vpos;" +
    "void main() {" +
    "gl_Position = vec4(vpos, 0.0, 1.0);" +
    "}";

export const fsc = "precision lowp float;" +
    "uniform vec4 vcolor;" +
    "void main() {" +
    "gl_FragColor = vcolor;" +
    "}";

export const magenta_color = [1, 0, 1];
export const yellow_color = [1, 1, 0];
export const cyan_color = [0, 1, 1];

export let gl = null;
export let gl_prog = null;
export let unif_vcolor = null;
export let defaultBuffer = null;
export let attr_vpos = null;
export const N_DIM = 2;

export function create_shader_program() {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vs, vsc);
    gl.shaderSource(fs, fsc);
    gl.compileShader(vs);
    gl.compileShader(fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return prog;
}

export function init_gl(canvasId = "webgl_canvas") {
    const canvas = document.getElementById(canvasId);
    gl = canvas.getContext("webgl");
    gl_prog = create_shader_program();
    gl.useProgram(gl_prog);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    defaultBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, defaultBuffer);
    attr_vpos = gl.getAttribLocation(gl_prog, "vpos");
    gl.vertexAttribPointer(attr_vpos, N_DIM, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(attr_vpos);

    unif_vcolor = gl.getUniformLocation(gl_prog, "vcolor");
    gl.viewport(0, 0, canvas.width, canvas.height);
    return true;
}
