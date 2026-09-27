// ============================================================
// export-plan.js — matematika export MURNI (tanpa DOM/WebCodecs).
//
// Tujuan: logika penjamin "true FPS + resolusi tepat" hidup di SATU
// tempat yang bisa diimpor browser (app.js) DAN diuji di Node.
// Preview dan export berbagi evaluator scene; modul ini hanya
// menjawab: frame apa saja yang HARUS dihasilkan untuk (durMs, fps,
// resolusi target) — independen dari kecepatan preview.
//
// Kontrak deterministic export:
//   N        = round(durMs * fps / 1000)
//   tMs[i]   = i * 1000 / fps          (waktu evaluasi scene)
//   tsUs[i]  = round(i * 1e6 / fps)    (timestamp mux, CFR)
//   durUs    = round(1e6 / fps)        (durasi tiap frame, konstan)
// Renderer HARUS menghasilkan tepat N frame (lambat boleh, drop tidak).
// ============================================================

export const AUDIO_SR = 48000;
export const MAX_EXPORT_FPS = 120;
// Short-side langkah resolusi (semantik portabel utk portrait maupun
// landscape; selaras dgn device_capabilities.csv AM: 720..2160).
export const RES_SHORT_STEPS = [2160, 1440, 1080, 720, 480, 360, 270];

export function clampPlan(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function even(n) {
  n = Math.round(n);
  return n - (n % 2);
}

// Rencana frame export. Mengembalikan N, timestamp mux (µs, CFR ketat),
// dan waktu evaluasi scene (ms) per frame.
export function framePlanForExport(durMs, fps) {
  fps = clampPlan(Math.round(fps) || 60, 1, MAX_EXPORT_FPS);
  durMs = Math.max(1, Math.round(durMs));
  const N = Math.max(1, Math.round((durMs * fps) / 1000));
  const frameDurUs = Math.round(1e6 / fps);
  const tsUs = new Array(N);
  const tMs = new Array(N);
  for (let i = 0; i < N; i++) {
    tsUs[i] = Math.round((i * 1e6) / fps);
    // Evaluasi di awal jendela frame; dijepit 1ms sebelum akhir durasi
    // agar tidak mengevaluasi di luar timeline.
    tMs[i] = Math.min((i * 1000) / fps, Math.max(0, durMs - 1));
  }
  return { fps, durMs, N, tsUs, tMs, frameDurUs };
}

// Timestamp AudioData (mikrodetik) untuk offset sampel tertentu.
//fmt: off — rumus: us = off / sampleRate * 1e6.
export function audioChunkTimestampUs(sampleOffset, sampleRate = AUDIO_SR) {
  return Math.round((sampleOffset * 1e6) / sampleRate);
}

// Resolusi export: skala NATIVE (projW/H) sehingga sisi pendek == target,
// naik MAUPUN turun, aspek dipertahankan, sisi genap (syarat H.264).
export function dimsForTargetShort(nativeW, nativeH, targetShort) {
  nativeW = Math.max(2, Math.round(nativeW));
  nativeH = Math.max(2, Math.round(nativeH));
  const short = Math.min(nativeW, nativeH);
  if (!(targetShort > 0)) return { w: even(nativeW), h: even(nativeH) };
  const k = targetShort / short;
  return { w: Math.max(2, even(nativeW * k)), h: Math.max(2, even(nativeH * k)) };
}

// Bitrate adaptif resolusi (3..24 Mbps, acuan 16 Mbps @1080p).
export function bitrateForRes(w, h) {
  return Math.round(Math.min(24e6, Math.max(3e6, (16e6 * (w * h)) / (1920 * 1080))));
}

// Zoom kamera dari skala layer (konvensi app: 200 == 1x).
export function cameraZoomOf(sx, sy) {
  const zx = (sx == null ? 200 : sx) / 200;
  const zy = (sy == null ? 200 : sy) / 200;
  return clampPlan((zx + zy) / 2, 0.05, 16);
}

// ------------------------------------------------------------
// Kualitas export (padanan kontrol bitrate/quality AM).
// Standar = perilaku lama (16 Mbps @1080p). Ultra ≈ 40 Mbps @1080p
// (setara panduan "high quality" AM 20-25+ Mbps untuk VFX/60fps).
// ------------------------------------------------------------
export const QUALITY_LEVELS = {
  hemat: { mult: 0.5, crf: 26, label: 'Hemat' },
  standar: { mult: 1, crf: 20, label: 'Standar' },
  tinggi: { mult: 1.6, crf: 17, label: 'Tinggi' },
  ultra: { mult: 2.5, crf: 14, label: 'Ultra' },
};

export function qualityKeyOf(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('hemat')) return 'hemat';
  if (t.includes('tinggi')) return 'tinggi';
  if (t.includes('ultra')) return 'ultra';
  return 'standar';
}

export function qualityDef(key) {
  return QUALITY_LEVELS[key] || QUALITY_LEVELS.standar;
}

// Bitrate video final = basis resolusi × pengali kualitas.
export function videoBitrate(w, h, qkey = 'standar') {
  return Math.round(bitrateForRes(w, h) * qualityDef(qkey).mult);
}

// Estimasi ukuran file (byte) dari bitrate + durasi. Audio 128k bila ada.
export function estimateBytes(videoBps, durMs, hasAudio = true, audioBps = 128000) {
  const total = videoBps + (hasAudio ? audioBps : 0);
  return Math.max(1, Math.round((total * Math.max(0, durMs)) / 8000));
}

export function fmtSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + 'GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + 'MB';
  return Math.max(1, Math.round(bytes / 1e3)) + 'KB';
}
