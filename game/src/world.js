// world.js — builds the whole island city from layout.js: ground, roads with
// markings, planted medians, textured buildings, kampung houses, landmarks,
// signed places, props, beaches, interiors, sky. Static geometry is merged
// per material to keep draw calls low. Also owns the collider set.
import * as THREE from 'three';
import {
  LAND, ROAD_SEGS, MEDIANS, ROUNDABOUT, PLACES, INTERIORS, KAMPUNG_DOOR, BOATS,
  DISTRICTS, PARKS, KAMPUNGS, PORT, distToRoad, inRect,
} from './layout.js';
import {
  facadeMats, FACADE_BY_STYLE, kampungMats, roofMats, signPlate, signTexture,
  asphaltTexture, grassTexture, sandTexture, rng, litMaterials,
} from './textures.js';

// ---------------------------------------------------------------- colliders
const colCircles = [];   // {x, z, r}
const colBoxes = [];     // {x, z, hw, hd} axis-aligned
export function addCircleCollider(x, z, r) { colCircles.push({ x, z, r }); }
export function addBoxCollider(x, z, hw, hd) { colBoxes.push({ x, z, hw, hd }); }
export function colliderCount() { return colCircles.length + colBoxes.length; }
export function collideCircle(px, pz, r) {
  let x = px, z = pz;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colCircles) {
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = c.x + dx / d * rr; z = c.z + dz / d * rr;
      }
    }
    for (const b of colBoxes) {
      const dx = x - b.x, dz = z - b.z;
      const ox = b.hw + r - Math.abs(dx), oz = b.hd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) x = b.x + (dx >= 0 ? 1 : -1) * (b.hw + r);
        else z = b.z + (dz >= 0 ? 1 : -1) * (b.hd + r);
      }
    }
  }
  return { x, z, hit: x !== px || z !== pz };
}

// ---------------------------------------------------------------- merging
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function xform(x, y, z, ry, sx, sy, sz) {
  _e.set(0, ry || 0, 0); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
}
class GeomBucket {
  constructor() { this.parts = []; }
  add(geo, matrix, uvScale) {
    let g = geo.clone();
    if (g.index) g = g.toNonIndexed();
    if (uvScale && g.attributes.uv) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
    }
    if (matrix) g.applyMatrix4(matrix);
    this.parts.push(g);
    return this;
  }
  box(w, h, d, x, y, z, ry, uvScale) {
    return this.add(new THREE.BoxGeometry(w, h, d), xform(x, y, z, ry), uvScale);
  }
  build(material, shadows) {
    if (!this.parts.length) return null;
    let total = 0;
    for (const g of this.parts) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of this.parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(out, material);
    if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
    return mesh;
  }
}

// shared simple materials
const M = {
  concrete: new THREE.MeshLambertMaterial({ color: 0xb9bcc0 }),
  concreteDark: new THREE.MeshLambertMaterial({ color: 0x7e838a }),
  curb: new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
  white: new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }),
  lineWhite: new THREE.MeshBasicMaterial({ color: 0xf2f2ea }),
  lineYellow: new THREE.MeshBasicMaterial({ color: 0xf2c230 }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2e }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x3f7a34 }),
  leafLight: new THREE.MeshLambertMaterial({ color: 0x549245 }),
  palmLeaf: new THREE.MeshLambertMaterial({ color: 0x4c9440, side: THREE.DoubleSide }),
  metal: new THREE.MeshLambertMaterial({ color: 0x3a4048 }),
  lampHead: new THREE.MeshBasicMaterial({ color: 0x8a8f96 }),
  gold: new THREE.MeshPhongMaterial({ color: 0xd9a441, shininess: 120, specular: 0xffe9a8 }),
  poolBlue: new THREE.MeshPhongMaterial({ color: 0x2e9fd8, shininess: 160, specular: 0xbfe8ff }),
  sea: new THREE.MeshLambertMaterial({ color: 0x1d6a8a }),
  stadium: new THREE.MeshLambertMaterial({ color: 0xd8d4c8 }),
  stadiumRoof: new THREE.MeshLambertMaterial({ color: 0xb8452f }),
  dome: new THREE.MeshPhongMaterial({ color: 0x2e8c74, shininess: 90 }),
  deck: new THREE.MeshLambertMaterial({ color: 0x8f959c }),
};

const lampPositions = [];
export const worldRefs = {
  clouds: null, sunDisc: null, sunHalo: null, moonDisc: null, stars: null,
  ferris: null, discoBall: null, discoTiles: [], rain: null, lampHeadMat: M.lampHead,
  boats: [], karaokeDoor: null, sunLight: null, hemi: null, domeMat: null, seaMat: M.sea,
};

function prismGeo(w, h, d) {
  // pitched roof: triangle profile extruded along width
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0);
  return g;
}

