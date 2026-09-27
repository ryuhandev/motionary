// Validasi nyata pipeline server /api/export/mp4 (Test D/E):
// file MP4 hasil diverifikasi dgn ffprobe: codec H.264 yuv420p,
// fps CFR sesuai ?fps=, resolusi, durasi (TANPA -shortest), audio AAC.
// Juga membuktikan fix ENOENT Termux (os.tmpdir) end-to-end.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amexp-test-'));

function haveBin(b) {
  const r = spawnSync('sh', ['-c', `command -v ${b}`]);
  return r.status === 0;
}
const HAS_FFMPEG = haveBin('ffmpeg') && haveBin('ffprobe');

function ff(args, timeout = 90000) {
  return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout }).toString();
}
function probe(file, entries = 'stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate,duration') {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'json', file], { timeout: 30000 }).toString();
  return JSON.parse(out).streams;
}

let server = null;
async function waitHealth(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server tidak siap');
}

before(async () => {
  if (!HAS_FFMPEG) return;
  // Fixture 1: webm VFR-ish + audio vorbis 3 detik, 320x240 @30
  ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=3',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:v', 'libvpx', '-c:a', 'libvorbis', path.join(TMP, 'in-av.webm')]);
  // Fixture 2: tanpa audio
  ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=2',
      '-c:v', 'libvpx', '-an', path.join(TMP, 'in-noaudio.webm')]);
  // Fixture 3: video 4 dtk, audio 1.5 dtk (uji TANPA -shortest: hasil ~4 dtk)
  ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5',
      '-c:v', 'libvpx', '-c:a', 'libvorbis', path.join(TMP, 'in-short-a.webm')]);
  server = spawn('npx', ['tsx', 'server.ts'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitHealth();
});

after(async () => {
  try { server?.kill('SIGTERM'); } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});

async function convertWebm(fixture, fps, q = 'standar') {
  const buf = fs.readFileSync(path.join(TMP, fixture));
  const r = await fetch(`${BASE}/api/export/mp4?fps=${fps}&q=${q}`, {
    method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: buf,
  });
  assert.equal(r.status, 200, `status convert ${fixture}`);
  const out = path.join(TMP, `out-${fps}-${q}-${fixture}.mp4`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  assert.ok(fs.statSync(out).size > 1024);
  return out;
}

describe('server export — Test D: CFR 60fps H.264 + audio sync', { skip: !HAS_FFMPEG }, () => {
  it('webm 30fps+Vorbis -> MP4 60fps CFR, 320x240, durasi ~3 dtk, AAC', async () => {
    const out = await convertWebm('in-av.webm', 60);
    const ss = probe(out);
    const v = ss.find((s) => s.codec_type === 'video');
    const a = ss.find((s) => s.codec_type === 'audio');
    assert.equal(v.codec_name, 'h264');
    assert.equal(v.pix_fmt, 'yuv420p');
    assert.equal(v.r_frame_rate, '60/1');
    assert.equal(v.width, 320);
    assert.equal(v.height, 240);
    assert.ok(Math.abs(parseFloat(v.duration) - 3) < 0.6, `durasi ${v.duration}`);
    assert.ok(a, 'track audio ada');
    assert.equal(a.codec_name, 'aac');
  });
});

describe('server export — Test E: proyek bisu (cabang -an)', { skip: !HAS_FFMPEG }, () => {
  it('webm tanpa audio -> MP4 valid 30fps tanpa gagal', async () => {
    const out = await convertWebm('in-noaudio.webm', 30);
    const ss = probe(out);
    const v = ss.find((s) => s.codec_type === 'video');
    assert.equal(v.codec_name, 'h264');
    assert.equal(v.r_frame_rate, '30/1');
    assert.ok(Math.abs(parseFloat(v.duration) - 2) < 0.6, `durasi ${v.duration}`);
  });
});

describe('server export — Test E: audio lebih pendek (regresi -shortest)', { skip: !HAS_FFMPEG }, () => {
  it('video 4 dtk + audio 1.5 dtk -> hasil ~4 dtk (tidak kepotong)', async () => {
    const out = await convertWebm('in-short-a.webm', 60);
    const ss = probe(out);
    const v = ss.find((s) => s.codec_type === 'video');
    assert.ok(Math.abs(parseFloat(v.duration) - 4) < 0.8, `durasi ${v.duration}`);
    assert.equal(v.r_frame_rate, '60/1');
  });
});

describe('server export — kualitas ?q=hemat|ultra (CRF 26/14)', { skip: !HAS_FFMPEG }, () => {
  it('ultra menghasilkan MP4 valid; hemat tidak lebih besar dari ultra', async () => {
    const hi = await convertWebm('in-av.webm', 60, 'ultra');
    const lo = await convertWebm('in-av.webm', 60, 'hemat');
    for (const f of [hi, lo]) {
      const v = probe(f).find((s) => s.codec_type === 'video');
      assert.equal(v.codec_name, 'h264');
      assert.equal(v.r_frame_rate, '60/1');
    }
    assert.ok(fs.statSync(lo).size <= fs.statSync(hi).size, 'hemat <= ultra');
  });
});
