// The splash planet from LogicPlanet/Planet.tscn, drawn with the same camera,
// light, lean, and ring shader. The globe and clouds spin; the rings stay put.

const SPIN = 0.32;
const LEAN = -0.28;
const LIGHT = normalize([0.5224, 0.53, 0.6682]);

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function linear(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function scaled(rgb, energy) {
  return rgb.map((channel) => linear(channel) * energy);
}

const AMBIENT = scaled([0.6, 0.75, 0.95], 0.85);
const SUN = scaled([1, 0.96, 0.9], 1.9);

const VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
uniform mat4 uMvp;
uniform mat4 uModel;
out vec3 vNormal;
out vec2 vUv;
void main() {
  vUv = aUv;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUv;
uniform sampler2D uMap;
uniform vec3 uLight;
uniform vec3 uAmbient;
uniform vec3 uSun;
uniform vec4 uColor;
uniform float uUseMap;
uniform float uCut;
uniform float uShade;
out vec4 frag;
vec3 toLinear(vec3 c) {
  bvec3 low = lessThanEqual(c, vec3(0.04045));
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  vec3 lo = c / 12.92;
  return mix(hi, lo, vec3(low));
}
vec3 toSrgb(vec3 c) {
  bvec3 low = lessThanEqual(c, vec3(0.0031308));
  vec3 hi = 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055;
  vec3 lo = c * 12.92;
  return mix(hi, lo, vec3(low));
}
void main() {
  vec4 tex = texture(uMap, vUv);
  vec4 albedo = mix(uColor, tex, uUseMap);
  if (albedo.a < uCut) discard;
  float toon = smoothstep(-1.0, 1.0, dot(normalize(vNormal), uLight));
  vec3 lit = toLinear(albedo.rgb) * (uAmbient + uSun * toon);
  frag = vec4(mix(albedo.rgb, toSrgb(lit), uShade), 1.0);
}`;

const RING = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
float band(float at, float from, float to, float edge) {
  return smoothstep(from - edge, from + edge, at) * (1.0 - smoothstep(to - edge, to + edge, at));
}
void main() {
  vec2 at = (vUv - vec2(0.5)) * 2.0;
  float outFromMiddle = length(at);
  float edge = max(fwidth(outFromMiddle), 0.0001);
  float lit = band(outFromMiddle, 0.62, 0.97, edge);
  float division = band(outFromMiddle, 0.74, 0.84, edge);
  vec3 ink = outFromMiddle < 0.79 ? vec3(1.0, 0.85, 0.42) : vec3(1.0, 0.66, 0.36);
  float alpha = lit * (1.0 - division);
  if (alpha <= 0.0) discard;
  frag = vec4(ink, alpha);
}`;

function sphere(stacks, slices) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const phi = v * Math.PI;
    const y = Math.cos(phi);
    const w = Math.sin(phi);
    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const theta = u * Math.PI * 2;
      const x = Math.cos(theta) * w;
      const z = Math.sin(theta) * w;
      positions.push(x, y, z);
      normals.push(x, y, z);
      uvs.push(u, v);
    }
  }
  const row = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { positions, normals, uvs, indices };
}

function plane() {
  return {
    positions: [-2, 0, -2, 2, 0, -2, 2, 0, 2, -2, 0, 2],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 2, 1, 0, 3, 2],
  };
}

function identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function rotY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

function rotZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = identity();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

function scale(amount) {
  const m = identity();
  m[0] = m[5] = m[10] = amount;
  return m;
}

function viewMatrix() {
  const eye = [0, 2, 5.6];
  const right = [1, 0, 0];
  const up = [0, 0.9418, -0.3363];
  const back = [0, 0.3363, 0.9418];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const m = identity();
  m[0] = right[0];
  m[4] = right[1];
  m[8] = right[2];
  m[12] = -dot(right, eye);
  m[1] = up[0];
  m[5] = up[1];
  m[9] = up[2];
  m[13] = -dot(up, eye);
  m[2] = back[0];
  m[6] = back[1];
  m[10] = back[2];
  m[14] = -dot(back, eye);
  return m;
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader");
  }
  return shader;
}

function program(gl, fragment) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.bindAttribLocation(prog, 1, "aNormal");
  gl.bindAttribLocation(prog, 2, "aUv");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || "program");
  }
  return prog;
}

function mesh(gl, data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const put = (loc, size, values) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  put(0, 3, data.positions);
  put(1, 3, data.normals);
  put(2, 2, data.uvs);
  const indices = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: data.indices.length };
}

