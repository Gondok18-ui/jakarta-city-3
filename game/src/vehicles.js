// vehicles.js — every vehicle is built from an extruded 2D side profile (real
// silhouettes: nose, glasshouse, tail) plus wheels, glass and lights.
// Fictional model names only. Local forward is +Z.
import * as THREE from 'three';
import { signPlate } from './textures.js';

export const PAINTS = [0xd94f3d, 0x2e6fd9, 0xf2b13d, 0x53b06a, 0xe8e4da, 0x23262e, 0x8a8f99, 0x7a2e8c,
  0xe06aa8, 0x2ea8a0, 0xf2762e, 0x9c2f39, 0x3b5998, 0xc0c6ce, 0x5d8a48, 0x8a5a3b, 0xffd94d, 0x12403b];
const paintMats = new Map();
function paint(color) {
  let m = paintMats.get(color);
  if (!m) { m = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x777777 }); paintMats.set(color, m); }
  return m;
}
const glassMat = new THREE.MeshPhongMaterial({ color: 0x1d2c3a, shininess: 140, specular: 0xaaccdd });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9bfc6 });
const chromeMat = new THREE.MeshPhongMaterial({ color: 0xd7dce2, shininess: 160 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x23262e });

// Build an extruded body from a side profile: pts are [z, y] front to back.
function profileBody(pts, width, material) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  // after rotateY(-90deg): shape x (length) -> +z, extrusion -> -x..0 -> centred by translate
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}
function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function wheel(r, w) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), tyreMat);
  tyre.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 10), hubMat);
  hub.rotation.z = Math.PI / 2;
  g.add(tyre, hub);
  return g;
}

