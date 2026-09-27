// Validasi kontrak deterministic export (Test A/B/C + resolusi + audio).
// Menjamin: N = round(dur*fps/1000), timestamp CFR ketat, resolusi
// target sisi-pendek, timestamp audio mikrodetik yang benar.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  framePlanForExport,
  audioChunkTimestampUs,
  dimsForTargetShort,
  bitrateForRes,
  cameraZoomOf,
  qualityKeyOf,
  qualityDef,
  videoBitrate,
  estimateBytes,
  fmtSize,
  AUDIO_SR,
} from '../public/js/export-plan.js';

describe('frame plan — Test A: 10 detik @ 30fps = 300 frame', () => {
  it('N=300, ts CFR 0,33333,66667 dur=33333', () => {
    const p = framePlanForExport(10000, 30);
    assert.equal(p.N, 300);
    assert.deepEqual(p.tsUs.slice(0, 3), [0, 33333, 66667]);
    assert.equal(p.frameDurUs, 33333);
    assert.equal(p.tsUs.length, p.N);
    for (let i = 1; i < p.N; i++) assert.ok(Math.abs((p.tsUs[i] - p.tsUs[i - 1]) - 33333) <= 1);
  });
});

describe('frame plan — Test B: 10 detik @ 60fps = 600 frame', () => {
  it('N=600, ts = i*1e6/60 dibulatkan, t evaluasi = i*1000/60', () => {
    const p = framePlanForExport(10000, 60);
    assert.equal(p.N, 600);
    assert.deepEqual(p.tsUs.slice(0, 4), [0, 16667, 33333, 50000]);
    assert.equal(p.frameDurUs, 16667);
    assert.equal(p.tMs[0], 0);
    assert.ok(Math.abs(p.tMs[1] - 1000 / 60) < 1e-9);
    // frame terakhir mencakup ekor durasi (evaluasi <= durMs-1)
    assert.ok(p.tMs[p.N - 1] <= 9999);
    assert.ok(p.tMs[p.N - 1] > 9900);
  });
});

describe('frame plan — Test C: 10 detik @ 120fps = 1200 frame', () => {
  it('N=1200, interval 8333±1µs (pembulatan CFR), ts akhir tepat', () => {
    const p = framePlanForExport(10000, 120);
    assert.equal(p.N, 1200);
    assert.equal(p.frameDurUs, 8333);
    for (let i = 1; i < p.N; i++) assert.ok(Math.abs((p.tsUs[i] - p.tsUs[i - 1]) - 8333) <= 1);
    assert.equal(p.tsUs[p.N - 1], Math.round(((p.N - 1) * 1e6) / 120));
  });
});

describe('frame plan — durasi & cakupan', () => {
  it('durasi total mux = N*frameDur ≈ durMs (toleransi 1 frame)', () => {
    for (const [dur, fps] of [[5000, 60], [2000, 60], [10000, 24], [7350, 50]]) {
      const p = framePlanForExport(dur, fps);
      assert.ok(Math.abs(p.N * p.frameDurUs - dur * 1000) < p.frameDurUs, `${dur}ms@${fps}`);
    }
  });
  it('cap 120fps, floor 1fps, N>=1', () => {
    assert.equal(framePlanForExport(10000, 240).fps, 120);
    assert.equal(framePlanForExport(10000, 240).N, 1200);
    assert.equal(framePlanForExport(0, 60).N, 1); // durMs floor 1 -> N>=1
  });
});

describe('Test D — resolusi target (short-side, aspek tetap, genap)', () => {
  it('720p landscape 1920x1080 dari 960x540', () => {
    assert.deepEqual(dimsForTargetShort(960, 540, 720), { w: 1280, h: 720 });
  });
  it('1080p = sisi pendek 1080', () => {
    const d = dimsForTargetShort(1920, 1080, 1080);
    assert.deepEqual(d, { w: 1920, h: 1080 });
  });
  it('portrait 960x1560 -> 1080p: short=1080, aspek ~tetap, genap', () => {
    const d = dimsForTargetShort(960, 1560, 1080);
    assert.equal(Math.min(d.w, d.h), 1080);
    assert.equal(d.w % 2, 0);
    assert.equal(d.h % 2, 0);
    assert.ok(Math.abs(d.w / d.h - 960 / 1560) < 0.002);
  });
  it('downscale 1080p -> 360p', () => {
    const d = dimsForTargetShort(1920, 1080, 360);
    assert.deepEqual(d, { w: 640, h: 360 });
  });
  it('tanpa target -> native genap', () => {
    assert.deepEqual(dimsForTargetShort(961, 1561, null), { w: 960, h: 1560 });
  });
});

