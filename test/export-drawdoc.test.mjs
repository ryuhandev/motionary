// Workspace Drawing: mapping, kertas, replay — SEMUA dlm koordinat canvas.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  paperPresets, paperDimsFor, fmtClock, mapImageToCanvas, docRevealAt,
  planAutoStrokes, visiblePoints, docDuration, DRAW_SPEEDS, REPLAY_SPEEDS,
} from '../public/js/draw-doc.js';

describe('paperDimsFor — A4/A3/A5 via DPI, custom, orientasi', () => {
  it('A4 300dpi = 2480×3508', () => {
    const d = paperDimsFor('A4', 300, 'portrait');
    assert.deepEqual([d.w, d.h], [2480, 3508]);
    assert.equal(d.dpi, 300);
  });
  it('A4 landscape menukar', () => {
    const d = paperDimsFor('A4', 300, 'landscape');
    assert.deepEqual([d.w, d.h], [3508, 2480]);
  });
  it('A3 = 2x area A4 (skala ~2x piksel per sisi /2)', () => {
    const a = paperDimsFor('A4', 150, 'portrait');
    const b = paperDimsFor('A3', 150, 'portrait');
    assert.ok(Math.abs(b.w / a.w - Math.SQRT2) < 0.02);
  });
  it('custom + genap', () => {
    const d = paperDimsFor('custom', 300, 'portrait', 1001, 501);
    assert.deepEqual([d.w, d.h], [1000, 500]);
  });
});

describe('mapImageToCanvas — tanpa distorsi, deterministik', () => {
  it('fit 800x600 ke 2480x3508: aspek utuh, tengah', () => {
    const m = mapImageToCanvas(800, 600, 2480, 3508, { mode: 'fit' });
    assert.ok(Math.abs(m.w / m.h - 800 / 600) < 1e-9);
    assert.ok(Math.abs((m.x + m.w / 2) - 1240) < 1e-9);
    assert.ok(Math.abs((m.y + m.h / 2) - 1754) < 1e-9);
  });
  it('fill menutup canvas (crop, aspek utuh)', () => {
    const m = mapImageToCanvas(800, 600, 2480, 3508, { mode: 'fill' });
    assert.ok(m.w >= 2480 && m.h >= 3508);
    assert.ok(Math.abs(m.w / m.h - 800 / 600) < 1e-9);
  });
  it('original = skala 1', () => {
    const m = mapImageToCanvas(800, 600, 2480, 3508, { mode: 'original' });
    assert.deepEqual([m.w, m.h], [800, 600]);
  });
  it('custom 2x dari fit + anchor sudut', () => {
    const a = mapImageToCanvas(800, 600, 2480, 3508, { mode: 'fit' });
    const b = mapImageToCanvas(800, 600, 2480, 3508, { mode: 'custom', scale: 2, tx: 0, ty: 0 });
    assert.ok(Math.abs(b.w / a.w - 2) < 1e-9);
    assert.deepEqual([b.x, b.y], [-b.w / 2, -b.h / 2]); // anchor 0 = tengah gambar di sudut
    const c = mapImageToCanvas(800, 600, 2480, 3508, { mode: 'custom', scale: 2, tx: 0.5, ty: 0.5 });
    assert.ok(Math.abs((c.x + c.w / 2) - 1240) < 1e-9); // tengah = tengah canvas
  });
  it('deterministik: dua panggilan identik', () => {
    const o = { mode: 'fit', tx: 0.3, ty: 0.7, rotation: 15 };
    assert.deepEqual(mapImageToCanvas(800, 600, 2480, 3508, o), mapImageToCanvas(800, 600, 2480, 3508, o));
  });
});

describe('planAutoStrokes — timing dari panjang & speed', () => {
  const edges = [[[0, 0], [300, 0]], [[0, 0], [0, 400]]]; // 300 + 400 px
  const cover = [[0, 0], [600, 0], [600, 600]];
  const cum = [0, 600, 1200];
  it('700px/s 1x: sketsa 1 dtk, wash 1200/2100 dtk', () => {
    const p = planAutoStrokes(edges, cover, cum, 700, 1);
    assert.equal(Math.round(p.sketchMs), 1000);
    assert.equal(Math.round(p.colorMs), Math.round(1200 / 2100 * 1000));
    assert.equal(p.strokes.length, 2);
    assert.ok(p.wash && p.wash.wash === true);
    assert.equal(p.totalMs, Math.round(p.sketchMs + p.colorMs));
  });
  it('wash mulai setelah sketsa (order)', () => {
    const p = planAutoStrokes(edges, cover, cum, 700, 1);
    assert.ok(p.wash.startT >= p.sketchMs - 1);
  });
});

describe('visiblePoints — replay rate mengalikan jam', () => {
  const s = { startT: 1000, pts: [[0, 0, 0], [10, 0, 1000], [20, 0, 2000]] };
  it('1x: titik kedua muncul di 2000', () => {
    assert.equal(visiblePoints(s, 1500, 1).length, 1);
    assert.equal(visiblePoints(s, 2000, 1).length, 2);
  });
  it('2x: dua kali lebih cepat', () => {
    assert.equal(visiblePoints(s, 1500, 2).length, 2);
  });
});

describe('docRevealAt + docDuration + fmtClock', () => {
  it('human fase, instant penuh', () => {
    const a = { mode: 'human', sketchMs: 1000, colorMs: 1000 };
    assert.deepEqual([docRevealAt(500, a).sketch, docRevealAt(500, a).wash], [0.5, 0]);
    assert.deepEqual([docRevealAt(0, { mode: 'instant' }).sketch, 1], [1, 1]);
  });
  it('durasi = akhir stroke terjauh', () => {
    const doc = { layers: [{ strokes: [{ startT: 0, pts: [[0, 0, 0], [1, 1, 500]] }, { startT: 2000, pts: [[0, 0, 0]] }] }] };
    assert.equal(docDuration(doc), 2000);
  });
  it('fmtClock 92 dtk = 01:32', () => {
    assert.equal(fmtClock(92000), '01:32');
  });
});
