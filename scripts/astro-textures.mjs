// Ground and cloud maps for the splash planet in LogicPlanet/Planet.tscn.
// FastNoiseLite OpenSimplex2S, then Godot's seamless skirt blend and a constant
// color ramp. Width stays at NoiseTexture2D's default of 512; the scene sets height 256.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import FastNoiseLite from "fastnoise-lite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "assets", "astro");

const WIDTH = 512;
const HEIGHT = 256;
const SKIRT = 0.1;

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function sample(noise, width, height) {
  const values = new Float32Array(width * height);
  let min = Infinity;
  let max = -Infinity;
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = noise.GetNoise(x, y);
      values[i++] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  const bytes = new Uint8Array(width * height);
  const span = max - min || 1;
  for (let n = 0; n < values.length; n++) {
    bytes[n] = Math.max(0, Math.min(255, ((values[n] - min) / span) * 255));
  }
  return bytes;
}

// Quadrant swap plus skirt blend, from Godot's Noise::_generate_seamless_image.
function seamless(src, srcW, srcH, width, height) {
  const skirtW = Math.max(1, Math.trunc(width * SKIRT));
  const skirtH = Math.max(1, Math.trunc(height * SKIRT));
  const halfW = Math.trunc(width * 0.5);
  const halfH = Math.trunc(height * 0.5);
  const edgeX = halfW + skirtW;
  const edgeY = halfH + skirtH;
  const dest = new Uint8Array(width * height);

  const at = (x, y, mode) => {
    const ox = x + halfW;
    const oy = y + halfH;
    let xx;
    let yy;
    if (mode === "xy") {
      xx = ox % width;
      yy = oy % height;
    } else if (mode === "x") {
      xx = ox % width;
      yy = oy % srcH;
    } else if (mode === "y") {
      xx = ox % srcW;
      yy = oy % height;
    } else {
      xx = ox % srcW;
      yy = oy % srcH;
    }
    return src[yy * srcW + xx];
  };
  const blend = (bg, fg, alpha) => ((alpha + 1) * fg + (256 - alpha) * bg) >> 8;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) dest[y * width + x] = at(x, y, "xy");
  }

  for (let x = halfW; x < edgeX; x++) {
    const alpha = 255 * (1 - smoothstep(0.1, 0.9, (x - halfW) / skirtW));
    for (let y = 0; y < height; y++) {
      if (y === halfH) y = edgeY - 1;
      else dest[y * width + x] = blend(dest[y * width + x], at(x, y, "y"), alpha);
    }
  }

  for (let y = halfH; y < edgeY; y++) {
    const alpha = 255 * (1 - smoothstep(0.1, 0.9, (y - halfH) / skirtH));
    for (let x = 0; x < width; x++) {
      if (x === halfW) x = edgeX - 1;
      else dest[y * width + x] = blend(dest[y * width + x], at(x, y, "x"), alpha);
    }
  }

  for (let y = halfH; y < edgeY; y++) {
    const ypos = 255 * (1 - smoothstep(0.1, 0.9, (y - halfH) / skirtH));
    for (let x = halfW; x < edgeX; x++) {
      const xpos = 255 * (1 - smoothstep(0.1, 0.9, (x - halfW) / skirtW));
      const top = blend(at(x, y, "x"), at(x, y, "default"), xpos);
      const bottom = blend(at(x, y, "xy"), at(x, y, "y"), xpos);
      dest[y * width + x] = blend(bottom, top, ypos);
    }
  }
  return dest;
}

function ramp(t, stops) {
  let color = stops[0];
  for (const stop of stops) if (t >= stop.at) color = stop;
  return color;
}

function noiseFor(seed, frequency) {
  const noise = new FastNoiseLite(seed);
  noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2S);
  noise.SetFractalType(FastNoiseLite.FractalType.FBm);
  noise.SetFractalOctaves(4);
  noise.SetFractalLacunarity(2);
  noise.SetFractalGain(0.5);
  noise.SetFrequency(frequency);
  return noise;
}

function bake(seed, frequency, stops) {
  const skirtW = Math.max(1, Math.trunc(WIDTH * SKIRT));
  const skirtH = Math.max(1, Math.trunc(HEIGHT * SKIRT));
  const srcW = WIDTH + skirtW;
  const srcH = HEIGHT + skirtH;
  const src = sample(noiseFor(seed, frequency), srcW, srcH);
  const gray = seamless(src, srcW, srcH, WIDTH, HEIGHT);
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let i = 0; i < gray.length; i++) {
    const color = ramp(gray[i] / 255, stops);
    rgba[i * 4] = color.r;
    rgba[i * 4 + 1] = color.g;
    rgba[i * 4 + 2] = color.b;
    rgba[i * 4 + 3] = color.a;
  }
  return rgba;
}

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ground = bake(11, 0.0065, [
  { at: 0, r: 28, g: 120, b: 219, a: 255 },
  { at: 0.44, r: 61, g: 184, b: 87, a: 255 },
  { at: 0.66, r: 135, g: 219, b: 102, a: 255 },
]);
const clouds = bake(5, 0.019, [
  { at: 0, r: 255, g: 255, b: 255, a: 0 },
  { at: 0.62, r: 255, g: 255, b: 255, a: 255 },
]);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "ground.png"), png(WIDTH, HEIGHT, ground));
writeFileSync(join(outDir, "clouds.png"), png(WIDTH, HEIGHT, clouds));

let cloud = 0;
for (let i = 3; i < clouds.length; i += 4) if (clouds[i] > 127) cloud++;
console.log(`astro textures ${WIDTH}x${HEIGHT}, cloud cover ${(cloud / (WIDTH * HEIGHT)).toFixed(3)}`);