// ---------------------------------------------------------------- the build
export function buildWorld(scene) {
  _sceneRef = scene;
  const R = rng(20261123);
  const grassTex = grassTexture(); grassTex.repeat.set(90, 130);
  const sandTex = sandTexture(); sandTex.repeat.set(90, 130);
  const roadTex = asphaltTexture(); roadTex.repeat.set(1, 1);

  // ground: sand apron under everything, grass land on top (beach band north)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1600, 2320), new THREE.MeshLambertMaterial({ map: sandTex }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, -0.05, -100); sand.receiveShadow = true;
  scene.add(sand);
  const land = new THREE.Mesh(new THREE.PlaneGeometry(1560, 2216), new THREE.MeshLambertMaterial({ map: grassTex }));
  land.rotation.x = -Math.PI / 2; land.position.set(0, 0, -68); land.receiveShadow = true;
  scene.add(land);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), M.sea);
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.55;
  scene.add(sea);
  // interior ground pads (off-island east)
  for (const key of Object.keys(INTERIORS)) {
    const p = INTERIORS[key];
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), new THREE.MeshLambertMaterial({ map: grassTex }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(p.x, -0.02, p.z); pad.receiveShadow = true;
    scene.add(pad);
  }

  // ---- roads, sidewalks, markings
  const roadBucket = new GeomBucket();
  const walkBucket = new GeomBucket();
  const lineBucket = new GeomBucket();
  const MEDIAN_ROADS = new Set(['thamrin', 'panjang', 'rasuna', 'sahari']);
  for (const s of ROAD_SEGS) {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const ang = Math.atan2(s.x2 - s.x1, s.z2 - s.z1);
    const mx = (s.x1 + s.x2) / 2, mz = (s.z1 + s.z2) / 2;
    roadBucket.add(new THREE.BoxGeometry(s.w, 0.07, len), xform(mx, 0.035, mz, ang), [len / 16, s.w / 16]);
    if (s.w >= 12) {
      for (const side of [-1, 1]) {
        const off = s.w / 2 + 1.3;
        const wx = mx + Math.cos(ang) * off * side, wz = mz - Math.sin(ang) * off * side;
        walkBucket.box(2.6, 0.1, len, wx, 0.05, wz, ang);
      }
    }
    // markings
    const dashAt = (off) => {
      for (let d = 4; d < len - 3; d += 9) {
        const t = d / len;
        const bx = s.x1 + (s.x2 - s.x1) * t + Math.cos(ang) * off;
        const bz = s.z1 + (s.z2 - s.z1) * t - Math.sin(ang) * off;
        lineBucket.box(0.22, 0.02, 3.4, bx, 0.085, bz, ang);
      }
    };
    if (MEDIAN_ROADS.has(s.name)) {
      for (const side of [-1, 1]) {
        const off = s.w / 2 - 0.7;
        const ex = mx + Math.cos(ang) * off * side, ez = mz - Math.sin(ang) * off * side;
        lineBucket.box(0.2, 0.02, len, ex, 0.085, ez, ang);
      }
      dashAt(3.4); dashAt(-3.4); dashAt(10.6); dashAt(-10.6);
    } else if (s.w >= 12) {
      dashAt(0);
    }
    // lamps along bigger roads
    if (s.w >= 12) {
      for (let d = 22; d < len; d += 46) {
        const t = d / len, side = (Math.floor(d / 46) % 2) ? 1 : -1;
        const off = s.w / 2 + 1.4;
        lampPositions.push({
          x: s.x1 + (s.x2 - s.x1) * t + Math.cos(ang) * off * side,
          z: s.z1 + (s.z2 - s.z1) * t - Math.sin(ang) * off * side,
        });
      }
    }
  }
  // roundabout apron + ring lines
  const apron = new THREE.Mesh(new THREE.CircleGeometry(ROUNDABOUT.apronR, 40), new THREE.MeshLambertMaterial({ map: roadTex }));
  apron.rotation.x = -Math.PI / 2; apron.position.set(ROUNDABOUT.x, 0.06, ROUNDABOUT.z); apron.receiveShadow = true;
  scene.add(apron);
  const ringLine = (rIn, rOut, mat, y) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 48), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(ROUNDABOUT.x, y, ROUNDABOUT.z);
    scene.add(m);
  };
  ringLine(33.2, 34, M.lineWhite, 0.075); ringLine(16, 16.7, M.lineWhite, 0.075);
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * Math.PI * 2;
    lineBucket.box(0.22, 0.02, 3.2, ROUNDABOUT.x + Math.cos(a) * 25, 0.085, ROUNDABOUT.z + Math.sin(a) * 25, -a + Math.PI / 2);
  }
  // island + pool + monument
  const island = new THREE.Mesh(new THREE.CylinderGeometry(16, 16.6, 0.5, 32), M.concrete);
  island.position.set(ROUNDABOUT.x, 0.25, ROUNDABOUT.z); island.receiveShadow = true;
  scene.add(island);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(ROUNDABOUT.poolR, ROUNDABOUT.poolR, 0.3, 28), M.poolBlue);
  pool.position.set(ROUNDABOUT.x, 0.55, ROUNDABOUT.z);
  scene.add(pool);
  addBoxCollider(ROUNDABOUT.x, ROUNDABOUT.z, 17, 12); addBoxCollider(ROUNDABOUT.x, ROUNDABOUT.z, 12, 17);
  const monument = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 3.4, 10), M.concreteDark);
  ped.position.y = 1.7;
  const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.6, 3, 10), M.gold);
  figure.position.y = 4.6;
  const armUp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.7, 8), M.gold);
  armUp.position.set(0.7, 5.6, 0); armUp.rotation.z = -0.7;
  monument.add(ped, figure, armUp);
  monument.position.set(ROUNDABOUT.x, 0.6, ROUNDABOUT.z);
  scene.add(monument);

  const roadMesh = roadBucket.build(new THREE.MeshLambertMaterial({ map: roadTex }), false);
  roadMesh.receiveShadow = true; scene.add(roadMesh);
  const walkMesh = walkBucket.build(M.concrete, false); walkMesh.receiveShadow = true; scene.add(walkMesh);
  scene.add(lineBucket.build(M.lineWhite, false));

  // ---- medians: curb, grass bed, planting
  const curbBucket = new GeomBucket(), bedBucket = new GeomBucket();
  const palmSpots = [], leafySpots = [];
  for (const m of MEDIANS) {
    const len = Math.hypot(m.x2 - m.x1, m.z2 - m.z1);
    const ang = Math.atan2(m.x2 - m.x1, m.z2 - m.z1);
    const mx = (m.x1 + m.x2) / 2, mz = (m.z1 + m.z2) / 2;
    curbBucket.box(3.4, 0.22, len, mx, 0.11, mz, ang);
    bedBucket.box(2.8, 0.1, len, mx, 0.24, mz, ang);
    if (Math.abs(m.x2 - m.x1) < 1) addBoxCollider(mx, mz, 1.7, len / 2);
    else addBoxCollider(mx, mz, len / 2, 1.7);
    for (let d = 8; d < len - 4; d += 15) {
      const t = d / len;
      const px = m.x1 + (m.x2 - m.x1) * t, pz = m.z1 + (m.z2 - m.z1) * t;
      (Math.floor(d / 15) % 2 ? palmSpots : leafySpots).push({ x: px, z: pz, median: true });
    }
  }
  scene.add(curbBucket.build(M.curb, true));
  scene.add(bedBucket.build(new THREE.MeshLambertMaterial({ color: 0x4c7a3a }), false));

  buildBuildings(R);
  buildKampung(R);
  for (const key of Object.keys(_facadeBuckets)) {
    const mesh = _facadeBuckets[key].build(facadeMats[key], true);
    if (mesh) scene.add(mesh);
  }
  const roofMesh = roofBucket.build(M.concreteDark, true);
  if (roofMesh) scene.add(roofMesh);
  const darkMesh = darkBucket.build(M.metal, false);
  if (darkMesh) scene.add(darkMesh);
  buildLandmarks(scene, R);
  buildPlaces(scene, R);
  buildProps(scene, R, palmSpots, leafySpots);
  buildBeach(scene, R);
  buildInteriors(scene);
  buildSky(scene);
  buildBoats(scene);
  return worldRefs;
}

// ---------------------------------------------------------------- buildings
const _facadeBuckets = {};
function facadeBucket(key) {
  if (!_facadeBuckets[key]) _facadeBuckets[key] = new GeomBucket();
  return _facadeBuckets[key];
}
const roofBucket = new GeomBucket();
const darkBucket = new GeomBucket();
let _scene = null;

function placeProtected(x, z, pad) {
  for (const key of Object.keys(PLACES)) {
    const p = PLACES[key];
    if (Math.hypot(x - p.x, z - p.z) < pad) return true;
  }
  if (Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) < 56) return true;
  return false;
}
function addBuilding(x, z, w, d, h, style, R) {
  const keys = FACADE_BY_STYLE[style] || FACADE_BY_STYLE.mid;
  const key = keys[Math.floor(R() * keys.length)];
  facadeBucket(key).box(w, h, d, x, h / 2, z, 0, [Math.max(w, d) / 13, h / 13]);
  roofBucket.box(w * 0.96, 0.5, d * 0.96, x, h + 0.25, z, 0);
  if (R() < 0.4) darkBucket.box(2 + R() * 2.4, 1 + R() * 1.4, 2 + R() * 2, x + (R() - 0.5) * w * 0.5, h + 0.9, z + (R() - 0.5) * d * 0.5, 0);
  addBoxCollider(x, z, w / 2, d / 2);
}
function buildBuildings(R) {
  for (const dist of DISTRICTS) {
    for (let gx = dist.x1 + 14; gx < dist.x2 - 10; gx += 31) {
      for (let gz = dist.z1 + 14; gz < dist.z2 - 10; gz += 31) {
        if (R() > dist.density) continue;
        const x = gx + (R() - 0.5) * 13, z = gz + (R() - 0.5) * 13;
        const w = 13 + R() * 11, d = 12 + R() * 9;
        const h = dist.hMin + R() * (dist.hMax - dist.hMin);
        if (x < -LAND.x + 26 || x > LAND.x - 26 || z < -1176 + 16 || z > LAND.zMax - 26) continue;
        if (distToRoad(x, z) < Math.max(w, d) / 2 + 3.2) continue;
        if (PARKS.some(p => inRect(x, z, p, 8))) continue;
        if (KAMPUNGS.some(k => inRect(x, z, k, 2))) continue;
        if (inRect(x, z, PORT, 4)) continue;
        if (placeProtected(x, z, 30)) continue;
        addBuilding(x, z, w, d, h, dist.style, R);
      }
    }
  }
  // ruko shophouse rows fronting the arterials and the avenue
  const rows = [
    { fixed: 'z', at: -640, from: -660, to: 660, w: 26 }, { fixed: 'z', at: -300, from: -660, to: 660, w: 26 },
    { fixed: 'z', at: 760, from: -660, to: 660, w: 26 }, { fixed: 'z', at: 30, from: -660, to: 660, w: 26 },
    { fixed: 'x', at: 0, from: -850, to: 880, w: 38 }, { fixed: 'x', at: 400, from: -980, to: 850, w: 32 },
    { fixed: 'x', at: -400, from: -980, to: 800, w: 32 },
  ];
  for (const row of rows) {
    for (let t = row.from; t < row.to; t += 23) {
      for (const side of [-1, 1]) {
        if (R() < 0.24) continue;
        const off = row.w / 2 + 10.5;
        const x = row.fixed === 'x' ? row.at + off * side : t + (R() - 0.5) * 3;
        const z = row.fixed === 'x' ? t + (R() - 0.5) * 3 : row.at + off * side;
        if (distToRoad(x, z) < 9.5) continue;
        if (placeProtected(x, z, 27)) continue;
        if (PARKS.some(p => inRect(x, z, p, 4))) continue;
        if (KAMPUNGS.some(k => inRect(x, z, k, 0))) continue;
        addBuilding(x, z, 15 + R() * 4, 11, 9 + R() * 5, 'old', R);
      }
    }
  }
}

