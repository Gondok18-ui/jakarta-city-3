// missions.js — the five story missions (original English dialogue), the
// stage runner that drives them, floating objective markers, and the
// delivery / ojol side jobs generated from the road graph.
import * as THREE from 'three';
import { graph, randomNode } from './layout.js';

export const STORY = [
  {
    id: 'm1', title: 'FIRST WHEELS', reward: 150000, phone: false,
    giver: { name: 'PAK HAJI', x: 8, z: -866, shirt: 0xe8e4da, head: 'peci' },
    intro: [
      { who: 'PAK HAJI', text: 'Peace be upon you, young one. You have the look of someone who can drive.' },
      { who: 'YOU', text: 'I can drive, Pak. What do you need?' },
      { who: 'PAK HAJI', text: 'My grandson waits by the fountain at Bundaran HI, and my legs are not what they were. Take the road south — the big avenue, straight to the roundabout.' },
      { who: 'PAK HAJI', text: 'There is a car by the hospital with your name on it. Go — and drive like you mean it.' },
    ],
    stages: [
      { type: 'drive', x: 24, z: 30, r: 15, label: 'Drive to the Bundaran HI fountain' },
    ],
    outro: [
      { who: 'PAK HAJI', text: 'Ha! The city is still ours, eh? Keep the change — you will need it in Jakarta.' },
    ],
  },
  {
    id: 'm2', title: 'SPECIAL DELIVERY', reward: 200000, phone: false,
    giver: { name: 'SARI', x: 58, z: 252, shirt: 0xbfd9e8, head: 'hijab' },
    intro: [
      { who: 'SARI', text: 'Please — you have a car, right? These satay orders were promised to the Grand Mosque before the prayer break.' },
      { who: 'YOU', text: 'How long do I have?' },
      { who: 'SARI', text: 'Eighty seconds before they go cold. The mosque is north-east of here, past the police station street. Go, go!' },
    ],
    stages: [
      { type: 'timed', x: 185, z: -171, r: 13, time: 80, label: 'Deliver the satay to the Grand Mosque' },
    ],
    outro: [
      { who: 'SARI', text: 'Still warm! You are a lifesaver. The kitchen pays its debts — here.' },
    ],
  },
  {
    id: 'm3', title: 'THE PASSENGER', reward: 175000, phone: true,
    giver: { name: 'PHONE', x: 48, z: 44 },
    intro: [
      { who: 'PHONE', text: 'Unknown number: "Driver? I am at the south-east corner of Bundaran HI, blue shirt, waving at every car. My shift at the workshop starts soon — please hurry."' },
      { who: 'YOU', text: 'On my way. Stay where you are.' },
    ],
    stages: [
      { type: 'pickup', x: 48, z: 44, r: 9, label: 'Pick up the passenger at Bundaran HI' },
      { type: 'drive', x: 215, z: 505, r: 13, label: 'Take him to the Bengkel workshop' },
    ],
    outro: [
      { who: 'RUDI', text: 'Lifesaver, boss. The Bengkel crew always pays full fare — no discount for family!' },
    ],
  },
  {
    id: 'm4', title: 'MIDNIGHT RUN', reward: 300000, phone: true,
    giver: { name: 'PHONE', x: 215, z: 505 },
    intro: [
      { who: 'PHONE', text: 'Workshop line: "You drive clean. One run, four checkpoints, four minutes twenty — Bundaran HI, Semanggi flyover, the GBK gate, then back to the fountain. Prove it."' },
      { who: 'YOU', text: 'Consider it proven.' },
    ],
    stages: [
      { type: 'timedcheck', time: 260, label: 'Hit every checkpoint before the clock dies', points: [
        { x: 24, z: 30, r: 15 }, { x: 8, z: 488, r: 16 }, { x: -330, z: 742, r: 15 }, { x: 24, z: 30, r: 15 },
      ] },
    ],
    outro: [
      { who: 'PHONE', text: '"...Clean. The whole city is talking about that run. Payment sent."' },
    ],
  },
  {
    id: 'm5', title: 'HEAT RUN', reward: 500000, phone: false,
    giver: { name: 'PAK HAJI', x: -63, z: -143, shirt: 0xe8e4da, head: 'peci' },
    intro: [
      { who: 'PAK HAJI', text: 'Listen carefully. Someone left a package for me at Monas — north side of the park, by the carnival. The police watch that park. The moment you touch it, they will come.' },
      { who: 'YOU', text: 'And then?' },
      { who: 'PAK HAJI', text: 'Then you run. Bring it to the Bengkel — Rudi will know what to do. Lose them, or outrun them. Do not stop.' },
    ],
    stages: [
      { type: 'drive', x: 20, z: -972, r: 12, label: 'Collect the package at Monas' },
      { type: 'escape', x: 215, z: 505, r: 14, label: 'Escape! Reach the Bengkel', heat: 300 },
    ],
    outro: [
      { who: 'PAK HAJI', text: 'You did what whole crews could not. Jakarta is yours now, anak. Spend it well.' },
    ],
  },
];

