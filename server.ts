import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { framePlanForExport, qualityDef, QUALITY_LEVELS } from "./public/js/export-plan.js";
import { spawn } from "node:child_process";
import JSZip from "jszip";

const app = new Hono();
app.use("*", cors());

const FIREBASE_BASE = "https://firebasestorage.googleapis.com/v0/b/alight-creative.appspot.com/o";
const USER_AGENT = "AlightMotion/6.2.53 (iOS; gzip)";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicIndex = path.join(__dirname, "public", "index.html");

type PackageEntry = {
  name: string;
  size: number;
  xml: boolean;
  media: boolean;
  mime: string;
};

// in-memory cache of packages (xml + filenames), media served from memory
const packages = new Map<
  string,
  {
    files: Map<string, { blob: Uint8Array; mime: string }>;
    xmls: { name: string; text: string }[];
    list: PackageEntry[];
    meta: { title: string; description: string; thumb: string };
    fetchedAt: number;
  }
>();

function parseShareLink(link: string): { user: string; pkg: string } | null {
  const m = link.match(
    /(?:alightcreative\.com|alight\.link)\/am\/share\/u\/([A-Za-z0-9_-]+)\/p\/([A-Za-z0-9_\-]+)/i
  );
  return m ? { user: m[1], pkg: m[2] } : null;
}

async function fetchShareMeta(link: string) {
  try {
    const html = await (await fetch(link, { headers: { "User-Agent": USER_AGENT } })).text();
    const title = html.match(/<h1>([^<]+)<\/h1>/)?.[1] ?? "";
    const description = html.match(/property="og:description" content="([^"]+)"/)?.[1] ?? "";
    const thumb = html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? "";
    return { title, description, thumb };
  } catch {
    return { title: "", description: "", thumb: "" };
  }
}

async function downloadZip(user: string, pkg: string): Promise<Uint8Array | null> {
  const names = ["projectfiles.zip", "projectFiles.zip", "package.zip", "project.zip"];
  for (const name of names) {
    const url = `${FIREBASE_BASE}/share%2Fu%2F${user}%2Fp%2F${pkg}%2F${name}?alt=media`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "identity" },
      });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length > 0) return buf;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function sceneTitleOf(xmlText: string): string {
  const m = xmlText.match(/<scene[^>]*\btitle="([^"]+)"/);
  return m ? m[1] : "";
}

function mimeOf(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

app.post("/api/link", async (c) => {
  const body = await c.req.parseBody().catch(() => null);
  const raw = body ? ((body as Record<string, unknown>).link as string) : null;
  const link = raw || (await c.req.json().catch(() => null))?.link;
  if (!link) return c.json({ error: "link required" }, 400);
  const parsed = parseShareLink(link);
  if (!parsed) return c.json({ error: "invalid Alight Motion share link" }, 400);

  const cacheKey = parsed.pkg;
  const existing = packages.get(cacheKey);
  if (existing && Date.now() - existing.fetchedAt < 1000 * 60 * 30) {
    return c.json({
      packageId: parsed.pkg,
      meta: { ...existing.meta, projects: existing.xmls.map((x) => x.name) },
      projects: existing.xmls.map((x) => ({ name: x.name, size: x.text.length, title: sceneTitleOf(x.text) })),
      files: existing.list,
      cached: true,
    });
  }

  const zipBuf = await downloadZip(parsed.user, parsed.pkg);
  if (!zipBuf) return c.json({ error: "package not found / expired" }, 404);

  const meta = await fetchShareMeta(link);
  const zip = await JSZip.loadAsync(zipBuf);
  const files = new Map<string, { blob: Uint8Array; mime: string }>();
  const xmls: { name: string; text: string }[] = [];
  const list: PackageEntry[] = [];
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const data = new Uint8Array(await entry.async("uint8array"));
    const mime = mimeOf(name);
    files.set(name, { blob: data, mime });
    list.push({ name, size: data.length, xml: mime === "application/xml", media: mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/"), mime });
    if (mime === "application/xml") {
      xmls.push({ name, text: await entry.async("string") });
    }
  }
  packages.set(cacheKey, {
    files,
    xmls,
    list,
    meta: { title: meta.title, description: meta.description, thumb: meta.thumb },
    fetchedAt: Date.now(),
  });
  return c.json({
    packageId: parsed.pkg,
    meta: { ...meta, projects: xmls.map((x) => x.name) },
    projects: xmls.map((x) => ({ name: x.name, size: x.text.length, title: sceneTitleOf(x.text) })),
    files: list,
    cached: false,
  });
});

app.get("/api/link/:packageId/xml/:name", (c) => {
  const pkg = packages.get(c.req.param("packageId"));
  if (!pkg) return c.json({ error: "package not loaded, POST /api/link first" }, 404);
  const name = decodeURIComponent(c.req.param("name"));
  const xml = pkg.xmls.find((x) => x.name === name);
  if (!xml) return c.json({ error: "xml not found" }, 404);
  return c.text(xml.text, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-cache",
  });
});

app.get("/api/link/:packageId/media/:name", (c) => {
  const pkg = packages.get(c.req.param("packageId"));
  if (!pkg) return c.json({ error: "package not loaded, POST /api/link first" }, 404);
  const name = decodeURIComponent(c.req.param("name"));
  const file = pkg.files.get(name);
  if (!file) return c.json({ error: "file not found" }, 404);
  const buf = file.blob.buffer.slice(
    file.blob.byteOffset,
    file.blob.byteOffset + file.blob.byteLength
  );
  const range = c.req.header("range");
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
      if (start >= buf.byteLength || start > end) {
        return c.body(null, 416, { "Content-Range": `bytes */${buf.byteLength}` });
      }
      const chunk = buf.slice(start, end + 1);
      return c.body(chunk as ArrayBuffer, 206, {
        "Content-Type": file.mime,
        "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
        "Content-Length": String(chunk.byteLength),
        "Accept-Ranges": "bytes",
      });
    }
  }
  return c.body(buf as ArrayBuffer, 200, {
    "Content-Type": file.mime,
    "Cache-Control": "public, max-age=86400",
    "Accept-Ranges": "bytes",
  });
});