function buildKampung(R) {
  for (const k of KAMPUNGS) {
    for (let gx = k.x1 + 8; gx < k.x2 - 6; gx += 12.5) {
      for (let gz = k.z1 + 8; gz < k.z2 - 6; gz += 12.5) {
        if (R() < 0.22) continue;
        const x = gx + (R() - 0.5) * 3, z = gz + (R() - 0.5) * 3;
        if (distToRoad(x, z) < 5.4) continue;
        if (Math.hypot(x - KAMPUNG_DOOR.x, z - (KAMPUNG_DOOR.z + 8)) < 9) continue;
        const two = R() < 0.3;
        const h = two ? 6.2 : 3.4;
        const m = new THREE.Mesh(new THREE.BoxGeometry(7.4, h, 6.4), kampungMats[Math.floor(R() * kampungMats.length)]);
        m.position.set(x, h / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        const roof = new THREE.Mesh(prismGeo(8, 1.7, 7.2), roofMats[Math.floor(R() * roofMats.length)]);
        roof.position.set(x, h, z);
        roof.castShadow = true;
        _sceneRef.add(m, roof);
        addBoxCollider(x, z, 3.7, 3.2);
      }
    }
  }
  // the enterable kampung house, front door on the z=580 street
  const dx = KAMPUNG_DOOR.x, dz = KAMPUNG_DOOR.z + 7.6;
  const house = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.6, 7), kampungMats[1]);
  house.position.set(dx, 1.8, dz); house.castShadow = true;
  const hroof = new THREE.Mesh(prismGeo(9.2, 1.9, 7.8), roofMats[0]);
  hroof.position.set(dx, 3.6, dz); hroof.castShadow = true;
  _sceneRef.add(house, hroof);
  addBoxCollider(dx - 3.4, dz, 0.8, 3.5); addBoxCollider(dx + 3.4, dz, 0.8, 3.5); addBoxCollider(dx, dz + 3.4, 4.2, 0.6);
}

// scene handle for the sub-builders that add individual meshes
let _sceneRef = null;

// ---------------------------------------------------------------- landmarks
function xformE(x, y, z, rx, ry, rz, s) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s || 1, s || 1, s || 1));
}
function labelAt(text, bg, fg, w, h, x, y, z, ry) {
  const p = signPlate(text, bg, fg, w, h);
  p.position.set(x, y, z); p.rotation.y = ry || 0;
  _sceneRef.add(p);
  return p;
}

