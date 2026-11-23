// main.js — Jakarta City: game state, player, traffic, peds, combat, police
// wiring, missions, places, boats, weather, saves, cheats, camera, and the
// ?shot= staging used to take the entry's screenshots.
import * as THREE from 'three';
import {
  ROAD_SEGS, PLACES, INTERIORS, KAMPUNG_DOOR, BOATS, RESPAWN, SPAWN, STARTER_CAR,
  graph, nearestNode, randomNode, route, lanePointAt, zoneName, distToRoad, SAND, LAND,
} from './layout.js';
import { buildWorld, updateEnvironment, worldRefs, collideCircle, colliderCount } from './world.js';
import { makeVehicle, makeBike, setHeadlights, TRAFFIC_TYPES, VEHICLE_TYPES } from './vehicles.js';
import { makePerson, walkPose, idlePose, sitPose, drivePose, aimPose, downPose } from './people.js';
import { SFX } from './audio.js';
import { WEAPONS, CombatFX, AMMO_PRICE, AMMO_PACK } from './weapons.js';
import { PoliceSystem } from './police.js';
import { STORY, Marker, MissionRunner } from './missions.js';
import { HUD } from './hud.js';
import { rng } from './textures.js';

const R = rng(987123);
const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'webgl';
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc8e8);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 7000);
camera.position.set(30, 12, -60);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

buildWorld(scene);
const fx = new CombatFX(scene);
const hud = new HUD();
const marker = new Marker(scene);

// ---------------------------------------------------------------- state
const SAVE_KEY = 'jakarta-city-sa-save';
const MANUAL_KEY = 'jakarta-city-sa-manual';
const S = {
  mode: 'menu',           // menu | play
  started: false,
  money: 250000, hp: 100, armor: 0,
  weapon: 2,              // index into WEAPONS (pistol)
  owned: { fists: true, machete: false, pistol: true, smg: false, shotgun: false, rifle: false },
  ammo: { pistol: 120, smg: 0, shells: 0, rifle: 0 },
  minutes: 17 * 60 + 5,   // menu backdrop runs at golden hour
  day: 0, elapsed: 0,
  inCar: null, inBoat: null, interior: null,
  knockedDown: 0, dead: false, invuln: 0,
  houseOwned: false,
  weather: 0, weatherTarget: 0, weatherT: 40,
  camYaw: Math.PI, camPitch: 0.24, shake: 0,
  zone: '', autosaveT: 15, sideOfferT: 55, sideOffer: false, sideOfferCd: 0,
  phoneAvail: false, dialogue: null, shopNear: false,
  quality: 0, fpsAcc: 0, fpsN: 0, fpsT: 0,
  blink: false, blinkT: 0,
};
const TOP_SPEED = { vulcan: 63, falco: 56, sedan: 43, hatch: 40, suv: 42, mpv: 40, taxi: 43, angkot: 34, pickup: 42, bus: 30, minibus: 36, classic: 38, roadster: 54, kei: 36, truck: 33, sportbike: 60, scooter: 38 };

// ---------------------------------------------------------------- input
const keys = {};
const input = { mx: 0, mz: 0, sprint: false, jump: false, attack: false, aim: false };
let mouseDown = false, mouseAim = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (S.mode === 'play') {
    if (e.code === 'KeyE') onInteractKey();
    if (e.code === 'KeyF') onEnterKey();
    if (e.code === 'KeyP' || e.code === 'KeyM') toggleMap();
    if (e.code === 'KeyJ') acceptSideOffer();
    if (e.code === 'KeyH' && S.inCar) SFX.horn();
    if (e.code === 'KeyC') hud.el.cheatPanel.classList.toggle('hidden');
    if (/^Digit[1-6]$/.test(e.code)) selectWeapon(+e.code.slice(5) - 1);
    typeCheat(e.key);
  }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys[e.code] = false);
renderer.domElement.addEventListener('mousedown', e => {
  SFX.init(); SFX.resume();
  if (S.mode !== 'play') return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) mouseAim = true;
  if (!shotMode) renderer.domElement.requestPointerLock();
});
addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) mouseAim = false;
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement) {
    S.camYaw -= e.movementX * 0.0026;
    S.camPitch = clamp(S.camPitch + e.movementY * 0.0022, -0.08, 1.05);
  }
});
addEventListener('wheel', e => {
  if (S.mode === 'play' && !S.inCar) {
    let n = S.weapon + (e.deltaY > 0 ? 1 : -1);
    for (let k = 0; k < 6; k++) {
      const idx = ((n % 6) + 6) % 6;
      if (S.owned[WEAPONS[idx].id]) { selectWeapon(idx); break; }
      n += (e.deltaY > 0 ? 1 : -1);
    }
  }
}, { passive: true });

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const touchState = { active: false, sx: 0, sy: 0, dx: 0, dy: 0 };
if (isTouch) setupTouch();
function setupTouch() {
  document.getElementById('touch').classList.remove('hidden');
  const stick = document.getElementById('stick'), knob = document.getElementById('stickKnob');
  const mkBtn = (label, x, y, cb) => {
    const b = document.createElement('div');
    b.className = 'tbtn'; b.textContent = label;
    b.style.right = x + 'px'; b.style.bottom = y + 'px';
    b.addEventListener('touchstart', e => { e.preventDefault(); SFX.init(); SFX.resume(); cb(true); }, { passive: false });
    b.addEventListener('touchend', e => { e.preventDefault(); cb(false); }, { passive: false });
    document.getElementById('touch').appendChild(b);
    return b;
  };
  mkBtn('ENTER', 24, 190, d => { if (d) onEnterKey(); });
  mkBtn('USE', 96, 250, d => { if (d) onInteractKey(); });
  mkBtn('FIRE', 24, 300, d => mouseDown = d);
  mkBtn('JUMP', 96, 130, d => { if (d) keys['Space'] = true; else keys['Space'] = false; });
  mkBtn('MAP', 168, 250, d => { if (d) toggleMap(); });
  mkBtn('HORN', 168, 130, d => { if (d) SFX.horn(); });
  stick.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchState.active = true; touchState.sx = t.clientX; touchState.sy = t.clientY;
    e.preventDefault();
  }, { passive: false });
  addEventListener('touchmove', e => {
    if (!touchState.active) return;
    const t = e.changedTouches[0];
    touchState.dx = clamp((t.clientX - touchState.sx) / 42, -1, 1);
    touchState.dy = clamp((t.clientY - touchState.sy) / 42, -1, 1);
    knob.style.transform = 'translate(calc(-50% + ' + touchState.dx * 32 + 'px), calc(-50% + ' + touchState.dy * 32 + 'px))';
  }, { passive: true });
  addEventListener('touchend', () => {
    touchState.active = false; touchState.dx = 0; touchState.dy = 0;
    knob.style.transform = 'translate(-50%,-50%)';
  });
}
function readMoveInput() {
  let x = 0, z = 0;
  if (keys['KeyW'] || keys['ArrowUp']) z -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) z += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) x += 1;
  if (touchState.active) { x += touchState.dx; z += touchState.dy; }
  input.mx = x; input.mz = z;
  input.sprint = !!(keys['ShiftLeft'] || keys['ShiftRight']);
  input.jump = !!keys['Space'];
  input.attack = mouseDown;
  input.aim = mouseAim || mouseDown;
}

// ---------------------------------------------------------------- player
const player = {
  p: makePerson({ shirt: 0x2e6fd9, pants: 0x2e3440, head: 'hair' }),
  x: SPAWN.x, z: SPAWN.z, y: 0, vy: 0, heading: Math.PI, speed: 0,
  phase: 0, punchT: 0, fireCd: 0, stepT: 0,
};
scene.add(player.p.g);
player.p.g.position.set(player.x, 0, player.z);

// ---------------------------------------------------------------- police
const police = new PoliceSystem(scene, fx, {
  dispatch: html => { hud.dispatch(html); clearTimeout(police._dt); police._dt = setTimeout(() => hud.dispatch(null), 6000); },
  damagePlayer: d => hurtPlayer(d, false),
  onBusted: () => doBusted(),
  explode: (x, z) => explode(x, z),
  sfx: name => { if (name === 'crash') SFX.crash(false); else if (name === 'shotPolice') SFX.shot('pistol'); },
  siren: (on, dist) => SFX.siren(on && S.mode === 'play', dist),
});

// ---------------------------------------------------------------- missions
const runner = new MissionRunner({
  pay: (amount, title) => {
    S.money += amount;
    SFX.cash();
    hud.toast(title + ' complete — +Rp ' + amount.toLocaleString('en-US'));
    hud.setMoney(S.money);
    checkPhoneMission();
  },
  toast: t => hud.toast(t),
  addHeat: n => police.addHeat(n),
  fail: t => { hud.toast(t); SFX.hurt(); },
});
let giverPerson = null, passengerPerson = null;
function refreshGiver() {
  if (giverPerson) { scene.remove(giverPerson.g); giverPerson = null; }
  if (passengerPerson) { scene.remove(passengerPerson.g); passengerPerson = null; }
  const def = runner.nextDef;
  if (!def || runner.active || S.completed) return;
  if (def.phone) { S.phoneAvail = true; return; }
  giverPerson = makePerson({ shirt: def.giver.shirt || 0xe8e4da, head: def.giver.head || 'hair' });
  giverPerson.g.position.set(def.giver.x, 0, def.giver.z);
  giverPerson.g.rotation.y = Math.PI * 0.75;
  scene.add(giverPerson.g);
}
function checkPhoneMission() {
  const def = runner.nextDef;
  if (def && def.phone && !runner.active) {
    S.phoneAvail = true;
    hud.toast('Your phone is ringing — press E to answer');
    SFX.buy();
  }
}

