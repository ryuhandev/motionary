# Motionary — Alight Motion Web (mobile-style)

Aplikasi editor video ala **Alight Motion** di browser dengan **engine WebGL yang menjalankan shader GLSL asli Alight Motion** (`public/amfx/` — 315 efek dari APK 5.0.273), scraper link share `alightcreative.com` + ekspor video MP4.

## Menjalankan (lokal)

```bash
npm install
npm start            # = npx tsx server.ts  →  http://localhost:3000
```

- Butuh **Node 18+**. Tidak perlu build step — frontend statis dari `public/`.
- `ffmpeg` di PATH **opsional**: dipakai server untuk finalisasi MP4 (H.264+AAC). Tanpa itu, ekspor tetap jalan dan mengikuti kemampuan browser (WebM/MP4 sesuai codec yang didukung).
- Impor preset: tombol Import → tempel link share `alightmotion.com`/`alightcreative.com` (media & XML diambil via server), atau pilih file XML. Efek dimuat dari `public/amfx/` — **100% offline, tanpa API eksternal untuk efek**.
- Catatan: render preview memakai WebGL; di GPU tanpa akselerasi (software rendering) frame berat bisa lambat.

## Timeline (compact, zoomable, mobile-first)

- **Struktur**: time ruler sticky di atas + baris layer padat (34px, nama/eye/thumbnail di kolom kiri yang tetap saat scroll horizontal). Satu scroll container: geser horizontal = waktu, vertikal = antar layer (gesture tidak saling ganggu).
- **Zoom timeline**: pinch 2 jari (horizontal) atau tombol `−/+` dan `⤢` (fit). Zoom hanya mengubah `px/detik` — **durasi clip & kecepatan playback tidak berubah**.
- **Ruler adaptif**: zoom rendah → label `0:05` per 5s; zoom tinggi → label per detik/pecahan (`0:01.5`, `0:01.25`). Major tick jelas + label, minor tick tipis. **Beat/bookmark marker** digambar merah di ruler, **berbeda** dari **playhead** (garis hijau + cap yang mengikuti waktu).
- **Scrub**: seret ruler untuk seek. Saat playback, playhead bergerak mengikuti waktu nyata dan timeline auto-scroll bila playhead keluar layar.
- **Clip**: tap = pilih (muncul handle trim kiri/kanan), seret badan clip = geser waktu, seret handle = trim (min 50ms, dijepit ke durasi proyek). Undo didukung (snapshot sebelum modifikasi).
- **Kecepatan putar**: tombol `1×` di kanan-atas timeline (0.25× / 0.5× / 1× / 1.5× / 2×) — hanya mempengaruhi preview; ekspor selalu 1×.

## Ekspor video (frame-accurate)

Ekspor `Video` memakai **WebCodecs + mp4-muxer** (`public/js/vendor/`, offline, tanpa CDN):
- Setiap frame dirender offline pada `t = n/fps` lalu di-encode dengan timestamp presisi → hasil **persis fps proyek** (mis. 60fps), tidak tergantung kecepatan preview/GPU.
- **Audio dirender offline** (OfflineAudioContext: trim inMs/outMs, speed, timing startMs) — elemen audio di timeline TIDAK disentuh sama sekali (memperbaiki bug "suara timeline hilang setelah ekspor").
- Codec otomatis: H.264 (avc) → fallback VP9; audio AAC → fallback Opus. Tanpa WebCodecs (mis. Firefox lama) otomatis fallback ke mode MediaRecorder realtime — di mode itu sambungan audio elemen kini **disambungkan ulang ke speaker** setelah ekspor.
- **Flow**: Timeline → tombol Ekspor → **Export Settings** (Resolution 1440p–270p + **FPS 24/25/30/50/60**, default = FPS proyek, ditampilkan eksplisit) → `Ekspor` → **Progress** (bar, persen, stage, ETA dari progress aktual, elapsed, tombol Batalkan) → **Export Complete** (Simpan/Unduh + Kembali ke Timeline). Gagal/dibatalkan → pesan jelas, proyek & posisi timeline tidak berubah.
- Kombinasi resolusi+FPS diverifikasi lewat `VideoEncoder.isConfigSupported` **sebelum** ekspor dimulai; bila tidak didukung, ditampilkan peringatan (tidak mulai buta).
- Resolusi mengikuti pilihan di sheet ekspor (1440p–270p); render di resolusi berapa pun identik dengan render native yang di-resize (koordinat layer diskalakan dari ukuran scene asli `projW/projH`).

## Struktur