function buildLandmarks(scene, R) {
  // --- Monas: plaza, obelisk with gold flame, carnival corner
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(64, 36), M.concrete);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.04, -1030); plaza.receiveShadow = true;
  scene.add(plaza);
  const obelisk = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(13, 6, 13), M.concreteDark); base.position.y = 3;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.4, 40, 4), M.concrete);
  shaft.position.y = 26; shaft.rotation.y = Math.PI / 4; shaft.castShadow = true;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.8, 2.4, 10), M.gold); cup.position.y = 47;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6, 10), M.gold); flame.position.y = 51;
  obelisk.add(base, shaft, cup, flame);
  obelisk.position.set(0, 0, -1030);
  scene.add(obelisk);
  addBoxCollider(0, -1030, 7.5, 7.5);
  // carnival tents + stalls at the park's south-east corner
  const tentCols = [0xd94f3d, 0xf2b13d, 0x3d7bd9];
  [[70, -950], [95, -925], [45, -920]].forEach(([tx, tz], i) => {
    const tent = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 3.4, 12), new THREE.MeshLambertMaterial({ color: 0xf2ead8 }));
    wall.position.y = 1.7;
    const top = new THREE.Mesh(new THREE.ConeGeometry(7.2, 3.6, 12), new THREE.MeshLambertMaterial({ color: tentCols[i % 3] }));
    top.position.y = 5.2; top.castShadow = true;
    tent.add(wall, top); tent.position.set(tx, 0, tz);
    scene.add(tent);
    addCircleCollider(tx, tz, 6.4);
  });

  // --- GBK stadium: ring wall, roof, pitch, track, floodlights
  const gbk = new THREE.Group();
  const wallOut = new THREE.Mesh(new THREE.CylinderGeometry(58, 62, 15, 36, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xd8d4c8, side: THREE.DoubleSide }));
  wallOut.position.y = 7.5; wallOut.castShadow = true;
  const roof = new THREE.Mesh(new THREE.TorusGeometry(57, 4.6, 8, 36), M.stadiumRoof);
  roof.rotation.x = Math.PI / 2; roof.position.y = 15.4; roof.scale.set(1, 1, 0.45);
  const pitch = new THREE.Mesh(new THREE.CircleGeometry(41, 28), new THREE.MeshLambertMaterial({ color: 0x4c8a3f }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.12;
  const track = new THREE.Mesh(new THREE.RingGeometry(41, 51, 28), new THREE.MeshLambertMaterial({ color: 0xb06a48 }));
  track.rotation.x = -Math.PI / 2; track.position.y = 0.1;
  gbk.add(wallOut, roof, pitch, track);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const px = Math.cos(a) * 66, pz = Math.sin(a) * 66;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 25, 8), M.metal);
    pole.position.set(px, 12.5, pz);
    const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 0.5), M.lampHead);
    head.position.set(px, 25.4, pz); head.lookAt(0, 22, 0);
    gbk.add(pole, head);
    addCircleCollider(-330 + px, 620 + pz, 0.7);
  }
  gbk.position.set(-330, 0, 620);
  scene.add(gbk);
  addCircleCollider(-330, 620, 63);

  // --- Grand Mosque: hall, dome, minaret
  const mq = new THREE.Group();
  const hall = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 20), facadeMats.concrete);
  hall.position.y = 5; hall.castShadow = true;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.dome);
  dome.position.y = 10; dome.castShadow = true;
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 8), M.gold); finial.position.y = 19.6;
  const minaret = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.9, 27, 10), M.concrete);
  minaret.position.set(19, 13.5, 0); minaret.castShadow = true;
  const mcap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 4.4, 10), M.dome); mcap.position.set(19, 29, 0);
  mq.add(hall, dome, finial, minaret, mcap);
  mq.position.set(185, 0, -186);
  scene.add(mq);
  addBoxCollider(185, -186, 15, 10); addCircleCollider(204, -186, 2.2);
  labelAt('MASJID', '#1d5c48', '#ffffff', 10, 1.8, 185, 6.5, -175.6, 0);

  // --- Semanggi flyover: elevated deck crossing the avenue on the diagonal
  const diagAng = Math.atan2(1110, 1020);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 1.3, 210), M.deck);
  deck.position.set(0, 7.6, 485); deck.rotation.y = diagAng; deck.castShadow = true;
  scene.add(deck);
  const pillarBucket = new GeomBucket();
  for (const off of [-88, -52, 52, 88]) {
    const px = Math.sin(diagAng) * off, pz = 485 + Math.cos(diagAng) * off;
    pillarBucket.add(new THREE.CylinderGeometry(1.1, 1.3, 7.2, 10), xform(px, 3.6, pz, 0));
    addCircleCollider(px, pz, 1.5);
  }
  scene.add(pillarBucket.build(M.concreteDark, true));

  // --- the port: dock, container stacks, portal cranes, ships offshore
  const dock = new THREE.Mesh(new THREE.BoxGeometry(185, 1, 165), M.concreteDark);
  dock.position.set(610, 0.5, -1075); dock.receiveShadow = true;
  scene.add(dock);
  const contCols = [0xc7512f, 0x2e6fd9, 0x53b06a, 0xf2b13d, 0x8a5a3b, 0x7a2e8c];
  const contBucket = new GeomBucket();
  for (let i = 0; i < 42; i++) {
    const cx = 535 + (i % 7) * 15 + (R() - 0.5) * 3, cz = -1130 + Math.floor(i / 7) * 16;
    const lvl = Math.floor(R() * 2.4);
    for (let l = 0; l <= lvl; l++)
      contBucket.box(11, 2.6, 5, cx, 2.3 + l * 2.7, cz, 0);
  }
  // containers get per-box colours via vertex colours is overkill; use one steel tone
  scene.add(contBucket.build(new THREE.MeshLambertMaterial({ color: 0xa8b0b8 }), true));
  for (const cx of [555, 610, 665]) {
    const crane = new THREE.Group();
    const legL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 17, 1.2), M.metal); legL.position.set(-7, 8.5, 0);
    const legR = legL.clone(); legR.position.x = 7;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(17, 1.4, 1.4), new THREE.MeshLambertMaterial({ color: 0xf2762e }));
    beam.position.y = 17;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 20), beam.material); jib.position.set(0, 16.4, -6);
    crane.add(legL, legR, beam, jib);
    crane.position.set(cx, 1, -1095);
    scene.add(crane);
    addCircleCollider(cx - 7, -1095, 1); addCircleCollider(cx + 7, -1095, 1);
  }
  for (const [sx, sz, sry] of [[500, -1345, 0.3], [-350, -1380, -0.2]]) {
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(13, 5, 58), new THREE.MeshLambertMaterial({ color: 0x37424e }));
    hull.position.y = 1.2;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 8), M.white);
    bridge.position.set(0, 7, -20);
    const stack = new THREE.Mesh(new THREE.BoxGeometry(11, 2.6, 30), new THREE.MeshLambertMaterial({ color: 0xc7512f }));
    stack.position.set(0, 5.4, 6);
    ship.add(hull, bridge, stack);
    ship.position.set(sx, 0, sz); ship.rotation.y = sry;
    scene.add(ship);
  }
}

