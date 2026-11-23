// people.js — capsule characters: coloured clothes, skin tones, hair / cap /
// peci / hijab / helmet head styles, and pose helpers (walk, sit, drive, aim).
import * as THREE from 'three';
import { rng } from './textures.js';

const SKIN = [0xf2c9a0, 0xe0ac82, 0xc68863, 0x9c6642, 0x7a4a2b];
const SHIRT = [0xd94f3d, 0x3d7bd9, 0x53b06a, 0xf2b13d, 0xe8e4da, 0x7a4fd0, 0x2ea8a0, 0xe06aa8, 0x44506b, 0xf2762e, 0x8a5a3b, 0xbfd9e8];
const PANTS = [0x2e3440, 0x4a3b2c, 0x5b6e8c, 0x707880, 0x30381f, 0x8c2f39, 0xd8d3c3];
const HEAD_STYLES = ['hair', 'hair', 'cap', 'peci', 'hijab', 'helmet', 'bald'];

const matCache = new Map();
function mat(color) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(color, m); }
  return m;
}
function capsule(r, len, color) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 10), mat(color));
  m.castShadow = true;
  return m;
}
function limb(r, len, color) {
  // a limb pivoting at its top: geometry translated so origin = shoulder/hip
  const geo = new THREE.CapsuleGeometry(r, len, 3, 8);
  geo.translate(0, -(len / 2 + r * 0.4), 0);
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = true;
  return m;
}

let personSeed = 5000;
export function makePerson(o) {
  o = o || {};
  const R = rng(personSeed += 7);
  const skin = o.skin !== undefined ? o.skin : SKIN[Math.floor(R() * SKIN.length)];
  const shirt = o.shirt !== undefined ? o.shirt : SHIRT[Math.floor(R() * SHIRT.length)];
  const pants = o.pants !== undefined ? o.pants : PANTS[Math.floor(R() * PANTS.length)];
  const style = o.head || HEAD_STYLES[Math.floor(R() * HEAD_STYLES.length)];
  const g = new THREE.Group();

  const legL = limb(0.085, 0.62, pants); legL.position.set(-0.11, 0.86, 0);
  const legR = limb(0.085, 0.62, pants); legR.position.set(0.11, 0.86, 0);
  const torso = capsule(0.21, 0.5, shirt); torso.position.y = 1.22; torso.scale.set(1.15, 1, 0.82);
  const armL = limb(0.07, 0.55, shirt); armL.position.set(-0.31, 1.48, 0);
  const armR = limb(0.07, 0.55, shirt); armR.position.set(0.31, 1.48, 0);
  const headG = new THREE.Group(); headG.position.y = 1.78;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), mat(skin));
  head.castShadow = true;
  headG.add(head);
  if (style === 'hair' || style === 'cap') {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mat(style === 'cap' ? SHIRT[Math.floor(R() * SHIRT.length)] : 0x2b2118));
    top.position.y = 0.025; headG.add(top);
    if (style === 'cap') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.03, 12), top.material);
      brim.position.set(0, 0.06, 0.1); headG.add(brim);
    }
  } else if (style === 'peci') {
    const peci = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.165, 0.13, 14), mat(0x1c1c22));
    peci.position.y = 0.1; headG.add(peci);
  } else if (style === 'hijab') {
    const hijab = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 12), mat(SHIRT[Math.floor(R() * SHIRT.length)]));
    hijab.scale.set(1, 1.12, 1); hijab.position.y = 0.01; headG.add(hijab);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), mat(skin));
    face.position.set(0, -0.01, 0.045); headG.add(face);
  } else if (style === 'helmet') {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      mat([0xe8b13d, 0xd94f3d, 0x3d7bd9][Math.floor(R() * 3)]));
    helm.position.y = 0.03; headG.add(helm);
  }
  g.add(legL, legR, torso, armL, armR, headG);
  return { g, legL, legR, armL, armR, headG, torso };
}

// Swing limbs for walking; phase advances with distance travelled.
export function walkPose(p, phase, amp) {
  const s = Math.sin(phase) * (amp || 0.55);
  p.legL.rotation.x = s; p.legR.rotation.x = -s;
  p.armL.rotation.x = -s * 0.75; p.armR.rotation.x = s * 0.75;
  p.armL.rotation.z = 0.08; p.armR.rotation.z = -0.08;
  p.torso.rotation.x = 0.04;
}
export function idlePose(p, t) {
  p.legL.rotation.x = 0; p.legR.rotation.x = 0;
  const b = Math.sin(t * 1.6) * 0.03;
  p.armL.rotation.x = b; p.armR.rotation.x = -b;
  p.armL.rotation.z = 0.08; p.armR.rotation.z = -0.08;
}
export function sitPose(p) {
  p.legL.rotation.x = -1.5; p.legR.rotation.x = -1.5;
  p.armL.rotation.x = -0.25; p.armR.rotation.x = -0.25;
  p.armL.rotation.z = 0.15; p.armR.rotation.z = -0.15;
}
export function drivePose(p) {
  p.legL.rotation.x = -1.35; p.legR.rotation.x = -1.2;
  p.armL.rotation.x = -0.95; p.armR.rotation.x = -0.95;
  p.armL.rotation.z = 0.3; p.armR.rotation.z = -0.3;
}
export function aimPose(p) {
  p.armR.rotation.x = -1.5; p.armR.rotation.z = 0;
  p.armL.rotation.x = -1.25; p.armL.rotation.z = 0.35;
}
export function downPose(p) {
  p.g.rotation.x = -Math.PI / 2 + 0.08;
}
