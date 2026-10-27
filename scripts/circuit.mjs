// Generates the circuit-board background.
//
//   src/assets/circuit/board.svg    the artwork, one tile that wraps in both directions
//   public/circuit/paths.json       trace geometry for the pulse animation
//
// Run with `npm run circuit`. Output is deterministic for a given SEED.
//
// Pipeline: place parts on a routing grid, build a netlist between their pins,
// route each net with A* under clearance rules, then fall back to short escapes
// into vias for anything that could not be routed. Every trace starts and ends
// on a pin, a pad or a via.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEED = 2718;
const P = 8; // routing grid pitch in px
const W = 2400;
const H = 2400;
const C = W / P;
const R = H / P;
const INK = "rgba(3,6,11,0.5)";
const SHEEN = "rgba(238,242,247,0.03)";
const TURN_COST = 6;
const CHAMFER = 3;

// ---------------------------------------------------------------- random

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
const shuffle = (list) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

// ---------------------------------------------------------------- grid

const mod = (v, m) => ((v % m) + m) % m;
const wrapDelta = (d, m) => mod(d + m / 2, m) - m / 2;
const at = (x, y) => mod(y, R) * C + mod(x, C);

const FREE = 0;
const BLOCK = -1;
const grid = new Int32Array(C * R);
// Corridors kept clear of parts so a long trace can fold into a serpentine.
const lane = new Uint8Array(C * R);
// Which pin a cell belongs to before any trace claims it (the pin's escape corridor).
const reserve = new Int32Array(C * R);
// Routed trace occupying a cell, as index + 1 into `routes`.
const traceOf = new Int32Array(C * R);
let lastId = 0;
const newId = () => ++lastId;

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const dirIndex = ([dx, dy]) => DIRS.findIndex(([x, y]) => x === dx && y === dy);
const perpendiculars = ([dx, dy]) => [
  [dy, dx],
  [-dy, -dx],
];

function areaIs(x0, y0, w, h, margin) {
  for (let y = y0 - margin; y < y0 + h + margin; y++)
    for (let x = x0 - margin; x < x0 + w + margin; x++) {
      const cell = at(x, y);
      if (grid[cell] !== FREE || lane[cell]) return false;
    }
  return true;
}

function fillArea(x0, y0, w, h, value) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) grid[at(x, y)] = value;
}

// A cell can carry a trace of `ids` if it is free (or already theirs) and none of
// its eight neighbours belongs to anything else. That keeps one empty cell
// between unrelated copper and away from component bodies.
function passable(x, y, a, b = a) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const v = grid[at(x + dx, y + dy)];
      if (v !== FREE && v !== a && v !== b) return false;
    }
  return true;
}

// Smooth density field that wraps with the tile: clusters and quiet areas.
const waves = Array.from({ length: 6 }, () => ({
  k: int(1, 3) * (chance(0.5) ? 1 : -1),
  l: int(-3, 3),
  phase: rand() * Math.PI * 2,
  amp: 0.4 + rand(),
}));
const waveTotal = waves.reduce((sum, w) => sum + w.amp, 0);
function density(x, y) {
  let s = 0;
  for (const w of waves) s += w.amp * Math.sin(2 * Math.PI * ((w.k * x) / C + (w.l * y) / R) + w.phase);
  const raw = Math.min(1, Math.max(0, 0.5 + (1.5 * s) / waveTotal));
  return 0.68 + 0.32 * raw;
}

// ---------------------------------------------------------------- parts

const chips = [];
const parts = [];
const holes = [];
const vias = [];
const traces = [];

// A pin owns its cell and the cell in front of each exit direction, so later
// traces cannot box it in before it gets routed.
function makePin(x, y, dirs, comp, shape = "pad") {
  const pin = { x, y, dirs, comp, shape, id: newId(), used: false, escapes: [] };
  pin.origId = pin.id;
  grid[at(x, y)] = pin.id;
  for (const [dx, dy] of dirs)
    for (let k = 1; k <= 2; k++) {
      const cell = at(x + dx * k, y + dy * k);
      if (grid[cell] !== FREE) break;
      grid[cell] = reserve[cell] = pin.id;
      pin.escapes.push(cell);
    }
  return pin;
}

const SIDE_NORMAL = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

// Odd body size. Pins are placed every other cell, so a longer side gets more pins.
function chipSpan(kind) {
  if (kind === "narrow") return int(2, 3) * 2 + 1;
  const roll = rand();
  if (kind !== "large" && roll < 0.4) return int(2, 3) * 2 + 1;
  if (kind !== "large" && roll < 0.72) return int(4, 8) * 2 + 1;
  return int(9, 14) * 2 + 1;
}

function placeChip(x0, y0, kind = "mix") {
  const quad = chance(0.42);
  let w;
  let h;
  if (quad) {
    w = chipSpan(kind);
    h = chance(0.55) ? w : chipSpan(kind);
  } else if (chance(0.5)) {
    w = chipSpan("narrow");
    h = Math.max(chipSpan(kind), w + 4);
  } else {
    h = chipSpan("narrow");
    w = Math.max(chipSpan(kind), h + 4);
  }
  if (!areaIs(x0 - 1, y0 - 1, w + 2, h + 2, 3)) return null;
  fillArea(x0, y0, w, h, BLOCK);
  const chip = { x0, y0, w, h, sides: {}, label: `U${chips.length + 1}` };
  const sides = quad ? ["N", "S", "W", "E"] : w < h ? ["W", "E"] : ["N", "S"];
  for (const side of sides) {
    const d = SIDE_NORMAL[side];
    const list = [];
    if (side === "N" || side === "S") {
      const y = side === "N" ? y0 - 1 : y0 + h;
      for (let x = x0 + 1; x < x0 + w - 1; x += 2) list.push(makePin(x, y, [d], chip));
    } else {
      const x = side === "W" ? x0 - 1 : x0 + w;
      for (let y = y0 + 1; y < y0 + h - 1; y += 2) list.push(makePin(x, y, [d], chip));
    }
    chip.sides[side] = list;
  }
  chips.push(chip);
  return chip;
}