// type: { len, wid, profile, glass: profile|null, wheelR, wheelZ:[front,back], seats }
export const VEHICLE_TYPES = {
  vulcan: { len: 4.5, wid: 1.98, wheelR: 0.36, name: 'Vulcan GT',
    profile: [[2.25, 0.32], [2.2, 0.55], [1.5, 0.72], [0.5, 0.98], [-0.6, 1.02], [-1.7, 0.88], [-2.25, 0.78], [-2.28, 0.4], [-1.9, 0.3], [1.9, 0.28]],
    glass: [[1.15, 0.74], [0.45, 0.97], [-0.55, 1.0], [-1.2, 0.86], [0.2, 0.72]] },
  falco: { len: 4.3, wid: 1.86, wheelR: 0.34, name: 'Falco',
    profile: [[2.15, 0.3], [2.05, 0.6], [1.2, 0.78], [0.3, 1.06], [-0.8, 1.08], [-1.8, 0.92], [-2.15, 0.82], [-2.18, 0.38], [-1.8, 0.28], [1.8, 0.26]],
    glass: [[0.95, 0.8], [0.25, 1.05], [-0.75, 1.06], [-1.35, 0.9], [0.1, 0.78]] },
  sedan: { len: 4.6, wid: 1.8, wheelR: 0.33, name: 'Sedan',
    profile: [[2.3, 0.35], [2.25, 0.68], [1.4, 0.82], [0.55, 1.12], [-0.7, 1.14], [-1.6, 0.95], [-2.28, 0.88], [-2.3, 0.4], [-1.9, 0.3], [1.9, 0.3]],
    glass: [[1.2, 0.84], [0.5, 1.1], [-0.65, 1.12], [-1.3, 0.94], [0.2, 0.82]] },
  hatch: { len: 3.9, wid: 1.74, wheelR: 0.31, name: 'Hatch',
    profile: [[1.95, 0.35], [1.9, 0.7], [1.1, 0.85], [0.3, 1.14], [-0.9, 1.16], [-1.75, 1.05], [-1.95, 0.95], [-1.95, 0.4], [-1.6, 0.3], [1.6, 0.3]],
    glass: [[0.9, 0.87], [0.25, 1.12], [-0.85, 1.14], [-1.55, 1.02], [0.05, 0.85]] },
  suv: { len: 4.7, wid: 1.92, wheelR: 0.4, name: 'SUV',
    profile: [[2.35, 0.45], [2.3, 0.85], [1.5, 0.98], [0.7, 1.32], [-1.5, 1.34], [-2.3, 1.25], [-2.35, 0.5], [-1.9, 0.4], [1.9, 0.4]],
    glass: [[1.3, 1.0], [0.65, 1.3], [-1.45, 1.32], [-1.95, 1.22], [0.3, 0.98]] },
  mpv: { len: 4.6, wid: 1.86, wheelR: 0.34, name: 'MPV',
    profile: [[2.3, 0.4], [2.2, 0.85], [1.3, 1.05], [0.5, 1.3], [-1.7, 1.32], [-2.28, 1.2], [-2.3, 0.45], [-1.9, 0.35], [1.9, 0.35]],
    glass: [[1.45, 1.02], [0.55, 1.27], [-1.6, 1.29], [-2.0, 1.18], [0.2, 1.0]] },
  taxi: { len: 4.6, wid: 1.8, wheelR: 0.33, name: 'Taxi',
    profile: [[2.3, 0.35], [2.25, 0.68], [1.4, 0.82], [0.55, 1.12], [-0.7, 1.14], [-1.6, 0.95], [-2.28, 0.88], [-2.3, 0.4], [-1.9, 0.3], [1.9, 0.3]],
    glass: [[1.2, 0.84], [0.5, 1.1], [-0.65, 1.12], [-1.3, 0.94], [0.2, 0.82]], taxi: true },
  angkot: { len: 4.4, wid: 1.8, wheelR: 0.33, name: 'Angkot',
    profile: [[2.2, 0.4], [2.15, 0.95], [1.6, 1.25], [-1.9, 1.28], [-2.2, 1.15], [-2.2, 0.45], [-1.8, 0.35], [1.8, 0.35]],
    glass: [[1.75, 1.05], [1.55, 1.22], [-1.8, 1.25], [-2.05, 1.13], [0.4, 1.03]], angkot: true },
  pickup: { len: 4.9, wid: 1.9, wheelR: 0.38, name: 'Pickup',
    profile: [[2.45, 0.42], [2.4, 0.82], [1.6, 0.95], [0.9, 1.28], [-0.3, 1.3], [-0.55, 0.95], [-2.42, 0.92], [-2.45, 0.45], [-2.0, 0.38], [2.0, 0.38]],
    glass: [[1.35, 0.97], [0.85, 1.26], [-0.25, 1.28], [-0.45, 0.97], [0.6, 0.95]] },
  bus: { len: 10.6, wid: 2.5, wheelR: 0.48, name: 'City Bus',
    profile: [[5.3, 0.5], [5.25, 1.6], [4.6, 2.6], [-4.9, 2.62], [-5.3, 2.3], [-5.3, 0.55], [-4.6, 0.45], [4.6, 0.42]],
    glass: [[5.05, 1.7], [4.55, 2.5], [-4.8, 2.52], [-5.1, 2.25], [0, 1.62]], bus: true },
  minibus: { len: 5.6, wid: 2.0, wheelR: 0.36, name: 'Minibus',
    profile: [[2.8, 0.42], [2.7, 1.0], [2.0, 1.45], [-2.5, 1.48], [-2.8, 1.3], [-2.8, 0.48], [-2.3, 0.38], [2.3, 0.38]],
    glass: [[2.3, 1.12], [1.95, 1.4], [-2.4, 1.43], [-2.62, 1.28], [0.2, 1.08]] },
  classic: { len: 4.4, wid: 1.78, wheelR: 0.34, name: 'Classic',
    profile: [[2.2, 0.38], [2.18, 0.62], [1.7, 0.72], [0.7, 0.78], [0.2, 1.08], [-0.9, 1.1], [-1.5, 0.8], [-2.18, 0.72], [-2.2, 0.4], [-1.8, 0.32], [1.8, 0.32]],
    glass: [[0.55, 0.82], [0.15, 1.06], [-0.85, 1.08], [-1.2, 0.8], [0.05, 0.8]] },
  roadster: { len: 4.1, wid: 1.84, wheelR: 0.33, name: 'Roadster',
    profile: [[2.05, 0.3], [2.0, 0.55], [1.1, 0.68], [0.2, 0.92], [-0.7, 0.94], [-1.6, 0.8], [-2.05, 0.7], [-2.08, 0.35], [-1.7, 0.27], [1.7, 0.26]],
    glass: [[0.8, 0.7], [0.15, 0.91], [-0.65, 0.92], [-1.1, 0.78], [0.0, 0.68]] },
  kei: { len: 3.3, wid: 1.55, wheelR: 0.28, name: 'Kei Car',
    profile: [[1.65, 0.35], [1.6, 0.75], [1.0, 0.95], [0.3, 1.2], [-1.2, 1.22], [-1.62, 1.05], [-1.65, 0.4], [-1.3, 0.3], [1.3, 0.3]],
    glass: [[0.85, 0.97], [0.25, 1.18], [-1.15, 1.2], [-1.45, 1.03], [0.05, 0.95]] },
  truck: { len: 6.8, wid: 2.2, wheelR: 0.44, name: 'Truck',
    profile: [[3.4, 0.5], [3.35, 1.3], [2.7, 1.75], [1.6, 1.78], [1.35, 0.9], [1.3, 0.5], [0.6, 0.45], [3.0, 0.45]],
    glass: [[3.1, 1.35], [2.65, 1.7], [1.7, 1.72], [1.5, 1.0], [2.4, 1.32]], truck: true },
};
export const CAR_TYPES = Object.keys(VEHICLE_TYPES);
export const TRAFFIC_TYPES = ['sedan', 'sedan', 'hatch', 'suv', 'mpv', 'taxi', 'angkot', 'pickup', 'kei', 'minibus', 'classic', 'falco', 'roadster', 'truck', 'bus'];

