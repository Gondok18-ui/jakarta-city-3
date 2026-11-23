// textures.js — every surface texture in the game is painted on a canvas here:
// building facades with window grids, shop sign bands, label plates, asphalt.
// Facade materials register themselves so the day/night cycle can raise the
// warm emissive windows as dusk falls.
import * as THREE from 'three';

export const litMaterials = []; // materials whose emissiveMap holds lit windows

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, rx, ry) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// deterministic little rng so the city looks the same on every load
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Paint one facade: wall colour, window grid, plinth band at the bottom,
// trim line at the top; returns { map, emissive } canvases.
function paintFacade(o) {
  const W = 256, H = 256;
  const [c, g] = canvas(W, H);
  const [ec, eg] = canvas(W, H);
  const R = rng(o.seed);
  g.fillStyle = o.wall; g.fillRect(0, 0, W, H);
  eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
  // subtle concrete variation
  for (let i = 0; i < 260; i++) {
    g.fillStyle = 'rgba(' + (R() > .5 ? '255,255,255' : '0,0,0') + ',' + (0.02 + R() * 0.05) + ')';
    g.fillRect(R() * W, R() * H, 8 + R() * 30, 4 + R() * 14);
  }
  // roof trim + plinth
  g.fillStyle = o.trim; g.fillRect(0, 0, W, 10);
  g.fillStyle = o.plinth; g.fillRect(0, H - 26, W, 26);
  const cols = o.cols, rows = o.rows;
  const cw = W / cols, ch = (H - 40) / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cw + cw * 0.22, py = 16 + y * ch + ch * 0.18;
      const pw = cw * 0.56, ph = ch * 0.58;
      const lit = R() < (o.litRatio || 0.3);
      if (o.glass) {
        const grad = g.createLinearGradient(px, py, px, py + ph);
        grad.addColorStop(0, o.winHi); grad.addColorStop(1, o.win);
        g.fillStyle = grad;
      } else {
        g.fillStyle = o.win;
      }
      g.fillRect(px, py, pw, ph);
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.fillRect(px, py, pw, 2);
      if (lit) { eg.fillStyle = o.litColor || '#ffb45e'; eg.fillRect(px, py, pw, ph); }
      if (o.balcony && R() < .6) {
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.fillRect(px - 3, py + ph, pw + 6, 4);
      }
    }
  }
  if (o.signBand) {
    g.fillStyle = o.signBand; g.fillRect(0, H - 58, W, 30);
    g.fillStyle = o.signText || '#fff';
    g.font = 'bold 21px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(o.signWord || 'TOKO', W / 2, H - 42);
  }
  if (o.shopfront) {
    g.fillStyle = 'rgba(20,24,34,.9)'; g.fillRect(6, H - 24, W - 12, 18);
    g.fillStyle = '#ffd98a'; g.fillRect(10, H - 21, 30, 12); g.fillRect(W - 40, H - 21, 30, 12);
    eg.fillStyle = '#ffca7a'; eg.fillRect(10, H - 21, 30, 12); eg.fillRect(W - 40, H - 21, 30, 12);
  }
  return { map: tex(c), emissive: tex(ec) };
}