app.get("/api/health", (c) => c.json({ ok: true }));

// ---- konversi WebM -> MP4 (opsional, pakai ffmpeg bila tersedia di sistem) ----
// NOTE Termux: tidak ada /tmp — pakai os.tmpdir() ($PREFIX/tmp).
let ffmpegPath: string | null = null;
for (const p of ["ffmpeg", "/data/data/com.termux/files/usr/bin/ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
  try {
    const probe = spawn(p, ["-version"]);
    const ok = await new Promise<boolean>((res) => {
      probe.on("error", () => res(false));
      probe.on("close", (code) => res(code === 0));
    });
    if (ok) { ffmpegPath = p; break }
  } catch { /* next */ }
}
if (ffmpegPath) console.log(`[server] ffmpeg ditemukan: ${ffmpegPath} (konversi MP4 aktif)`);
else console.log("[server] ffmpeg tidak ada — ekspor video akan tetap WebM di browser");

app.post("/api/export/mp4", async (c) => {
  if (!ffmpegPath) return c.json({ error: "ffmpeg unavailable" }, 501);
  const body = new Uint8Array(await c.req.arrayBuffer());
  if (!body.length) return c.json({ error: "empty body" }, 400);

  // fps target dari client (?fps=60) — default 60. Dipakai untuk CFR agar
  // durasi & fps hasil SELALU sesuai pilihan export, bukan kecepatan rekam.
  const qFps = Math.max(1, Math.min(120, Number(c.req.query("fps")) || 60));
  // kualitas dari client (?q=hemat|standar|tinggi|ultra) -> CRF libx264.
  // Selaras QUALITY_LEVELS di public/js/export-plan.js.
  const qKey = (c.req.query("q") || "standar").toLowerCase();
  const crf = qKey.includes("hemat") ? 26 : qKey.includes("tinggi") ? 17 : qKey.includes("ultra") ? 14 : 20;

  // FIX Termux ENOENT: jangan hardcode /tmp — pakai os.tmpdir().
  // Beri ekstensi (.webm) agar ffmpeg sniffing andal + mkdir rekursif.
  let tmpDir = os.tmpdir();
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const mimeIn = (c.req.header("content-type") || "").toLowerCase();
  const extIn = mimeIn.includes("mp4") ? ".mp4" : ".webm";
  const tmpIn = path.join(tmpDir, `amexp-${tag}${extIn}`);
  const tmpOut = path.join(tmpDir, `amexp-${tag}.mp4`);
  try { writeFileSync(tmpIn, body); }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: "tmp write failed", detail: msg, tmpDir }, 500);
  }
  // Selalu re-encode H.264 CFR + AAC (jangan -c:v copy):
  // - copy mempertahankan timestamp VFR MediaRecorder -> durasi/fps ngaco
  //   ("tidak 60fps", "cuma 7 detik").
  // - encode ulang menjamin fps & durasi = full render.
  // NOTE: tanpa -shortest — flag itu memotong video mengikuti stream
  // terpendek (sumber bug "hasil cuma 7 detik").
  const ffprobePath =
    ffmpegPath === "ffmpeg" ? "ffprobe"
    : ffmpegPath.replace(/ffmpeg(\.exe)?$/, (m) => m.replace("ffmpeg", "ffprobe"));
  async function inputHasAudio(file: string): Promise<boolean | null> {
    try {
      const pr = spawn(ffprobePath, [
        "-v", "error", "-select_streams", "a",
        "-show_entries", "stream=index", "-of", "csv=p=0", file,
      ]);
      let out = "";
      pr.stdout.on("data", (d) => (out += String(d)));
      await new Promise((r) => pr.on("close", r));
      return out.trim().length > 0;
    } catch { return null; }
  }
  async function runFfmpeg(withAudio: boolean): Promise<{ code: number; err: string }> {
    const args = [
      "-hide_banner", "-loglevel", "error",
      "-y",
      "-i", tmpIn,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p",
      "-r", String(qFps), "-vsync", "cfr",
      ...(withAudio
        ? ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]
        : ["-an"]),
      "-movflags", "+faststart",
      tmpOut,
    ];
    const ff = spawn(ffmpegPath as string, args);
    const stderr: string[] = [];
    ff.stderr.on("data", (d) => stderr.push(String(d)));
    const code = await new Promise<number>((res) => ff.on("close", res));
    return { code, err: stderr.join("") };
  }
  const probedAudio = await inputHasAudio(tmpIn);
  let res = await runFfmpeg(probedAudio !== false);
  // Input tanpa track audio + `-c:a aac` bisa gagal -> retry tanpa audio.
  if (res.code !== 0 && probedAudio !== true && /audio|aac|stream|map/i.test(res.err)) {
    res = await runFfmpeg(false);
  }
  let out: Buffer | null = null;
  try { out = readFileSync(tmpOut) } catch { out = null }
  try { unlinkSync(tmpIn) } catch {}
  try { unlinkSync(tmpOut) } catch {}
  if (res.code !== 0 || !out) {
    return c.json({ error: "ffmpeg failed", detail: res.err.slice(0, 500) }, 500);
  }
  return c.body(new Uint8Array(out) as unknown as ArrayBuffer, 200, {
    "Content-Type": "video/mp4",
  });
});