function texture(gl, image) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  const ext = gl.getExtension("EXT_texture_filter_anisotropic");
  if (ext) {
    const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
  }
  return tex;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(url));
    image.src = url;
  });
}

export function mountAstro(canvas) {
  if (canvas.dataset.ready) return;
  canvas.dataset.ready = "1";
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: false,
  });
  if (!gl) return;

  let globeProg;
  let ringProg;
  try {
    globeProg = program(gl, FRAG);
    ringProg = program(gl, RING);
  } catch (error) {
    console.error(error);
    return;
  }

  const globe = mesh(gl, sphere(20, 40));
  const rings = mesh(gl, plane());
  const view = viewMatrix();
  const lean = rotZ(LEAN);
  const locs = {
    globe: {
      mvp: gl.getUniformLocation(globeProg, "uMvp"),
      model: gl.getUniformLocation(globeProg, "uModel"),
      light: gl.getUniformLocation(globeProg, "uLight"),
      ambient: gl.getUniformLocation(globeProg, "uAmbient"),
      sun: gl.getUniformLocation(globeProg, "uSun"),
      color: gl.getUniformLocation(globeProg, "uColor"),
      useMap: gl.getUniformLocation(globeProg, "uUseMap"),
      cut: gl.getUniformLocation(globeProg, "uCut"),
      shade: gl.getUniformLocation(globeProg, "uShade"),
    },
    ring: { mvp: gl.getUniformLocation(ringProg, "uMvp") },
  };

  let ground = null;
  let clouds = null;
  let turned = 0;
  let last = 0;
  let frame = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const drawMesh = (entry, model, { map, cut, shade, color }) => {
    gl.useProgram(globeProg);
    gl.uniformMatrix4fv(locs.globe.mvp, false, multiply(projection(), multiply(view, model)));
    gl.uniformMatrix4fv(locs.globe.model, false, model);
    gl.uniform3fv(locs.globe.light, LIGHT);
    gl.uniform3fv(locs.globe.ambient, AMBIENT);
    gl.uniform3fv(locs.globe.sun, SUN);
    gl.uniform4fv(locs.globe.color, color);
    gl.uniform1f(locs.globe.useMap, map ? 1 : 0);
    gl.uniform1f(locs.globe.cut, cut);
    gl.uniform1f(locs.globe.shade, shade);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, map || ground);
    gl.bindVertexArray(entry.vao);
    gl.drawElements(gl.TRIANGLES, entry.count, gl.UNSIGNED_SHORT, 0);
  };

  let proj = perspective(Math.PI / 6, 4 / 3, 0.1, 40);
  const projection = () => proj;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelsW = Math.round(width * dpr);
    const pixelsH = Math.round(height * dpr);
    if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
      canvas.width = pixelsW;
      canvas.height = pixelsH;
    }
    proj = perspective(Math.PI / 6, pixelsW / pixelsH, 0.1, 40);
  };

  const draw = () => {
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!ground || !clouds) return;
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const spin = rotY(turned);
    drawMesh(globe, multiply(lean, spin), { map: ground, cut: 0, shade: 1, color: [1, 1, 1, 1] });
    drawMesh(globe, multiply(lean, multiply(spin, scale(1.055))), {
      map: clouds,
      cut: 0.5,
      shade: 1,
      color: [1, 1, 1, 1],
    });
    gl.cullFace(gl.FRONT);
    drawMesh(globe, multiply(lean, scale(1.06)), {
      map: null,
      cut: 0,
      shade: 0,
      color: [0.06, 0.12, 0.2, 1],
    });

    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(ringProg);
    gl.uniformMatrix4fv(locs.ring.mvp, false, multiply(projection(), multiply(view, lean)));
    gl.bindVertexArray(rings.vao);
    gl.drawElements(gl.TRIANGLES, rings.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
  };

  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!reduced && !document.hidden) turned = (turned + dt * SPIN) % (Math.PI * 2);
    draw();
    frame = requestAnimationFrame(tick);
  };

  new ResizeObserver(draw).observe(canvas);
  Promise.all([loadImage(canvas.dataset.ground), loadImage(canvas.dataset.clouds)]).then(([groundImage, cloudImage]) => {
    ground = texture(gl, groundImage);
    clouds = texture(gl, cloudImage);
    last = performance.now();
    frame = requestAnimationFrame(tick);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) last = performance.now();
  });

  return () => cancelAnimationFrame(frame);
}