// ---------------------------------------------------------------- places
function buildPlaces(scene, R) {
  const P = PLACES;
  const front = (place, w, h, d, mat, signText, bg, fg, signRy) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(place.x, h / 2, place.z);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    addBoxCollider(place.x, place.z, w / 2, d / 2);
    return b;
  };
  // POLSEK — two-storey, flag pole out front (front faces +z toward its street)
  front(P.polsek, 17, 7.5, 10, facadeMats.officeWhite);
  labelAt('POLSEK', '#1d3f7d', '#ffffff', 8, 1.6, P.polsek.x, 5.6, P.polsek.z + 5.1, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.6, 8), M.metal);
  pole.position.set(P.polsek.x + 8, 3.8, P.polsek.z + 8); scene.add(pole);
  const flagTop = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.75), new THREE.MeshBasicMaterial({ color: 0xd93425, side: THREE.DoubleSide }));
  flagTop.position.set(P.polsek.x + 9.1, 7.1, P.polsek.z + 8);
  const flagBot = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.75), new THREE.MeshBasicMaterial({ color: 0xf4f4f4, side: THREE.DoubleSide }));
  flagBot.position.set(P.polsek.x + 9.1, 6.35, P.polsek.z + 8);
  scene.add(flagTop, flagBot);
  addCircleCollider(P.polsek.x + 8, P.polsek.z + 8, 0.3);

  // RSUD — hospital block, canopy over the north entrance, red cross
  front(P.rsud, 21, 9.5, 12, facadeMats.hotel);
  labelAt('RSUD', '#f4f4f4', '#c22424', 8, 1.7, P.rsud.x, 6.8, P.rsud.z - 6.1, Math.PI);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 3.6), M.concrete);
  canopy.position.set(P.rsud.x, 3.4, P.rsud.z - 7.6); canopy.castShadow = true;
  scene.add(canopy);
  for (const sx of [-3.8, 3.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.4, 8), M.metal);
    post.position.set(P.rsud.x + sx, 1.7, P.rsud.z - 9.1); scene.add(post);
    addCircleCollider(P.rsud.x + sx, P.rsud.z - 9.1, 0.3);
  }
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xd92b2b }));
  crossV.position.set(P.rsud.x - 6.5, 6.8, P.rsud.z - 6.15);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.2), crossV.material);
  crossH.position.copy(crossV.position);
  scene.add(crossV, crossH);

  // TOKO SENJATA — gun shop, front faces +z
  front(P.gunshop, 11, 6, 8, facadeMats.shophouse);
  labelAt('TOKO SENJATA', '#23262e', '#ffd94d', 8.4, 1.5, P.gunshop.x, 4.6, P.gunshop.z + 4.1, 0);

  // STAR KARAOKE — front faces -z toward the RSUD street
  front(P.karaoke, 13, 7, 9, facadeMats.beige);
  labelAt('STAR KARAOKE', '#5b2a86', '#ff9ff0', 9.6, 1.6, P.karaoke.x, 5.2, P.karaoke.z - 4.6, Math.PI);
  const kGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6),
    new THREE.MeshBasicMaterial({ color: 0xff7ad9, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }));
  kGlow.position.set(P.karaoke.x, 1.6, P.karaoke.z - 4.65); kGlow.rotation.y = Math.PI;
  scene.add(kGlow);

  // BENGKEL — open workshop: slab, back + side walls, canopy roof, tyre stacks
  const bk = P.bengkel;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(17, 0.25, 13), M.concrete);
  slab.position.set(bk.x, 0.12, bk.z); slab.receiveShadow = true; scene.add(slab);
  const wallMat = facadeMats.oldbrick;
  const back = new THREE.Mesh(new THREE.BoxGeometry(17, 4.6, 0.5), wallMat);
  back.position.set(bk.x, 2.3, bk.z + 6.2); back.castShadow = true; scene.add(back);
  for (const sx of [-8.2, 8.2]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.6, 12.5), wallMat);
    side.position.set(bk.x + sx, 2.3, bk.z); side.castShadow = true; scene.add(side);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.6, 0.45), M.metal);
    post.position.set(bk.x + sx, 2.3, bk.z - 6); scene.add(post);
    addCircleCollider(bk.x + sx, bk.z - 6, 0.5);
  }
  const broof = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 14), M.stadiumRoof);
  broof.position.set(bk.x, 4.8, bk.z); broof.castShadow = true; scene.add(broof);
  addBoxCollider(bk.x, bk.z + 6.2, 8.5, 0.5);
  addBoxCollider(bk.x - 8.2, bk.z, 0.5, 6.2); addBoxCollider(bk.x + 8.2, bk.z, 0.5, 6.2);
  labelAt('BENGKEL', '#8c2f1d', '#ffffff', 9, 1.6, bk.x, 5.6, bk.z - 7.05, Math.PI);
  labelAt('PAY N SPRAY', '#23262e', '#7ddb6a', 7, 1.1, bk.x, 3.9, bk.z - 7.05, Math.PI);
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
  for (const [tx, tz] of [[-6, 2], [-6, 4.6], [6.4, 3.4]]) {
    for (let l = 0; l < 3; l++) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.24, 8, 14), tyreMat);
      tyre.rotation.x = Math.PI / 2;
      tyre.position.set(bk.x + tx, 0.45 + l * 0.48, bk.z + tz);
      tyre.castShadow = true;
      scene.add(tyre);
    }
    addCircleCollider(bk.x + tx, bk.z + tz, 0.85);
  }
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 0.6), new THREE.MeshLambertMaterial({ color: 0xc22e2e }));
  cabinet.position.set(bk.x + 5, 1, bk.z + 5.4); scene.add(cabinet);
  addBoxCollider(bk.x + 5, bk.z + 5.4, 0.9, 0.5);

  // RUMAH DIJUAL — the house for sale on its own plot, sign + price at the prompt
  const hs = P.house;
  const hbody = new THREE.Mesh(new THREE.BoxGeometry(10, 4.4, 8), kampungMats[3]);
  hbody.position.set(hs.x, 2.2, hs.z); hbody.castShadow = true; scene.add(hbody);
  const hroof = new THREE.Mesh(prismGeo(11, 2.2, 9), roofMats[0]);
  hroof.position.set(hs.x, 4.4, hs.z); hroof.castShadow = true; scene.add(hroof);
  addBoxCollider(hs.x, hs.z, 5, 4);
  const hpost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), M.trunk);
  hpost.position.set(hs.px, 1.3, hs.pz); scene.add(hpost);
  labelAt('RUMAH DIJUAL', '#f4f4f4', '#c22424', 4.6, 1.1, hs.px, 2.6, hs.pz, Math.PI);
  labelAt('Rp 300,000', '#23262e', '#ffd94d', 3.6, 0.9, hs.px, 1.55, hs.pz, Math.PI);
  addCircleCollider(hs.px, hs.pz, 0.25);

  // SAVE POINT — Rumah Singgah small house
  const sg = P.singgah;
  const sbody = new THREE.Mesh(new THREE.BoxGeometry(8.6, 3.7, 7), kampungMats[5]);
  sbody.position.set(sg.x, 1.85, sg.z); sbody.castShadow = true; scene.add(sbody);
  const sroof = new THREE.Mesh(prismGeo(9.4, 1.8, 7.8), roofMats[2]);
  sroof.position.set(sg.x, 3.7, sg.z); sroof.castShadow = true; scene.add(sroof);
  addBoxCollider(sg.x, sg.z, 4.3, 3.5);
  labelAt('SAVE POINT', '#2e6e5e', '#ffffff', 5.4, 1.1, sg.x, 3.1, sg.z + 3.6, 0);

  // GBK gate — two pillars and a beam on the park's south entrance
  for (const sx of [-8, 8]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.4, 1.4), M.concrete);
    pil.position.set(-330 + sx, 3.2, 742); pil.castShadow = true; scene.add(pil);
    addCircleCollider(-330 + sx, 742, 1);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17.4, 1.5, 1.2), M.stadiumRoof);
  beam.position.set(-330, 6.6, 742); scene.add(beam);
  labelAt('GBK STADIUM', '#b8452f', '#ffffff', 9, 1.3, -330, 6.6, 742.7, 0);
}