// ---------------------------------------------------------------- traffic
const traffic = [];   // moving vehicles (stealable)
const parked = [];    // parked vehicles (stealable)
function edgeWidth(a, b) {
  const e = graph.nodes[a].edges.find(e => e.to === b);
  return e ? e.w : 12;
}
function makeDriver(car) {
  const bike = car.userData.isBike;
  const d = makePerson(bike ? { head: 'helmet' } : {});
  d.g.userData.isDriver = true;
  if (bike) { d.g.position.set(0, 0.62, -0.1); d.g.scale.setScalar(0.96); }
  else d.g.position.set(-0.38, -0.5, 0.1); // seated low, inside the cabin
  drivePose(d);
  if (bike) { d.legL.rotation.x = -0.85; d.legR.rotation.x = -0.85; }
  car.add(d.g);
  return d;
}
function spawnTrafficCar(nodeA, nodeB, t) {
  const isBike = R() < 0.16;
  let g;
  if (isBike) g = makeBike(R() < 0.6 ? 'sportbike' : 'scooter', [0xd94f3d, 0x2e6fd9, 0x23262e, 0xf2b13d][Math.floor(R() * 4)]);
  else {
    const type = TRAFFIC_TYPES[Math.floor(R() * TRAFFIC_TYPES.length)];
    g = makeVehicle(type, Math.floor(R() * 18) === 0 ? 0xffd94d : undefined);
    if (g.userData.type !== 'taxi' && R() < 0.85) {
      // repaint: rebuild with a random colour is wasteful; tint via a new build only for variety
    }
  }
  makeDriver(g);
  scene.add(g);
  const dest = randomNode(R, 9);
  const path = route(nodeB, dest) || [nodeB];
  const car = {
    g, path, i: 1, from: nodeA, to: nodeB, t: t || 0,
    queue: path ? path.slice(1) : [],
    w: edgeWidth(nodeA, nodeB), speed: 0, cruise: 8 + R() * 5,
    hp: 110, dead: false, stuckT: 0, dispT: 0, lastX: 0, lastZ: 0, dispAcc: 0,
    isBike, honkT: 0,
  };
  if (car.w <= 7) car.cruise = 4.5;
  if (g.userData.def && (g.userData.type === 'bus' || g.userData.type === 'truck')) car.cruise = 7;
  traffic.push(car);
  return car;
}
function initTraffic() {
  const edges = [];
  graph.nodes.forEach((n, i) => n.edges.forEach(e => { if (e.w >= 8) edges.push([i, e.to, e.w]); }));
  for (let k = 0; k < 46; k++) {
    const e = edges[Math.floor(R() * edges.length)];
    spawnTrafficCar(e[0], e[1], R());
  }
  // parked cars at kerbs on wide roads
  let placed = 0, guard = 0;
  while (placed < 16 && guard++ < 300) {
    const e = edges[Math.floor(R() * edges.length)];
    if (e[2] < 24) continue;
    const A = graph.nodes[e[0]], B = graph.nodes[e[1]];
    const t = 0.2 + R() * 0.6;
    const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
    if (Math.hypot(x, z - 30) < 42) continue;
    const ang = Math.atan2(B.x - A.x, B.z - A.z);
    const side = R() < 0.5 ? 1 : -1;
    const off = e[2] / 2 - 0.4;
    const px = x + Math.cos(ang) * off * side, pz = z - Math.sin(ang) * off * side;
    const type = TRAFFIC_TYPES[Math.floor(R() * TRAFFIC_TYPES.length)];
    const g = makeVehicle(type, undefined);
    // random paint by swapping in a coloured build is skipped; parked use default palette order
    g.position.set(px, 0, pz);
    g.rotation.y = ang + (side > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.06;
    scene.add(g);
    parked.push({ g, hp: 110, dead: false, parked: true });
    placed++;
  }
  // the starter car by the hospital
  const sg = makeVehicle('falco', 0xffd94d);
  sg.position.set(STARTER_CAR.x, 0, STARTER_CAR.z);
  sg.rotation.y = Math.PI;
  scene.add(sg);
  parked.push({ g: sg, hp: 110, dead: false, parked: true, starter: true });
}
initTraffic();

// ---------------------------------------------------------------- peds
const peds = [];
function spawnPedWalker() {
  const a = randomNode(R, 7);
  const p = makePerson({});
  scene.add(p.g);
  const ped = {
    p, g: p.g, from: a, to: null, t: R(), speed: 1.1 + R() * 0.9,
    side: R() < 0.5 ? 1 : -1, phase: R() * 6, hp: 30, dead: false, deadT: 0, flee: 0,
  };
  pickNext(ped, a);
  peds.push(ped);
  return ped;
}
function pickNext(ped, atNode) {
  const n = graph.nodes[atNode];
  const opts = n.edges.filter(e => e.w >= 5);
  if (!opts.length) { ped.to = atNode; return; }
  ped.to = opts[Math.floor(R() * opts.length)].to;
  ped.from = atNode; ped.t = 0;
  ped.w = edgeWidth(atNode, ped.to);
}
function pedPosOnEdge(ped, t) {
  const A = graph.nodes[ped.from], B = graph.nodes[ped.to];
  const dx = B.x - A.x, dz = B.z - A.z;
  const len = Math.hypot(dx, dz) || 1;
  const off = (ped.w / 2 + 1.5) * ped.side;
  return {
    x: A.x + dx * t + (dz / len) * off,
    z: A.z + dz * t - (dx / len) * off,
    hx: dx / len, hz: dz / len, len,
  };
}
function initPeds() {
  for (let i = 0; i < 92; i++) spawnPedWalker();
  // sitters: kampung stoops, beach towels, park benches
  const sitSpots = [];
  for (let i = 0; i < 12; i++) sitSpots.push({ x: -660 + R() * 190, z: 486 + R() * 200, ry: R() * 6.3 });
  for (let i = 0; i < 6; i++) sitSpots.push({ x: 470 + R() * 190, z: -620 + R() * 180, ry: R() * 6.3 });
  for (let i = 0; i < 10; i++) sitSpots.push({ x: -720 + R() * 1440, z: -1212 + R() * 14, ry: Math.PI });
  for (let i = 0; i < 8; i++) sitSpots.push({ x: (R() * 2 - 1) * 130, z: -1140 + R() * 200, ry: R() * 6.3 });
  const stoopMat = new THREE.MeshLambertMaterial({ color: 0xa89880 });
  for (const s of sitSpots) {
    if (distToRoad(s.x, s.z) < 2.2) continue;
    const p = makePerson({});
    const stoop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.6), stoopMat);
    stoop.position.set(s.x, 0.22, s.z);
    stoop.rotation.y = s.ry;
    scene.add(stoop);
    p.g.position.set(s.x, -0.41, s.z);
    p.g.rotation.y = s.ry;
    sitPose(p);
    scene.add(p.g);
    peds.push({ p, g: p.g, sitter: true, hp: 30, dead: false, deadT: 0, phase: R() * 6 });
  }
}
initPeds();

// ---------------------------------------------------------------- combat
const pendingBooms = [];
function witnessed(x, z) {
  for (const c of police.cars) if (Math.hypot(c.g.position.x - x, c.g.position.z - z) < 85) return true;
  for (const o of police.officers) if (Math.hypot(o.g.position.x - x, o.g.position.z - z) < 85) return true;
  for (const p of peds) if (!p.dead && Math.hypot(p.g.position.x - x, p.g.position.z - z) < 38) return true;
  return false;
}
function explode(x, z) {
  fx.flash(new THREE.Vector3(x, 1.4, z));
  fx.flash(new THREE.Vector3(x, 3.2, z));
  SFX.boom();
  const pd = Math.hypot(playerPos().x - x, playerPos().z - z);
  S.shake = Math.min(1, S.shake + clamp(16 / (pd + 4), 0, 0.8));
  const R2 = 9.5;
  if (pd < R2 && !S.inBoat) {
    const d = 48 * (1 - pd / R2);
    hurtPlayer(d);
    if (d > 18 && S.knockedDown <= 0 && !S.inCar) knockDown();
    S.invuln = Math.max(S.invuln, 0.6);
  }
  for (const p of peds) {
    if (p.dead) continue;
    const d = Math.hypot(p.g.position.x - x, p.g.position.z - z);
    if (d < R2) killPed(p);
  }
  for (const list of [traffic, parked]) {
    for (const c of list) {
      if (c.dead || c === S.inCar) continue;
      const d = Math.hypot(c.g.position.x - x, c.g.position.z - z);
      if (d < R2) { c.hp -= 100; if (c.hp <= 0 && !c.dead) { c.dead = true; c.chainT = 0.3; } }
    }
  }
  for (const c of [...police.cars]) {
    const d = Math.hypot(c.g.position.x - x, c.g.position.z - z);
    if (d < R2) police.damageCar(c, 100);
  }
  for (const o of [...police.officers]) {
    const d = Math.hypot(o.g.position.x - x, o.g.position.z - z);
    if (d < R2) police.damageOfficer(o, 100);
  }
}
function killPed(p) {
  if (p.dead) return;
  p.dead = true; p.deadT = 0;
  downPose(p.p);
}
function hurtPlayer(d, fromShot) {
  if (S.dead || S.invuln > 0 || S.mode !== 'play') return;
  if (S.inCar) d *= 0.45;
  const absorbed = Math.min(S.armor, d * 0.6);
  S.armor -= absorbed;
  S.hp -= (d - absorbed);
  hud.hurtFlash();
  SFX.hurt();
  if (S.hp <= 0) { S.hp = 0; doWasted(); }
}
function knockDown() {
  S.knockedDown = 2.3;
  downPose(player.p);
  hud.toast('You are down — if the police reach you, you are BUSTED');
}
function playerPos() {
  if (S.inCar) return { x: S.inCar.g.position.x, z: S.inCar.g.position.z };
  if (S.inBoat) return { x: S.inBoat.group.position.x, z: S.inBoat.group.position.z };
  return { x: player.x, z: player.z };
}