function placePassive(x0, y0, horizontal) {
  const w = horizontal ? 3 : 1;
  const h = horizontal ? 1 : 3;
  if (!areaIs(horizontal ? x0 - 2 : x0, horizontal ? y0 : y0 - 2, horizontal ? 7 : 1, horizontal ? 1 : 7, 2)) return null;
  const part = { type: "passive", x0, y0, horizontal };
  grid[at(horizontal ? x0 + 1 : x0, horizontal ? y0 : y0 + 1)] = BLOCK;
  part.a = makePin(x0, y0, [horizontal ? [-1, 0] : [0, -1]], part);
  part.b = makePin(horizontal ? x0 + 2 : x0, horizontal ? y0 : y0 + 2, [horizontal ? [1, 0] : [0, 1]], part);
  parts.push(part);
  return part;
}

function placeHeader(x0, y0, count, horizontal) {
  const len = count * 2 - 1;
  const w = horizontal ? len : 1;
  const h = horizontal ? 1 : len;
  if (!areaIs(horizontal ? x0 : x0 - 2, horizontal ? y0 - 2 : y0, horizontal ? w : 5, horizontal ? 5 : h, 3)) return null;
  const part = { type: "header", x0, y0, horizontal, pins: [] };
  const dirs = horizontal
    ? [
        [0, -1],
        [0, 1],
      ]
    : [
        [-1, 0],
        [1, 0],
      ];
  for (let i = 0; i < count; i++) {
    const x = horizontal ? x0 + i * 2 : x0;
    const y = horizontal ? y0 : y0 + i * 2;
    part.pins.push(makePin(x, y, dirs, part, i === 0 ? "square" : "ring"));
  }
  parts.push(part);
  return part;
}

function placeCrystal(x0, y0, horizontal) {
  const w = horizontal ? 6 : 3;
  const h = horizontal ? 3 : 6;
  if (!areaIs(horizontal ? x0 - 2 : x0, horizontal ? y0 : y0 - 2, horizontal ? 10 : 3, horizontal ? 3 : 10, 2)) return null;
  const part = { type: "crystal", x0, y0, horizontal };
  if (horizontal) {
    fillArea(x0 + 1, y0, 4, 3, BLOCK);
    part.a = makePin(x0, y0 + 1, [[-1, 0]], part);
    part.b = makePin(x0 + 5, y0 + 1, [[1, 0]], part);
  } else {
    fillArea(x0, y0 + 1, 3, 4, BLOCK);
    part.a = makePin(x0 + 1, y0, [[0, -1]], part);
    part.b = makePin(x0 + 1, y0 + 5, [[0, 1]], part);
  }
  parts.push(part);
  return part;
}

function placeHole(x, y) {
  if (!areaIs(x - 4, y - 4, 9, 9, 1)) return false;
  fillArea(x - 4, y - 4, 9, 9, BLOCK);
  holes.push({ x, y });
  return true;
}

// ---------------------------------------------------------------- netlist

const nets = [];
const viaEscapes = [];

function connect(a, b, priority = 1, keep = false) {
  if (a.used || b.used) return false;
  a.used = b.used = true;
  const dx = wrapDelta(b.x - a.x, C);
  const dy = wrapDelta(b.y - a.y, R);
  nets.push({ a, b, priority, length: Math.abs(dx) + Math.abs(dy), keep });
  return true;
}

function toVia(pin) {
  if (pin.used) return;
  pin.used = true;
  viaEscapes.push(pin);
}

const chipCenter = (chip) => [chip.x0 + chip.w / 2, chip.y0 + chip.h / 2];
const partCenter = (part) =>
  part.type === "header"
    ? [part.x0 + (part.horizontal ? part.pins.length - 1 : 0), part.y0 + (part.horizontal ? 0 : part.pins.length - 1)]
    : [part.x0, part.y0];

function facingSide(sides, v) {
  const len = Math.hypot(v[0], v[1]) || 1;
  let best = null;
  let bestDot = 0.35;
  for (const side of Object.keys(sides)) {
    const n = SIDE_NORMAL[side];
    const dot = (n[0] * v[0] + n[1] * v[1]) / len;
    if (dot > bestDot && sides[side].some((pin) => !pin.used)) {
      bestDot = dot;
      best = side;
    }
  }
  return best;
}

