// layout.js — Jakarta City map data: roads, medians, zones, places, traffic graph.
// Everything geometric in the game reads from here (world building, minimap, routing).

export const LAND = { x: 780, zMin: -1240, zMax: 1040 };
export const SAND = { x: 800, zMin: -1260, zMax: 1060 };
export const SPAWN = { x: 46, z: 246 };
export const STARTER_CAR = { x: 56, z: 254 };

// A road segment: straight strip from (x1,z1) to (x2,z2), width w (metres).
function seg(x1, z1, x2, z2, w, name) { return { x1, z1, x2, z2, w, name: name || '' }; }

export const ROAD_SEGS = [
  // grand avenues (north-south)
  seg(0, -880, 0, 900, 38, 'thamrin'),
  seg(-400, -1010, -400, 830, 32, 'panjang'),
  seg(400, -1010, 400, 880, 32, 'rasuna'),
  seg(640, -420, 640, 560, 24, 'haryono'),
  // arterials (east-west)
  seg(-700, -1000, 700, -1000, 26, 'sahari'),
  seg(-700, -640, 700, -640, 26, 'arterial'),
  seg(-700, -300, 700, -300, 26, 'arterial'),
  seg(-700, 30, 700, 30, 26, 'kebon'),
  seg(-700, 760, 700, 760, 26, 'arterial'),
  // ring road rectangle
  seg(-700, -1160, 700, -1160, 30, 'ring'),
  seg(-700, 960, 700, 960, 30, 'ring'),
  seg(-700, -1160, -700, 960, 30, 'ring'),
  seg(700, -1160, 700, 960, 30, 'ring'),
  // Gatot Subroto diagonal, through Semanggi (0,485)
  seg(-680, -140, 430, 880, 30, 'gatsu'),
  // connectors avenue -> ring
  seg(0, 900, 0, 960, 14), seg(-400, 830, -400, 960, 14), seg(400, 880, 400, 960, 14),
  seg(-400, -1010, -400, -1160, 14), seg(400, -1010, 400, -1160, 14), seg(0, -880, 0, -1000, 14),
  seg(640, 560, 640, 760, 14), seg(640, -420, 640, -640, 14),
  // local streets at the places
  seg(-160, -140, 60, -140, 12, 'polsek'),
  seg(60, -170, 300, -170, 12, 'masjid'),
  seg(-60, 250, 330, 250, 12, 'rsud'),
  seg(60, 505, 330, 505, 12, 'bengkel'),
  seg(-330, 620, -330, 760, 12, 'gbk'),
  // Menteng local grid
  seg(-160, -520, -160, -40, 9), seg(-80, -520, -80, -40, 9),
  seg(-240, -460, -20, -460, 9), seg(-240, -380, -20, -380, 9),
  // Kebayoran local grid
  seg(120, 560, 120, 720, 9), seg(220, 560, 220, 720, 9),
  seg(40, 600, 320, 600, 9), seg(40, 680, 320, 680, 9),
  // Kampung Barat streets
  seg(-660, 520, -480, 520, 7), seg(-660, 580, -480, 580, 7), seg(-660, 640, -480, 640, 7),
  seg(-560, 480, -560, 700, 7),
  // Kampung Melayu streets
  seg(470, -560, 670, -560, 7), seg(470, -500, 670, -500, 7), seg(570, -620, 570, -440, 7),
  // gang lanes (no through traffic)
  seg(-620, 520, -620, 640, 5, 'gang'), seg(-520, 520, -520, 640, 5, 'gang'),
  seg(520, -560, 520, -500, 5, 'gang'), seg(620, -560, 620, -500, 5, 'gang'),
  // Ancol shore road + pier stem
  seg(-700, -1176, 700, -1176, 12, 'ancol'),
  seg(400, -1176, 400, -1240, 8, 'pier'),
];