// ---------------------------------------------------------------- props
function buildProps(scene, R, palmSpots, leafySpots) {
  // street lamps
  const poleBucket = new GeomBucket(), headBucket = new GeomBucket();
  for (const lp of lampPositions) {
    if (Math.hypot(lp.x - ROUNDABOUT.x, lp.z - ROUNDABOUT.z) < 38) continue;
    poleBucket.add(new THREE.CylinderGeometry(0.09, 0.13, 5.8, 7), xform(lp.x, 2.9, lp.z, 0));
    headBucket.box(0.34, 0.14, 0.9, lp.x, 5.85, lp.z, R() * Math.PI);
    addCircleCollider(lp.x, lp.z, 0.28);
  }
  scene.add(poleBucket.build(M.metal, false));
  scene.add(headBucket.build(M.lampHead, false));

  // trees: median spots plus parks, beach fringe and grass scatter
  const spots = palmSpots.concat(leafySpots);
  for (const p of PARKS) {
    for (let i = 0; i < 46; i++) {
      const x = p.x1 + R() * (p.x2 - p.x1), z = p.z1 + R() * (p.z2 - p.z1);
      if (distToRoad(x, z) < 5) continue;
      if (Math.hypot(x, z + 1030) < 70) continue; // keep the Monas plaza clear
      if (Math.hypot(x + 330, z - 620) < 70) continue; // keep the stadium clear
      spots.push({ x, z, palm: R() < 0.4 });
    }
  }
  for (let i = 0; i < 240; i++) {
    const x = (R() * 2 - 1) * 760, z = -1220 + R() * 2240;
    if (distToRoad(x, z) < 7.5) continue;
    if (placeProtected(x, z, 12)) continue;
    if (PARKS.some(p => inRect(x, z, p, 0)) || KAMPUNGS.some(k => inRect(x, z, k, 0))) continue;
    if (inRect(x, z, PORT, 2) || z < -1176) continue;
    spots.push({ x, z, palm: R() < 0.35 });
  }
  for (let x = -760; x < 770; x += 26) { // Ancol beach palms
    if (R() < 0.25) continue;
    spots.push({ x: x + (R() - 0.5) * 8, z: -1196 + (R() - 0.5) * 8, palm: true });
  }
  const trunkBucket = new GeomBucket(), leafBucket = new GeomBucket(), frondBucket = new GeomBucket();
  for (const s of spots) {
    const isPalm = s.palm || s.median && R() < 0.5;
    if (isPalm) {
      const lean = (R() - 0.5) * 0.16, h = 5.2 + R() * 1.6;
      trunkBucket.add(new THREE.CylinderGeometry(0.14, 0.22, h, 7), xformE(s.x, h / 2, s.z, lean, 0, lean * 0.6));
      for (let f = 0; f < 6; f++) {
        const a = f / 6 * Math.PI * 2 + R() * 0.5;
        frondBucket.add(new THREE.PlaneGeometry(0.65, 3.4),
          xformE(s.x + Math.cos(a) * 1.3, h + 0.25, s.z + Math.sin(a) * 1.3, -0.9 - R() * 0.3, -a + Math.PI / 2, 0));
      }
      addCircleCollider(s.x, s.z, 0.4);
    } else {
      const h = 1.6 + R() * 0.9;
      trunkBucket.add(new THREE.CylinderGeometry(0.13, 0.2, h, 7), xform(s.x, h / 2, s.z, 0));
      const cr = 1.5 + R() * 1.1;
      leafBucket.add(new THREE.IcosahedronGeometry(cr, 1), xform(s.x, h + cr * 0.8, s.z, R() * 3));
      leafBucket.add(new THREE.IcosahedronGeometry(cr * 0.7, 1), xform(s.x + cr * 0.55, h + cr * 0.45, s.z + cr * 0.3, R() * 3));
      addCircleCollider(s.x, s.z, 0.42);
    }
  }
  scene.add(trunkBucket.build(M.trunk, true));
  scene.add(leafBucket.build(M.leaf, true));
  scene.add(frondBucket.build(M.palmLeaf, false));

  // benches + bins in parks and along the beach
  const benchBucket = new GeomBucket(), binBucket = new GeomBucket();
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3b });
  const binMat = new THREE.MeshLambertMaterial({ color: 0x2e6e46 });
  const benchAt = (x, z, ry) => {
    benchBucket.box(1.9, 0.12, 0.5, x, 0.5, z, ry);
    benchBucket.box(1.9, 0.5, 0.1, x - Math.sin(ry) * 0.24, 0.85, z - Math.cos(ry) * 0.24, ry);
    addBoxCollider(x, z, 1, 0.4);
  };
  for (let i = 0; i < 26; i++) {
    const x = -700 + R() * 1400, z = -1210 + R() * 26;
    benchAt(x, z, 0);
    binBucket.add(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 9), xform(x + 1.6, 0.4, z, 0));
    addCircleCollider(x + 1.6, z, 0.4);
  }
  for (let i = 0; i < 22; i++) {
    const x = (R() * 2 - 1) * 130, z = -1150 + R() * 220;
    if (distToRoad(x, z) < 4 || Math.hypot(x, z + 1030) < 66) continue;
    benchAt(x, z, R() * Math.PI);
  }
  scene.add(benchBucket.build(benchMat, true));
  scene.add(binBucket.build(binMat, false));

  // billboards along the avenues — fictional local brands
  const ads = [['KOPI KOTA', '#5d3a1a', '#ffd94d'], ['BANK NUSANTARA', '#1d3f7d', '#ffffff'],
    ['SATE SENAYAN', '#8c2f1d', '#ffe9a8'], ['HOTEL MELATI', '#5b2a86', '#ffffff'],
    ['ARTHA MALL', '#0f5e5e', '#aef2e2'], ['ES TEH SEGAR', '#2e6e46', '#ffffff'],
    ['MIE AYAM BAKSO', '#a83232', '#fff2b0'], ['WARTEG BAHARI', '#274b63', '#ffd94d']];
  const adSpots = [[26, -500], [-26, -180], [26, 210], [-26, 640], [426, -60], [-426, 300], [26, -760], [-426, -520]];
  adSpots.forEach(([ax, az], i) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 6.4, 8), M.metal);
    post.position.set(ax, 3.2, az); scene.add(post);
    const [word, bg, fg] = ads[i % ads.length];
    const panel = signPlate(word, bg, fg, 8.4, 3.4);
    panel.position.set(ax, 7.6, az);
    panel.rotation.y = ax > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(panel);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 8.6), M.metal);
    back.position.set(ax, 7.6, az); scene.add(back);
    addCircleCollider(ax, az, 0.5);
  });

  // bus stops (HALTE): posts, roof, bench
  for (const [hx, hz, ry] of [[21, -420, 0], [-21, 120, 0], [421, 420, 0], [-421, -60, 0], [21, 700, 0], [-379, -700, 0]]) {
    const roofB = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 1.8), M.stadiumRoof);
    roofB.position.set(hx, 2.6, hz); roofB.rotation.y = ry; scene.add(roofB);
    for (const sx of [-2, 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), M.metal);
      post.position.set(hx + sx, 1.3, hz); scene.add(post);
      addCircleCollider(hx + sx, hz, 0.2);
    }
    labelAt('HALTE', '#1d3f7d', '#ffffff', 1.7, 0.6, hx, 2.2, hz + 0.95, 0);
  }
}

// ---------------------------------------------------------------- beach
function buildBeach(scene, R) {
  const umbCols = [0xd94f3d, 0xf2b13d, 0x3d7bd9, 0xe06aa8, 0x53b06a, 0xf2762e];
  const umbBucket = new GeomBucket(), towelBucket = new GeomBucket();
  const towelMats = umbCols.map(c => new THREE.MeshLambertMaterial({ color: c }));
  const towelBuckets = towelMats.map(() => new GeomBucket());
  const umbrellaAt = (x, z) => {
    umbBucket.add(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), xform(x, 1.15, z, 0));
    umbBucket.add(new THREE.ConeGeometry(1.9, 0.6, 9), xform(x, 2.4, z, 0));
    towelBuckets[Math.floor(R() * towelBuckets.length)].box(1.1, 0.04, 2.1, x + (R() - 0.5) * 3, 0.05, z + 1.8 + R(), R() * 3);
    addCircleCollider(x, z, 0.25);
  };
  for (let x = -740; x < 750; x += 34) if (R() > 0.3) umbrellaAt(x + (R() - 0.5) * 10, -1206 + (R() - 0.5) * 12);
  for (let z = -900; z < 700; z += 90) { if (R() > 0.4) umbrellaAt(-789, z); if (R() > 0.4) umbrellaAt(789, z + 40); }
  scene.add(umbBucket.build(M.white, false));
  towelBuckets.forEach((b, i) => { const m = b.build(towelMats[i], false); if (m) scene.add(m); });

  // lifeguard tower + volleyball net on Ancol
  const lg = new THREE.Group();
  for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 7), M.trunk);
    leg.position.set(lx, 1.7, lz); lg.add(leg);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.9, 2.8), M.white); cabin.position.y = 4.3;
  const lroof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1, 4), new THREE.MeshLambertMaterial({ color: 0xd94f3d }));
  lroof.position.y = 5.8; lroof.rotation.y = Math.PI / 4;
  lg.add(cabin, lroof);
  lg.position.set(120, 0, -1198);
  scene.add(lg);
  addBoxCollider(120, -1198, 1.6, 1.6);
  for (const nx of [-129, -111]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 7), M.metal);
    post.position.set(nx, 1.2, -1206); scene.add(post);
    addCircleCollider(nx, -1206, 0.2);
  }
  const net = new THREE.Mesh(new THREE.PlaneGeometry(18, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  net.position.set(-120, 1.5, -1206);
  scene.add(net);

  // the Ancol pier: deck on posts reaching into the bay
  const pier = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 72), new THREE.MeshLambertMaterial({ color: 0x9a7c5c }));
  pier.position.set(400, 0.55, -1272); pier.receiveShadow = true;
  scene.add(pier);
  for (let pz = -1244; pz > -1300; pz -= 12) for (const px of [397, 403]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 7), M.trunk);
    post.position.set(px, -0.2, pz); scene.add(post);
  }

  // ferris wheel at the Ancol park
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(15, 0.35, 8, 28), new THREE.MeshLambertMaterial({ color: 0xd94f3d }));
  wheel.add(rim);
  worldRefs.ferrisCabins = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 30, 6), M.metal);
    spoke.rotation.z = a; wheel.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7),
      new THREE.MeshLambertMaterial({ color: umbCols[k % umbCols.length] }));
    cab.position.set(Math.cos(a) * 15, Math.sin(a) * 15, 0);
    wheel.add(cab);
    worldRefs.ferrisCabins.push(cab);
  }
  const legs = new THREE.Group();
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 19, 8), M.metal);
    leg.position.set(sx * 4.4, -8.6, 0); leg.rotation.z = sx * 0.24;
    legs.add(leg);
  }
  wheel.add(legs);
  wheel.position.set(-250, 17.5, -1105);
  scene.add(wheel);
  worldRefs.ferris = wheel;
  addCircleCollider(-254, -1105, 1); addCircleCollider(-246, -1105, 1);
}