```
public/           frontend (WAJIB public/, bukan dist/ — folder dist tidak persisten)
  index.html      layout mobile: home, editor, timeline, panel bawah, sheet
  styles.css      tema gelap AM (#191C29, accent #00E08A)
  js/app.js       state, render, timeline, panel, ekspor (raster layer + komposit)
  js/amgl.js      ENGINE WebGL: kompilasi shader GLSL asli AM (CDATA amfx),
                  acLayerNorm/l2s matrix, motionblur via velocity, adjFx/copyBg
  js/preset.js    parser XML preset Alight Motion → layer app (kf, sizeRaw, media)
  js/fx.js        katalog UI efek (browser "Tambah Efek", label Indonesia)
  amfx/           315 XML efek ASLI Alight Motion + index.json + textures
server.ts         Hono: static public/ + /api/link (Firebase) + /api/export/mp4 (ffmpeg)
```

## Endpoint API

- `POST /api/link {link}` — unduh paket preset dari link share (cache 30 menit), balikkan daftar proyek XML (+judul scene) dan file media.
- `GET /api/link/:pkg/xml/:name` — teks XML proyek.
- `GET /api/link/:pkg/media/:name` — media (dukung HTTP Range untuk video/audio).
- `POST /api/export/mp4` — WebM/MP4 → MP4 H.264 + AAC faststart (video disalin bila sudah H.264; di-encode bila VP9/VP8/AV1).

## Tiga perbaikan utama (dari laporan bug)

### 1. Preview: foto & kotak seleksi tidak sesuai
Root cause di `preset.js` lama + `app.js`:
- **Skala preset 2× salah**: konvensi app = layer digambar ke offscreen lalu discale `sx/200` (sx=200 → 100% lebar kotak 100px). Konversi dari AM seharusnya `sx = lebar_px × 2`, kode lama memakai `× 4` → semua layer preset tampil 2× lebih besar dari select box.
- **Urutan z salah**: XML AM menulis layer atas duluan; sekarang urutan dibalik saat import (gelombang/overlay tampil DI ATAS foto, seperti "seharusnya").
- **Keyframe location/scale/rotation tidak pernah diparse** (komentar lama: "rare, skip" — pada preset nyata 19/34 layer memakainya). Sekarang `parseKfVec` mengubah kf loc/scale/rot (scale AM = multiplier → dikonversi ke unit app; rot derajat).
- **Select box pakai nilai statis** `l.x` / `w=l.sx*0.5` tanpa rotasi. Sekarang `updateSelectBox()` memakai `evalProp()` (nilai kf pada playhead) + `rotate()`, dan dipanggil tiap frame sehingga kotak menempel ke layer yang sedang beranimasi.
- **Media crop/fit mengabaikan aspek layer** (selalu kotak 1:1) → sekarang mengikuti rasio `sx:sy`.
- Preview canvas diukur dari container nyata (`.preview-outer` + ResizeObserver), tidak lagi tebakan persentase window; panel bawah kosong disembunyikan total.

### 2. Durasi "ke-loop mulu" → ekspor kepanjangan
- Playback **berhenti di akhir durasi** (dulu `S.T=0` tanpa reset timer → loop selamanya).
- Ekspor video lama memakai `waitMs(1000/fps)` per frame → durasi file = waktu render (bisa 2–6× lebih panjang di device lambat). Sekarang **wall-clock**: `S.T = performance.now() - t0`, berhenti tepat di `durationMs`, lalu `rec.stop()`. Watchdog memutus rekaman maksimal `durasi + 15s`.
- Audio ekspor: satu AudioContext dipakai ulang + cache `MediaElementSource` (elemen hanya boleh punya satu source); `playbackRate` video mengikuti speed layer; koreksi drift 0.35s.

### 3. UI/UX disamakan ke screenshot referensi (47 jpg)
- **Impor multi-proyek**: modal "Impor 2 Proyek" + "Total: 4,7 MB" (judul scene diparse dari XML, bukan UUID).
- **Move & Transform**: baris properti dengan input hijau format `540,00` + tombol **+** per properti; tab Posisi/Putar/Skala/Skew; hint "Geser ke sini untuk memindahkan layer". Tombol **+** dan edit input menulis keyframe di playhead memakai nilai animasi saat ini (`evalProp`) sehingga kf baru mulus.
- **Blending & Opacity** ter-kategori ala AM: Normal / Gelapkan (Multiply, Darken, Color Burn…) / Cerahkan (Screen, Color Dodge…) / Kontras (Overlay, Soft/Hard Light…) / Perbedaan (Difference, Exclusion, Subtract, Divide) / Warna (Hue, Saturation, Color, Luminosity) — semuanya dipetakan ke blend Canvas2D.
- **Browser efek** berkategori: Warna & Cahaya, Blur, Distorsi / Warp, Gambar & Tepi, Move / Transform, Kunci / Matte.
- Timeline: nama layer + thumbnail di blok kiri.
- Grid edit 3 kolom (Color and Fill / Border and Bayangan / Blending and Opacity / Move and Transform / Edit Bentuk / Presets / Efek) — tombolnya kini benar-benar membuka panelnya (bug lama: hanya set state tanpa render).

