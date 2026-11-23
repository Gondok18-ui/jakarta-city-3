// hud.js — all DOM HUD: stats, bars, objective, dialogue, toasts, dispatch,
// radio ticker, minimap and the full world map (both drawn from layout data).
import { ROAD_SEGS, ROUNDABOUT, PLACES, DISTRICTS, PARKS, LAND, zoneName } from './layout.js';

const $ = id => document.getElementById(id);
export const STATIONS = [
  { name: '98.4 KOTA FM', lines: ['Jakarta\'s own sound, all day long', 'Traffic: Sudirman flowing, Semanggi busy', 'Weather: warm with a chance of rain'] },
  { name: '101.2 SUARA JAKARTA', lines: ['News, talk and the city pulse', 'Monas carnival runs all weekend', 'Harbour winds picking up at Ancol'] },
  { name: '88.7 RADIO MELAYU', lines: ['Dangdut and classics for the kampung', 'Warung kopi hour — requests open', 'Shout-out to Kampung Melayu!'] },
  { name: '95.5 ANGKOT FM', lines: ['Songs for the long way home', 'Ojol drivers, this one is for you', 'Blok M night market opens at six'] },
  { name: '107.9 MALAM FM', lines: ['Slow songs for night drivers', 'The city never really sleeps', 'GBK lights on for the evening match'] },
];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), money: $('money'), clock: $('clockLine'), stars: $('stars'),
      hp: $('hpFill'), armor: $('armorFill'), weaponName: $('weaponName'), weaponAmmo: $('weaponAmmo'),
      objective: $('objective'), zone: $('zoneBanner'), toast: $('toast'),
      radioStation: $('radioStation'), radioLine: $('radioLine'),
      speedo: $('speedo'), speedVal: $('speedVal'), dispatch: $('dispatch'),
      dialogue: $('dialogue'), dlgName: $('dlgName'), dlgText: $('dlgText'),
      prompt: $('prompt'), crosshair: $('crosshair'), hitmark: $('hitmark'),
      flashRed: $('flashRed'), stateBig: $('stateBig'), worldMap: $('worldMap'),
      cheatPanel: $('cheatPanel'),
    };
    this.minimap = $('minimap').getContext('2d');
    this.mapCtx = $('mapCanvas').getContext('2d');
    this.toastT = 0; this.zoneT = 0; this.hitT = 0; this.radioT = 0; this.radioIdx = 0; this.lineIdx = 0;
    this.mapOpen = false;
    this._zoneName = '';
    this._dlgTimer = null;
  }
  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }
  setMoney(v) { this.el.money.textContent = 'Rp ' + Math.round(v).toLocaleString('en-US'); }
  setClock(minutes, day) {
    const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    this.el.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' · ' + DAYS[day % 7];
  }
  setStars(n) {
    let html = '';
    for (let i = 0; i < 5; i++) html += '<span class="' + (i < n ? 'lit' : '') + '">★</span>';
    this.el.stars.innerHTML = html;
  }
  setBars(hp, armor) {
    this.el.hp.style.width = Math.max(0, Math.min(100, hp)) + '%';
    this.el.armor.style.width = Math.max(0, Math.min(100, armor)) + '%';
  }
  setWeapon(name, ammoText) {
    this.el.weaponName.textContent = name;
    this.el.weaponAmmo.textContent = ammoText || '';
  }
  objective(html) {
    if (!html) { this.el.objective.classList.add('hidden'); return; }
    this.el.objective.classList.remove('hidden');
    this.el.objective.innerHTML = html;
  }
  toast(text, dur) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = 1;
    this.toastT = dur || 2.6;
  }
  zone(name) {
    if (name === this._zoneName) return;
    this._zoneName = name;
    this.el.zone.textContent = name;
    this.el.zone.style.opacity = 1;
    this.zoneT = 2.2;
  }
  dispatch(html) {
    if (!html) { this.el.dispatch.classList.add('hidden'); return; }
    this.el.dispatch.classList.remove('hidden');
    this.el.dispatch.innerHTML = html;
  }
  dialogue(name, text) {
    if (!text) { this.el.dialogue.classList.add('hidden'); return; }
    this.el.dialogue.classList.remove('hidden');
    this.el.dlgName.textContent = name;
    this.el.dlgText.textContent = text;
  }
  prompt(html) {
    if (!html) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.classList.remove('hidden');
    this.el.prompt.innerHTML = html;
  }
  speed(kmh) {
    if (kmh === null || kmh === undefined) { this.el.speedo.classList.add('hidden'); return; }
    this.el.speedo.classList.remove('hidden');
    this.el.speedVal.textContent = Math.round(kmh);
  }
  crosshair(on) { this.el.crosshair.classList.toggle('hidden', !on); }
  hitmark() { this.el.hitmark.style.opacity = 1; this.hitT = 0.14; }
  hurtFlash() { this.el.flashRed.style.opacity = 1; setTimeout(() => this.el.flashRed.style.opacity = 0, 130); }
  bigState(text, color) {
    const el = this.el.stateBig;
    if (!text) { el.style.opacity = 0; return; }
    el.textContent = text;
    el.style.color = color || '#fff';
    el.style.opacity = 1;
  }
  setMapOpen(open) {
    this.mapOpen = open;
    this.el.worldMap.classList.toggle('hidden', !open);
  }
  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.style.opacity = 0; }
    if (this.zoneT > 0) { this.zoneT -= dt; if (this.zoneT <= 0) this.el.zone.style.opacity = 0; }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.el.hitmark.style.opacity = 0; }
    this.radioT -= dt;
    if (this.radioT <= 0) {
      this.radioT = 7;
      const st = STATIONS[this.radioIdx];
      this.el.radioStation.textContent = st.name;
      this.el.radioLine.textContent = st.lines[this.lineIdx % st.lines.length];
      this.lineIdx++;
      if (this.lineIdx % 3 === 0) this.radioIdx = (this.radioIdx + 1) % STATIONS.length;
    }
  }
  // ------------------------------------------------------------ minimap
  drawMinimap(S) {
    const g = this.minimap, W = 276, C = W / 2, scale = W / 300; // 300 m across
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#274b5c'; g.fillRect(0, 0, W, W);
    const px = S.player.x, pz = S.player.z;
    const X = x => C + (x - px) * scale, Z = z => C + (z - pz) * scale;
    g.fillStyle = '#55703f';
    g.fillRect(X(-LAND.x), Z(LAND.zMin), LAND.x * 2 * scale, (LAND.zMax - LAND.zMin) * scale);
    g.fillStyle = '#d9c28e';
    g.fillRect(X(-800), Z(-1260), 1600 * scale, 90 * scale);
    g.fillStyle = '#6d9a52';
    for (const p of PARKS) g.fillRect(X(p.x1), Z(p.z1), (p.x2 - p.x1) * scale, (p.z2 - p.z1) * scale);
    g.strokeStyle = '#c8ccd2'; g.lineCap = 'round';
    for (const s of ROAD_SEGS) {
      g.lineWidth = Math.max(1.4, s.w * scale * 0.8);
      g.beginPath(); g.moveTo(X(s.x1), Z(s.z1)); g.lineTo(X(s.x2), Z(s.z2)); g.stroke();
    }
    g.lineWidth = 5;
    g.beginPath(); g.arc(X(ROUNDABOUT.x), Z(ROUNDABOUT.z), ROUNDABOUT.laneR * scale, 0, Math.PI * 2); g.stroke();
    // blips
    const dot = (x, z, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r || 4, 0, Math.PI * 2); g.fill(); };
    for (const c of S.cars) dot(c.x, c.z, '#aab3bd', 3);
    for (const c of S.police) dot(c.x, c.z, (S.blink ? '#ff5040' : '#3d7bd9'), 4.5);
    if (S.marker) {
      const pulse = 6 + Math.sin(S.time * 5) * 2;
      dot(S.marker.x, S.marker.z, '#ffd94d', pulse);
    }
    for (const key of Object.keys(PLACES)) {
      const p = PLACES[key];
      dot(p.px, p.pz, 'rgba(255,255,255,0.75)', 2.4);
    }
    // player arrow
    g.save();
    g.translate(C, C);
    g.rotate(Math.atan2(S.player.sx || 0, S.player.sz || 1));
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill();
    g.restore();
  }
  // ------------------------------------------------------------ world map
  drawWorldMap(S) {
    const g = this.mapCtx, W = 620, H = 880;
    const X = x => (x + 830) / 1660 * W, Z = z => (z + 1310) / 2420 * H;
    g.fillStyle = '#274b5c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d9c28e'; g.fillRect(X(-800), Z(-1260), 1600 / 1660 * W, 2320 / 2420 * H);
    g.fillStyle = '#55703f'; g.fillRect(X(-LAND.x), Z(LAND.zMin), LAND.x * 2 / 1660 * W, (LAND.zMax - LAND.zMin) / 2420 * H);
    g.fillStyle = '#6d9a52';
    for (const p of PARKS) g.fillRect(X(p.x1), Z(p.z1), (p.x2 - p.x1) / 1660 * W, (p.z2 - p.z1) / 2420 * H);
    g.fillStyle = '#8a5a3b';
    g.fillRect(X(520), Z(-1150), 180 / 1660 * W, 180 / 2420 * H);
    g.strokeStyle = '#dfe3e8'; g.lineCap = 'round';
    for (const s of ROAD_SEGS) {
      g.lineWidth = Math.max(1, s.w / 1660 * W * 0.85);
      g.beginPath(); g.moveTo(X(s.x1), Z(s.z1)); g.lineTo(X(s.x2), Z(s.z2)); g.stroke();
    }
    g.lineWidth = 3;
    g.beginPath(); g.arc(X(ROUNDABOUT.x), Z(ROUNDABOUT.z), ROUNDABOUT.laneR / 1660 * W, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 10px Arial'; g.textAlign = 'center';
    for (const key of Object.keys(PLACES)) {
      const p = PLACES[key];
      g.fillRect(X(p.px) - 2, Z(p.pz) - 2, 4, 4);
      g.fillText(p.label, X(p.px), Z(p.pz) - 6);
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '11px Arial';
    for (const d of DISTRICTS) {
      g.fillText(d.name, X((d.x1 + d.x2) / 2), Z((d.z1 + d.z2) / 2));
    }
    if (S.marker) {
      const pulse = 6 + Math.sin(S.time * 5) * 2.5;
      g.fillStyle = '#ffd94d';
      g.beginPath(); g.arc(X(S.marker.x), Z(S.marker.z), pulse, 0, Math.PI * 2); g.fill();
    }
    g.save();
    g.translate(X(S.player.x), Z(S.player.z));
    g.rotate(Math.atan2(S.player.sx || 0, S.player.sz || 1));
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 2.5); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = 'bold 12px Arial'; g.textAlign = 'left';
    g.fillText(zoneName(S.player.x, S.player.z), 12, 20);
  }
}