// ---------------------------------------------------------------- weapons
function ammoKey(w) { return w.ammo; }
function selectWeapon(i) {
  const w = WEAPONS[i];
  if (!w) return;
  if (S.shopNear && !S.owned[w.id] && WEAPON_PRICES[w.id]) { buyWeapon(w); return; }
  if (!S.owned[w.id]) { hud.toast('You do not own the ' + w.name + ' — visit the Armory'); return; }
  S.weapon = i;
  SFX.ui();
}
const WEAPON_PRICES = { machete: 15000, smg: 60000, shotgun: 85000, rifle: 120000 };
function buyWeapon(w) {
  const price = WEAPON_PRICES[w.id] || 0;
  if (S.money < price) { hud.toast('Not enough money for the ' + w.name); return; }
  S.money -= price;
  S.owned[w.id] = true;
  if (w.ammo) S.ammo[w.ammo] = (S.ammo[w.ammo] || 0) + 60;
  hud.toast(w.name + ' purchased — press ' + (WEAPONS.indexOf(w) + 1) + ' to equip');
  hud.setMoney(S.money);
  SFX.buy();
}
function buyAmmo() {
  const w = WEAPONS[S.weapon];
  if (w.melee || !AMMO_PRICE[w.ammo]) { hud.toast('No ammo needed for the ' + w.name); return; }
  const cost = AMMO_PRICE[w.ammo] * AMMO_PACK[w.ammo];
  if (S.money < cost) { hud.toast('Not enough money for ammo'); return; }
  S.money -= cost;
  S.ammo[w.ammo] += AMMO_PACK[w.ammo];
  hud.toast('+' + AMMO_PACK[w.ammo] + ' ' + w.name + ' ammo');
  hud.setMoney(S.money);
  SFX.buy();
}
function buyArmor() {
  if (S.money < 30000) { hud.toast('Not enough money for armor'); return; }
  if (S.armor >= 100) { hud.toast('Armor already full'); return; }
  S.money -= 30000; S.armor = 100;
  hud.toast('Body armor fitted');
  hud.setMoney(S.money);
  SFX.buy();
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
function collectTargets() {
  const list = [];
  for (const p of peds) {
    if (p.dead) continue;
    const gp = p.g.position;
    list.push({ x: gp.x, y: 1.62, z: gp.z, r: 0.34, kind: 'pedHead', ref: p });
    list.push({ x: gp.x, y: 1.05, z: gp.z, r: 0.6, kind: 'ped', ref: p });
  }
  for (const listName of [traffic, parked]) {
    for (const c of listName) {
      if (c.dead || c === S.inCar) continue;
      const gp = c.g.position;
      list.push({ x: gp.x, y: 0.8, z: gp.z, r: Math.max(c.g.userData.len || 4, c.g.userData.wid || 2) * 0.52, kind: 'car', ref: c });
    }
  }
  for (const c of police.cars) {
    if (c.dead) continue;
    const gp = c.g.position;
    list.push({ x: gp.x, y: 0.8, z: gp.z, r: 2.4, kind: 'pcar', ref: c });
  }
  for (const o of police.officers) {
    if (o.dead) continue;
    const gp = o.g.position;
    list.push({ x: gp.x, y: 1.6, z: gp.z, r: 0.34, kind: 'officerHead', ref: o });
    list.push({ x: gp.x, y: 1.05, z: gp.z, r: 0.6, kind: 'officer', ref: o });
  }
  if (police.heli && !police.heli.dead) {
    const gp = police.heli.g.position;
    list.push({ x: gp.x, y: gp.y, z: gp.z, r: 3.4, kind: 'heli', ref: police.heli });
  }
  return list;
}
function rayHit(origin, dir, targets) {
  let best = null, bestT = 130;
  for (const t of targets) {
    _v1.set(t.x - origin.x, t.y - origin.y, t.z - origin.z);
    const proj = _v1.dot(dir);
    if (proj < 0 || proj > bestT) continue;
    const d2 = _v1.lengthSq() - proj * proj;
    if (d2 < t.r * t.r) { bestT = proj; best = t; }
  }
  if (dir.y < -0.02) {
    const tg = -origin.y / dir.y;
    if (tg > 0 && tg < bestT) { bestT = tg; best = null; }
  }
  return { target: best, dist: bestT };
}
function damageTarget(t, dmg) {
  if (!t) return;
  const head = t.kind.endsWith('Head');
  const d = head ? dmg * 2.1 : dmg;
  if (t.kind === 'ped' || t.kind === 'pedHead') {
    const p = t.ref;
    p.hp -= d;
    if (p.hp <= 0) { killPed(p); police.addHeat(45); }
    else { p.flee = 5; p.fleeFrom = { x: player.x, z: player.z }; police.addHeat(18); }
  } else if (t.kind === 'car') {
    const c = t.ref;
    c.hp -= d;
    if (c.hp <= 0 && !c.dead) { c.dead = true; c.chainT = 0.4; police.addHeat(20); }
  } else if (t.kind === 'pcar') {
    police.damageCar(t.ref, d);
    police.addHeat(16);
  } else if (t.kind === 'officer' || t.kind === 'officerHead') {
    police.damageOfficer(t.ref, d);
    police.addHeat(10);
  } else if (t.kind === 'heli') {
    police.damageHeli(d);
    police.addHeat(10);
  }
}
function tryFire(dt) {
  player.fireCd -= dt;
  const w = WEAPONS[S.weapon];
  if (!input.attack || player.fireCd > 0 || S.dialogue || S.dead || S.knockedDown > 0) return;
  if (S.inCar || S.inBoat) return; // no firing from vehicles in this build
  if (w.melee) {
    player.fireCd = w.rof;
    player.punchT = 0.28;
    SFX.shot('melee');
    // nearest ped or officer in front
    const fx2 = -Math.sin(S.camYaw), fz2 = -Math.cos(S.camYaw);
    let hitAny = false;
    const tryHit = (x, z, apply) => {
      const dx = x - player.x, dz = z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < w.range && (dx * fx2 + dz * fz2) / (dist || 1) > 0.35) { apply(); hitAny = true; }
    };
    for (const p of peds) {
      if (p.dead) continue;
      tryHit(p.g.position.x, p.g.position.z, () => {
        p.hp -= w.dmg;
        if (p.hp <= 0) { killPed(p); police.addHeat(45); }
        else { p.flee = 5; p.fleeFrom = { x: player.x, z: player.z }; if (witnessed(player.x, player.z)) police.addHeat(15); }
      });
    }
    for (const o of police.officers) {
      if (o.dead) continue;
      tryHit(o.g.position.x, o.g.position.z, () => { police.damageOfficer(o, w.dmg); police.addHeat(20); });
    }
    // a swing that hits nobody is NOT a crime — nothing else happens
    return;
  }
  const key = ammoKey(w);
  if (S.ammo[key] <= 0) {
    player.fireCd = 0.3;
    hud.toast('Out of ' + w.name + ' ammo — the Armory stocks more');
    return;
  }
  S.ammo[key]--;
  player.fireCd = w.rof;
  SFX.shot(w.id);
  camera.getWorldDirection(_v2);
  const origin = camera.position.clone();
  const targets = collectTargets();
  const pellets = w.pellets || 1;
  let muzzle = null;
  for (let pi = 0; pi < pellets; pi++) {
    const dir = _v2.clone();
    if (w.spread) {
      dir.x += (R() - 0.5) * w.spread * 2;
      dir.y += (R() - 0.5) * w.spread * 2;
      dir.z += (R() - 0.5) * w.spread * 2;
      dir.normalize();
    }
    const hit = rayHit(origin, dir, targets);
    const end = origin.clone().add(dir.multiplyScalar(hit.dist));
    if (!muzzle) {
      muzzle = new THREE.Vector3(player.x - Math.sin(S.camYaw) * 0.5, 1.42, player.z - Math.cos(S.camYaw) * 0.5);
      fx.flash(muzzle);
    }
    fx.tracer(muzzle, end, 0xffe9a8);
    if (hit.target) damageTarget(hit.target, w.dmg);
  }
  S.camPitch = clamp(S.camPitch - 0.0035, -0.08, 1.05);
  if (witnessed(player.x, player.z)) police.addHeat(5);
}

// ---------------------------------------------------------------- player on foot
function updatePlayer(dt) {
  if (S.knockedDown > 0) {
    S.knockedDown -= dt;
    if (S.knockedDown <= 0 && !S.dead) idlePose(player.p);
    player.p.g.position.set(player.x, 0, player.z);
    return;
  }
  const inWater = Math.abs(player.x) > 796 || player.z < -1256 || player.z > 1056;
  const speedBase = (input.sprint ? 7.4 : 4.3) * (inWater ? 0.42 : 1);
  const fx2 = -Math.sin(S.camYaw), fz2 = -Math.cos(S.camYaw);
  const rx = -fz2, rz = fx2;
  let mx = fx2 * -input.mz + rx * input.mx;
  let mz = fz2 * -input.mz + rz * input.mx;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const moving = ml > 0.12 && !S.dialogue;
  if (moving) {
    const tx = player.x + mx * speedBase * dt;
    const tz = player.z + mz * speedBase * dt;
    const cx = collideCircle(tx, player.z, 0.42);
    player.x = cx.x;
    const cz = collideCircle(player.x, tz, 0.42);
    player.z = cz.z;
    if (!input.aim) player.heading = Math.atan2(mx, mz);
    player.phase += dt * (input.sprint ? 11 : 8.2);
    player.stepT -= dt;
    if (player.stepT <= 0) { player.stepT = input.sprint ? 0.3 : 0.42; SFX.step(); }
  }
  // keep the player on the island and its wading band
  player.x = clamp(player.x, -824, 824);
  player.z = clamp(player.z, -1284, 1084);
  if (input.jump && player.y <= 0 && !inWater) player.vy = 5.4;
  player.vy -= 15 * dt;
  player.y += player.vy * dt;
  if (player.y < 0) { player.y = 0; player.vy = 0; }
  if (input.aim || input.attack) player.heading = S.camYaw + Math.PI;
  player.p.g.position.set(player.x, inWater ? player.y - 0.45 : player.y, player.z);
  player.p.g.rotation.y = player.heading;
  if (player.punchT > 0) {
    player.punchT -= dt;
    const k = Math.sin((0.28 - player.punchT) / 0.28 * Math.PI);
    player.p.armR.rotation.x = -1.9 * k;
    player.p.armL.rotation.x = 0.2;
  } else if (input.aim && !WEAPONS[S.weapon].melee) {
    aimPose(player.p);
  } else if (moving) {
    walkPose(player.p, player.phase, input.sprint ? 0.85 : 0.6);
  } else {
    idlePose(player.p);
  }
  player.speed = moving ? speedBase : 0;
}