const FACADE_DEFS = [
  { key: 'glass', wall: '#5d7488', win: '#274b63', winHi: '#9fd4ef', glass: true, cols: 7, rows: 9, trim: '#31424f', plinth: '#232c34', litRatio: .34, seed: 11 },
  { key: 'glassTeal', wall: '#4d6a68', win: '#1f4a52', winHi: '#a8e0d8', glass: true, cols: 6, rows: 8, trim: '#2b3f3d', plinth: '#1f2b2a', litRatio: .3, seed: 23 },
  { key: 'concrete', wall: '#b8b2a4', win: '#3c4a56', cols: 6, rows: 7, trim: '#8d877a', plinth: '#6e6a5e', litRatio: .3, seed: 37 },
  { key: 'beige', wall: '#c9b189', win: '#46525e', cols: 5, rows: 6, trim: '#a08b62', plinth: '#7a6a4e', litRatio: .28, seed: 41 },
  { key: 'apartment', wall: '#c7a58c', win: '#3a4550', cols: 5, rows: 6, trim: '#9a7c64', plinth: '#77604c', litRatio: .38, balcony: true, seed: 53 },
  { key: 'hotel', wall: '#ddd6c4', win: '#31506b', winHi: '#bfe0f2', glass: true, cols: 8, rows: 8, trim: '#b3a888', plinth: '#8a8069', litRatio: .44, seed: 67 },
  { key: 'mall', wall: '#9aa4ae', win: '#22384c', winHi: '#8fc3e8', glass: true, cols: 4, rows: 3, trim: '#6d767f', plinth: '#4c545c', litRatio: .36, seed: 71, signBand: '#c7512f', signWord: 'MALL' },
  { key: 'shophouse', wall: '#d8c9a8', win: '#4a4238', cols: 4, rows: 3, trim: '#a68d5f', plinth: '#6b5a41', litRatio: .3, seed: 83, signBand: '#2e6e5e', signWord: 'WARUNG', shopfront: true },
  { key: 'oldbrick', wall: '#a9714f', win: '#3d3430', cols: 4, rows: 4, trim: '#7d5136', plinth: '#5d3d28', litRatio: .24, seed: 97 },
  { key: 'officeWhite', wall: '#e3e6e8', win: '#39536b', winHi: '#c4e2f4', glass: true, cols: 7, rows: 8, trim: '#b9bfc4', plinth: '#878d91', litRatio: .32, seed: 103 },
];
export const facadeMats = {};   // key -> MeshLambertMaterial (map + emissive windows)
export const facadeKeys = [];
{
  for (const def of FACADE_DEFS) {
    const { map, emissive } = paintFacade(def);
    const m = new THREE.MeshLambertMaterial({ map, emissiveMap: emissive, emissive: 0xffb45e, emissiveIntensity: 0 });
    facadeMats[def.key] = m;
    facadeKeys.push(def.key);
    litMaterials.push(m);
  }
}
export const FACADE_BY_STYLE = {
  tower: ['glass', 'glassTeal', 'hotel', 'officeWhite', 'concrete'],
  mid: ['concrete', 'beige', 'apartment', 'officeWhite', 'oldbrick'],
  mall: ['mall', 'glass', 'hotel'],
  old: ['oldbrick', 'shophouse', 'beige', 'concrete'],
  house: ['apartment', 'beige', 'shophouse'],
};

// Kampung house walls: plain pastel with a door and two windows.
export const kampungMats = [];
{
  const pastels = ['#e8b4a0', '#a8c8a2', '#f2d38a', '#9fb8d8', '#e6a8c0', '#c4d8e8', '#f0e0b6', '#b5d0b0'];
  pastels.forEach((col, i) => {
    const [c, g] = canvas(128, 128);
    const R = rng(300 + i);
    g.fillStyle = col; g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 60; k++) { g.fillStyle = 'rgba(0,0,0,' + (R() * .05) + ')'; g.fillRect(R() * 128, R() * 128, 10, 6); }
    g.fillStyle = '#5d4630'; g.fillRect(52, 62, 24, 66);            // door
    g.fillStyle = '#31424f'; g.fillRect(14, 44, 26, 30); g.fillRect(88, 44, 26, 30); // windows
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(14, 44, 26, 4); g.fillRect(88, 44, 26, 4);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 118, 128, 10);   // plinth
    kampungMats.push(new THREE.MeshLambertMaterial({ map: tex(c) }));
  });
}
export const roofMats = ['#a34a32', '#7d5a41', '#5f7386', '#8a4a56', '#4f6e5e'].map(col =>
  new THREE.MeshLambertMaterial({ color: col }));

// A free-standing label plate (canvas text) used for place signs and shop boards.
export function signTexture(text, bg, fg, w, h) {
  const [c, g] = canvas(w || 512, h || 96);
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(7, 7, c.width - 14, c.height - 14);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = c.height * 0.52;
  g.font = 'bold ' + size + 'px Arial';
  while (g.measureText(text).width > c.width - 40 && size > 10) { size -= 2; g.font = 'bold ' + size + 'px Arial'; }
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
export function signPlate(text, bg, fg, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), side: THREE.DoubleSide }));
  return m;
}

// Asphalt with a faint aggregate speckle; roads tint it per use.
export function asphaltTexture() {
  const [c, g] = canvas(128, 128);
  const R = rng(7);
  g.fillStyle = '#3c4046'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = 'rgba(' + (R() > .5 ? '255,255,255' : '0,0,0') + ',' + (0.03 + R() * 0.06) + ')';
    g.fillRect(R() * 128, R() * 128, 1.6, 1.6);
  }
  return tex(c, 6, 6);
}
export function grassTexture() {
  const [c, g] = canvas(128, 128);
  const R = rng(19);
  g.fillStyle = '#5d8a48'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = 'rgba(' + (R() > .5 ? '190,230,140' : '30,60,25') + ',' + (0.05 + R() * 0.09) + ')';
    g.fillRect(R() * 128, R() * 128, 2, 3);
  }
  return tex(c, 40, 40);
}
export function sandTexture() {
  const [c, g] = canvas(128, 128);
  const R = rng(29);
  g.fillStyle = '#d9c28e'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(' + (R() > .5 ? '255,246,210' : '160,130,80') + ',' + (0.05 + R() * 0.08) + ')';
    g.fillRect(R() * 128, R() * 128, 2, 2);
  }
  return tex(c, 30, 30);
}