// Planted medians: strips along the avenues and Gunung Sahari, with gaps at crossings.
export const MEDIANS = [
  // Thamrin-Sudirman x=0 (gaps: arterials, the roundabout, the Semanggi diagonal)
  { x1: 0, z1: -872, x2: 0, z2: -656 }, { x1: 0, z1: -624, x2: 0, z2: -316 },
  { x1: 0, z1: -284, x2: 0, z2: -12 }, { x1: 0, z1: 72, x2: 0, z2: 468 },
  { x1: 0, z1: 502, x2: 0, z2: 744 }, { x1: 0, z1: 776, x2: 0, z2: 892 },
  // Jl. Panjang x=-400 (gaps: arterials, diagonal at z=117)
  { x1: -400, z1: -986, x2: -400, z2: -656 }, { x1: -400, z1: -624, x2: -400, z2: -316 },
  { x1: -400, z1: -284, x2: -400, z2: 14 }, { x1: -400, z1: 46, x2: -400, z2: 100 },
  { x1: -400, z1: 134, x2: -400, z2: 744 }, { x1: -400, z1: 776, x2: -400, z2: 822 },
  // Rasuna Said x=400 (gaps: arterials, diagonal at z=852)
  { x1: 400, z1: -986, x2: 400, z2: -656 }, { x1: 400, z1: -624, x2: 400, z2: -316 },
  { x1: 400, z1: -284, x2: 400, z2: 14 }, { x1: 400, z1: 46, x2: 400, z2: 744 },
  { x1: 400, z1: 776, x2: 400, z2: 836 }, { x1: 400, z1: 868, x2: 400, z2: 872 },
  // Gunung Sahari z=-1000 (gaps at the three avenues and the ring)
  { x1: -684, z1: -1000, x2: -418, z2: -1000 }, { x1: -382, z1: -1000, x2: -18, z2: -1000 },
  { x1: 18, z1: -1000, x2: 382, z2: -1000 }, { x1: 418, z1: -1000, x2: 684, z2: -1000 },
];

export const ROUNDABOUT = { x: 0, z: 30, islandR: 16, apronR: 34, laneR: 25, poolR: 9.5 };

// Interactive places. px/pz = prompt point (where the player stands).
export const PLACES = {
  polsek:  { x: -70, z: -152, px: -70, pz: -141.5, label: 'POLSEK', name: 'Police Station' },
  rsud:    { x: 70, z: 263, px: 70, pz: 250.5, label: 'RSUD', name: 'City Hospital' },
  karaoke: { x: 150, z: 264, px: 150, pz: 250.5, label: 'STAR KARAOKE', name: 'Star Karaoke' },
  gunshop: { x: 120, z: 238, px: 120, pz: 249, label: 'TOKO SENJATA', name: 'Gun Shop' },
  bengkel: { x: 215, z: 518, px: 215, pz: 505.5, label: 'BENGKEL', name: 'Bengkel — Pay N Spray' },
  house:   { x: 318, z: -268, px: 318, pz: -276, label: 'RUMAH DIJUAL', name: 'House for Sale — Rp 300,000' },
  singgah: { x: -60, z: -862, px: -60, pz: -855, label: 'SAVE POINT', name: 'Rumah Singgah — Save Point' },
  gbk:     { x: -330, z: 620, px: -330, pz: 742, label: 'GBK', name: 'GBK Stadium Gate' },
  masjid:  { x: 185, z: -186, px: 185, pz: -171, label: 'MASJID', name: 'Grand Mosque' },
  monas:   { x: 0, z: -1030, px: 8, pz: -866, label: 'MONAS', name: 'Monas Park Gate' },
};
export const INTERIORS = {
  karaoke: { x: 1150, z: 690 },
  rumah: { x: 1000, z: 690 },
};
export const KAMPUNG_DOOR = { x: -571, z: 577.8 };
export const BOATS = [ { x: -790, z: -100 }, { x: 409, z: -1280 } ];
export const RESPAWN = { busted: { x: -70, z: -134 }, wasted: { x: 70, z: 258 } };

// District rectangles used for building generation and zone names.
export const DISTRICTS = [
  { name: 'KOTA TUA', x1: 130, z1: -1150, x2: 690, z2: -910, style: 'old', hMin: 8, hMax: 20, density: 0.5 },
  { name: 'GROGOL', x1: -690, z1: -700, x2: -470, z2: -120, style: 'mid', hMin: 10, hMax: 26, density: 0.5 },
  { name: 'MENTENG', x1: -330, z1: -560, x2: -30, z2: -30, style: 'house', hMin: 6, hMax: 12, density: 0.42 },
  { name: 'THAMRIN', x1: -230, z1: -900, x2: 230, z2: -120, style: 'tower', hMin: 26, hMax: 62, density: 0.55 },
  { name: 'SUDIRMAN', x1: -230, z1: 90, x2: 230, z2: 560, style: 'tower', hMin: 30, hMax: 74, density: 0.55 },
  { name: 'KUNINGAN', x1: 290, z1: -120, x2: 580, z2: 560, style: 'tower', hMin: 24, hMax: 58, density: 0.5 },
  { name: 'SETIABUDI', x1: 50, z1: 290, x2: 300, z2: 560, style: 'mid', hMin: 12, hMax: 30, density: 0.45 },
  { name: 'KEBAYORAN', x1: -580, z1: 40, x2: -40, z2: 470, style: 'mid', hMin: 10, hMax: 24, density: 0.42 },
  { name: 'BLOK M', x1: 30, z1: 550, x2: 350, z2: 870, style: 'mall', hMin: 12, hMax: 26, density: 0.5 },
  { name: 'KEBAYORAN TIMUR', x1: 430, z1: 40, x2: 690, z2: 470, style: 'mid', hMin: 10, hMax: 24, density: 0.42 },
  { name: 'JAKARTA TIMUR', x1: 430, z1: 550, x2: 690, z2: 870, style: 'house', hMin: 6, hMax: 14, density: 0.4 },
  { name: 'JAKARTA BARAT', x1: -690, z1: -1150, x2: -470, z2: -760, style: 'mid', hMin: 10, hMax: 22, density: 0.45 },
];
export const PARKS = [
  { x1: -150, z1: -1170, x2: 150, z2: -890 },   // Monas park
  { x1: -520, z1: 520, x2: -140, z2: 730 },     // Senayan / GBK park
];
export const KAMPUNGS = [
  { name: 'KAMPUNG BARAT', x1: -676, z1: 470, x2: -464, z2: 706 },
  { name: 'KAMPUNG MELAYU', x1: 454, z1: -636, x2: 686, z2: -424 },
];
export const PORT = { x1: 520, z1: -1150, x2: 700, z2: -970 };