// ============ SERVER RENDER (Railway + Playwright) ============
// Render deterministik di sisi server untuk browser tanpa WebCodecs:
// client mengunggah project + media -> headless Chromium menjalankan
// engine yg SAMA (window.__amHeadless) frame-demi-frame -> PNG disuap
// ke ffmpeg (image2pipe) + WAV mixdown -> MP4 CFR. Antresequential.
// MEDIA/PRESET TETAP MILIK CLIENT (local device): server hanya menyimpan
// file job sementara dan tidak menanggung database preset.
type RenderJob = {
  id: string; status: "queued" | "running" | "done" | "error";
  progress: number; error?: string; file?: string; fileSize?: number;
  w: number; h: number; fps: number; frames: number;
  createdAt: number;
};
const renderJobs = new Map<string, RenderJob>();
let renderChain: Promise<void> = Promise.resolve();
let _browser: { newPage: (...a: never[]) => Promise<never>; close: () => Promise<void> } | null = null;

function jobRoot(id: string) {
  return path.join(os.tmpdir(), `amjob-${id}`);
}
// sapu job > 2 jam (hindari /tmp penuh di Railway)
function sweepJobs() {
  const now = Date.now();
  for (const [id, j] of renderJobs) {
    if (now - j.createdAt > 2 * 3600 * 1000) {
      try { rmSync(jobRoot(id), { recursive: true, force: true }) } catch {}
      renderJobs.delete(id);
    }
  }
}

async function getBrowser(): Promise<{ newPage: (opts?: Record<string, unknown>) => Promise<import("playwright").Page>; close: () => Promise<void> }> {
  if (_browser) return _browser as never;
  let pw: typeof import("playwright");
  try { pw = await import("playwright") }
  catch { throw new Error("playwright belum terinstal di server (npm i playwright + npx playwright install chromium)") }
  try {
    const browser = await pw.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--mute-audio"],
    });
    _browser = browser as never;
    return browser;
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error("chromium headless gagal start (butuh: npx playwright install chromium): " + m.slice(0, 160));
  }
}

function needToken(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const want = process.env.EXPORT_TOKEN;
  if (!want) return null;
  const got = c.req.header("x-export-token");
  if (got !== want) return "unauthorized (x-export-token salah)";
  return null;
}

