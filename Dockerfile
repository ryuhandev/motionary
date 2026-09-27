FROM node:20-bookworm-slim

# ffmpeg (mux MP4) + python (playwright deps helper)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# deps dulu agar layer ter-cache
COPY package.json package-lock.json ./
RUN npm ci

# Chromium headless + dependensi sistemnya (untuk server-render).
# Tidak jalan di Termux/Android — hanya untuk Railway/linux x64.
RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Opsional: EXPORT_TOKEN untuk mengunci endpoint /api/export/server-render
# (client mengirim header x-export-token yang sama).

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "server.ts"]