describe('Test D — bitrate adaptif', () => {
  it('1080p=16Mbps, batas 3..24Mbps', () => {
    assert.equal(bitrateForRes(1920, 1080), 16000000);
    assert.ok(bitrateForRes(320, 240) >= 3e6);
    assert.ok(bitrateForRes(3840, 2160) <= 24e6);
    assert.ok(bitrateForRes(640, 360) < bitrateForRes(1920, 1080));
  });
});

describe('Test D — sinkron audio (regressi bug off/48)', () => {
  it('48000 sampel @48kHz = tepat 1000000µs (bukan 1000)', () => {
    assert.equal(audioChunkTimestampUs(48000, 48000), 1000000);
    assert.equal(audioChunkTimestampUs(0), 0);
    assert.equal(audioChunkTimestampUs(24000), 500000);
  });
  it('chunk 1 detik berurutan menutup 10 detik tanpa tumpang tindih', () => {
    const sr = AUDIO_SR;
    let prev = -1;
    for (let off = 0; off < 10 * sr; off += sr) {
      const ts = audioChunkTimestampUs(off, sr);
      assert.ok(ts > prev);
      prev = ts;
    }
    assert.equal(prev, 9 * 1000000);
  });
});

describe('kamera — zoom 200==1x, batas 0.05..16', () => {
  it('default 1x, 400==2x, clamp', () => {
    assert.equal(cameraZoomOf(200, 200), 1);
    assert.equal(cameraZoomOf(400, 400), 2);
    assert.equal(cameraZoomOf(0, 0), 0.05);
    assert.equal(cameraZoomOf(99999, 99999), 16);
  });
});

describe('kualitas export — pengali bitrate + CRF server', () => {
  it('key dari label UI', () => {
    assert.equal(qualityKeyOf('Kualitas Hemat (file kecil)'), 'hemat');
    assert.equal(qualityKeyOf('Kualitas Standar'), 'standar');
    assert.equal(qualityKeyOf('Kualitas Tinggi'), 'tinggi');
    assert.equal(qualityKeyOf('Kualitas Ultra (file besar)'), 'ultra');
    assert.equal(qualityKeyOf('aneh'), 'standar');
  });
  it('mult & crf selaras server (?q= -> crf 26/20/17/14)', () => {
    assert.deepEqual([qualityDef('hemat').mult, qualityDef('hemat').crf], [0.5, 26]);
    assert.deepEqual([qualityDef('standar').mult, qualityDef('standar').crf], [1, 20]);
    assert.deepEqual([qualityDef('tinggi').mult, qualityDef('tinggi').crf], [1.6, 17]);
    assert.deepEqual([qualityDef('ultra').mult, qualityDef('ultra').crf], [2.5, 14]);
  });
  it('videoBitrate 1080p: standar 16Mbps, ultra 40Mbps', () => {
    assert.equal(videoBitrate(1920, 1080, 'standar'), 16000000);
    assert.equal(videoBitrate(1920, 1080, 'ultra'), 40000000);
    assert.equal(videoBitrate(1920, 1080, 'hemat'), 8000000);
  });
});

describe('estimasi ukuran — ganti angka statis 19.8MB', () => {
  it('preset contoh 28.032 dtk 1080x1920 standar ≈ 57MB', () => {
    const b = estimateBytes(videoBitrate(1080, 1920, 'standar'), 28032, true);
    assert.ok(Math.abs(b - 56.6e6) < 2e6, `estimasi ${b}`);
    assert.equal(fmtSize(b).endsWith('MB'), true);
  });
  it('ultra ≈ 2.5x standar; hemat ≈ 0.5x', () => {
    const s = estimateBytes(videoBitrate(1080, 1920, 'standar'), 28032, true);
    const u = estimateBytes(videoBitrate(1080, 1920, 'ultra'), 28032, true);
    const h = estimateBytes(videoBitrate(1080, 1920, 'hemat'), 28032, true);
    assert.ok(Math.abs(u / s - 2.5) < 0.05);
    assert.ok(Math.abs(h / s - 0.5) < 0.05);
  });
});