// A tall light beam + floating ring marking the current objective.
export class Marker {
  constructor(scene) {
    this.group = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd94d, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 46, 12, 1, true), beamMat);
    this.beam.position.y = 23;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 1.1;
    this.group.add(this.beam, this.ring);
    this.group.visible = false;
    scene.add(this.group);
    this.t = 0;
  }
  show(x, z, color) {
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    if (color) {
      this.beam.material.color.setHex(color);
      this.ring.material.color.setHex(color);
    }
  }
  hide() { this.group.visible = false; }
  update(dt) {
    this.t += dt;
    this.ring.rotation.z = this.t * 1.4;
    this.ring.position.y = 1.1 + Math.sin(this.t * 2.4) * 0.25;
    this.beam.material.opacity = 0.28 + Math.sin(this.t * 3.1) * 0.08;
  }
}

// Drives one mission at a time: dialogue -> stages -> outro -> reward.
export class MissionRunner {
  constructor(cb) {
    // cb: { pay(amount, title), toast(text), addHeat(n), objective(html|null), fail(text) }
    this.cb = cb;
    this.index = 0;              // next story mission
    this.active = null;          // { def, stageIdx, timer, pointIdx }
    this.side = null;            // side job { kind, stage:'pickup'|'dropoff', x, z, tx, tz, reward, timer }
    this.completedAll = false;
  }
  get nextDef() { return STORY[this.index] || null; }
  startStory() {
    const def = this.nextDef;
    if (!def) return null;
    this.active = { def, stageIdx: 0, timer: null, pointIdx: 0 };
    return def;
  }
  beginStages() {
    const a = this.active;
    if (!a) return;
    this.armStage();
  }
  armStage() {
    const a = this.active;
    const st = a.def.stages[a.stageIdx];
    if (!st) return;
    if (st.type === 'timed') a.timer = st.time;
    if (st.type === 'timedcheck') { a.timer = st.time; a.pointIdx = 0; }
    if (st.type === 'escape' && st.heat) this.cb.addHeat(st.heat);
  }
  currentTarget() {
    if (this.side) {
      return this.side.stage === 'pickup'
        ? { x: this.side.x, z: this.side.z, r: 9 }
        : { x: this.side.tx, z: this.side.tz, r: 12 };
    }
    const a = this.active;
    if (!a) return null;
    const st = a.def.stages[a.stageIdx];
    if (!st) return null;
    if (st.type === 'timedcheck') {
      const p = st.points[a.pointIdx];
      return { x: p.x, z: p.z, r: p.r };
    }
    return { x: st.x, z: st.z, r: st.r };
  }
  currentLabel() {
    if (this.side) {
      return this.side.stage === 'pickup'
        ? (this.side.kind === 'ojol' ? 'Pick up your ojol passenger' : 'Pick up the delivery package')
        : (this.side.kind === 'ojol' ? 'Drop off your passenger' : 'Deliver the package');
    }
    const a = this.active;
    if (!a) return null;
    const st = a.def.stages[a.stageIdx];
    if (!st) return null;
    if (st.type === 'timedcheck') return st.label + ' — checkpoint ' + (a.pointIdx + 1) + '/' + st.points.length;
    return st.label;
  }
  // returns 'stage' | 'complete' | 'failed' | null
  update(dt, px, pz, inCar) {
    if (this.side) {
      const s = this.side;
      if (s.timer !== null && s.timer !== undefined) {
        s.timer -= dt;
        if (s.timer <= 0) { this.side = null; this.cb.fail('The customer cancelled — job lost.'); return 'failed'; }
      }
      const t = this.currentTarget();
      if (Math.hypot(px - t.x, pz - t.z) < t.r && inCar) {
        if (s.stage === 'pickup') {
          s.stage = 'dropoff';
          this.cb.toast(s.kind === 'ojol' ? 'Passenger aboard — go!' : 'Package loaded — go!');
          return 'stage';
        }
        const reward = s.reward;
        this.side = null;
        this.cb.pay(reward, s.kind === 'ojol' ? 'OJOL RUN' : 'DELIVERY');
        return 'complete';
      }
      return null;
    }
    const a = this.active;
    if (!a) return null;
    const st = a.def.stages[a.stageIdx];
    if (!st) return null;
    if (a.timer !== null && a.timer !== undefined) {
      a.timer -= dt;
      if (a.timer <= 0) {
        const title = a.def.title;
        this.active = null;
        this.cb.fail(title + ' failed — the clock ran out. The giver is still waiting.');
        return 'failed';
      }
    }
    const t = this.currentTarget();
    if (!t) return null;
    const arrived = Math.hypot(px - t.x, pz - t.z) < t.r;
    if (st.type === 'drive' || st.type === 'escape') {
      if (arrived && inCar) return this.advance();
      if (arrived && !inCar) { this.cb.toast('You need a car for this.'); return null; }
    } else if (st.type === 'timed') {
      if (arrived && inCar) return this.advance();
    } else if (st.type === 'pickup') {
      if (arrived && inCar) {
        this.cb.toast('Passenger aboard — go!');
        return this.advance();
      }
    } else if (st.type === 'timedcheck') {
      if (arrived && inCar) {
        a.pointIdx++;
        if (a.pointIdx >= st.points.length) return this.advance();
        this.cb.toast('Checkpoint ' + a.pointIdx + '/' + st.points.length + ' — keep going!');
        return 'stage';
      }
    }
    return null;
  }
  advance() {
    const a = this.active;
    a.stageIdx++;
    a.timer = null;
    if (a.stageIdx >= a.def.stages.length) {
      const def = a.def;
      this.active = null;
      this.index++;
      if (this.index >= STORY.length) this.completedAll = true;
      this.cb.pay(def.reward, def.title);
      return 'complete';
    }
    this.armStage();
    return 'stage';
  }
  cancelActive() { this.active = null; }
  // ------------------------------------------------------------ side jobs
  offerSideJob(rng) {
    if (this.side || this.active) return null;
    const from = graph.nodes[randomNode(rng, 12)];
    const to = graph.nodes[randomNode(rng, 12)];
    if (!from || !to || Math.hypot(from.x - to.x, from.z - to.z) < 260) return null;
    const kind = rng() < 0.5 ? 'delivery' : 'ojol';
    const dist = Math.hypot(from.x - to.x, from.z - to.z);
    this.side = {
      kind, stage: 'pickup',
      x: from.x, z: from.z, tx: to.x, tz: to.z,
      reward: Math.round((45000 + dist * 55) / 1000) * 1000,
      timer: kind === 'delivery' ? Math.max(70, dist / 9) : null,
    };
    return this.side;
  }
  sideTimer() { return this.side ? this.side.timer : null; }
  storyTimer() { return this.active ? this.active.timer : null; }
}
