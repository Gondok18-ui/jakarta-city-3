// weapons.js — the six-slot arsenal and the shared combat effects
// (tracer lines + a single pooled muzzle-flash light, so gunfire stays cheap).
import * as THREE from 'three';

export const WEAPONS = [
  { id: 'fists', name: 'FISTS', dmg: 13, range: 2.3, rof: 0.36, auto: false, spread: 0, pellets: 1, melee: true, ammo: 'inf' },
  { id: 'machete', name: 'MACHETE', dmg: 32, range: 2.6, rof: 0.44, auto: false, spread: 0, pellets: 1, melee: true, ammo: 'inf' },
  { id: 'pistol', name: 'PISTOL', dmg: 16, range: 95, rof: 0.30, auto: false, spread: 0.008, pellets: 1, ammo: 'pistol' },
  { id: 'smg', name: 'SMG', dmg: 11, range: 85, rof: 0.088, auto: true, spread: 0.03, pellets: 1, ammo: 'smg' },
  { id: 'shotgun', name: 'PUMP SHOTGUN', dmg: 9, range: 46, rof: 0.92, auto: false, spread: 0.085, pellets: 7, ammo: 'shells' },
  { id: 'rifle', name: 'RIFLE', dmg: 27, range: 150, rof: 0.135, auto: true, spread: 0.011, pellets: 1, ammo: 'rifle' },
];
export const AMMO_PRICE = { pistol: 6, smg: 5, shells: 14, rifle: 9 }; // per round, gun shop
export const AMMO_PACK = { pistol: 40, smg: 60, shells: 16, rifle: 40 };

export class CombatFX {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo.clone(), mat);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.flashLight = new THREE.PointLight(0xffc37a, 0, 26, 1.6);
    scene.add(this.flashLight);
    this.flashT = 0;
    const [c, g] = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const ctx = cv.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,230,170,1)'); grad.addColorStop(0.4, 'rgba(255,170,60,0.55)');
      grad.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
      return [cv, ctx];
    })();
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.flashSprite.scale.set(1.5, 1.5, 1);
    scene.add(this.flashSprite);
  }
  tracer(from, to, color) {
    const t = this.tracers.find(t => t.life <= 0) || this.tracers[0];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color || 0xffd9a0);
    t.line.material.opacity = 0.85;
    t.line.visible = true;
    t.life = 0.07;
  }
  flash(pos) {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 26;
    this.flashSprite.position.copy(pos);
    this.flashSprite.material.opacity = 0.95;
    this.flashSprite.material.rotation = Math.random() * 3;
    this.flashT = 0.055;
  }
  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flashLight.intensity = 0; this.flashSprite.material.opacity = 0; }
    }
  }
}