export function makeVehicle(type, color, opts) {
  opts = opts || {};
  const def = VEHICLE_TYPES[type];
  const g = new THREE.Group();
  const bodyMat = opts.police ? paint(0xf2f3f5) : paint(color !== undefined ? color : PAINTS[0]);
  const body = profileBody(def.profile, def.wid - 0.12, bodyMat);
  g.add(body);
  if (def.glass) {
    const glass = profileBody(def.glass, def.wid - 0.02, glassMat);
    glass.position.y = 0.015;
    g.add(glass);
  }
  if (def.truck) {
    const cargo = box(2.1, 2.3, 3.6, paint(0xd8d3c3), 0, 1.75, -1.55);
    g.add(cargo);
  }
  if (def.taxi) {
    const sign = box(0.62, 0.16, 0.3, new THREE.MeshBasicMaterial({ color: 0xffd94d }), 0, 1.24, -0.15);
    g.add(sign);
  }
  if (opts.police) {
    const stripeL = box(0.02, 0.3, def.len * 0.7, paint(0x2456c8), -def.wid / 2 - 0.01, 0.72, 0);
    const stripeR = stripeL.clone(); stripeR.position.x = def.wid / 2 + 0.01;
    const bar = box(0.9, 0.09, 0.34, darkMat, 0, 1.22, -0.15);
    const bl = box(0.4, 0.07, 0.3, new THREE.MeshBasicMaterial({ color: 0x2e6fd9 }), -0.24, 1.3, -0.15);
    const br = box(0.4, 0.07, 0.3, new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 0.24, 1.3, -0.15);
    g.add(stripeL, stripeR, bar, bl, br);
    g.userData.lightBar = [bl, br];
  }
  // wheels: front pair steers (groups at the axle), rear pair fixed
  const wz = def.len * 0.31, wr = def.wheelR;
  const wheels = [];
  const mkWheel = (x, z, steer) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, wr, z);
    const w = wheel(wr, 0.22);
    pivot.add(w);
    g.add(pivot);
    wheels.push({ pivot, spin: w, steer: !!steer });
    return pivot;
  };
  mkWheel(-def.wid / 2 + 0.08, wz, true); mkWheel(def.wid / 2 - 0.08, wz, true);
  mkWheel(-def.wid / 2 + 0.08, -wz, false); mkWheel(def.wid / 2 - 0.08, -wz, false);
  if (def.bus || def.truck) { mkWheel(-def.wid / 2 + 0.08, -wz * 0.45, false); mkWheel(def.wid / 2 - 0.08, -wz * 0.45, false); }
  // lights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.04), lightMat);
  hl.position.set(-def.wid / 2 + 0.3, 0.62, def.len / 2 + 0.02);
  const hr = hl.clone(); hr.position.x = def.wid / 2 - 0.3;
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.04), tailMat);
  tl.position.set(-def.wid / 2 + 0.3, 0.68, -def.len / 2 - 0.02);
  const tr = tl.clone(); tr.position.x = def.wid / 2 - 0.3;
  g.add(hl, hr, tl, tr);
  // headlight cones + road glow (visible at night only)
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffeeb8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const cones = [];
  for (const sx of [-1, 1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 7.5, 12, 1, true), coneMat);
    cone.rotation.x = Math.PI / 2 + 0.06;
    cone.position.set(sx * (def.wid / 2 - 0.3), 0.6, def.len / 2 + 3.6);
    cone.visible = false;
    g.add(cone); cones.push(cone);
  }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.6, 14),
    new THREE.MeshBasicMaterial({ color: 0xffdf94, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.06, def.len / 2 + 3.4);
  glow.visible = false;
  g.add(glow);
  g.userData = Object.assign(g.userData, {
    isVehicle: true, type, def, wheels, cones, coneMat, glow,
    len: def.len, wid: def.wid, speed: 0, heading: 0,
  });
  return g;
}