app.get("/api/render-capable", async (c) => {
  let playwright = false, chromium = false;
  try {
    const pw = await import("playwright");
    playwright = true;
    try { chromium = existsSync(pw.chromium.executablePath()) } catch { chromium = false }
  } catch { /* tidak ada */ }
  return c.json({ playwright, chromium, ffmpeg: !!ffmpegPath, serverRender: !!(playwright && chromium && ffmpegPath) });
});

app.post("/api/export/server-render", async (c) => {
  const deny = needToken(c);
  if (deny) return c.json({ error: deny }, 401);
  if (!ffmpegPath) return c.json({ error: "ffmpeg tidak tersedia di server" }, 501);
  let body: Record<string, string | File | File[]>;
  try { body = await c.req.parseBody() } catch { return c.json({ error: "multipart tidak valid" }, 400) }
  const projRaw = body.project;
  if (typeof projRaw !== "string" || !projRaw.length) return c.json({ error: "field project (JSON) wajib" }, 400);
  let project: Record<string, unknown>;
  try { project = JSON.parse(projRaw) } catch { return c.json({ error: "project JSON rusak" }, 400) }
  if (!Array.isArray((project as { layers?: unknown }).layers)) return c.json({ error: "project.layers hilang" }, 400);
  const qkey = String(body.quality || "standar");
  const plan = framePlanForExport(Number(body.durationMs ?? (project as { durationMs?: number }).durationMs ?? 5000), Number(body.fps ?? 60));
  const dims = {
    w: Math.max(2, Number(body.width) || 1080),
    h: Math.max(2, Number(body.height) || 1920),
  };
  dims.w -= dims.w % 2; dims.h -= dims.h % 2;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = jobRoot(id);
  const mediaDir = path.join(dir, "media");
  mkdirSync(mediaDir, { recursive: true });
  writeFileSync(path.join(dir, "project.json"), JSON.stringify(project));
  // kumpulkan file media apa adanya (nama dipertahankan)
  const blobs: File[] = [];
  const m = body.media;
  if (m) (Array.isArray(m) ? m : [m]).forEach((f) => { if (f && typeof f !== "string") blobs.push(f as File) });
  for (const f of blobs) {
    const safe = path.basename(f.name || "media.bin").slice(0, 120) || "media.bin";
    writeFileSync(path.join(mediaDir, safe), Buffer.from(await (f as File).arrayBuffer()));
  }
  const job: RenderJob = {
    id, status: "queued", progress: 0,
    w: dims.w, h: dims.h, fps: plan.fps, frames: plan.N, createdAt: Date.now(),
  };
  renderJobs.set(id, job);
  sweepJobs();
  renderChain = renderChain.then(() => runRenderJob(id, qkey).catch((e: unknown) => {
    job.status = "error";
    job.error = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
  }));
  return c.json({ jobId: id, frames: plan.N, fps: plan.fps, w: dims.w, h: dims.h, status: "queued" });
});