// ---------------------------------------------------------------- vehicles: enter / drive / exit
function allStealable() {
  const out = [];
  for (const c of traffic) if (!c.dead) out.push(c);
  for (const c of parked) if (!c.dead) out.push(c);
  for (const c of police.cars) if (!c.dead) out.push({ g: c.g, policeRef: c, hp: c.hp });
  return out;
}
function nearestStealable(maxD) {
  const pp = playerPos();
  let best = null, bd = maxD;
  for (const c of allStealable()) {
    const d = Math.hypot(c.g.position.x - pp.x, c.g.position.z - pp.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterCar(ent) {
  // detach from its list
  let ix = traffic.indexOf(ent); if (ix >= 0) traffic.splice(ix, 1);
  ix = parked.indexOf(ent); if (ix >= 0) parked.splice(ix, 1);
  if (ent.policeRef) {
    police.damageCar(ent.policeRef, 0); // no-op touch
    const pc = ent.policeRef;
    const ix2 = police.cars.indexOf(pc); if (ix2 >= 0) police.cars.splice(ix2, 1);
    ent = { g: ent.g, hp: pc.hp, dead: false, stolenPolice: true };
    police.addHeat(45);
    hud.toast('You stole a police car — bad idea, great story');
  }
  ent.heading = ent.g.rotation.y;
  ent.speed = 0;
  ent.steerVis = 0;
  S.inCar = ent;
  // driver ejects and runs if this was a traffic car with a driver
  for (const child of [...ent.g.children]) {
    if (child.type === 'Group' && child !== ent.g.children[0]) { /* person groups are Groups */ }
  }
  const driver = ent.g.children.find(ch => ch.userData && ch.userData.isDriver);
  if (driver) {
    ent.g.remove(driver);
    const gp = ent.g.position;
    const flee = makePerson({});
    flee.g.position.set(gp.x + 2, 0, gp.z + 1);
    scene.add(flee.g);
    peds.push({ p: flee, g: flee.g, from: nearestNode(gp.x, gp.z), to: null, t: 0, speed: 4.6, side: 1, phase: 0, hp: 30, dead: false, deadT: 0, flee: 6, fleeFrom: { x: gp.x, z: gp.z } });
    hud.toast('The driver bails out!');
    if (witnessed(gp.x, gp.z)) police.addHeat(18);
  }
  // seat the player
  ent.g.add(player.p.g);
  const bike = ent.g.userData.isBike;
  player.p.g.position.set(bike ? 0 : -0.38, bike ? 0.62 : -0.5, bike ? -0.1 : 0.1);
  player.p.g.rotation.set(0, 0, 0);
  player.p.g.scale.setScalar(bike ? 0.96 : 1);
  drivePose(player.p);
  SFX.door();
  SFX.engine(true, 0);
}
function exitCar() {
  const ent = S.inCar;
  if (!ent) return;
  scene.add(player.p.g);
  player.p.g.scale.setScalar(1);
  const sideX = Math.cos(ent.heading), sideZ = -Math.sin(ent.heading);
  let px = ent.g.position.x + sideX * 2.1, pz = ent.g.position.z + sideZ * 2.1;
  const col = collideCircle(px, pz, 0.42);
  player.x = col.x; player.z = col.z;
  player.y = 0; player.vy = 0;
  player.heading = ent.heading;
  player.p.g.position.set(player.x, 0, player.z);
  player.p.g.rotation.set(0, player.heading, 0);
  ent.speed = 0;
  parked.push(ent);
  S.inCar = null;
  SFX.door();
  SFX.engine(false, 0);
  SFX.siren(false, 999);
}
function driveCar(dt, nightAmt) {
  const ent = S.inCar;
  const g = ent.g;
  const type = g.userData.type;
  const maxF = TOP_SPEED[type] || 42;
  const fwdIn = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0) + (touchState.active ? -touchState.dy : 0);
  const steerIn = (keys['KeyA'] || keys['ArrowLeft'] ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) + (touchState.active ? touchState.dx : 0);
  const accel = type === 'bus' || type === 'truck' ? 8 : 13.5;
  if (fwdIn > 0) ent.speed += accel * dt * (1 - Math.max(0, ent.speed) / (maxF * 1.15));
  else if (fwdIn < 0) ent.speed -= (ent.speed > 0.5 ? 20 : 7) * dt;
  ent.speed -= ent.speed * 0.32 * dt;
  if (Math.abs(ent.speed) < 0.12 && fwdIn === 0) ent.speed = 0;
  ent.speed = clamp(ent.speed, -10, maxF);
  const turnAuthority = clamp(Math.abs(ent.speed) / 6.5, 0, 1) * (ent.speed < 0 ? -1 : 1);
  ent.heading -= steerIn * turnAuthority * dt * 1.45;
  ent.steerVis = steerIn * 0.42;
  let nx = g.position.x + Math.sin(ent.heading) * ent.speed * dt;
  let nz = g.position.z + Math.cos(ent.heading) * ent.speed * dt;
  // deep water floods the engine
  const inDeep = Math.abs(nx) > 800 || nz < -1260 || nz > 1060;
  if (inDeep && !ent.flooded) {
    ent.flooded = true;
    hud.toast('The engine floods — cars cannot swim. Get out and wade ashore.');
    SFX.crash(false);
  }
  if (ent.flooded) ent.speed *= Math.pow(0.12, dt);
  const r = g.userData.isBike ? 0.75 : 1.55;
  const col = collideCircle(nx, nz, r);
  if (col.hit && Math.abs(ent.speed) > 3) {
    const impact = Math.abs(ent.speed);
    if (impact > 8) {
      ent.hp -= (impact - 7) * 2.4;
      SFX.crash(impact > 15);
      S.shake = Math.min(1, S.shake + impact * 0.012);
      if (impact > 14) hurtPlayer((impact - 12) * 0.7);
      if (ent.hp <= 0 && !ent.dead) { ent.dead = true; ent.chainT = 0.5; hud.toast('Your ride is wrecked!'); }
    }
    ent.speed = -ent.speed * 0.22;
    nx = col.x; nz = col.z;
  }
  g.position.x = nx; g.position.z = nz;
  g.rotation.y = ent.heading;
  // collisions with other vehicles
  for (const list of [traffic, parked]) {
    for (const o of list) {
      if (o.dead) continue;
      const dx = o.g.position.x - nx, dz = o.g.position.z - nz;
      const d = Math.hypot(dx, dz);
      const minD = ((g.userData.len || 4) + (o.g.userData.len || 4)) * 0.36;
      if (d > 0.01 && d < minD) {
        const impact = Math.abs(ent.speed);
        g.position.x -= (dx / d) * (minD - d) * 0.6;
        g.position.z -= (dz / d) * (minD - d) * 0.6;
        if (impact > 5) {
          o.hp -= impact * 1.6; ent.hp -= impact * 1.1;
          SFX.crash(impact > 13);
          S.shake = Math.min(1, S.shake + impact * 0.01);
          if (o.hp <= 0 && !o.dead) { o.dead = true; o.chainT = 0.45; }
          if (witnessed(nx, nz)) police.addHeat(10);
        }
        ent.speed *= 0.4;
      }
    }
  }
  for (const c of police.cars) {
    if (c.dead) continue;
    const dx = c.g.position.x - g.position.x, dz = c.g.position.z - g.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 3.6) {
      if (Math.abs(ent.speed) > 5) { police.damageCar(c, Math.abs(ent.speed) * 1.8); SFX.crash(true); police.addHeat(14); }
      ent.speed *= 0.5;
    }
  }
  // running over peds
  for (const p of peds) {
    if (p.dead || p.sitter) continue;
    const dx = p.g.position.x - g.position.x, dz = p.g.position.z - g.position.z;
    if (Math.abs(dx) < 1.7 && Math.abs(dz) < 1.7 && Math.abs(ent.speed) > 3) {
      p.hp -= Math.abs(ent.speed) * 2.4;
      SFX.crash(false);
      if (p.hp <= 0) { killPed(p); police.addHeat(45); }
      else { p.flee = 5; p.fleeFrom = { x: g.position.x, z: g.position.z }; police.addHeat(28); }
      ent.speed *= 0.93;
    }
  }
  for (const wd of g.userData.wheels) {
    wd.spin.rotation.x += ent.speed * dt / 0.33;
    if (wd.steer) wd.pivot.rotation.y = ent.steerVis;
  }
  setHeadlights(g, nightAmt > 0.25, 1);
  SFX.engine(true, Math.abs(ent.speed) / maxF);
  player.speed = ent.speed;
}

// ---------------------------------------------------------------- traffic update
function updateTraffic(dt, nightAmt) {
  for (let i = traffic.length - 1; i >= 0; i--) {
    const c = traffic[i];
    if (c.dead) {
      c.chainT -= dt;
      if (c.chainT <= 0) {
        const gp = c.g.position;
        scene.remove(c.g);
        traffic.splice(i, 1);
        explode(gp.x, gp.z);
      }
      continue;
    }
    const A = graph.nodes[c.from], B = graph.nodes[c.to];
    const segLen = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    // follow the vehicle ahead on the same lane
    let target = c.cruise;
    for (const o of traffic) {
      if (o === c || o.dead || o.from !== c.from || o.to !== c.to) continue;
      const gap = (o.t - c.t) * segLen - 5.2;
      if (gap > -2 && gap < 7) target = Math.min(target, gap < 2.6 ? 0 : o.speed * 0.85);
    }
    // brake for the player on foot ahead
    if (!S.inCar && S.mode === 'play') {
      const ahead = lanePointAt(A.x, A.z, B.x, B.z, c.w, Math.min(1, c.t + 6 / segLen));
      if (Math.hypot(player.x - ahead.x, player.z - ahead.z) < 2.6) target = 0;
    }
    const accel = target > c.speed ? 5.5 : 13;
    c.speed += clamp(target - c.speed, -accel * dt, accel * dt);
    c.t += c.speed * dt / segLen;
    if (c.t >= 1) {
      c.from = c.to;
      const next = c.queue && c.queue.length ? c.queue.shift() : null;
      if (next === null || next === undefined) {
        const dest = randomNode(R, 9);
        const path = route(c.from, dest);
        if (!path || path.length < 2) { // respawn somewhere sensible
          const n2 = randomNode(R, 10);
          const nb = graph.nodes[n2].edges.filter(e => e.w >= 8);
          if (!nb.length) continue;
          c.from = n2; c.to = nb[0].to; c.t = 0.3;
        } else { c.to = path[1]; c.queue = path.slice(2); c.t = 0; }
      } else { c.to = next; c.t = 0; }
      c.w = edgeWidth(c.from, c.to);
      if (c.w <= 7) c.cruise = 4.5; else if (c.cruise < 7) c.cruise = 8 + R() * 4;
    }
    const A2 = graph.nodes[c.from], B2 = graph.nodes[c.to];
    const p0 = lanePointAt(A2.x, A2.z, B2.x, B2.z, c.w, c.t);
    const p1 = lanePointAt(A2.x, A2.z, B2.x, B2.z, c.w, Math.min(1, c.t + 0.015));
    c.g.position.set(p0.x, 0, p0.z);
    if (p1.x !== p0.x || p1.z !== p0.z) c.g.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    for (const wd of c.g.userData.wheels) wd.spin.rotation.x += c.speed * dt / 0.33;
    setHeadlights(c.g, nightAmt > 0.25, 0.9);
    // anti-stuck watchdog: displacement over time, unless queued behind a car
    c.dispT += dt;
    c.dispAcc += Math.abs(c.speed) * dt;
    if (c.dispT > 6) {
      let queued = false;
      for (const o of traffic) {
        if (o !== c && !o.dead && o.from === c.from && o.to === c.to && (o.t - c.t) * segLen < 6 && o.t > c.t) queued = true;
      }
      if (c.dispAcc < 1.2 && !queued) {
        c.stuckT += 6;
        if (c.stuckT >= 12) {
          // respawn on a random wide edge
          const nodes = graph.nodes.map((n, ix) => [n, ix]).filter(([n]) => n.edges.some(e => e.w >= 12));
          const [nn, nix] = nodes[Math.floor(R() * nodes.length)];
          const e = nn.edges.filter(e2 => e2.w >= 12)[0];
          c.from = nix; c.to = e.to; c.t = 0.4; c.w = e.w; c.speed = 4;
          const dest = randomNode(R, 9);
          const path = route(c.to, dest);
          c.queue = path ? path.slice(1) : [];
          c.stuckT = 0;
        } else {
          // reroute from the nearest node
          const nn = nearestNode(c.g.position.x, c.g.position.z);
          c.from = nn; c.t = 0;
          const dest = randomNode(R, 9);
          const path = route(nn, dest);
          if (path && path.length > 1) { c.to = path[1]; c.queue = path.slice(2); c.w = edgeWidth(c.from, c.to); }
          c.speed = 3;
        }
      } else c.stuckT = 0;
      c.dispT = 0; c.dispAcc = 0;
    }
    if (c.honkT > 0) c.honkT -= dt;
  }
  // parked wrecks burn out too
  for (let i = parked.length - 1; i >= 0; i--) {
    const c = parked[i];
    if (c.dead && c.chainT !== undefined) {
      c.chainT -= dt;
      if (c.chainT <= 0) {
        const gp = c.g.position;
        scene.remove(c.g);
        parked.splice(i, 1);
        explode(gp.x, gp.z);
      }
    }
  }
}

// ---------------------------------------------------------------- peds update
function updatePeds(dt) {
  const pp = playerPos();
  for (let i = peds.length - 1; i >= 0; i--) {
    const ped = peds[i];
    if (ped.dead) {
      ped.deadT += dt;
      if (ped.deadT > 25) { scene.remove(ped.g); peds.splice(i, 1); }
      continue;
    }
    if (ped.sitter) {
      ped.phase += dt;
      ped.p.torso.rotation.x = Math.sin(ped.phase * 0.8) * 0.04;
      continue;
    }
    if (ped.flee > 0 && ped.fleeFrom) {
      ped.flee -= dt;
      const dx = ped.g.position.x - ped.fleeFrom.x, dz = ped.g.position.z - ped.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      const col = collideCircle(ped.g.position.x + dx / d * 5.4 * dt, ped.g.position.z + dz / d * 5.4 * dt, 0.4);
      ped.g.position.x = col.x; ped.g.position.z = col.z;
      ped.g.rotation.y = Math.atan2(dx, dz);
      ped.phase += dt * 11;
      walkPose(ped.p, ped.phase, 0.9);
      continue;
    }
    if (ped.to === null || ped.to === undefined) pickNext(ped, ped.from);
    const pos = pedPosOnEdge(ped, ped.t);
    // yield to nearby traffic
    let blocked = false;
    for (const c of traffic) {
      if (Math.abs(c.g.position.x - pos.x) < 4.5 && Math.abs(c.g.position.z - pos.z) < 4.5) { blocked = true; break; }
    }
    if (!blocked) ped.t += ped.speed * dt / (pos.len || 40);
    if (ped.t >= 1) { ped.from = ped.to; pickNext(ped, ped.from); }
    const np = pedPosOnEdge(ped, ped.t);
    ped.g.position.set(np.x, 0, np.z);
    ped.g.rotation.y = Math.atan2(np.hx, np.hz);
    if (!blocked) { ped.phase += dt * 7 * (ped.speed / 1.4); walkPose(ped.p, ped.phase, 0.55); }
    else idlePose(ped.p);
    // keep the world populated near the player
    if (Math.hypot(ped.g.position.x - pp.x, ped.g.position.z - pp.z) > 620 && peds.length > 100) {
      scene.remove(ped.g);
      peds.splice(i, 1);
    }
  }
  while (peds.filter(p => !p.sitter).length < 92 && R() < 0.3) {
    const ped = spawnPedWalker();
    // spawn new walkers somewhere mid-city, not on top of the player
    const pos = pedPosOnEdge(ped, ped.t);
    ped.g.position.set(pos.x, 0, pos.z);
  }
}

// ---------------------------------------------------------------- dialogue
function startDialogue(lines, onDone) {
  S.dialogue = { lines, i: 0, onDone };
  const L = lines[0];
  hud.dialogue(L.who, L.text);
  SFX.ui();
}
function advanceDialogue() {
  const d = S.dialogue;
  if (!d) return;
  d.i++;
  if (d.i >= d.lines.length) {
    S.dialogue = null;
    hud.dialogue(null);
    if (d.onDone) d.onDone();
  } else {
    const L = d.lines[d.i];
    hud.dialogue(L.who, L.text);
  }
  SFX.ui();
}
function startStoryMission() {
  const def = runner.startStory();
  if (!def) return;
  S.phoneAvail = false;
  refreshGiver();
  startDialogue(def.intro, () => {
    runner.beginStages();
    if (def.id === 'm3') spawnPassenger();
    hud.toast(def.title + ' — follow the red marker');
  });
}
function answerPhone() { startStoryMission(); }
function spawnPassenger() {
  if (passengerPerson) scene.remove(passengerPerson.g);
  passengerPerson = makePerson({ shirt: 0x3d7bd9, head: 'cap' });
  passengerPerson.g.position.set(48, 0, 44);
  scene.add(passengerPerson.g);
}

// ---------------------------------------------------------------- interactions
function onInteractKey() {
  if (S.mode !== 'play' || S.dead) return;
  SFX.init(); SFX.resume();
  if (S.dialogue) { advanceDialogue(); return; }
  if (S.promptAction) { const a = S.promptAction; S.promptAction = null; hud.prompt(null); a(); return; }
  if (S.phoneAvail && !runner.active) { answerPhone(); return; }
}
function onEnterKey() {
  if (S.mode !== 'play' || S.dead || S.dialogue) return;
  SFX.init(); SFX.resume();
  if (S.inBoat) { tryExitBoat(); return; }
  if (S.inCar) { exitCar(); return; }
  if (S.interior) return;
  const boat = nearestBoat(8.5);
  if (boat) { boardBoat(boat); return; }
  const car = nearestStealable(4.6);
  if (car) enterCar(car);
}
function toggleMap() { if (S.mode === 'play') hud.setMapOpen(!hud.mapOpen); }
function acceptSideOffer() {
  if (!S.sideOffer || S.mode !== 'play') return;
  S.sideOffer = false;
  const job = runner.offerSideJob(R);
  if (job) {
    hud.toast((job.kind === 'ojol' ? 'OJOL' : 'DELIVERY') + ' job accepted — follow the ' + (job.kind === 'ojol' ? 'blue' : 'green') + ' marker');
    SFX.buy();
  }
}
addEventListener('keydown', e => {
  if (e.code === 'KeyQ' && S.shopNear && S.mode === 'play') buyArmor();
});
let lastMouseMoveT = -9;
addEventListener('mousemove', () => { lastMouseMoveT = S.elapsed; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.mode === 'play' && !S.interior) saveGame(false, true);
});