## Hasil verifikasi (Playwright, preset `fwzw6tN4ha` "Proyek Baru 109")

| Uji | Hasil |
|---|---|
| Import link share → modal 2 proyek | ✅ "Proyek Baru 109 Copy" / "Proyek Baru 109", Total 4,7 MB |
| 1080×1920, 35 layer (34 shape + 1 audio), durasi 29853ms | ✅ |
| Kf terparse (x 7, y 7, sx 19, sy 19, rot 7, opacity 24) | ✅ |
| Select box mengikuti kf loc/scale/rot saat scrub | ✅ top 59.7→34.8px, w 24→39px, rotate ikut |
| Playback berhenti di akhir (bukan loop) | ✅ T=29853, playing=false |
| Render preview = pola "seharusnya" (foto gelap + wave ungu di atas) | ✅ |
| Ekspor 6s dengan CPU throttle 4× | ✅ file 6.08s |
| Ekspor penuh 29.85s | ✅ file **29.94s**, H.264 + AAC + faststart |
| Buat proyek baru kosong (960×1560, 60fps) | ✅ |
| Error JS selama seluruh sesi uji | ✅ nol |

Catatan: contoh link share sudah terisi di halaman depan ("Muat Preset") untuk demo cepat.


## RONDE 3 — Kalibrasi vs player referensi am.zervida.my.id (26 Sep 2026)

Dipakai ground-truth PLAYER REFERENSI (test XML sintetis via API publik `window.AM`) untuk
menemukan & membetulkan 7 akar masalah rendering (diff grid 4x7 rata-rata 6 timestamp:
**87.3 -> 37.9**; t=6.0s **4.9** ≈ identik; frame export t=6s diff **5.5**):

| # | Temuan (via eksperimen di player referensi) | Perbaikan |
|---|---|---|
| 1 | Properti `size` XML AM = piksel comp ÷ 2 (selalu x2, ukuran comp apapun; dibuktikan uji 1080x1920, 1080x1080, 720x1280) | `sx=size*scale*4` (kode awal `x4` ternyata benar; "fix" x2 session lama yang salah) |
| 2 | XML belakangan digambar DI ATAS (urutan dokumen = paint order) | hapus `shapes.reverse()` |
| 3 | `lift` = efek **Copy Background** (nama bin: effect_copybg) — layer menyalin composite di bawah + efek piksel (inilah riak air "gelombang") | `L.copyBg`: snapshot kanvas -> applyFxStack -> gambar full-screen |
| 4 | `displacemap3` tanpa peta input = layer tak digambar; efek lain jadi adjustment di bawahnya | `L.adjFx` |
| 5 | Opacity layer HARUS diaplikasi saat draw final, bukan di-bake ke offscreen (fx `tile` mengisi hitam opaque -> menghancurkan alpha -> layer 60% jadi menutup penuh) | `ctx.globalAlpha=alpha` di draw final; offscreen hanya fillAlpha |
| 6 | `cubicBezier x1 y1 x2 y2` + flag `reverse` = easing asli AM (bukan 'cubic' generik) | solver bezier (biseksi 24 iterasi) di `easeOf` |
| 7 | `randomdisplace` = displacement noise PER-PIKSEL (bukan translasi layer); `blink2` = square-wave freq Hz | kasus piksel noise di fx.js; sin gate di drawLayer |
| 8 | kf `t` ternormalisasi **durasi layer** (bukan scene) — dikonfirmasi uji layer pendek; kf bisa <0 / >1 (di luar rentang layer) | parser sudah benar; kf di-sort |
| 9 | satvib: `vib=1.0` = NETRAL (bukan 0); sat +: saturasi naik (uji patch warna) | konversi `(vib-1)*100`, sat*100 — sudah benar |
| 10 | gradien radial/linear `<gradient>` kini dirender (bukan solid) | `L.grad` + radial/linear gradient |
| 11 | Offscreen 100x100 wajib `translate(50,50)` (kode gambar koordinat -50..50) — hilang saat rewrite -> foto cuma tampak kuadran kiri-atas | translate dipulihkan |
| 12 | wavewarp2: m1=spacing (unit AM), m2=magnitudo fraksi×spacing; dinormalisasi ke lebar kanvas | `m1*w/100`, `amp=m2*m1` |

Verifikasi: E2E export ulang PASS (30.08s, 0 error); frame t=6s export vs referensi diff 5.5.
Perbandingan visual 6 timestamp: `docs-verify/perbandingan-zervida.png`.

Sisa gap (t=18.5s & 24s): aproksimasi efek bertumpuk (motionblur4 arah-akurat, shake2
multi-axis, sharpen AM) — Canvas2D mendekati tapi tidak identik dengan shader AM asli.
