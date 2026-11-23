// police.js — the wanted system: heat and stars, pursuit cars that deploy
// foot officers, a five-star roadblock, and a searchlight helicopter.
// Rules wired in: officers shoot on foot; BUSTED only when the player is
// knocked down and an officer reaches him.
import * as THREE from 'three';
import { makeVehicle, setHeadlights } from './vehicles.js';
import { makePerson, walkPose, aimPose, downPose } from './people.js';
import { graph, nearestNode } from './layout.js';
import { collideCircle } from './world.js';

const OFFICER_STYLE = { shirt: 0x2456c8, pants: 0x1d2431, head: 'cap' };

export class PoliceSystem {
  constructor(scene, fx, cb) {
    this.scene = scene;
    this.fx = fx;
    this.cb = cb; // { dispatch(text), damagePlayer(d), onBusted(), explode(x,z), sfx(name) }
    this.heat = 0;
    this.stars = 0;
    this.cars = [];
    this.officers = [];
    this.heli = null;
    this.lastCrime = -99;
    this.time = 0;
    this.roadblockDone = false;
    this.bustT = 0;
    this.spawnT = 0;
  }
  addHeat(n) {
    const before = this.stars;
    this.heat = Math.min(620, this.heat + n);
    this.lastCrime = this.time;
    this.stars = this.computeStars();
    if (this.stars > before) {
      const msgs = {
        1: 'Dispatch: a unit is responding to the disturbance.',
        2: 'Dispatch: two units dispatched. Suspect is wanted.',
        3: 'Dispatch: all nearby units — pursue and stop the suspect.',
        4: 'Dispatch: air support inbound. Ground units, box him in.',
        5: 'Dispatch: citywide alert — roadblocks up, use all means.',
      };
      this.cb.dispatch('<b>POLICE</b> ' + (msgs[this.stars] || ''));
      if (this.cb.sfx) this.cb.sfx('sirenOn');
    }
  }
  computeStars() {
    const h = this.heat;
    return h <= 0 ? 0 : h < 60 ? 1 : h < 150 ? 2 : h < 270 ? 3 : h < 420 ? 4 : 5;
  }
  clearAll() {
    this.heat = 0; this.stars = 0; this.roadblockDone = false;
    for (const c of this.cars) this.scene.remove(c.g);
    for (const o of this.officers) this.scene.remove(o.g);
    if (this.heli) { this.scene.remove(this.heli.g); this.heli = null; }
    this.cars = []; this.officers = [];
    if (this.cb.sfx) this.cb.sfx('sirenOff');
  }
  wantedLevel() { return this.stars; }

