# Deploy Motionary ke Railway (server render 60fps)

Arsitektur: browser HP tanpa WebCodecs tidak bisa Full Render lokal.
Solusinya: Railway menjalankan headless Chromium (Playwright) yang
menjalankan **engine yang sama persis** (`window.__amHeadless`) frame
demi frame, lalu ffmpeg mem-mux jadi MP4 CFR.

Penting: **database preset tetap milik local device user**
(localStorage + tombol "Bersihkan cache preset"). Server hanya menyimpan
file job sementara (±2 jam, lalu disapu otomatis).

## 1. Deploy

1. Push repo ini ke GitHub (private boleh).
2. Railway → New Project → Deploy from GitHub Repo → pilih repo.
3. Railway otomatis memakai `Dockerfile` + `railway.json`.
4. Tunggu build (±5–10 mnt pertama: install Chromium).
5. Buka URL publik → `/api/health` harus `{"ok":true}`,
   `/api/render-capable` harus `{"serverRender":true,...}`.

## 2. Variabel opsional

| Var | Fungsi |
|---|---|
| `EXPORT_TOKEN` | Kunci endpoint render. Jika diisi, client harus mengirim header `x-export-token` yang sama. |
| `PORT` | Diisi otomatis oleh Railway. |

## 3. Cara pakai (dari HP)

1. Buka web → impor preset seperti biasa (tersimpan di HP).
2. Sheet Export → **Export via Server**.
3. Client mengunggah proyek + media → pantau progres → unduh MP4.

## 4. Batasan

- Job antre **satu per satu** (hemat RAM). Proyek 28 dtk @60fps
  (1682 frame SwiftShader) bisa makan belasan menit.
- File job/media dihapus otomatis (>2 jam) kecuali MP4 hasil.
- Tanpa `EXPORT_TOKEN`, siapa pun yang tahu URL bisa memakai antrean
  render (CPU burn) — disarankan isi token untuk service publik.