// ---------------------------------------------------------------- interiors
function buildInteriors(scene) {
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a6b42 });
  const wallMatI = new THREE.MeshLambertMaterial({ color: 0xe8ddcb });
  const room = (cx, cz, w, d, wallMat) => {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), woodMat);
    floor.position.set(cx, 0.1, cz); floor.receiveShadow = true; scene.add(floor);
    const mkWall = (ww, x, z, ry) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 3.4, 0.35), wallMat);
      wall.position.set(x, 1.7, z); wall.rotation.y = ry || 0; wall.castShadow = true; scene.add(wall);
    };
    mkWall(w, cx, cz - d / 2, 0);                       // north
    mkWall(d, cx - w / 2, cz, Math.PI / 2);             // west
    mkWall(d, cx + w / 2, cz, Math.PI / 2);             // east
    addBoxCollider(cx, cz - d / 2, w / 2, 0.4);
    addBoxCollider(cx - w / 2, cz, 0.4, d / 2);
    addBoxCollider(cx + w / 2, cz, 0.4, d / 2);
    return { floor };
  };
  // STAR KARAOKE room (entered from the karaoke place)
  const K = INTERIORS.karaoke;
  room(K.x, K.z, 24, 16, new THREE.MeshLambertMaterial({ color: 0x4a3566 }));
  // south wall with a door gap in the middle
  const kw1 = new THREE.Mesh(new THREE.BoxGeometry(9.5, 3.4, 0.35), new THREE.MeshLambertMaterial({ color: 0x4a3566 }));
  kw1.position.set(K.x - 7.2, 1.7, K.z + 8); scene.add(kw1);
  const kw2 = kw1.clone(); kw2.position.x = K.x + 7.2; scene.add(kw2);
  addBoxCollider(K.x - 7.2, K.z + 8, 4.8, 0.4); addBoxCollider(K.x + 7.2, K.z + 8, 4.8, 0.4);
  // dance floor: 5x4 coloured tiles (materials cycled by the game loop)
  for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 4; iz++) {
    const tileMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), tileMat);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(K.x - 3.6 + ix * 1.8, 0.22, K.z - 1 + iz * 1.8);
    scene.add(tile);
    worldRefs.discoTiles.push(tileMat);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10),
    new THREE.MeshPhongMaterial({ color: 0xd8dee8, shininess: 200, specular: 0xffffff }));
  ball.position.set(K.x, 3, K.z);
  scene.add(ball);
  worldRefs.discoBall = ball;
  // bar counter along the north wall + stools + bottles
  const counter = new THREE.Mesh(new THREE.BoxGeometry(10, 1.15, 1.2), new THREE.MeshLambertMaterial({ color: 0x6e3b1f }));
  counter.position.set(K.x, 0.6, K.z - 6.4); counter.castShadow = true; scene.add(counter);
  addBoxCollider(K.x, K.z - 6.4, 5, 0.7);
  const bottleCols = [0x53b06a, 0xf2b13d, 0xd94f3d, 0x3d7bd9];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6),
      new THREE.MeshLambertMaterial({ color: bottleCols[i % 4] }));
    b.position.set(K.x - 4 + i * 1.1, 1.45, K.z - 6.4);
    scene.add(b);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 10),
      new THREE.MeshLambertMaterial({ color: 0x8c2f39 }));
    stool.position.set(K.x - 4 + i * 1.3, 0.38, K.z - 4.6);
    scene.add(stool);
  }
  const screen = signPlate('STAR KARAOKE', '#1c1030', '#ff9ff0', 6, 2);
  screen.position.set(K.x, 2.2, K.z - 7.75);
  scene.add(screen);

  // Rumah warga — a kampung living room (entered through the kampung door)
  const H = INTERIORS.rumah;
  room(H.x, H.z, 15, 11, wallMatI);
  const hw1 = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.4, 0.35), wallMatI);
  hw1.position.set(H.x - 5.2, 1.7, H.z + 5.5); scene.add(hw1);
  const hw2 = hw1.clone(); hw2.position.x = H.x + 5.2; scene.add(hw2);
  addBoxCollider(H.x - 5.2, H.z + 5.5, 2.3, 0.4); addBoxCollider(H.x + 5.2, H.z + 5.5, 2.3, 0.4);
  const roofH = new THREE.Mesh(prismGeo(16, 2.4, 12), roofMats[1]);
  roofH.position.set(H.x, 3.4, H.z); scene.add(roofH);
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 1.2), new THREE.MeshLambertMaterial({ color: 0x7a4a56 }));
  sofa.position.set(H.x - 3, 0.5, H.z - 3); scene.add(sofa);
  addBoxCollider(H.x - 3, H.z - 3, 1.7, 0.7);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 1), woodMat);
  table.position.set(H.x - 3, 0.38, H.z - 0.8); scene.add(table);
  addBoxCollider(H.x - 3, H.z - 0.8, 1, 0.6);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 3.4), new THREE.MeshLambertMaterial({ color: 0xbfd9e8 }));
  bed.position.set(H.x + 4.6, 0.3, H.z + 2.6); scene.add(bed);
  addBoxCollider(H.x + 4.6, H.z + 2.6, 1.2, 1.8);
  const tv = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 0.12), new THREE.MeshBasicMaterial({ color: 0x10131a }));
  tv.position.set(H.x - 3, 1.5, H.z - 4.7); scene.add(tv);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.2), new THREE.MeshLambertMaterial({ color: 0xa83232 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(H.x - 1, 0.22, H.z + 1);
  scene.add(rug);
}

// ---------------------------------------------------------------- sky + boats
function buildSky(scene) {
  scene.fog = new THREE.Fog(0xbfe3f2, 150, 1700);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  worldRefs.sunLight = sun; worldRefs.hemi = hemi;

  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f6fd0) },
      horizon: { value: new THREE.Color(0xbfe3f2) },
      bottom: { value: new THREE.Color(0x8aa5b8) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;' +
      'void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.62)) : mix(horizon, bottom, pow(-h, 0.5)); gl_FragColor = vec4(c, 1.0); }',
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(3300, 24, 14), domeMat);
  scene.add(skyDome);
  worldRefs.domeMat = domeMat; worldRefs.dome = skyDome;

  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(95, 20), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
  scene.add(sunDisc); worldRefs.sunDisc = sunDisc;
  const [hc, hg] = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,240,190,0.85)'); grad.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return [c, g];
  })();
  const haloTex = new THREE.CanvasTexture(hc);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false }));
  halo.scale.set(760, 760, 1);
  scene.add(halo); worldRefs.sunHalo = halo;
  const moon = new THREE.Mesh(new THREE.CircleGeometry(62, 20), new THREE.MeshBasicMaterial({ color: 0xe8ecf2, fog: false }));
  scene.add(moon); worldRefs.moonDisc = moon;

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(600 * 3);
  const SR = rng(4242);
  for (let i = 0; i < 600; i++) {
    const a = SR() * Math.PI * 2, e = Math.acos(SR() * 0.95);
    const r = 3050;
    starPos[i * 3] = Math.cos(a) * Math.sin(e) * r;
    starPos[i * 3 + 1] = Math.cos(e) * r * 0.6 + 300;
    starPos[i * 3 + 2] = Math.sin(a) * Math.sin(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars); worldRefs.stars = stars;

  // cloud clusters: merged soft puffs in a handful of meshes, drifting +x
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  worldRefs.cloudMat = cloudMat;
  const clouds = new THREE.Group();
  const CR = rng(777);
  for (let i = 0; i < 30; i++) {
    const bucket = new GeomBucket();
    const puffs = 4 + Math.floor(CR() * 4);
    for (let p = 0; p < puffs; p++) {
      bucket.add(new THREE.IcosahedronGeometry(7 + CR() * 9, 1),
        xformE((CR() - 0.5) * 30, (CR() - 0.5) * 3.4, (CR() - 0.5) * 13, 0, CR() * 3, 0));
    }
    const m = bucket.build(cloudMat, false);
    m.scale.y = 0.45;
    m.position.set((CR() * 2 - 1) * 1700, 128 + CR() * 55, (CR() * 2 - 1) * 1700);
    clouds.add(m);
  }
  scene.add(clouds);
  worldRefs.clouds = clouds;

  // rain streaks around the camera (positions animated by the game loop)
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(1300 * 3);
  const RR = rng(99);
  for (let i = 0; i < 1300; i++) {
    rainPos[i * 3] = (RR() * 2 - 1) * 46;
    rainPos[i * 3 + 1] = RR() * 55;
    rainPos[i * 3 + 2] = (RR() * 2 - 1) * 46;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0xaec6d8, size: 0.32, transparent: true, opacity: 0,
  }));
  rain.visible = false;
  scene.add(rain);
  worldRefs.rain = rain;
}