const ZONE_TESTS = [
  { name: 'ANCOL BEACH', test: (x, z) => z < -1176 },
  { name: 'MONAS', test: (x, z) => Math.abs(x) < 150 && z > -1170 && z < -890 },
  { name: 'BUNDARAN HI', test: (x, z) => Math.hypot(x, z - 30) < 62 },
  { name: 'PORT', test: (x, z) => x > 520 && x < 700 && z > -1150 && z < -970 },
  { name: 'KAMPUNG BARAT', test: (x, z) => x > -690 && x < -450 && z > 460 && z < 720 },
  { name: 'KAMPUNG MELAYU', test: (x, z) => x > 450 && x < 690 && z > -650 && z < -410 },
  { name: 'SENAYAN · GBK', test: (x, z) => x > -530 && x < -130 && z > 510 && z < 880 },
  { name: 'SEMANGGI', test: (x, z) => Math.hypot(x, z - 485) < 95 },
  { name: 'MENTENG', test: (x, z) => x > -340 && x < -30 && z > -570 && z < -30 },
  { name: 'THAMRIN', test: (x, z) => Math.abs(x) < 80 && z >= -900 && z < -120 },
  { name: 'SUDIRMAN', test: (x, z) => Math.abs(x) < 80 && z >= 100 && z < 580 },
  { name: 'GUNUNG SAHARI', test: (x, z) => Math.abs(z + 1000) < 60 && Math.abs(x) < 470 },
  { name: 'KOTA TUA', test: (x, z) => x > 120 && z < -900 },
  { name: 'GROGOL', test: (x, z) => x < -460 && z > -720 && z < -100 },
  { name: 'KUNINGAN', test: (x, z) => x > 290 && x < 590 && z > -130 && z < 570 },
  { name: 'SETIABUDI', test: (x, z) => x > 40 && x < 310 && z > 280 && z < 570 },
  { name: 'BLOK M', test: (x, z) => x > 20 && x < 360 && z >= 570 && z < 880 },
  { name: 'KEBAYORAN', test: (x, z) => x > -590 && x < -30 && z > 30 && z < 480 },
];
export function zoneName(x, z) {
  for (const t of ZONE_TESTS) if (t.test(x, z)) return t.name;
  return 'JAKARTA';
}

// --- geometry helpers -------------------------------------------------------
export function distToSeg(px, pz, s) {
  const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - s.x1) * dx + (pz - s.z1) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = s.x1 + dx * t, cz = s.z1 + dz * t;
  return Math.hypot(px - cx, pz - cz);
}
export function distToRoad(x, z) {
  let d = 1e9;
  for (const s of ROAD_SEGS) d = Math.min(d, distToSeg(x, z, s) - s.w / 2);
  const rb = Math.abs(Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) - ROUNDABOUT.laneR) - 9;
  return Math.min(d, rb);
}
export function roadClear(x, z, pad) { return distToRoad(x, z) > pad; }
export function inRect(x, z, r, pad) {
  return x > r.x1 - pad && x < r.x2 + pad && z > r.z1 - pad && z < r.z2 + pad;
}

