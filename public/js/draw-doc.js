// ============================================================
// draw-doc.js — MODEL DATA Drawing workspace (murni, tanpa DOM).
//
// Aturan suci: Canvas Coordinate ≠ Screen Coordinate.
// - Geometri (strokes, mapping, transform) hidup di koordinat canvas
//   native (0..w × 0..h px). TIDAK PERNAH dalam CSS/ viewport px.
// - Viewport {zoom, panX, panY} hanya untuk TAMPILAN.
// - Replay/export/scrub memakai doc-time (ms) + canvas coords.
//
// Doc:
// { id, name, w, h, dpi, bg, createdAt,
//   layers:[{id,name,visible,opacity,strokes:[...], auto?}],
//   viewport:{zoom,panX,panY}, replay:{t, playing, speed},
//   durationMs }
// Stroke: {id, tool:'brush'|'eraser', color, size(px canvas),
//           opacity, startT(doc ms), pts:[[x,y,dt]...]}
//   dt = offset ms pada 1x (kecepatan replay mengalikan jam).
// Auto wash: stroke {wash:true} dgn pts+dt hasil generate.
// ============================================================

export const DRAW_SPEEDS = [
  { id: 'very-slow', label: 'Very Slow', px: 120 },
  { id: 'slow', label: 'Slow', px: 300 },
  { id: 'normal', label: 'Normal', px: 700 },
  { id: 'fast', label: 'Fast', px: 1500 },
  { id: 'very-fast', label: 'Very Fast', px: 3200 },
];

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

// Preset kertas: A-series dihitung dari DPI (mm -> px).
export function paperPresets() {
  const mm2px = (mm, dpi) => Math.round((mm / 25.4) * dpi);
  return [
    { id: 'square', label: 'Square', kind: 'px', w: 1080, h: 1080 },
    { id: 'portrait', label: 'Portrait', kind: 'px', w: 1080, h: 1920 },
    { id: 'landscape', label: 'Landscape', kind: 'px', w: 1920, h: 1080 },
    { id: 'A5', label: 'A5', kind: 'dpi', mmW: 148, mmH: 210 },
    { id: 'A4', label: 'A4', kind: 'dpi', mmW: 210, mmH: 297 },
    { id: 'A3', label: 'A3', kind: 'dpi', mmW: 297, mmH: 420 },
  ];
}

export function paperDimsFor(presetId, dpi, orient = 'portrait', customW = 0, customH = 0) {
  const list = paperPresets();
  const p = list.find((x) => x.id === presetId) || list[1];
  let w, h, usedDpi = null;
  if (presetId === 'custom') {
    w = Math.max(64, Math.round(customW) || 1080);
    h = Math.max(64, Math.round(customH) || 1080);
  } else if (p.kind === 'dpi') {
    const mm2px = (mm) => Math.max(64, Math.round((mm / 25.4) * dpi));
    w = mm2px(p.mmW); h = mm2px(p.mmH); usedDpi = dpi;
  } else { w = p.w; h = p.h }
  if (orient === 'landscape' && h > w) { const t = w; w = h; h = t }
  if (orient === 'portrait' && w > h && p.kind === 'dpi') { const t = w; w = h; h = t }
  w -= w % 2; h -= h % 2;
  return { w, h, dpi: usedDpi, preset: p.id };
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// --- Image -> Canvas mapping (SEMUA dalam px canvas) ---
// mode: fit (tanpa distorsi) | fill (crop) | original | custom
// custom: {scale} mengalikan basis fit; anchor/pos: tx,ty = titik tumpu
// (0..1, default tengah) + offX/offY px; rotation derajat.
export function mapImageToCanvas(imgW, imgH, canvasW, canvasH, opts = {}) {
  const mode = opts.mode || 'fit';
  const rot = ((opts.rotation || 0) % 360 + 360) % 360;
  let base;
  if (mode === 'original') base = 1;
  else if (mode === 'fill') base = Math.max(canvasW / imgW, canvasH / imgH);
  else base = Math.min(canvasW / imgW, canvasH / imgH); // fit + custom
  if (mode === 'custom') base *= Math.max(0.01, opts.scale || 1);
  const dw = imgW * base, dh = imgH * base;
  const ax = opts.tx == null ? 0.5 : opts.tx;
  const ay = opts.ty == null ? 0.5 : opts.ty;
  const x = ax * canvasW - dw / 2 + (opts.offX || 0);
  const y = ay * canvasH - dh / 2 + (opts.offY || 0);
  return { x, y, w: dw, h: dh, scale: base, rotation: rot, mode,
    // uji distorsi: fit/fill/original TIDAK PERNAH mengubah aspek
    aspectKept: mode === 'custom' ? true : true };
}

// Fraksi reveal wash & sketsa dari doc-time (mode human/instant).
export function docRevealAt(T, auto) {
  if (!auto) return { sketch: 1, wash: 1 };
  if (auto.mode === 'instant') return { sketch: 1, wash: 1 };
  const sk = auto.sketchMs > 0 ? Math.max(0, Math.min(1, T / auto.sketchMs)) : 1;
  const wa = auto.colorMs > 0 ? Math.max(0, Math.min(1, (T - auto.sketchMs) / auto.colorMs)) : 1;
  return { sketch: sk, wash: wa };
}

// Bangun timing auto strokes dari panjang (px canvas) & kecepatan.
// Mengembalikan {strokes:[...dengan startT+dt...], wash, sketchMs, colorMs, totalMs}
export function planAutoStrokes(edgeStrokes, coverPts, coverCum, penSpeed, recordSpeed, colorBoost = 3) {
  const sp = Math.max(30, penSpeed || 700);
  const rs = Math.max(0.1, Math.min(16, recordSpeed || 1));
  let t = 0;
  const strokes = [];
  for (const pts of edgeStrokes) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const dur = (L / sp) * 1000 / rs;
    const timed = pts.map((p, i) => {
      let a = 0;
      for (let k = 1; k <= i; k++) a += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      return [p[0], p[1], (a / Math.max(1e-6, L)) * dur];
    });
    strokes.push({ pts: timed, len: L, startT: t, dur });
    t += dur;
  }
  const sketchMs = t;
  const coverLen = coverCum && coverCum.length ? coverCum[coverCum.length - 1] : 0;
  const colorMs = (coverLen / (sp * colorBoost)) * 1000 / rs;
  const wash = coverPts && coverPts.length ? {
    wash: true, startT: sketchMs, dur: colorMs,
    pts: coverPts.map((p, i) => [p[0], p[1], coverLen > 0 ? (coverCum[i] / coverLen) * colorMs : 0]),
  } : null;
  return { strokes, wash, sketchMs, colorMs, totalMs: Math.max(500, Math.round(sketchMs + colorMs)) };
}

// Titik-titik stroke yg terlihat pada replayT (kecepatan s mengalikan jam).
export function visiblePoints(stroke, replayT, speed) {
  const s = Math.max(0.05, speed || 1);
  const out = [];
  for (const p of stroke.pts) {
    if (stroke.startT + p[2] / s <= replayT + 1e-6) out.push(p);
    else break;
  }
  return out;
}

export function docDuration(doc) {
  let m = 1000;
  for (const L of doc.layers || []) for (const s of L.strokes || []) {
    const last = s.pts && s.pts.length ? s.pts[s.pts.length - 1][2] : 0;
    m = Math.max(m, (s.startT || 0) + last);
  }
  return Math.max(500, Math.round(m));
}