async function runRenderJob(id: string, qkey: string) {
  const job = renderJobs.get(id);
  if (!job) return;
  job.status = "running";
  const dir = jobRoot(id);
  const project = JSON.parse(readFileSync(path.join(dir, "project.json"), "utf-8"));
  const crf = qualityDef(qkey).crf;
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: Math.min(1920, job.w), height: Math.min(1920, job.h) } });
  page.setDefaultTimeout(10 * 60 * 1000);
  const outPath = path.join(dir, "out.mp4");
  const wavPath = path.join(dir, "audio.wav");
  try {
    const base = `http://127.0.0.1:${port}/`;
    await page.goto(base + "index.html?headless=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __amHeadless?: unknown }).__amHeadless, null, { timeout: 60000 });
    await page.evaluate(
      (j: { project: unknown; mediaBase: string; w: number; h: number }) =>
        (window as unknown as { __amHeadless: { loadJob: (x: unknown) => Promise<unknown> } }).__amHeadless.loadJob(j),
      { project, mediaBase: `/job-media/${id}/`, w: job.w, h: job.h }
    );
    // audio mixdown (boleh null = proyek bisu)
    let hasAudio = false;
    try {
      const wav = await page.evaluate(() =>
        (window as unknown as { __amHeadless: { renderWav: () => Promise<Uint8Array | null> } }).__amHeadless.renderWav());
      if (wav && (wav as Uint8Array).length > 44) {
        writeFileSync(wavPath, Buffer.from(wav as Uint8Array));
        hasAudio = true;
      }
    } catch { hasAudio = false }
    const ff = spawn(ffmpegPath as string, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "image2pipe", "-framerate", String(job.fps), "-i", "pipe:0",
      ...(hasAudio ? ["-i", wavPath] : []),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p",
      "-r", String(job.fps), "-vsync", "cfr",
      ...(hasAudio ? ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"] : ["-an"]),
      "-movflags", "+faststart",
      outPath,
    ]);
    const stderr: string[] = [];
    ff.stderr.on("data", (d) => stderr.push(String(d)));
    const done = new Promise<number>((res, rej) => {
      ff.on("close", res);
      ff.on("error", rej);
    });
    for (let i = 0; i < job.frames; i++) {
      const t = Math.min(job.frames > 0 ? (project as { durationMs: number }).durationMs - 1 : 0, (i * 1000) / job.fps);
      const png = await page.evaluate(
        (tt: number) => (window as unknown as { __amHeadless: { renderPng: (x: number) => Promise<Uint8Array> } }).__amHeadless.renderPng(tt),
        t
      );
      const buf = Buffer.isBuffer(png) ? png : Buffer.from(png as unknown as Uint8Array);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      job.progress = (i + 1) / job.frames;
    }
    ff.stdin.end();
    const code = await done;
    if (code !== 0) throw new Error("ffmpeg gagal: " + stderr.join("").slice(0, 300));
    const st = statSync(outPath);
    if (st.size < 1024) throw new Error("hasil render kosong");
    // hemat disk: hapus media sumber, pertahankan mp4 + info
    try { rmSync(path.join(dir, "media"), { recursive: true, force: true }) } catch {}
    try { unlinkSync(path.join(dir, "project.json")) } catch {}
    job.status = "done";
    job.progress = 1;
    job.file = outPath;
    job.fileSize = st.size;
  } finally {
    try { await page.close() } catch {}
  }
}

app.get("/api/export/server-render/:id", (c) => {
  const j = renderJobs.get(c.req.param("id"));
  if (!j) return c.json({ error: "job tidak ada / sudah dibersihkan" }, 404);
  return c.json({
    id: j.id, status: j.status, progress: j.progress, error: j.error || null,
    w: j.w, h: j.h, fps: j.fps, frames: j.frames, fileSize: j.fileSize || 0,
    downloadUrl: j.status === "done" ? `/api/export/server-render/${j.id}/file` : null,
  });
});

app.get("/api/export/server-render/:id/file", (c) => {
  const j = renderJobs.get(c.req.param("id"));
  if (!j || j.status !== "done" || !j.file || !existsSync(j.file)) {
    return c.json({ error: "file belum siap" }, 404);
  }
  const data = readFileSync(j.file);
  return c.body(new Uint8Array(data) as unknown as ArrayBuffer, 200, {
    "Content-Type": "video/mp4",
    "Content-Disposition": `attachment; filename="motionary-${j.w}x${j.h}-${j.fps}fps.mp4"`,
    "Content-Length": String(data.length),
  });
});

// media per-job utk headless renderer (sementara, ikut dibersihkan sweepJobs)
app.get("/job-media/:jobId/:name", (c) => {
  const dir = path.join(jobRoot(c.req.param("jobId")), "media");
  const name = decodeURIComponent(c.req.param("name"));
  if (name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    return c.json({ error: "nama file tidak valid" }, 400);
  }
  const file = path.join(dir, name);
  if (!existsSync(file)) return c.json({ error: "media tidak ada" }, 404);
  const data = readFileSync(file);
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const range = c.req.header("range");
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
      if (start < buf.byteLength && start <= end) {
        const chunk = buf.slice(start, end + 1);
        return c.body(chunk as ArrayBuffer, 206, {
          "Content-Type": mimeOf(name),
          "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
          "Content-Length": String(chunk.byteLength),
          "Accept-Ranges": "bytes",
        });
      }
    }
  }
  return c.body(buf as ArrayBuffer, 200, {
    "Content-Type": mimeOf(name),
    "Cache-Control": "public, max-age=3600",
    "Accept-Ranges": "bytes",
  });
});

// cache preset server (in-memory) boleh dikosongkan dari client.
// (Database preset tetap milik local device user.)
app.delete("/api/cache", (c) => {
  const n = packages.size;
  packages.clear();
  return c.json({ cleared: n });
});

// serve frontend statis (public/)
app.get("/", (c) => c.body(readFileSync(publicIndex, "utf-8"), 200, { "Content-Type": "text/html; charset=utf-8" }));
app.use("/*", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT ?? 3000);
console.log(`[server] listening on http://0.0.0.0:${port}`);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
