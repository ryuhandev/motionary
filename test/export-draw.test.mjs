// Engine gambar: path sapuan, rantai tepi, timing, ETA.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPER_RATIOS, paperDims, serpentinePath, sobelEdges, chainStrokes,
  polyLen, strokesTotalLen, planTiming, fmtEta, revealAt,
} from '../public/js/draw-engine.js';

describe('paperDims — rasio kertas ibis', () => {
  it('A4 = 1:sqrt(2)', () => {
    const d = paperDims('A4', 1080);
    assert.equal(d.h, 1080);
    assert.ok(Math.abs(d.w / d.h - 1 / Math.SQRT2) < 0.005);
    assert.equal(d.w % 2, 0);
  });
  it('9:16 @720', () => {
    const d = paperDims('9:16', 720);
    assert.deepEqual([d.w, d.h], [404, 720]);
  });
  it('1:1 persegi', () => {
    const d = paperDims('1:1', 1080);
    assert.deepEqual([d.w, d.h], [1080, 1080]);
  });
});

describe('serpentinePath — menutup area', () => {
  it('grid 100x100 spacing 10: ~100 titik, total ~1000', () => {
    const p = serpentinePath(100, 100, 10);
    assert.ok(p.pts.length >= 90 && p.pts.length <= 110);
    assert.ok(p.total > 800 && p.total < 1200);
    assert.equal(p.cum.length, p.pts.length + 1);
    for (const [x, y] of p.pts) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100);
  });
  it('monoton & kontinu (tanpa lompatan liar)', () => {
    const p = serpentinePath(100, 100, 25);
    for (let i = 1; i < p.pts.length; i++) {
      assert.ok(Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]) < 60);
      assert.ok(p.cum[i] >= p.cum[i - 1]);
    }
  });
});

describe('sobelEdges + chainStrokes — sketsa sintetis', () => {
  it('garis diagonal terdeteksi & terangkai', () => {
    const w = 40, h = 40, gray = new Uint8Array(w * h).fill(255);
    for (let i = 5; i < 35; i++) gray[i * w + i] = 0;
    const e = sobelEdges(gray, w, h, 100);
    let n = 0; for (const v of e) n += v;
    assert.ok(n > 20, 'tepi ditemukan: ' + n);
    const st = chainStrokes(e, w, h, 2.2, 3, 6000);
    assert.ok(st.length >= 1);
    assert.ok(strokesTotalLen(st) > 20);
  });
  it('kanvas kosong -> tanpa stroke', () => {
    const e = sobelEdges(new Uint8Array(30 * 30).fill(200), 30, 30, 100);
    assert.deepEqual(chainStrokes(e, 30, 30), []);
  });
});

describe('planTiming + fmtEta + revealAt', () => {
  it('900px/s, record 1x: 900px sketsa + 2700px cover', () => {
    const p = planTiming(900, 2700, 900, 1);
    assert.equal(p.sketchMs, 1000);
    assert.equal(p.colorMs, 1000); // cover / (900*3)
    assert.equal(p.totalMs, 2000);
  });
  it('record 2x memangkas separuh', () => {
    const p = planTiming(900, 2700, 900, 2);
    assert.equal(p.totalMs, 1000);
  });
  it('fmtEta detik & menit', () => {
    assert.equal(fmtEta(45000), '45 dtk');
    assert.equal(fmtEta(130000), '2 mnt 10 dtk');
  });
  it('revealAt fase sketsa->warna, instant penuh', () => {
    const a = revealAt(500, 1000, 1000, 'human');
    assert.equal(a.sketch, 0.5); assert.equal(a.color, 0);
    const b = revealAt(1500, 1000, 1000, 'human');
    assert.equal(b.sketch, 1); assert.equal(b.color, 0.5);
    const c = revealAt(0, 0, 0, 'instant');
    assert.deepEqual([c.sketch, c.color], [1, 1]);
  });
});

describe('recordSpeedForTarget — custom durasi pas', () => {
  it('basis 30 dtk -> target 60 dtk = 0.5x', async () => {
    const { recordSpeedForTarget } = await import('../public/js/draw-engine.js');
    assert.equal(recordSpeedForTarget(30000, 60000), 0.5);
  });
  it('basis 120 dtk -> target 60 dtk = 2x', async () => {
    const { recordSpeedForTarget } = await import('../public/js/draw-engine.js');
    assert.equal(recordSpeedForTarget(120000, 60000), 2);
  });
  it('clamp 0.1..16x', async () => {
    const { recordSpeedForTarget } = await import('../public/js/draw-engine.js');
    assert.equal(recordSpeedForTarget(1000000, 1000), 16);
    assert.equal(recordSpeedForTarget(1000, 3600000), 0.1);
  });
});