export function setHeadlights(car, on, strength) {
  const u = car.userData;
  if (u.cones) for (const c of u.cones) c.visible = on;
  if (u.glow) {
    u.glow.visible = on;
    if (on) u.glow.material.opacity = 0.13 * (strength || 1);
  }
  if (on && u.coneMat) u.coneMat.opacity = 0.10 * (strength || 1);
}

// Motorcycles: light frame, two wheels, room for a rider figure.
export function makeBike(kind, color) {
  const g = new THREE.Group();
  const sport = kind === 'sportbike';
  const bodyMat = paint(color !== undefined ? color : 0xd94f3d);
  const frame = box(0.16, 0.3, sport ? 1.5 : 1.25, bodyMat, 0, 0.52, 0.05);
  const tank = box(0.24, 0.22, 0.55, bodyMat, 0, 0.72, sport ? 0.12 : 0.0);
  tank.rotation.x = sport ? -0.16 : 0;
  const seat = box(0.22, 0.09, 0.6, darkMat, 0, 0.78, -0.42);
  const shield = box(0.3, 0.34, 0.05, glassMat, 0, 0.92, 0.62);
  shield.rotation.x = -0.3;
  g.add(frame, tank, seat, shield);
  const wheels = [];
  for (const z of [0.72, -0.68]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.31, z);
    const w = wheel(0.31, 0.09);
    pivot.add(w); g.add(pivot);
    wheels.push({ pivot, spin: w, steer: z > 0 });
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.04), lightMat);
  hl.position.set(0, 0.78, 0.78); g.add(hl);
  g.userData = { isVehicle: true, isBike: true, type: kind, wheels, len: 1.9, wid: 0.6, speed: 0, heading: 0, cones: [], glow: null, coneMat: null };
  return g;
}
export function bikeRiderPose(p) { /* handled in people poses via drivePose variant in main */ }
export { signPlate };