// Pair k pins from each end so that the bundle does not have to cross itself.
function bus(pinsA, centerA, pinsB, centerB, k, priority = 0, keep = false) {
  const v = [wrapDelta(centerB[0] - centerA[0], C), wrapDelta(centerB[1] - centerA[1], R)];
  const perp = [-v[1], v[0]];
  const rel = (pin, origin, offset) => [
    wrapDelta(pin.x - origin[0], C) + offset[0],
    wrapDelta(pin.y - origin[1], R) + offset[1],
  ];
  const freeA = pinsA.filter((pin) => !pin.used);
  const freeB = pinsB.filter((pin) => !pin.used);
  const n = Math.min(k, freeA.length, freeB.length);
  if (n < 1) return;
  const near = (list, origin, offset, target) =>
    list
      .map((pin) => ({ pin, p: rel(pin, origin, offset) }))
      .sort((p, q) => Math.hypot(p.p[0] - target[0], p.p[1] - target[1]) - Math.hypot(q.p[0] - target[0], q.p[1] - target[1]))
      .slice(0, n)
      .sort((p, q) => p.p[0] * perp[0] + p.p[1] * perp[1] - (q.p[0] * perp[0] + q.p[1] * perp[1]));
  const selA = near(freeA, centerA, [0, 0], v);
  const selB = near(freeB, centerB, v, [0, 0]);
  for (let i = 0; i < n; i++) connect(selA[i].pin, selB[i].pin, priority, keep);
}

// ---------------------------------------------------------------- placement

// A few open corridors, claimed before the dense fill. Each one carries a
// single trace down the middle; the sides stay free so it can serpentine.
const lanes = [];
const laneBlock = [];
function tryLane() {
  const horizontal = chance(0.5);
  const dx = horizontal ? 1 : 0;
  const dy = horizontal ? 0 : 1;
  const length = int(72, 140);
  const half = 2;
  const gap = 6;
  const x0 = int(0, C - 1);
  const y0 = int(0, R - 1);
  const cells = [];
  for (let i = 0; i < length; i++) {
    const x = x0 + dx * i;
    const y = y0 + dy * i;
    for (let s = -(half + gap); s <= half + gap; s++) {
      const cell = at(x - dy * s, y + dx * s);
      if (lane[cell] || grid[cell] !== FREE) return false;
      if (Math.abs(s) <= half) cells.push(cell);
    }
  }
  for (const cell of cells) lane[cell] = 1;
  const a = makePin(x0, y0, [[dx, dy]], null, "via");
  const b = makePin(x0 + dx * (length - 1), y0 + dy * (length - 1), [[-dx, -dy]], null, "via");
  connect(a, b, -100000, true);
  const net = nets[nets.length - 1];
  net.serpentine = true;
  lanes.push({ cells, net });
  return true;
}
for (let i = 0; i < 80 && lanes.length < 14; i++) tryLane();

for (let i = 0; i < 40 && holes.length < 2; i++) {
  placeHole(int(0, C - 1), int(0, R - 1));
}

for (let i = 0; i < 120 && chips.length < 10; i++) {
  placeChip(int(0, C - 1), int(0, R - 1), "large");
}
for (let i = 0; i < 8000 && chips.length < 240; i++) {
  placeChip(int(0, C - 1), int(0, R - 1));
}

// Decoupling capacitors beside chip pins: pin -> pad, far pad -> via.
for (const chip of chips) {
  const count = int(2, 4);
  for (let k = 0; k < count; k++) {
    const side = pick(Object.keys(chip.sides));
    const options = chip.sides[side].filter((pin) => !pin.used);
    if (!options.length) continue;
    const pin = pick(options);
    const [dx, dy] = pin.dirs[0];
    const gap = int(3, 5);
    const lateral = chance(0.55) ? 0 : int(-5, 5);
    let part;
    if (dy !== 0) {
      const near = pin.y + dy * gap;
      part = placePassive(pin.x + lateral, dy < 0 ? near - 2 : near, false);
      if (part) {
        connect(pin, dy < 0 ? part.b : part.a);
        toVia(dy < 0 ? part.a : part.b);
      }
    } else {
      const near = pin.x + dx * gap;
      part = placePassive(dx < 0 ? near - 2 : near, pin.y + lateral, true);
      if (part) {
        connect(pin, dx < 0 ? part.b : part.a);
        toVia(dx < 0 ? part.a : part.b);
      }
    }
  }
}

// Crystals on two neighbouring pins.
for (const chip of chips) {
  if (!chance(0.3)) continue;
  const side = pick(Object.keys(chip.sides));
  const list = chip.sides[side];
  const starts = [];
  for (let i = 0; i < list.length - 1; i++) if (!list[i].used && !list[i + 1].used) starts.push(i);
  if (!starts.length) continue;
  const i = pick(starts);
  const [p, q] = [list[i], list[i + 1]];
  const [dx, dy] = p.dirs[0];
  const gap = int(4, 6);
  let part;
  if (dy !== 0) part = placeCrystal(p.x - 2, dy < 0 ? p.y - gap - 2 : p.y + gap, true);
  else part = placeCrystal(dx < 0 ? p.x - gap - 2 : p.x + gap, p.y - 2, false);
  if (part) {
    connect(p, part.a);
    connect(q, part.b);
  }
}

// Headers fill leftover gaps and wire to the nearest chip.
for (let i = 0, placed = 0; i < 900 && placed < 20; i++) {
  const x = int(0, C - 1);
  const y = int(0, R - 1);
  if (placeHeader(x, y, int(4, 8), chance(0.5))) placed++;
}

// Series resistors and pull-ups scattered near chips.
for (const chip of chips) {
  const count = int(2, 5);
  for (let k = 0; k < count; k++) {
    const [cx, cy] = chipCenter(chip);
    const angle = rand() * Math.PI * 2;
    const dist = Math.max(chip.w, chip.h) / 2 + int(4, 8);
    placePassive(Math.round(cx + Math.cos(angle) * dist), Math.round(cy + Math.sin(angle) * dist), chance(0.5));
  }
}

// ---------------------------------------------------------------- nets

