// ============================================================
// draw-engine.js — mesin Drawing ala ibis (murni, sebagian tanpa DOM).
// Model: layer 'drawing' berisi sketsa vektor + topeng reveal citra +
// coretan manual, semuanya dievaluasi sebagai fungsi T (ms) sehingga
// preview, scrub timeline, export Full Render & server-render konsisten.
//
// Satuan: unit kotak layer -50..50 (lebar 100), sama spt drawShape.
// ============================================================

// Rasio kertas (ibis-style): [id, label, w, h] — A4 = 1:sqrt(2).
export const PAPER_RATIOS = [
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '4:3', label: '4:3', w: 4, h: 3 },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: '16:9', label: '16:9', w: 16, h: 9 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '4:5', label: '4:5', w: 4, h: 5 },
  { id: 'A4', label: 'A4', w: 1, h: Math.SQRT2 },
  { id: 'A4-L', label: 'A4', w: Math.SQRT2, h: 1 },
];

export const PAPER_RES = [720, 1080, 1440, 2160];

// Dimensi komposisi dari rasio + resolusi (sisi panjang = res).
export function paperDims(ratioId, resLong) {
  const r = PAPER_RATIOS.find((x) => x.id === ratioId) || PAPER_RATIOS[4];
  const res = Math.max(240, Math.round(resLong) || 1080);
  const k = res / Math.max(r.w, r.h);
  const w = Math.round(r.w * k), h = Math.round(r.h * k);
  return { w: w - (w % 2), h: h - (h % 2), ratio: r.id };
}

// Jalur sapuan serpentine (grid) menutup seluruh kotak 0..100.
// spacing dalam unit kotak. Kembali {pts:[[x,y]..], cum:[len]}.
export function serpentinePath(w, h, spacing) {
  const sp = Math.max(2, spacing);
  const pts = [], cum = [0];
  let y = sp / 2, dir = 1, total = 0, px = -1, py = -1;
  for (; y < h; y += sp) {
    const xs = dir > 0 ? range(sp / 2, w, sp) : range(w - sp / 2, 0, sp);
    for (const x of xs) {
      pts.push([x, y]);
      if (px >= 0) total += Math.hypot(x - px, y - py);
      cum.push(total); px = x; py = y;
    }
    dir = -dir;
  }
  function range(a, b, s) {
    const o = [];
    if (a <= b) for (let v = a; v <= b; v += s) o.push(v);
    else for (let v = a; v >= b; v -= s) o.push(v);
    return o;
  }
  return { pts, cum, total };
}

// Sobel pada grayscale (0..255) -> peta tepi 0/1.
export function sobelEdges(gray, w, h, thr) {
  const out = new Uint8Array(w * h);
  const t = Math.max(1, thr);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
    const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
    if (Math.abs(gx) + Math.abs(gy) > t) out[i] = 1;
  }
  return out;
}

// Rangkai piksel tepi jadi polyline (serakah, lompat > gap = stroke baru).
// maxPts membatasi biaya; minLen membuang bintik.
export function chainStrokes(edge, w, h, gap = 2.2, minLen = 3, maxPts = 6000) {
  const left = new Set();
  for (let i = 0; i < edge.length && left.size < maxPts * 4; i++) if (edge[i]) left.add(i);
  const pts = [...left].slice(0, maxPts);
  const set = new Set(pts);
  const strokes = [];
  const g2 = gap * gap;
  while (set.size) {
    const start = set.values().next().value;
    set.delete(start);
    const line = [[start % w, (start / w) | 0]];
    let cur = start;
    for (;;) {
      const cx = cur % w, cy = (cur / w) | 0;
      let best = -1, bd = g2;
      const R = Math.ceil(gap);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!set.has(ni)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = ni }
      }
      if (best < 0) break;
      set.delete(best);
      line.push([best % w, (best / w) | 0]);
      cur = best;
    }
    if (line.length >= minLen) strokes.push(line);
  }
  return strokes;
}

export function polyLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

export function strokesTotalLen(strokes) {
  return strokes.reduce((a, s) => a + polyLen(s), 0);
}

// Rencana waktu: kecepatan pena px/detik (ruang comp), recordSpeed ala
// ibis (pengali timelapse). Panjang dlm px comp.
export function planTiming(sketchLenPx, coverLenPx, penSpeed, recordSpeed, colorBoost = 3) {
  const sp = Math.max(30, penSpeed || 900);
  const rs = Math.max(0.1, Math.min(16, recordSpeed || 1));
  const sketchMs = Math.max(0, (sketchLenPx / sp) * 1000 / rs);
  const colorMs = Math.max(0, (coverLenPx / (sp * colorBoost)) * 1000 / rs);
  const totalMs = Math.max(500, Math.round(sketchMs + colorMs));
  return { sketchMs, colorMs, totalMs };
}

export function fmtEta(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + ' dtk';
  const m = Math.floor(s / 60);
  return m + ' mnt ' + String(s % 60).padStart(2, '0') + ' dtk';
}

// recordSpeed yg dibutuhkan agar total pas targetMs (dari basis recordSpeed=1).
export function recordSpeedForTarget(baseTotalMs, targetMs) {
  const base = Math.max(500, baseTotalMs);
  const tgt = Math.max(500, targetMs);
  const rs = base / tgt;
  return Math.max(0.1, Math.min(16, Math.round(rs * 100) / 100));
}

// Fraksi reveal tiap fase dari T proyek (ms).
export function revealAt(T, sketchMs, colorMs, mode) {
  if (mode === 'instant') return { sketch: 1, color: 1 };
  const sk = sketchMs > 0 ? Math.max(0, Math.min(1, T / sketchMs)) : 1;
  const co = colorMs > 0 ? Math.max(0, Math.min(1, (T - sketchMs) / colorMs)) : 1;
  return { sketch: sk, color: co };
}