// ---------------------------------------------------------------- boats
function nearestBoat(maxD) {
  const pp = playerPos();
  let best = null, bd = maxD;
  for (const b of worldRefs.boats) {
    const d = Math.hypot(b.group.position.x - pp.x, b.group.position.z - pp.z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function boardBoat(b) {
  S.inBoat = b;
  if (b.speed === undefined) b.speed = 0;
  b.heading = b.group.rotation.y;
  b.group.add(player.p.g);
  player.p.g.position.set(0, 0.72, -0.7);
  player.p.g.rotation.set(0, 0, 0);
  idlePose(player.p);
  SFX.splash();
  hud.toast('A motorboat — W/S throttle, A/D steer. F to step ashore near land.');
}
function tryExitBoat() {
  const b = S.inBoat;
  const bp = b.group.position;
  const sx = clamp(bp.x, -772, 772), sz = clamp(bp.z, -1232, 1032);
  if (Math.hypot(bp.x - sx, bp.z - sz) < 20) {
    scene.add(player.p.g);
    const col = collideCircle(sx, sz, 0.42);
    player.x = col.x; player.z = col.z;
    player.p.g.position.set(player.x, 0, player.z);
    S.inBoat = null;
    SFX.splash();
    SFX.engine(false, 0);
  } else hud.toast('Too far from shore — steer closer to land');
}
function updateBoat(dt) {
  const b = S.inBoat, g = b.group;
  const fwdIn = (keys['KeyW'] ? 1 : 0) + (keys['KeyS'] ? -1 : 0) + (touchState.active ? -touchState.dy : 0);
  const steerIn = (keys['KeyA'] ? -1 : 0) + (keys['KeyD'] ? 1 : 0) + (touchState.active ? touchState.dx : 0);
  b.speed += fwdIn * 7 * dt;
  b.speed -= b.speed * 0.5 * dt;
  b.speed = clamp(b.speed, -4, 13);
  b.heading -= steerIn * dt * 0.7 * (b.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(b.speed) / 4 + 0.25);
  const px = g.position.x, pz = g.position.z;
  let nx = px + Math.sin(b.heading) * b.speed * dt;
  let nz = pz + Math.cos(b.heading) * b.speed * dt;
  if (Math.abs(nx) < 784 && nz > -1244 && nz < 1044) { nx = px; nz = pz; b.speed *= -0.25; SFX.crash(false); }
  g.position.x = clamp(nx, -905, 905);
  g.position.z = clamp(nz, -1470, 1230);
  g.position.y = Math.sin(S.elapsed * 1.35) * 0.07;
  g.rotation.y = b.heading;
  g.rotation.x = Math.sin(S.elapsed * 1.1) * 0.02;
  g.rotation.z = Math.sin(S.elapsed * 0.9) * 0.025;
  SFX.engine(true, Math.abs(b.speed) / 16);
  player.speed = b.speed;
}

// ---------------------------------------------------------------- places
function enterInterior(kind, x, z) {
  S.interior = kind;
  player.x = x; player.z = z; player.y = 0; player.vy = 0;
  player.p.g.position.set(x, 0, z);
  SFX.door();
}
function leaveInterior(x, z) {
  S.interior = null;
  player.x = x; player.z = z;
  player.p.g.position.set(x, 0, z);
  SFX.door();
}
function payNSpray() {
  if (!S.inCar) return;
  if (S.money < 50000) { hud.toast('Pay N Spray costs Rp 50,000'); return; }
  S.money -= 50000;
  S.inCar.hp = 110;
  police.clearAll();
  hud.setMoney(S.money);
  hud.toast('Fresh paint, fixed panels — and the heat is gone');
  SFX.buy();
}
function placePrompt(id) {
  const stars = police.stars;
  if (id === 'polsek') {
    if (stars > 0) {
      const fine = 25000 * stars;
      hud.prompt('E — Surrender: pay Rp ' + fine.toLocaleString('en-US') + ' and clear your name');
      S.promptAction = () => {
        if (S.money < fine) { hud.toast('You cannot afford the fine'); return; }
        S.money -= fine; hud.setMoney(S.money);
        police.clearAll();
        hud.toast('Case closed — walk free');
        SFX.buy();
      };
    } else {
      hud.prompt('POLSEK — the officers nod at you');
      S.promptAction = () => hud.toast('All quiet on this beat, citizen.');
    }
  } else if (id === 'rsud') {
    if (S.hp < 100) {
      hud.prompt('E — Get treated (Rp 20,000) — full health');
      S.promptAction = () => {
        if (S.money < 20000) { hud.toast('Not enough money'); return; }
        S.money -= 20000; S.hp = 100; hud.setMoney(S.money);
        hud.toast('Patched up — good as new');
        SFX.buy();
      };
    } else {
      hud.prompt('RSUD Hospital — you feel fine');
      S.promptAction = () => hud.toast('The nurse smiles: stay healthy out there.');
    }
  } else if (id === 'gunshop') {
    S.shopNear = true;
    const w = WEAPONS[S.weapon];
    hud.prompt('ARMORY — E: ammo for ' + w.name + ' · Q: armor Rp 30,000 · keys 2-6 buy: Machete 15k · SMG 60k · Shotgun 85k · Rifle 120k');
    S.promptAction = buyAmmo;
  } else if (id === 'bengkel') {
    hud.prompt('BENGKEL — Pay N Spray works from the driver seat (Rp 50,000)');
    S.promptAction = () => hud.toast('Hop in a car and pull up to the workshop');
  } else if (id === 'karaoke') {
    hud.prompt('E — Enter STAR KARAOKE');
    S.promptAction = () => enterInterior('karaoke', 1150, 693.5);
  } else if (id === 'house') {
    if (S.houseOwned) {
      hud.prompt('E — Save the game at your house');
      S.promptAction = () => saveGame(false);
    } else {
      hud.prompt('E — Buy this house (Rp 300,000) — a permanent save point');
      S.promptAction = () => {
        if (S.money < 300000) { hud.toast('Not enough money — the agent shakes his head'); return; }
        S.money -= 300000; S.houseOwned = true; hud.setMoney(S.money);
        hud.toast('The house is yours — save here any time');
        SFX.cash();
      };
    }
  } else if (id === 'singgah') {
    hud.prompt('E — Save the game');
    S.promptAction = () => saveGame(false);
  } else if (id === 'gbk') {
    hud.prompt('GBK Stadium — Senayan');
    S.promptAction = () => hud.toast('Gelora Bung Karno — 77,000 seats roar on matchday');
  } else if (id === 'masjid') {
    hud.prompt('Grand Mosque');
    S.promptAction = () => hud.toast('Peace be upon you — the courtyard is quiet');
  } else if (id === 'monas') {
    hud.prompt('Monas — National Monument');
    S.promptAction = () => hud.toast('Monas: 132 metres of gold-tipped pride');
  } else hud.prompt(null);
}
function scanPrompts() {
  S.promptAction = null;
  S.shopNear = false;
  if (S.mode !== 'play' || S.dead || S.dialogue) { hud.prompt(null); return; }
  const pp = playerPos();
  if (S.inBoat) { hud.prompt('F — Step ashore (near land)'); return; }
  if (S.inCar) {
    const bp = PLACES.bengkel;
    if (Math.hypot(pp.x - bp.px, pp.z - bp.pz) < 10) {
      hud.prompt('E — Pay N Spray: repair + lose the heat (Rp 50,000)');
      S.promptAction = payNSpray;
    } else hud.prompt('F — Exit vehicle · H — Horn');
    return;
  }
  if (S.interior === 'karaoke') {
    if (Math.hypot(pp.x - 1150, pp.z - 683.4) < 4.4) {
      hud.prompt('E — Buy a drink (Rp 10,000) · +25 HP');
      S.promptAction = () => {
        if (S.money < 10000) { hud.toast('Not enough money'); return; }
        S.money -= 10000; S.hp = Math.min(100, S.hp + 25); hud.setMoney(S.money);
        hud.toast('You feel better already');
        SFX.buy();
      };
    } else if (Math.hypot(pp.x - 1150, pp.z - 695.2) < 3.8) {
      hud.prompt('E — Leave STAR KARAOKE');
      S.promptAction = () => leaveInterior(150, 252);
    } else hud.prompt(null);
    return;
  }
  if (S.interior === 'rumah') {
    if (Math.hypot(pp.x - 1000, pp.z - 692.4) < 3.4) {
      hud.prompt('E — Leave the house');
      S.promptAction = () => leaveInterior(KAMPUNG_DOOR.x, KAMPUNG_DOOR.z - 6);
    } else if (Math.hypot(pp.x - 1003.2, pp.z - 685.6) < 3.4) {
      hud.prompt('E — Rest (+15 HP · an hour passes)');
      S.promptAction = () => {
        S.hp = Math.min(100, S.hp + 15);
        S.minutes = (S.minutes + 60) % 1440;
        hud.toast('You rest on the old bed');
        SFX.buy();
      };
    } else hud.prompt(null);
    return;
  }
  let best = null, bd = 4.4;
  for (const id in PLACES) {
    const p = PLACES[id];
    const d = Math.hypot(pp.x - p.px, pp.z - p.pz);
    if (d < bd) { bd = d; best = id; }
  }
  if (best) { placePrompt(best); return; }
  if (Math.hypot(pp.x - KAMPUNG_DOOR.x, pp.z - KAMPUNG_DOOR.z) < 3.8) {
    hud.prompt('E — Enter the kampung house');
    S.promptAction = () => enterInterior('rumah', 1000, 689);
    return;
  }
  if (giverPerson && runner.nextDef) {
    const g = runner.nextDef.giver;
    if (Math.hypot(pp.x - g.x, pp.z - g.z) < 4.8) {
      hud.prompt('E — Talk: ' + runner.nextDef.title);
      S.promptAction = () => startStoryMission();
      return;
    }
  }
  if (nearestBoat(9)) { hud.prompt('F — Board the boat'); return; }
  const car = nearestStealable(4.6);
  if (car) {
    hud.prompt('F — ' + (car.g.userData.isBike ? 'Ride' : 'Drive') + ' the ' + (car.g.userData.def ? car.g.userData.def.name : 'vehicle'));
    return;
  }
  if (S.phoneAvail) { hud.prompt('E — Answer your phone'); return; }
  if (S.sideOffer) { hud.prompt('J — Accept the job on your phone'); return; }
  hud.prompt(null);
}

// ---------------------------------------------------------------- wasted / busted
let deadT = 0;
function doWasted() {
  if (S.dead) return;
  S.dead = true; S.deadKind = 'wasted'; deadT = 0;
  hud.bigState('WASTED');
  if (!S.inCar && !S.inBoat) downPose(player.p);
  SFX.boom();
}
function doBusted() {
  if (S.dead) return;
  S.dead = true; S.deadKind = 'busted'; deadT = 0;
  const fine = police.stars * 10000;
  S.money = Math.max(0, S.money - fine);
  hud.setMoney(S.money);
  hud.bigState('BUSTED');
  police.clearAll();
  SFX.hurt();
}
function respawn() {
  if (S.inCar) exitCar();
  if (S.inBoat) {
    scene.add(player.p.g);
    player.p.g.position.set(player.x, 0, player.z);
    S.inBoat = null;
    SFX.engine(false, 0);
  }
  S.dead = false; S.knockedDown = 0; S.invuln = 2;
  hud.bigState(null);
  idlePose(player.p);
  if (S.deadKind === 'busted') {
    player.x = -70; player.z = -136;
    S.hp = Math.max(S.hp, 60);
    hud.toast('Released from POLSEK — lighter by the fine');
  } else {
    player.x = 70; player.z = 252;
    S.hp = 100;
    const bill = Math.min(S.money, 7500);
    S.money -= bill; hud.setMoney(S.money);
    police.clearAll();
    hud.toast('RSUD patched you up — bill Rp ' + bill.toLocaleString('en-US'));
  }
  player.p.g.position.set(player.x, 0, player.z);
  S.camYaw = Math.PI;
}

// ---------------------------------------------------------------- saves
function saveGame(manual, silent) {
  if (S.interior || S.mode !== 'play') return;
  const pp = playerPos();
  const data = {
    money: S.money, hp: S.hp, armor: S.armor, ammo: S.ammo, owned: S.owned,
    weapon: S.weapon, minutes: S.minutes, day: S.day, idx: runner.index,
    completedAll: runner.completedAll, houseOwned: S.houseOwned, x: pp.x, z: pp.z,
  };
  try { localStorage.setItem(manual ? MANUAL_KEY : SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage full/blocked */ }
  if (!silent) hud.toast('Game saved');
}
function loadSave(which) {
  try {
    const raw = localStorage.getItem(which === 'manual' ? MANUAL_KEY : SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function applySave(d) {
  S.money = d.money ?? 250000;
  S.hp = d.hp ?? 100;
  S.armor = d.armor ?? 0;
  S.ammo = Object.assign({}, S.ammo, d.ammo || {});
  S.owned = Object.assign({}, S.owned, d.owned || {});
  S.weapon = d.weapon ?? 2;
  S.minutes = d.minutes ?? 720;
  S.day = d.day ?? 0;
  runner.index = d.idx ?? 0;
  runner.completedAll = !!d.completedAll;
  S.houseOwned = !!d.houseOwned;
  player.x = d.x ?? SPAWN.x;
  player.z = d.z ?? SPAWN.z;
  player.p.g.position.set(player.x, 0, player.z);
}
function startGame(which) {
  S.mode = 'play';
  S.started = true;
  menuEl.classList.add('hidden');
  hud.show();
  if (which) {
    const d = loadSave(which);
    if (d) applySave(d);
  } else {
    S.minutes = 720;
    S.day = 0;
  }
  hud.setMoney(S.money);
  refreshGiver();
  const def = runner.nextDef;
  if (def && def.phone) checkPhoneMission();
  else if (def) hud.toast('Find ' + def.giver.name + ' — the gold marker — to start ' + def.title);
  SFX.init(); SFX.resume();
}
// menu wiring (the menu DOM lives in index.html)
const menuEl = document.getElementById('menu');
function refreshMenuButtons() {
  const bC = document.getElementById('btnContinue');
  const bL = document.getElementById('btnLoad');
  if (bC) bC.style.display = loadSave('auto') ? '' : 'none';
  if (bL) bL.style.display = loadSave('manual') ? '' : 'none';
}
document.getElementById('btnNew').addEventListener('click', () => { SFX.init(); SFX.resume(); startGame(null); });
document.getElementById('btnContinue').addEventListener('click', () => { SFX.init(); SFX.resume(); startGame('auto'); });
document.getElementById('btnLoad').addEventListener('click', () => { SFX.init(); SFX.resume(); startGame('manual'); });
document.getElementById('btnControls').addEventListener('click', () => {
  document.getElementById('controlsCard').classList.toggle('hidden');
  SFX.init(); SFX.ui();
});

// ---------------------------------------------------------------- cheats
let cheatBuf = '';
function spawnCheatVehicle(kind, paint) {
  const fx2 = Math.sin(player.heading), fz2 = Math.cos(player.heading);
  const x = player.x + fx2 * 7, z = player.z + fz2 * 7;
  let g;
  if (kind === 'bike') g = makeBike('sportbike', 0xd94f3d);
  else g = makeVehicle(kind, paint);
  g.position.set(x, 0, z);
  g.rotation.y = player.heading;
  scene.add(g);
  parked.push({ g, hp: 110, dead: false, parked: true });
}
const CHEATS = {
  BANYAKDUIT() { S.money += 250000; S.hp = 100; S.armor = 100; hud.setMoney(S.money); },
  MOBIL() { spawnCheatVehicle('falco', 0x2e6fd9); },
  MOTOR() { spawnCheatVehicle('bike'); },
  SENJATA() {
    for (const id in S.owned) S.owned[id] = true;
    S.ammo.pistol = 300; S.ammo.smg = 600; S.ammo.shells = 80; S.ammo.rifle = 300;
  },
  BINTANG5() { police.addHeat(520); },
  BERSIH() { police.clearAll(); },
  SEHAT() { S.hp = 100; },
  ROMPI() { S.armor = 100; },
  SIANG() { S.minutes = 720; },
  MALAM() { S.minutes = 0; },
  JAKARTA() { S.money += 100000; hud.setMoney(S.money); spawnCheatVehicle('vulcan', 0xd8a920); },
};
function typeCheat(key) {
  if (!key || key.length !== 1 || !/[a-zA-Z]/.test(key)) return;
  cheatBuf = (cheatBuf + key.toUpperCase()).slice(-12);
  for (const code in CHEATS) {
    if (cheatBuf.endsWith(code)) {
      CHEATS[code]();
      cheatBuf = '';
      hud.toast('Cheat activated: ' + code);
      SFX.cash();
      break;
    }
  }
}

// ---------------------------------------------------------------- camera
const camTarget = new THREE.Vector3();
let shotFreeze = null, shotSnap = false;
function updateCamera(dt) {
  if (S.mode === 'menu') {
    if (shotFreeze) {
      camera.position.copy(shotFreeze.pos);
      camera.lookAt(shotFreeze.look);
      return;
    }
    const t = S.elapsed * 0.045;
    camera.position.set(Math.sin(t) * 34, 13 + Math.sin(S.elapsed * 0.1) * 2.5, 168 + Math.cos(t * 0.7) * 44);
    camera.lookAt(0, 9, 20);
    return;
  }
  const pp = playerPos();
  camTarget.set(pp.x, S.interior ? 1.4 : (S.inCar || S.inBoat) ? 2.1 : 1.75, pp.z);
  if (S.inCar && S.elapsed - lastMouseMoveT > 2.2) {
    const want = S.inCar.heading + Math.PI;
    let d = want - S.camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    S.camYaw += d * Math.min(1, dt * 2.4);
  }
  const dist = S.interior ? 3.4 : S.inCar ? 10.5 + Math.abs(S.inCar.speed) * 0.07 : S.inBoat ? 11.5 : 7.6;
  const off = new THREE.Vector3(
    Math.sin(S.camYaw) * Math.cos(S.camPitch),
    Math.sin(S.camPitch),
    Math.cos(S.camYaw) * Math.cos(S.camPitch)).multiplyScalar(dist);
  const pos = camTarget.clone().add(off);
  pos.y = Math.max(pos.y, 0.7);
  if (shotSnap) camera.position.copy(pos);
  else camera.position.lerp(pos, Math.min(1, dt * 13));
  const look = camTarget.clone();
  look.y += 0.35;
  if (S.shake > 0) {
    look.x += (R() - 0.5) * S.shake * 1.5;
    look.y += (R() - 0.5) * S.shake * 0.9;
    S.shake = Math.max(0, S.shake - dt * 1.7);
  }
  camera.lookAt(look);
}

// ---------------------------------------------------------------- clock / weather
function updateClockWeather(dt) {
  if (S.mode === 'play') {
    S.minutes += dt * 1.2;
    if (S.minutes >= 1440) { S.minutes -= 1440; S.day++; }
  }
  S.weatherT -= dt;
  if (S.weatherT <= 0) {
    if (S.weatherTarget === 0) {
      S.weatherTarget = 1;
      S.weatherT = 35 + R() * 45;
      if (S.mode === 'play') hud.toast('Rain moving in over the bay');
    } else {
      S.weatherTarget = 0;
      S.weatherT = 80 + R() * 90;
      if (S.mode === 'play') hud.toast('The rain clears over Jakarta');
    }
  }
  S.weather += clamp(S.weatherTarget - S.weather, -dt * 0.03, dt * 0.03);
}

// ---------------------------------------------------------------- HUD refresh
function fmtTimer(t) {
  if (t === null || t === undefined) return '';
  return ' — <span class="' + (t < 15 ? 'timer-low' : '') + '">' + Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '</span>';
}
function refreshHUD(pp) {
  hud.setClock(S.minutes, S.day);
  hud.setStars(police.stars);
  hud.setBars(S.hp, S.armor);
  const w = WEAPONS[S.weapon];
  hud.setWeapon(w.name, w.melee ? '' : String(S.ammo[w.ammo] ?? 0));
  let obj;
  if (runner.side) obj = '<b>' + (runner.side.kind === 'ojol' ? 'OJOL' : 'DELIVERY') + '</b> — ' + runner.currentLabel() + fmtTimer(runner.sideTimer());
  else if (runner.active) obj = '<b>' + runner.active.def.title + '</b> — ' + runner.currentLabel() + fmtTimer(runner.storyTimer());
  else if (runner.nextDef) obj = runner.nextDef.phone
    ? 'Your phone will ring — <b>' + runner.nextDef.title + '</b> is next'
    : 'Talk to <b>' + runner.nextDef.giver.name + '</b> — <b>' + runner.nextDef.title + '</b>';
  else obj = 'Free roam — Jakarta is yours. Side jobs ring in (J).';
  hud.objective(obj);
  hud.speed(S.inCar ? Math.abs(S.inCar.speed) * 3.6 : S.inBoat ? Math.abs(S.inBoat.speed) * 3.6 : null);
  const t = runner.currentTarget();
  if (t) marker.show(t.x, t.z, runner.side ? (runner.side.kind === 'ojol' ? 0x53b6ff : 0x51e07a) : 0xff3b30);
  else if (runner.nextDef && !runner.nextDef.phone && !runner.active) marker.show(runner.nextDef.giver.x, runner.nextDef.giver.z, 0xffd94d);
  else marker.hide();
  const heading = S.inCar ? S.inCar.heading : player.heading;
  const mmMarker = t || (runner.nextDef && !runner.nextDef.phone && !runner.active ? { x: runner.nextDef.giver.x, z: runner.nextDef.giver.z } : null);
  hud.drawMinimap({
    player: { x: pp.x, z: pp.z, sx: Math.sin(heading), sz: Math.cos(heading) },
    cars: traffic.map(c => c.g.position),
    police: [...police.cars.map(c => c.g.position), ...police.officers.map(o => o.g.position)],
    marker: mmMarker, time: S.elapsed, blink: S.blink,
  });
  if (hud.mapOpen) hud.drawWorldMap({ player: { x: pp.x, z: pp.z, sx: Math.sin(heading), sz: Math.cos(heading) }, marker: mmMarker, time: S.elapsed });
}

// ---------------------------------------------------------------- per-frame play
function missionGlue(dt, pp) {
  const activeDef = runner.active ? runner.active.def : null;
  const res = runner.update(dt, pp.x, pp.z, !!S.inCar);
  if (res === 'complete') {
    if (activeDef) startDialogue(activeDef.outro, () => refreshGiver());
    refreshGiver();
  } else if (res === 'failed') {
    refreshGiver();
  } else if (res === 'stage') {
    if (activeDef && activeDef.id === 'm3' && passengerPerson) {
      scene.remove(passengerPerson.g);
      passengerPerson = null;
    }
  }
}
function playFrame(dt, env) {
  const nightAmt = env.nightAmt;
  if (S.dead) {
    deadT += dt;
    if (deadT > 2.8) respawn();
  } else if (!S.dialogue) {
    if (S.inCar) driveCar(dt, nightAmt);
    else if (S.inBoat) updateBoat(dt);
    else updatePlayer(dt);
    tryFire(dt);
  } else {
    player.p.g.position.set(player.x, player.y, player.z);
  }
  updateTraffic(dt, nightAmt);
  updatePeds(dt);
  const pp = playerPos();
  const vx = (pp.x - (playFrame._lx !== undefined ? playFrame._lx : pp.x)) / Math.max(dt, 0.001);
  const vz = (pp.z - (playFrame._lz !== undefined ? playFrame._lz : pp.z)) / Math.max(dt, 0.001);
  playFrame._lx = pp.x; playFrame._lz = pp.z;
  const speedNow = S.inCar ? Math.abs(S.inCar.speed) : Math.hypot(vx, vz);
  police.update(dt, {
    x: pp.x, z: pp.z,
    heading: S.inCar ? S.inCar.heading : player.heading,
    vx, vz, speed: speedNow,
    inCar: !!S.inCar, knockedDown: S.knockedDown > 0, dead: S.dead,
  }, nightAmt);
  if (!S.dialogue && !S.dead) missionGlue(dt, pp);
  scanPrompts();
  // side job offers
  if (!runner.active && !runner.side && !S.dialogue && !S.dead) {
    S.sideOfferT -= dt;
    if (S.sideOfferT <= 0 && !S.sideOffer) {
      S.sideOffer = true;
      S.sideOfferCd = 18;
      hud.toast('New job on your phone — press J to accept');
      SFX.buy();
      S.sideOfferT = 65 + R() * 45;
    }
  }
  if (S.sideOffer) {
    S.sideOfferCd -= dt;
    if (S.sideOfferCd <= 0) S.sideOffer = false;
  }
  updateClockWeather(dt);
  S.autosaveT -= dt;
  if (S.autosaveT <= 0) { S.autosaveT = 15; if (!S.interior) saveGame(false, true); }
  if (giverPerson) idlePose(giverPerson, S.elapsed);
  if (passengerPerson) {
    passengerPerson.armR.rotation.z = 2.6 + Math.sin(S.elapsed * 5.5) * 0.3;
    passengerPerson.armR.rotation.x = -0.3;
  }
  const zn = S.interior ? (S.interior === 'karaoke' ? 'STAR KARAOKE' : 'KAMPUNG HOUSE') : zoneName(pp.x, pp.z);
  if (zn !== S.zone) { S.zone = zn; hud.zone(zn); }
  refreshHUD(pp);
}

// ---------------------------------------------------------------- shot staging
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
let shotFrames = 0;
if (shotMode === 'menu') {
  S.minutes = 17 * 60 + 15; // golden hour: orange horizon, windows coming on
  shotFreeze = { pos: new THREE.Vector3(8, 14, -170), look: new THREE.Vector3(0, 7, 40) };
  // avenue traffic in the menu vista, both directions
  spawnTrafficCar(nearestNode(0, -300), nearestNode(0, -16), 0.35);
  spawnTrafficCar(nearestNode(0, -300), nearestNode(0, -16), 0.8);
  spawnTrafficCar(nearestNode(0, 485), nearestNode(0, 76), 0.5);
  spawnTrafficCar(nearestNode(44, 30), nearestNode(400, 30), 0.3);
} else if (shotMode) {
  startGame(null);
  shotSnap = true;
  if (shotMode === 'bundaran') {
    S.minutes = 640;
    player.x = 30; player.z = 64;
    player.heading = Math.atan2(0 - 30, 30 - 64);
    player.p.g.position.set(player.x, 0, player.z);
    player.p.g.rotation.y = player.heading;
    S.camYaw = 0.68; S.camPitch = 0.5;
    // traffic circulating the ring and feeding in from the south
    spawnTrafficCar(nearestNode(25, 30), nearestNode(17.7, 47.7), 0.3);
    spawnTrafficCar(nearestNode(0, 55), nearestNode(-17.7, 47.7), 0.5);
    spawnTrafficCar(nearestNode(-17.7, 12.3), nearestNode(0, 5), 0.4);
    spawnTrafficCar(nearestNode(0, 76), nearestNode(0, 55), 0.5);
    spawnTrafficCar(nearestNode(-44, 30), nearestNode(-25, 30), 0.45);
  } else if (shotMode === 'mission') {
    S.minutes = 580;
    player.x = 11.5; player.z = -858;
    player.heading = Math.atan2(8 - 11.5, -866 - -858);
    player.p.g.position.set(player.x, 0, player.z);
    player.p.g.rotation.y = player.heading;
    S.camYaw = 0.35; S.camPitch = 0.3;
    spawnTrafficCar(nearestNode(0, -1000), nearestNode(0, -880), 0.45);
    spawnTrafficCar(nearestNode(-400, -1000), nearestNode(0, -1000), 0.8);
    const stand = makePerson({ shirt: 0xe8e4da, head: 'peci' });
    stand.g.position.set(8, 0, -866);
    stand.g.rotation.y = Math.atan2(17 - 8, -850 - -866);
    scene.add(stand.g);
    const def = runner.startStory();
    if (def) startDialogue(def.intro, () => {});
  } else if (shotMode === 'night') {
    S.minutes = 1290;
    const g = makeVehicle('falco', 0x2e6fd9);
    g.position.set(4, 0, 330);
    g.rotation.y = Math.PI;
    scene.add(g);
    const ent = { g, hp: 110, dead: false, parked: true };
    parked.push(ent);
    enterCar(ent);
    if (S.inCar) { S.inCar.speed = 15; S.inCar.heading = Math.PI; }
    S.camYaw = 0; S.camPitch = 0.3;
    police.addHeat(300);
  }
}

// ---------------------------------------------------------------- main loop
const clockT = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clockT.getDelta(), 0.05);
  S.elapsed += dt;
  S.blinkT += dt;
  if (S.blinkT > 0.5) { S.blinkT = 0; S.blink = !S.blink; }
  if (S.invuln > 0) S.invuln -= dt;
  readMoveInput();
  const focus = S.mode === 'menu' ? { x: 0, z: 30 } : playerPos();
  const env = updateEnvironment(scene, S.minutes, S.weather, focus, S.elapsed);
  marker.update(dt);
  if (S.mode === 'menu') {
    updateTraffic(dt, env.nightAmt);
    updatePeds(dt);
    refreshMenuButtons();
  } else {
    playFrame(dt, env);
  }
  fx.update(dt);
  hud.update(dt);
  updateCamera(dt);
  // adaptive quality: trade pixels and shadows for a stable frame rate
  S.fpsAcc += dt; S.fpsN++; S.fpsT += dt;
  if (S.fpsT > 4) {
    const fps = S.fpsN / Math.max(S.fpsAcc, 0.001);
    if (fps < 32 && S.quality < 2) {
      S.quality++;
      if (S.quality === 1) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
      if (S.quality === 2) {
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = false;
        if (worldRefs.sunLight) worldRefs.sunLight.castShadow = false;
        scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
      }
    } else if (fps > 57 && S.quality > 0) {
      S.quality--;
      renderer.setPixelRatio(S.quality === 0 ? Math.min(devicePixelRatio, 1.75) : Math.min(devicePixelRatio, 1.25));
      if (S.quality < 2) {
        renderer.shadowMap.enabled = true;
        if (worldRefs.sunLight) worldRefs.sunLight.castShadow = true;
        scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
      }
    }
    S.fpsAcc = 0; S.fpsN = 0; S.fpsT = 0;
  }
  renderer.render(scene, camera);
  if (shotMode && ++shotFrames > 130) window.__SHOT_READY = true;
}
animate();
refreshGiver();
hud.setMoney(S.money);

// debug / rig hooks
window.__JC = {
  S, scene, camera, renderer, player, traffic, parked, peds, police, runner, hud, worldRefs,
  teleport(x, z) {
    if (S.inCar) S.inCar.g.position.set(x, 0, z);
    else { player.x = x; player.z = z; player.p.g.position.set(x, 0, z); }
  },
  setMinutes(m) { S.minutes = m; },
  addWanted(n) { police.addHeat(n); },
  start: startGame,
  colliders: () => colliderCount(),
  graph: () => ({ nodes: graph.nodes.length, edges: graph.nodes.reduce((a, n) => a + n.edges.length, 0) }),
  zone: () => S.zone,
  mission: () => ({ idx: runner.index, active: runner.active ? runner.active.def.id : null, side: !!runner.side, phone: S.phoneAvail }),
  enterNearest() { const c = nearestStealable(7); if (c) enterCar(c); },
  dialogue: () => !!S.dialogue,
  advance: () => advanceDialogue(),
  talk() { onInteractKey(); },
};