const torusDist = (a, b) => Math.hypot(wrapDelta(a[0] - b[0], C), wrapDelta(a[1] - b[1], R));

// Chip to chip buses. A few pairs sit on opposite sides of the tile and are
// routed first, so a trace can cross the open board. The rest stay local.
const paired = new Set();
const spanChips = new Set();
let spanned = 0;
for (const chip of shuffle([...chips])) {
  if (spanned >= 8 || spanChips.has(chip)) continue;
  const cA = chipCenter(chip);
  const far = chips
    .filter((other) => other !== chip && !spanChips.has(other))
    .map((other) => {
      const cB = chipCenter(other);
      const v = [wrapDelta(cB[0] - cA[0], C), wrapDelta(cB[1] - cA[1], R)];
      return { other, cB, v, d: Math.hypot(v[0], v[1]) };
    })
    .filter((item) => item.d >= 100)
    .sort((a, b) => b.d - a.d);
  for (const item of far.slice(0, 6)) {
    const key = [chip.label, item.other.label].sort().join("-");
    if (paired.has(key)) continue;
    const sideA = facingSide(chip.sides, item.v);
    const sideB = facingSide(item.other.sides, [-item.v[0], -item.v[1]]);
    if (!sideA || !sideB) continue;
    paired.add(key);
    spanChips.add(chip);
    spanChips.add(item.other);
    bus(chip.sides[sideA], cA, item.other.sides[sideB], item.cB, 2, -Math.round(item.d), true);
    spanned++;
    break;
  }
}

for (const chip of shuffle([...chips])) {
  const cA = chipCenter(chip);
  const others = chips
    .filter((other) => other !== chip)
    .map((other) => ({ other, d: torusDist(cA, chipCenter(other)) }))
    .filter((item) => item.d <= 110)
    .sort((a, b) => a.d - b.d);
  const picks = [];
  const long = others.filter((item) => item.d >= 36);
  if (long.length && chance(0.72)) picks.push(long[int(0, Math.min(long.length, 5) - 1)]);
  for (const item of others) {
    if (picks.length >= 3) break;
    if (!picks.includes(item)) picks.push(item);
  }
  for (const { other } of picks) {
    const key = [chip.label, other.label].sort().join("-");
    if (paired.has(key)) continue;
    const cB = chipCenter(other);
    const v = [wrapDelta(cB[0] - cA[0], C), wrapDelta(cB[1] - cA[1], R)];
    const sideA = facingSide(chip.sides, v);
    const sideB = facingSide(other.sides, [-v[0], -v[1]]);
    if (!sideA || !sideB) continue;
    paired.add(key);
    bus(chip.sides[sideA], cA, other.sides[sideB], cB, int(3, 6));
  }
}