function buildBoats(scene) {
  const mkBoat = (hullCol, x, z, heading) => {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-1.15, -3.3); shape.lineTo(1.15, -3.3); shape.lineTo(1.15, 1.7);
    shape.lineTo(0, 3.5); shape.lineTo(-1.15, 1.7); shape.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.85, bevelEnabled: false });
    hullGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshPhongMaterial({ color: hullCol, shininess: 70 }));
    hull.position.y = 0.85; hull.castShadow = true;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 5.4), M.white);
    rim.position.set(0, 0.92, -0.6);
    const bench1 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.5), M.trunk);
    bench1.position.set(0, 0.62, -1.4);
    const bench2 = bench1.clone(); bench2.position.z = 0.6;
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.4), M.metal);
    motor.position.set(0, 0.8, -3.5);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 0.08),
      new THREE.MeshPhongMaterial({ color: 0x9fc8e0, transparent: true, opacity: 0.6 }));
    shield.position.set(0, 1.15, 1.5); shield.rotation.x = -0.25;
    g.add(hull, rim, bench1, bench2, motor, shield);
    g.position.set(x, 0.05, z);
    g.rotation.y = heading;
    scene.add(g);
    return { group: g, heading, speed: 0 };
  };
  worldRefs.boats.push(mkBoat(0xd94f3d, BOATS[0].x, BOATS[0].z, 1.2));
  worldRefs.boats.push(mkBoat(0x2e6fd9, BOATS[1].x, BOATS[1].z, -0.4));
}

// ------------------------------------------------------- environment driver
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
const _fv = new THREE.Vector3();
function mix3(target, day, dusk, night, dayAmt, duskAmt) {
  target.copy(night);
  _c1.copy(day).multiplyScalar(dayAmt);
  _c2.copy(dusk).multiplyScalar(duskAmt);
  _c3.copy(night).multiplyScalar(Math.max(0, 1 - dayAmt - duskAmt));
  target.copy(_c1).add(_c2).add(_c3);
  return target;
}
export function updateEnvironment(scene, minutes, rain01, focus, elapsed) {
  const F = _fv.set(focus.x || 0, 0, focus.z || 0); // focus arrives as {x, z}
  const sunT = (minutes - 360) / 720;                 // 0 at 06:00, 1 at 18:00
  const elev = Math.sin(sunT * Math.PI);
  const dayAmt = THREE.MathUtils.clamp(elev * 1.7, 0, 1);
  const duskAmt = THREE.MathUtils.clamp(1 - Math.abs(elev - 0.1) / 0.3, 0, 1) * (elev > -0.12 ? 1 : 0);
  const nightAmt = 1 - dayAmt;
  const sunDir = new THREE.Vector3(Math.cos(sunT * Math.PI) * 0.85, Math.max(elev, -0.4), 0.38).normalize();

  const sun = worldRefs.sunLight, hemi = worldRefs.hemi;
  if (elev > 0.015) {
    sun.position.copy(F).addScaledVector(sunDir, 380);
    sun.color.setHex(0xfff2d8).lerp(_c1.setHex(0xff9a4d), duskAmt * 0.8);
    sun.intensity = 0.25 + 1.15 * dayAmt;
  } else {
    sun.position.set(focus.x - 150, 320, focus.z - 120);
    sun.color.setHex(0x8fb2e8);
    sun.intensity = 0.32;
  }
  sun.target.position.copy(F);
  hemi.intensity = 0.22 + 0.6 * dayAmt;

  const u = worldRefs.domeMat.uniforms;
  mix3(u.top.value, _c1.setHex(0x2f6fd0), _c2.setHex(0x3a4a8c), _c3.setHex(0x05081a), dayAmt, duskAmt * 0.7);
  mix3(u.horizon.value, _c1.setHex(0xbfe3f2), _c2.setHex(0xff9a4d), _c3.setHex(0x101a2e), dayAmt, duskAmt);
  u.bottom.value.setHex(0x8aa5b8).lerp(_c1.setHex(0x0a1018), nightAmt);
  worldRefs.dome.position.copy(F);

  scene.fog.color.copy(u.horizon.value);
  scene.fog.far = (rain01 > 0.03 ? 620 : 1750) * (0.45 + 0.55 * Math.max(dayAmt, 0.25));
  scene.fog.near = scene.fog.far * 0.08;

  for (const m of litMaterials) m.emissiveIntensity = nightAmt * 1.15 + duskAmt * 0.35;
  M.lampHead.color.setHex(nightAmt > 0.35 || duskAmt > 0.5 ? 0xffd98a : 0x8a8f96);
  M.sea.color.setHex(0x1d6a8a).lerp(_c1.setHex(0x0b2a3c), nightAmt * 0.85);

  const sd = worldRefs.sunDisc, halo = worldRefs.sunHalo;
  const sunVis = elev > -0.06 && rain01 < 0.4;
  sd.visible = halo.visible = sunVis;
  if (sunVis) {
    sd.position.copy(F).addScaledVector(sunDir, 2950);
    sd.lookAt(focus);
    halo.position.copy(sd.position);
    halo.material.opacity = 0.55 + duskAmt * 0.3;
  }
  const moon = worldRefs.moonDisc;
  moon.visible = nightAmt > 0.25;
  if (moon.visible) {
    moon.position.set(focus.x - 900, 1500, focus.z - 700);
    moon.lookAt(focus);
  }
  worldRefs.stars.material.opacity = nightAmt * (1 - rain01) * 0.95;
  worldRefs.stars.position.copy(F);

  const cm = worldRefs.cloudMat;
  mix3(cm.color, _c1.setHex(0xffffff), _c2.setHex(0xffb37a), _c3.setHex(0x2c3648), dayAmt, duskAmt * 0.8);
  cm.opacity = 0.92 - rain01 * 0.1;
  const clouds = worldRefs.clouds;
  const cdt = Math.min(0.1, Math.max(0, elapsed - (updateEnvironment._last || elapsed)));
  updateEnvironment._last = elapsed;
  for (const cl of clouds.children) {
    cl.position.x += cdt * 1.1;
    if (cl.position.x > 2000) cl.position.x -= 4000;
  }
  worldRefs.rain.visible = rain01 > 0.03;
  worldRefs.rain.material.opacity = rain01 * 0.75;
  return { dayAmt, duskAmt, nightAmt, elev };
}