// --- traffic graph ----------------------------------------------------------
// Segments are split at every crossing; nodes are the split points, edges run
// between neighbours along a segment and inherit its width. The roundabout is
// a directed one-way cycle at r25 (island kept on the driver's right).
export const graph = { nodes: [], edges: [] };
const nodeIndex = new Map();
function nodeId(x, z) {
  const key = Math.round(x * 2) / 2 + ',' + Math.round(z * 2) / 2;
  let id = nodeIndex.get(key);
  if (id === undefined) {
    id = graph.nodes.length;
    nodeIndex.set(key, id);
    graph.nodes.push({ x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2, edges: [] });
  }
  return id;
}
function addEdge(a, b, w, oneWay) {
  if (a === b) return;
  const A = graph.nodes[a], B = graph.nodes[b];
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  if (len < 0.6) return;
  const cost = len * (w <= 5 ? 1e6 : w <= 7 ? 3.2 : 1);
  A.edges.push({ to: b, w, len, cost });
  if (!oneWay) B.edges.push({ to: a, w, len, cost });
}
function segInt(p, q) {
  const d1x = p.x2 - p.x1, d1z = p.z2 - p.z1, d2x = q.x2 - q.x1, d2z = q.z2 - q.z1;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x1 - p.x1) * d2z - (q.z1 - p.z1) * d2x) / den;
  const u = ((q.x1 - p.x1) * d1z - (q.z1 - p.z1) * d1x) / den;
  if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) return t;
  return null;
}
(function buildGraph() {
  for (const s of ROAD_SEGS) {
    const ts = [0, 1];
    for (const q of ROAD_SEGS) {
      if (q === s) continue;
      const t = segInt(s, q);
      if (t !== null) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    let prev = null;
    for (const t of ts) {
      const id = nodeId(s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t);
      if (prev !== null) addEdge(prev, id, s.w, false);
      prev = id;
    }
  }
  // roundabout: 8 nodes on the r25 circle, one-way cycle (island on the
  // driver's right), fed by short two-way links from the avenue and arterial.
  const rb = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    rb.push(nodeId(ROUNDABOUT.x + Math.cos(a) * ROUNDABOUT.laneR, ROUNDABOUT.z + Math.sin(a) * ROUNDABOUT.laneR));
  }
  for (let k = 0; k < 8; k++) addEdge(rb[k], rb[(k + 1) % 8], 18, true);
  // Insert a feeder node on an existing straight edge and split the edge there.
  function insertOnEdge(x1, z1, x2, z2, nx, nz, w) {
    const a = nodeId(x1, z1), b = nodeId(x2, z2), n = nodeId(nx, nz);
    graph.nodes[a].edges = graph.nodes[a].edges.filter(e => e.to !== b);
    graph.nodes[b].edges = graph.nodes[b].edges.filter(e => e.to !== a);
    addEdge(a, n, w, false); addEdge(n, b, w, false);
    return n;
  }
  const fN = insertOnEdge(0, -300, 0, 30, 0, -16, 38);
  const fS = insertOnEdge(0, 30, 0, 485, 0, 76, 38);
  const fW = insertOnEdge(-400, 30, 0, 30, -44, 30, 26);
  const fE = insertOnEdge(0, 30, 400, 30, 44, 30, 26);
  // Cut every edge touching the centre node so nothing routes across the island.
  const centre = nodeId(0, 30);
  for (const n of graph.nodes) n.edges = n.edges.filter(e => e.to !== centre);
  graph.nodes[centre].edges = [];
  addEdge(fN, rb[6], 18, false); addEdge(fS, rb[2], 18, false);
  addEdge(fW, rb[4], 18, false); addEdge(fE, rb[0], 18, false);
})();

export function nearestNode(x, z, minW) {
  let best = -1, bd = 1e18;
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    if (minW && !n.edges.some(e => e.w >= minW)) continue;
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
export function randomNode(rng, minW) {
  for (let tries = 0; tries < 40; tries++) {
    const i = Math.floor(rng() * graph.nodes.length);
    const n = graph.nodes[i];
    if (!n.edges.length) continue;
    if (minW && !n.edges.some(e => e.w >= minW)) continue;
    return i;
  }
  return 0;
}
// Dijkstra shortest path between node ids; returns array of node ids or null.
export function route(a, b) {
  if (a === b) return [a];
  const N = graph.nodes.length;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  dist[a] = 0;
  for (let iter = 0; iter < N; iter++) {
    let u = -1, du = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    done[u] = 1;
    for (const e of graph.nodes[u].edges) {
      const nd = du + e.cost;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; }
    }
  }
  if (prev[b] < 0 && b !== a) return null;
  const path = [b];
  let cur = b;
  while (cur !== a) { cur = prev[cur]; if (cur < 0) return null; path.push(cur); }
  return path.reverse();
}
// Lane position for travel from node A to node B: left-hand traffic offset.
export function laneOffset(w) {
  if (w >= 30) return 6.2;
  if (w >= 24) return 4.5;
  if (w >= 12) return 3.0;
  if (w >= 8) return 2.4;
  return 1.8;
}
export function lanePoint(ax, az, bx, bz, w) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const off = laneOffset(w);
  // left of travel direction (dx,dz) is (dz,-dx) in x/z
  return { x: (ax + bx) / 2 + (dz / len) * off, z: (az + bz) / 2 - (dx / len) * off };
}
export function lanePointAt(ax, az, bx, bz, w, t) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const off = laneOffset(w);
  return { x: ax + dx * t + (dz / len) * off, z: az + dz * t - (dx / len) * off };
}