// Passives in the field: one end to a nearby chip pin, the other to a via or chip.
for (const part of parts) {
  if (part.type !== "passive" || part.a.used || part.b.used) continue;
  const c = [part.x0, part.y0];
  const near = chips
    .map((chip) => ({ chip, d: torusDist(c, chipCenter(chip)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  const [first, second] = near;
  if (!first || first.d > 40) continue;
  const linkTo = (pad, chip) => {
    const v = [wrapDelta(chipCenter(chip)[0] - pad.x, C), wrapDelta(chipCenter(chip)[1] - pad.y, R)];
    const side = facingSide(chip.sides, [-v[0], -v[1]]);
    if (!side) return false;
    bus(chip.sides[side], chipCenter(chip), [pad], [pad.x, pad.y], 1, 2);
    return pad.used;
  };
  const padA = part.a;
  const padB = part.b;
  if (linkTo(padA, first.chip)) {
    if (!(second && second.d < 40 && chance(0.5) && linkTo(padB, second.chip))) toVia(padB);
  }
}

// Headers to the nearest chip.
for (const part of parts) {
  if (part.type !== "header") continue;
  const c = partCenter(part);
  const near = chips.map((chip) => ({ chip, d: torusDist(c, chipCenter(chip)) })).sort((a, b) => a.d - b.d)[0];
  if (!near || near.d > 90) continue;
  const cB = chipCenter(near.chip);
  const v = [wrapDelta(cB[0] - c[0], C), wrapDelta(cB[1] - c[1], R)];
  const side = facingSide(near.chip.sides, [-v[0], -v[1]]);
  if (!side) continue;
  bus(part.pins, c, near.chip.sides[side], cB, part.pins.length);
  for (const pin of part.pins) if (!pin.used && chance(0.6)) toVia(pin);
}

// Fan some of the remaining chip pins out to vias.
for (const chip of chips)
  for (const list of Object.values(chip.sides)) for (const pin of list) if (!pin.used && chance(0.38)) toVia(pin);

// ---------------------------------------------------------------- routing

class Heap {
  constructor() {
    this.keys = [];
    this.prio = [];
  }
  get size() {
    return this.keys.length;
  }
  push(prio, key) {
    const { keys, prio: p } = this;
    let i = keys.length;
    keys.push(key);
    p.push(prio);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (p[parent] <= p[i]) break;
      [keys[parent], keys[i]] = [keys[i], keys[parent]];
      [p[parent], p[i]] = [p[i], p[parent]];
      i = parent;
    }
  }
  pop() {
    const { keys, prio: p } = this;
    const top = keys[0];
    const lastKey = keys.pop();
    const lastPrio = p.pop();
    if (keys.length) {
      keys[0] = lastKey;
      p[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < keys.length && p[l] < p[m]) m = l;
        if (r < keys.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [keys[m], keys[i]] = [keys[i], keys[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}

// Soft cost in front of every pin so traces avoid sealing off a chip's fanout area.
const frontCost = new Float32Array(C * R);
function markFronts() {
  const pins = [
    ...chips.flatMap((chip) => Object.values(chip.sides).flat()),
    ...parts.flatMap((part) => (part.type === "header" ? part.pins : [part.a, part.b])),
  ];
  for (const pin of pins)
    for (const [dx, dy] of pin.dirs)
      for (let k = 3; k <= 8; k++)
        for (let s = -1; s <= 1; s++) frontCost[at(pin.x + dx * k + (dy ? s : 0), pin.y + dy * k + (dx ? s : 0))] += (9 - k) * 0.5;
}

// A* over (cell, heading) so turns can be priced. With `relaxed`, existing
// traces are treated as empty, which is how rip-up finds what is in the way.
function astar(a, b, relaxed = false) {
  const sx = a.x;
  const sy = a.y;
  const tx = sx + wrapDelta(b.x - sx, C);
  const ty = sy + wrapDelta(b.y - sy, R);
  const pad = 30;
  const bx0 = Math.min(sx, tx) - pad;
  const by0 = Math.min(sy, ty) - pad;
  const bw = Math.abs(tx - sx) + pad * 2 + 1;
  const bh = Math.abs(ty - sy) + pad * 2 + 1;
  const size = bw * bh * 4;
  const g = new Float64Array(size).fill(Infinity);
  const prev = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const enc = (x, y, d) => (((y - by0) * bw + (x - bx0)) << 2) | d;
  const heuristic = (x, y) => Math.abs(tx - x) + Math.abs(ty - y);
  const entry = new Set(b.dirs.map(([dx, dy]) => dirIndex([-dx, -dy])));
  const heap = new Heap();
  const open = (x, y) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cell = at(x + dx, y + dy);
        const v = grid[cell];
        if (v === FREE || v === a.id || v === b.id || (relaxed && traceOf[cell])) continue;
        return false;
      }
    return true;
  };

  for (const d of a.dirs) {
    const x = sx + d[0];
    const y = sy + d[1];
    if (!open(x, y)) continue;
    const k = enc(x, y, dirIndex(d));
    g[k] = 1;
    prev[k] = -2;
    heap.push(1 + heuristic(x, y), k);
  }

  let found = -1;
  let expansions = 0;
  while (heap.size && expansions++ < 200000) {
    const k = heap.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    const d = k & 3;
    const cell = k >> 2;
    const x = bx0 + (cell % bw);
    const y = by0 + Math.floor(cell / bw);
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue;
      const nx = x + DIRS[nd][0];
      const ny = y + DIRS[nd][1];
      if (nx === tx && ny === ty) {
        if (entry.has(nd)) found = k;
        continue;
      }
      if (nx < bx0 || ny < by0 || nx >= bx0 + bw || ny >= by0 + bh) continue;
      if (!open(nx, ny)) continue;
      const nk = enc(nx, ny, nd);
      if (closed[nk]) continue;
      const cost = g[k] + 1 + (nd !== d ? TURN_COST : 0) + frontCost[at(nx, ny)];
      if (cost < g[nk]) {
        g[nk] = cost;
        prev[nk] = k;
        heap.push(cost + heuristic(nx, ny), nk);
      }
    }
    if (found >= 0) break;
  }
  if (found < 0) return null;

  const cells = [[tx, ty]];
  for (let k = found; k >= 0; k = prev[k]) {
    const cell = k >> 2;
    cells.push([bx0 + (cell % bw), by0 + Math.floor(cell / bw)]);
  }
  cells.push([sx, sy]);
  return cells.reverse();
}

function claim(cells, id) {
  for (const [x, y] of cells) grid[at(x, y)] = id;
}

function merge(from, into) {
  grid[at(from.x, from.y)] = into.id;
  for (const cell of from.escapes) if (grid[cell] === from.id) grid[cell] = into.id;
  from.id = into.id;
}

const routes = [];
const acceptable = (cells, net) => cells && cells.length <= net.length * 2.2 + 24;

function commit(net, cells) {
  const route = { net, cells, active: true };
  routes.push(route);
  for (const [x, y] of cells.slice(1, -1)) {
    const cell = at(x, y);
    grid[cell] = net.a.id;
    traceOf[cell] = routes.length;
  }
  merge(net.b, net.a);
}

function ripUp(route) {
  route.active = false;
  for (const [x, y] of route.cells.slice(1, -1)) {
    const cell = at(x, y);
    grid[cell] = reserve[cell];
    traceOf[cell] = 0;
  }
  const { b } = route.net;
  b.id = b.origId;
  grid[at(b.x, b.y)] = b.origId;
  for (const cell of b.escapes) grid[cell] = b.origId;
}

function tryRoute(net) {
  let cells = astar(net.a, net.b);
  if (!acceptable(cells, net)) {
    const reverse = astar(net.b, net.a);
    if (!acceptable(reverse, net)) return false;
    [net.a, net.b] = [net.b, net.a];
    cells = reverse;
  }
  commit(net, cells);
  return true;
}

function escapeToVia(pin) {
  const plans = [];
  for (const d of pin.dirs) {
    for (let len = 3; len <= 8; len++) plans.push([[d, len]]);
    for (const t of perpendiculars(d))
      for (let l1 = 3; l1 <= 6; l1++) for (let l2 = 2; l2 <= 7; l2++) plans.push([[d, l1], [t, l2]]);
  }
  shuffle(plans);
  if (chance(0.6)) plans.sort((p, q) => p.length - q.length);
  for (const plan of plans) {
    let x = pin.x;
    let y = pin.y;
    const cells = [[x, y]];
    let ok = true;
    for (const [d, len] of plan) {
      for (let i = 0; i < len && ok; i++) {
        x += d[0];
        y += d[1];
        if (!passable(x, y, pin.id)) ok = false;
        else cells.push([x, y]);
      }
      if (!ok) break;
    }
    if (!ok) continue;
    claim(cells.slice(1), pin.id);
    vias.push({ x, y });
    traces.push({ cells, start: pin.shape, end: "via" });
    pin.connected = true;
    return true;
  }
  return false;
}

// Route the corridor traces first, while their sides are still empty, then close
// those sides so later nets route around them instead of through the fold.
markFronts();
for (let i = 0; i < lane.length; i++) if (lane[i]) frontCost[i] = 0;
for (const item of lanes) {
  if (!tryRoute(item.net)) continue;
  item.routed = true;
  vias.push({ x: item.net.a.x, y: item.net.a.y }, { x: item.net.b.x, y: item.net.b.y });
  for (const cell of item.cells) if (grid[cell] === FREE) {
    grid[cell] = BLOCK;
    laneBlock.push(cell);
  }
}

// Route in priority order. When a net is blocked, find what lies on its ideal
// path, rip up a few of those traces, route this net, and queue them again.
nets.sort((p, q) => p.priority - q.priority || p.length - q.length);
const queue = nets.filter((net) => !net.serpentine);
const failed = [];
let ripped = 0;
for (let qi = 0; qi < queue.length; qi++) {
  const net = queue[qi];
  if (tryRoute(net)) continue;
  if ((net.rips ?? 0) < 2 && ripped < 600) {
    const ideal = astar(net.a, net.b, true);
    if (acceptable(ideal, net)) {
      const hit = new Set();
      for (const [x, y] of ideal)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const t = traceOf[at(x + dx, y + dy)];
            if (t) hit.add(t - 1);
          }
      const blockers = [...hit].map((i) => routes[i]).filter((route) => route.active);
      if (blockers.length && blockers.length <= 2 && blockers.every((route) => (route.net.rips ?? 0) < 2 && !route.net.keep)) {
        for (const route of blockers) ripUp(route);
        if (tryRoute(net)) {
          for (const route of blockers) {
            route.net.rips = (route.net.rips ?? 0) + 1;
            queue.push(route.net);
          }
          ripped += blockers.length;
          continue;
        }
        for (const route of blockers) if (!tryRoute(route.net)) failed.push(route.net);
      }
    }
  }
  failed.push(net);
}
for (const net of failed) {
  escapeToVia(net.a);
  escapeToVia(net.b);
}
const live = routes.filter((route) => route.active);

// Open the corridor sides back up. The center trace is already claimed, and
// nothing else was allowed in, so the fold has a clear slot.
for (const cell of laneBlock) if (grid[cell] === BLOCK) grid[cell] = FREE;

// Length-tuning serpentines on long straight runs. Each period is one tight
// up-and-down fold, covering about 80% of that straight run.
function serpentine(x, y, dx, dy, px, py, amp, tooth, periods, id) {
  const path = [[x, y]];
  const seen = new Set([at(x, y)]);
  let cx = x;
  let cy = y;
  const step = (sx, sy, n) => {
    for (let i = 0; i < n; i++) {
      cx += sx;
      cy += sy;
      const cell = at(cx, cy);
      if (seen.has(cell) || !passable(cx, cy, id)) return false;
      seen.add(cell);
      path.push([cx, cy]);
    }
    return true;
  };
  for (let p = 0; p < periods; p++) {
    if (!step(px, py, amp)) return null;
    if (!step(dx, dy, tooth)) return null;
    if (!step(-px, -py, amp * 2)) return null;
    if (!step(dx, dy, tooth)) return null;
    if (!step(px, py, amp)) return null;
  }
  return path;
}

let tuned = 0;
for (const route of live) {
  const id = route.net.a.id;
  const cells = route.cells;
  const next = [cells[0]];
  let used = false;
  for (let i = 1; i < cells.length; ) {
    const dx = Math.sign(cells[i][0] - cells[i - 1][0]);
    const dy = Math.sign(cells[i][1] - cells[i - 1][1]);
    let j = i;
    while (
      j < cells.length &&
      Math.sign(cells[j][0] - cells[j - 1][0]) === dx &&
      Math.sign(cells[j][1] - cells[j - 1][1]) === dy
    )
      j++;
    const run = j - i + 1;
    const tooth = 1;
    const amp = 1;
    const pitch = tooth * 2;
    // About 80% of the straight run, centered, so a longer trace gets a longer squiggle.
    let periods = Math.round((run * 0.8) / pitch);
    while (periods > 1 && periods * pitch > run - 2) periods--;
    const minPeriods = Math.max(8, Math.round((run * 0.65) / pitch));
    let placed = false;
    if (!used && periods >= 8 && (route.net.serpentine || chance(0.72))) {
      const flips = chance(0.5) ? [1, -1] : [-1, 1];
      for (; periods >= minPeriods && !placed; periods -= 2) {
        const span = periods * pitch;
        const lead = Math.floor((run - span) / 2);
        if (lead < 1 || lead + span > run - 1) continue;
        const start = i - 1 + lead;
        const [sx, sy] = cells[start];
        for (const flip of flips) {
          const path = serpentine(sx, sy, dx, dy, -dy * flip, dx * flip, amp, tooth, periods, id);
          if (!path) continue;
          for (let k = i; k <= start; k++) next.push(cells[k]);
          for (const point of path.slice(1)) next.push(point);
          const resume = start + span;
          const keep = new Set(path.map(([x, y]) => at(x, y)));
          for (let k = start + 1; k <= resume; k++) {
            const cell = at(cells[k][0], cells[k][1]);
            if (keep.has(cell)) continue;
            grid[cell] = reserve[cell];
            traceOf[cell] = 0;
          }
          for (const [x, y] of path.slice(1)) grid[at(x, y)] = id;
          for (let k = resume + 1; k < j; k++) next.push(cells[k]);
          placed = true;
          used = true;
          tuned++;
          break;
        }
      }
    }
    if (!placed) for (let k = i; k < j; k++) next.push(cells[k]);
    i = j;
  }
  route.cells = next;
}

for (const { net, cells } of live) {
  traces.push({ cells, start: net.a.shape, end: net.b.shape });
  net.a.connected = net.b.connected = true;
}
const routed = live.length;
const fallback = failed.length;

let escaped = 0;
for (const pin of viaEscapes) if (escapeToVia(pin)) escaped++;

// Two-terminal parts never float: give each open pad a via, and leave out any
// part that still has nothing attached.
for (const part of parts) {
  if (part.type !== "passive" && part.type !== "crystal") continue;
  for (const pad of [part.a, part.b]) if (!pad.connected) escapeToVia(pad);
  part.hidden = !part.a.connected && !part.b.connected;
}

// A few stitching vias. Most vias are the end of a real trace; open copper
// should not be sprinkled with dots that nothing connects to.
let stitched = 0;
for (let i = 0; i < 600 && stitched < 12; i++) {
  const x = int(0, C - 1);
  const y = int(0, R - 1);
  if (!chance(density(x, y) * 0.8)) continue;
  const [dx, dy] = pick(DIRS);
  const count = int(2, 5);
  let ok = true;
  for (let k = 0; k < count && ok; k++) ok = areaIs(x + dx * k * 3, y + dy * k * 3, 1, 1, 2);
  if (!ok) continue;
  for (let k = 0; k < count; k++) {
    grid[at(x + dx * k * 3, y + dy * k * 3)] = newId();
    vias.push({ x: x + dx * k * 3, y: y + dy * k * 3 });
    stitched++;
  }
}

console.log(
  `chips ${chips.length}, parts ${parts.length}, nets ${nets.length} (routed ${routed}, via fallback ${fallback}), escapes ${escaped}/${viaEscapes.length}, stitching vias ${stitched}, serpentines ${tuned}, cross-board buses ${spanned}`,
);

// ---------------------------------------------------------------- render

const num = (v) => String(Math.round(v * 10) / 10);
const layers = { body: [], outline: [], trace: [], pad: [], via: [], ring: [], label: [] };

// Draw a primitive in every tile position it touches so the tile wraps cleanly.
function emit(layer, box, draw) {
  for (const ox of [-W, 0, W])
    for (const oy of [-H, 0, H]) {
      if (box[2] + ox < 0 || box[0] + ox > W || box[3] + oy < 0 || box[1] + oy > H) continue;
      layers[layer].push(draw(ox, oy));
    }
}

const rect = (layer, x, y, w, h) =>
  emit(layer, [x, y, x + w, y + h], (ox, oy) => `M${num(x + ox)} ${num(y + oy)}h${num(w)}v${num(h)}h${num(-w)}z`);
const circle = (layer, x, y, r) =>
  emit(layer, [x - r, y - r, x + r, y + r], (ox, oy) => `<circle cx="${num(x + ox)}" cy="${num(y + oy)}" r="${r}"/>`);
const px = (v) => (v + 0.5) * P;

function shape(cells) {
  const pts = cells.map(([x, y]) => [px(x), px(y)]);
  const corners = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const [cx, cy] = pts[i + 1];
    if (Math.sign(bx - ax) !== Math.sign(cx - bx) || Math.sign(by - ay) !== Math.sign(cy - by)) corners.push(pts[i]);
  }
  corners.push(pts[pts.length - 1]);
  const out = [corners[0]];
  for (let i = 1; i < corners.length - 1; i++) {
    const [ax, ay] = corners[i - 1];
    const [bx, by] = corners[i];
    const [cx, cy] = corners[i + 1];
    out.push([bx - Math.sign(bx - ax) * CHAMFER, by - Math.sign(by - ay) * CHAMFER]);
    out.push([bx + Math.sign(cx - bx) * CHAMFER, by + Math.sign(cy - by) * CHAMFER]);
  }
  out.push(corners[corners.length - 1]);
  return out;
}

const TRIM = { via: 2.6, ring: 3.4, square: 0, pad: 0 };
function trim(points, startKind, endKind) {
  const pts = points.map((p) => [...p]);
  const cut = (i, j, amount) => {
    if (!amount) return;
    const [x, y] = pts[i];
    const [nx, ny] = pts[j];
    const len = Math.hypot(nx - x, ny - y);
    pts[i] = [x + ((nx - x) / len) * amount, y + ((ny - y) / len) * amount];
  };
  cut(0, 1, TRIM[startKind]);
  cut(pts.length - 1, pts.length - 2, TRIM[endKind]);
  return pts;
}

const pulsePaths = [];
for (const trace of traces) {
  const points = shape(trace.cells);
  const drawn = trim(points, trace.start, trace.end);
  const xs = drawn.map((p) => p[0]);
  const ys = drawn.map((p) => p[1]);
  emit("trace", [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], (ox, oy) =>
    drawn.map(([x, y], i) => `${i ? "L" : "M"}${num(x + ox)} ${num(y + oy)}`).join(""),
  );
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  if (length >= 40) pulsePaths.push(points.flatMap(([x, y]) => [Math.round(x), Math.round(y)]));
}

for (const chip of chips) {
  const x = chip.x0 * P + 1;
  const y = chip.y0 * P + 1;
  const w = chip.w * P - 2;
  const h = chip.h * P - 2;
  rect("body", x, y, w, h);
  rect("outline", x, y, w, h);
  circle("ring", x + 6, y + 6, 1.6);
  emit("label", [x, y, x + w, y + h], (ox, oy) => `<text x="${num(x + w / 2 + ox)}" y="${num(y + h / 2 + oy)}">${chip.label}</text>`);
  for (const list of Object.values(chip.sides))
    for (const pin of list) {
      const [dx, dy] = pin.dirs[0];
      const cx = px(pin.x);
      const cy = px(pin.y);
      const reach = P / 2 + 2;
      if (dx === 0) rect("pad", cx - 1.6, dy < 0 ? cy - 2 : cy - reach + 2, 3.2, reach);
      else rect("pad", dx < 0 ? cx - 2 : cx - reach + 2, cy - 1.6, reach, 3.2);
    }
}

for (const part of parts) {
  if (part.hidden) continue;
  if (part.type === "passive") {
    for (const pad of [part.a, part.b]) rect("pad", px(pad.x) - 3, px(pad.y) - 3, 6, 6);
    const mx = part.horizontal ? px(part.x0 + 1) : px(part.x0);
    const my = part.horizontal ? px(part.y0) : px(part.y0 + 1);
    if (part.horizontal) rect("body", mx - 3, my - 2.4, 6, 4.8);
    else rect("body", mx - 2.4, my - 3, 4.8, 6);
  } else if (part.type === "header") {
    for (const pin of part.pins) {
      if (pin.shape === "square") rect("pad", px(pin.x) - 3.6, px(pin.y) - 3.6, 7.2, 7.2);
      else circle("ring", px(pin.x), px(pin.y), 3.4);
    }
  } else if (part.type === "crystal") {
    const x0 = part.horizontal ? (part.x0 + 1) * P - 2 : part.x0 * P + 1;
    const y0 = part.horizontal ? part.y0 * P + 1 : (part.y0 + 1) * P - 2;
    const w = part.horizontal ? 4 * P + 4 : 3 * P - 2;
    const h = part.horizontal ? 3 * P - 2 : 4 * P + 4;
    const r = num(Math.min(w, h) / 2);
    emit("outline", [x0, y0, x0 + w, y0 + h], (ox, oy) =>
      part.horizontal
        ? `M${num(x0 + w / 2 - (w - h) / 2 + ox)} ${num(y0 + oy)}h${num(w - h)}a${r} ${r} 0 0 1 0 ${num(h)}h${num(h - w)}a${r} ${r} 0 0 1 0 ${num(-h)}z`
        : `M${num(x0 + ox)} ${num(y0 + w / 2 + oy)}a${r} ${r} 0 0 1 ${num(w)} 0v${num(h - w)}a${r} ${r} 0 0 1 ${num(-w)} 0z`,
    );
    for (const pad of [part.a, part.b]) rect("pad", px(pad.x) - 3, px(pad.y) - 3.4, 6, 6.8);
  }
}

for (const via of vias) circle("via", px(via.x), px(via.y), 2.6);

for (const hole of holes) {
  const cx = px(hole.x);
  const cy = px(hole.y);
  circle("ring", cx, cy, 13);
  circle("ring", cx, cy, 7);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    circle("via", cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 1.8);
  }
}

const art = [
  `<path d="${layers.body.join("")}" fill="currentColor" fill-opacity="0.3"/>`,
  `<path d="${layers.outline.join("")}" stroke="currentColor" stroke-width="1"/>`,
  `<path d="${layers.trace.join("")}" stroke="currentColor" stroke-width="1.5"/>`,
  `<path d="${layers.pad.join("")}" fill="currentColor"/>`,
  `<g stroke="currentColor" stroke-width="1.3">${layers.via.join("")}</g>`,
  `<g stroke="currentColor" stroke-width="1.5">${layers.ring.join("")}</g>`,
  `<g fill="currentColor" font-family="ui-monospace, Consolas, monospace" font-size="7" letter-spacing="0.6" text-anchor="middle" dominant-baseline="central">${layers.label.join("")}</g>`,
].join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round"><defs><g id="c">${art}</g></defs><g color="${SHEEN}" transform="translate(0 1)"><use href="#c" xlink:href="#c"/></g><g color="${INK}"><use href="#c" xlink:href="#c"/></g></svg>\n`;

const root = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(root + "src/assets/circuit", { recursive: true });
mkdirSync(root + "public/circuit", { recursive: true });
writeFileSync(root + "src/assets/circuit/board.svg", svg);
writeFileSync(root + "public/circuit/paths.json", JSON.stringify({ w: W, h: H, paths: pulsePaths }));
console.log(`board.svg ${(svg.length / 1024).toFixed(0)} KB, ${pulsePaths.length} pulse paths`);