  spawnCar(px, pz) {
    // find a graph node 75–130 m from the player to roll in from
    let best = null, bd = 1e18;
    for (let tries = 0; tries < 26; tries++) {
      const n = graph.nodes[Math.floor(Math.random() * graph.nodes.length)];
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d > 70 && d < 140 && d < bd) { bd = d; best = n; }
    }
    if (!best) return;
    const g = makeVehicle('sedan', 0xf2f3f5, { police: true });
    g.position.set(best.x, 0, best.z);
    this.scene.add(g);
    this.cars.push({ g, hp: 130, speed: 0, heading: Math.random() * 6.28, dead: false, deployT: 0, officersOut: false });
  }
  spawnOfficer(x, z) {
    const p = makePerson(OFFICER_STYLE);
    p.g.position.set(x, 0, z);
    this.scene.add(p.g);
    this.officers.push({
      p, g: p.g, hp: 42, dead: false, deadT: 0,
      shootCd: 0.8 + Math.random() * 1.2, phase: Math.random() * 6,
      strafeDir: Math.random() < 0.5 ? 1 : -1, bustRole: false,
    });
  }
  spawnRoadblock(P) {
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    const cx = P.x + fx * 95, cz = P.z + fz * 95;
    const sideX = fz, sideZ = -fx;
    for (let i = -1; i <= 1; i++) {
      const g = makeVehicle('sedan', 0xf2f3f5, { police: true });
      g.position.set(cx + sideX * i * 7.5, 0, cz + sideZ * i * 7.5);
      g.rotation.y = P.heading + Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      this.scene.add(g);
      this.cars.push({ g, hp: 130, speed: 0, heading: g.rotation.y, dead: false, deployT: 9, officersOut: true, blocker: true });
      this.spawnOfficer(cx + sideX * i * 7.5 + fx * 3, cz + sideZ * i * 7.5 + fz * 3);
    }
    this.cb.dispatch('<b>POLICE</b> Roadblock ahead — all units converge.');
  }
  spawnHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x2b3442, shininess: 80 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 3.4, 4, 10), bodyMat);
    body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.85);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 5.4), bodyMat);
    tail.position.set(0, 0.4, -4.6);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.8), bodyMat);
    fin.position.set(0, 0.9, -7.2);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.06, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.75 }));
    rotor.position.y = 1.85;
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4.4), bodyMat);
    skidL.position.set(-1.2, -1.7, 0);
    const skidR = skidL.clone(); skidR.position.x = 1.2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7.5, 42, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b8, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = -22.5;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(6.4, 16),
      new THREE.MeshBasicMaterial({ color: 0xffedb5, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    g.add(body, tail, fin, rotor, skidL, skidR, cone);
    this.scene.add(g);
    this.scene.add(glow);
    this.heli = { g, hp: 260, dead: false, rotor, glow, cone, angle: Math.random() * 6, shootCd: 2.5, deadT: 0 };
    this.cb.dispatch('<b>POLICE</b> Helicopter overhead — you are lit up.');
  }

  // combat interface used by the game's shooting code
  damageCar(car, dmg) {
    if (car.dead) return;
    car.hp -= dmg;
    if (car.hp <= 0) {
      car.dead = true; car.deadT = 0;
      if (!car.officersOut) { car.officersOut = true; this.spawnOfficer(car.g.position.x + 2, car.g.position.z + 1); }
    }
  }
  damageOfficer(o, dmg) {
    if (o.dead) return;
    o.hp -= dmg;
    if (o.hp <= 0) {
      o.dead = true; o.deadT = 0;
      downPose(o.p);
      this.addHeat(28);
    }
  }
  damageHeli(dmg) {
    if (!this.heli || this.heli.dead) return;
    this.heli.hp -= dmg;
    if (this.heli.hp <= 0) { this.heli.dead = true; this.heli.deadT = 0; }
  }

  update(dt, P, nightAmt) {
    this.time += dt;
    // heat decay once things go quiet
    if (this.heat > 0 && this.time - this.lastCrime > 7) {
      let near = false;
      for (const c of this.cars) if (Math.hypot(c.g.position.x - P.x, c.g.position.z - P.z) < 65) near = true;
      this.heat = Math.max(0, this.heat - dt * (near ? 3.2 : 10));
      const s = this.computeStars();
      if (s < this.stars) { this.stars = s; if (s === 0) this.cb.dispatch('<b>POLICE</b> Search called off — suspect lost.'); }
      if (this.stars < 5) this.roadblockDone = false;
      if (this.stars < 4 && this.heli) { this.scene.remove(this.heli.g); this.scene.remove(this.heli.glow); this.heli = null; }
    }
    this.stars = this.computeStars();

    // spawn / despawn pursuit cars
    const wantCars = this.stars === 0 ? 0 : [0, 1, 2, 3, 3, 4][this.stars];
    this.spawnT -= dt;
    const aliveCars = this.cars.filter(c => !c.dead);
    if (aliveCars.length < wantCars && this.spawnT <= 0) { this.spawnCar(P.x, P.z); this.spawnT = 1.6; }
    if (this.stars >= 5 && !this.roadblockDone && P.inCar && P.speed > 8) {
      this.roadblockDone = true;
      this.spawnRoadblock(P);
    }
    if (this.stars >= 4 && !this.heli) this.spawnHeli();

    // ---- cars
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const pos = c.g.position;
      const d = Math.hypot(P.x - pos.x, P.z - pos.z);
      if (d > 300 || (this.stars === 0 && d > 60)) {
        this.scene.remove(c.g); this.cars.splice(i, 1); continue;
      }
      if (c.dead) {
        c.deadT += dt;
        c.speed = 0;
        if (c.deadT > 1.1 && !c.exploded) { c.exploded = true; this.cb.explode(pos.x, pos.z); }
        if (c.deadT > 1.3) { this.scene.remove(c.g); this.cars.splice(i, 1); }
        continue;
      }
      if (c.blocker) { c.g.rotation.y = c.heading; continue; }
      // pursue: aim at a lead point on the player
      const lead = 0.45;
      const tx = P.x + (P.vx || 0) * lead, tz = P.z + (P.vz || 0) * lead;
      const want = Math.atan2(tx - pos.x, tz - pos.z);
      let dh = want - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const maxSpeed = 24 + this.stars * 2.2;
      const targetSpeed = d < 7 ? 0 : maxSpeed * (Math.abs(dh) > 1.4 ? 0.35 : 1);
      c.speed += Math.sign(targetSpeed - c.speed) * Math.min(Math.abs(targetSpeed - c.speed), dt * 14);
      c.heading += THREE.MathUtils.clamp(dh, -1, 1) * Math.min(1, Math.abs(dh)) * dt * (1.4 + Math.min(1.6, c.speed * 0.05));
      const nx = pos.x + Math.sin(c.heading) * c.speed * dt;
      const nz = pos.z + Math.cos(c.heading) * c.speed * dt;
      const col = collideCircle(nx, nz, 1.7);
      pos.x = col.x; pos.z = col.z;
      if (col.hit && Math.abs(c.speed) > 6) { c.speed *= 0.4; if (this.cb.sfx) this.cb.sfx('crash'); }
      pos.y = 0;
      c.g.rotation.y = c.heading;
      for (const w of c.g.userData.wheels) w.spin.rotation.x += c.speed * dt / 0.33;
      setHeadlights(c.g, nightAmt > 0.3, 0.8);
      if (c.g.userData.lightBar) {
        const blink = Math.sin(this.time * 10) > 0;
        c.g.userData.lightBar[0].material.color.setHex(blink ? 0x6ab0ff : 0x1d3f7d);
        c.g.userData.lightBar[1].material.color.setHex(blink ? 0x7d1d1d : 0xff5040);
      }
      // deploy officers when close and the player is on foot or slow
      if (!c.officersOut && d < 30 && (!P.inCar || P.speed < 4)) {
        c.deployT += dt;
        if (c.deployT > 0.9) {
          c.officersOut = true;
          const n = this.stars >= 3 ? 2 : 1;
          for (let k = 0; k < n; k++) this.spawnOfficer(pos.x + (k ? 2.4 : -2.4), pos.z + 1.5);
          if (this.officers.length > 7) this.officers.splice(0, this.officers.length - 7).forEach(o => this.scene.remove(o.g));
        }
      } else c.deployT = Math.max(0, c.deployT - dt);
    }

    // ---- officers
    let busting = false;
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      const pos = o.g.position;
      const d = Math.hypot(P.x - pos.x, P.z - pos.z);
      if (o.dead) {
        o.deadT += dt;
        if (o.deadT > 6 || d > 260) { this.scene.remove(o.g); this.officers.splice(i, 1); }
        continue;
      }
      if (d > 280 || this.stars === 0) { this.scene.remove(o.g); this.officers.splice(i, 1); continue; }
      o.g.rotation.y = Math.atan2(P.x - pos.x, P.z - pos.z);
      if (P.knockedDown && d < 3.4) busting = true;
      const wantD = P.knockedDown ? 1.6 : 12.5;
      let mx = 0, mz = 0;
      if (d > wantD + 1.5) { mx = (P.x - pos.x) / d; mz = (P.z - pos.z) / d; }
      else if (d < wantD - 2) { mx = -(P.x - pos.x) / d; mz = -(P.z - pos.z) / d; }
      else { // strafe around the player
        mx = (-(P.z - pos.z) / d) * o.strafeDir * 0.5; mz = ((P.x - pos.x) / d) * o.strafeDir * 0.5;
        if (Math.random() < dt * 0.14) o.strafeDir *= -1;
      }
      const spd = P.knockedDown ? 3.4 : 3.1;
      const col = collideCircle(pos.x + mx * spd * dt, pos.z + mz * spd * dt, 0.42);
      pos.x = col.x; pos.z = col.z;
      const moving = Math.hypot(mx, mz) > 0.1;
      if (moving) { o.phase += dt * 7.5; walkPose(o.p, o.phase, 0.5); }
      else aimPose(o.p);
      // shooting — only when the player is up and within range
      o.shootCd -= dt;
      if (!P.knockedDown && !P.dead && d < 58 && d > 2 && o.shootCd <= 0) {
        o.shootCd = 1.05 + Math.random() * 0.9;
        const from = new THREE.Vector3(pos.x, 1.45, pos.z);
        const to = new THREE.Vector3(P.x, P.inCar ? 1.1 : 1.25, P.z);
        this.fx.tracer(from, to, 0xffb0a0);
        this.fx.flash(from);
        if (this.cb.sfx) this.cb.sfx('shotPolice');
        const hitChance = THREE.MathUtils.clamp(0.6 - d * 0.008 - (P.inCar ? 0.12 : 0), 0.12, 0.55);
        if (Math.random() < hitChance) this.cb.damagePlayer(4 + Math.random() * 5);
      }
    }
    // BUSTED: knocked down + an officer on top of the player for a moment
    if (P.knockedDown && busting && !P.dead) {
      this.bustT += dt;
      if (this.bustT > 1.1) { this.bustT = 0; this.cb.onBusted(); }
    } else this.bustT = Math.max(0, this.bustT - dt * 2);

    // ---- helicopter
    if (this.heli) {
      const h = this.heli;
      if (h.dead) {
        h.deadT += dt;
        h.g.position.y -= dt * 16;
        h.g.rotation.z += dt * 1.6;
        if (h.g.position.y <= 1.4 && !h.exploded) { h.exploded = true; this.cb.explode(h.g.position.x, h.g.position.z); }
        if (h.deadT > 1.6) {
          this.scene.remove(h.g); this.scene.remove(h.glow); this.heli = null;
          this.cb.dispatch('<b>POLICE</b> Air support is down!');
        }
      } else {
        h.angle += dt * 0.35;
        const hx = P.x + Math.cos(h.angle) * 24, hz = P.z + Math.sin(h.angle) * 24;
        h.g.position.lerp(new THREE.Vector3(hx, 40, hz), Math.min(1, dt * 1.6));
        h.g.rotation.y = Math.atan2(P.x - hx, P.z - hz);
        h.rotor.rotation.y += dt * 28;
        h.glow.position.set(P.x, 0.14, P.z);
        h.glow.material.opacity = nightAmt > 0.25 ? 0.2 : 0.07;
        h.cone.material.opacity = nightAmt > 0.25 ? 0.15 : 0.05;
        h.shootCd -= dt;
        if (!P.knockedDown && !P.dead && h.shootCd <= 0) {
          h.shootCd = 2.6 + Math.random() * 1.2;
          for (let bIdx = 0; bIdx < 3; bIdx++) {
            const from = h.g.position.clone(); from.y -= 1.5;
            const to = new THREE.Vector3(P.x + (Math.random() - 0.5) * 4, 1.1, P.z + (Math.random() - 0.5) * 4);
            this.fx.tracer(from, to, 0xffc0a0);
          }
          if (Math.random() < 0.42) this.cb.damagePlayer(3 + Math.random() * 4);
        }
      }
    }
    // siren loudness follows the nearest police car
    if (this.cb.siren) {
      let nd = 1e9;
      for (const c of this.cars) nd = Math.min(nd, Math.hypot(c.g.position.x - P.x, c.g.position.z - P.z));
      this.cb.siren(this.stars > 0 && nd < 90, nd);
    }
  }
}
