import { FX_CATALOG, applyFxStack, applyTransformFx, fxDefault } from './fx.js';
import { parseAMXML, xmlToProject, EXAMPLE_LINK, fontStackFor } from './preset.js';
import * as AMGL from './amgl.js';
import { framePlanForExport, audioChunkTimestampUs, dimsForTargetShort, bitrateForRes, cameraZoomOf, RES_SHORT_STEPS, qualityKeyOf, qualityDef, videoBitrate, estimateBytes, fmtSize } from './export-plan.js';
import { PAPER_RATIOS, PAPER_RES, paperDims, serpentinePath, sobelEdges, chainStrokes, polyLen, strokesTotalLen, planTiming, fmtEta, revealAt, recordSpeedForTarget } from './draw-engine.js';
import { paperPresets, paperDimsFor, fmtClock, mapImageToCanvas, docRevealAt, planAutoStrokes, visiblePoints, docDuration, DRAW_SPEEDS, REPLAY_SPEEDS } from './draw-doc.js';

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
const uid = ()=> 'id'+Math.random().toString(36).slice(2,9);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>t.hidden=true,2200)}
function fmtTC(ms, fps=60){ms=Math.max(0,Math.round(ms));fps=Math.max(1,Math.round(fps)||60);const tf=Math.round(ms/1000*fps);const fr=tf%fps;const sec=Math.floor(tf/fps);const s=sec%60;const m=Math.floor(sec/60)%99;const p=(n)=>String(n).padStart(2,'0');return p(m)+':'+p(s)+':'+p(fr)}
function fmtDur(ms){const s=Math.round(ms/1000);return '00:'+String(s).padStart(2,'0')}
function hexToRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase()}

/* ---------- store ---------- */
const store = {
  get projects(){ try{return JSON.parse(localStorage.getItem('am_projects2')||'[]')}catch{return []} },
  set projects(v){ localStorage.setItem('am_projects2', JSON.stringify(v).map(p=>({...p, layers:p.layers.map(l=>({...l, mediaSrc:undefined, mediaEl:undefined}))}))) }
};
function saveProjects(list){ try{localStorage.setItem('am_projects2', JSON.stringify(list.map(p=>({id:p.id,name:p.name,w:p.w,h:p.h,projW:p.projW||null,projH:p.projH||null,fps:p.fps,bg:p.bg,durationMs:p.durationMs,createdAt:p.createdAt,pkgId:p.pkgId||null,shareLink:p.shareLink||null,layers:p.layers.map(l=>stripLayer(l))}))))}catch(e){} }
function stripLayer(l){ const c={...l}; delete c.mediaEl; if(c.mediaSrc && c.mediaSrc.startsWith('blob:')) delete c.mediaSrc; delete c._img; delete c._vid; delete c._aud; delete c._waveBusy; delete c._drawCache; delete c._dimg; delete c._dloading; return c }

/* ---------- state ---------- */
const S = {
  projects: store.projects || [],
  active: null,
  T: 0, playing:false, lastTs:0, fpsShow:60, playRate:1,
  tl:{ pps:0, laneW:112, minPps:3, maxPps:500 }, // px per detik (zoom timeline, visual saja)
  sel: null, sub: null, moveTab: 'pos',
  easeSel: 'cubic', zoom:1,
  undoStack:[], redoStack:[],
  fxFilter:'Semua', pkgCache:null, showAdd:false, exporting:false, expCancel:false,
};
window.__am = { evalProp, state:S, raster:l=>rasterContent(l, S.T, {dx:0,dy:0,drot:0,sx:1,sy:1,alpha:1}, false), renderFrameAsync:(t,cv)=>renderAtAsync(t,cv), updateTime:()=>updateTime() };

function defaultProject(name='Proyek Baru 92', w=960,h=1560,fps=60,bg='#000000'){
  return { id:uid(), name, w,h,fps,bg, durationMs:5000, createdAt:Date.now(), layers:[] };
}
function makeShape(kind, color='#E14E7A'){
  const n = (S.active?.layers.length||0)+1;
  return { id:uid(), name:(kind==='rect'?'Persegi...ulat ':kind+' ')+n, type:'shape', shapeKind:kind,
    visible:true, startMs:0, endMs:S.active?S.active.durationMs:2000,
    x:S.active?S.active.w/2:270, y:S.active?S.active.h/2:480, z:0,
    sx:200, sy:200, rot:0, skewX:0, skewY:0, opacity:100,
    color, fillAlpha:100,
    border:{on:false,width:4,color:'#FFFFFF',pos:'DI DALAM'},
    shadow:{on:false,blur:12,dx:0,dy:6,color:'#000000',op:50},
    blend:'normal', text:null, mediaSrc:null, mediaKind:null,
    kf:{}, fx:[], anchorX:.5, anchorY:.5, corner:24 };
}
function makeText(txt='Teks'){
  const l = makeShape('text'); l.type='text'; l.name='Teks '+(S.active.layers.length+1);
  l.text={content:txt,font:'Roboto Regular',size:64,align:'center',color:'#FFFFFF'}; l.color='#FFFFFF'; return l;
}
/* ---------- drawing (kertas + auto draw ala ibis) ---------- */
function makeDrawingLayer(){
  const P=S.active;
  // Kotak full-bleed: lebar comp = sx/2 -> sx = 2*P.w.
  const l=makeShape('rect'); l.type='drawing'; l.name='Gambar '+(P.layers.length+1);
  l.sx=2*P.w; l.sy=2*P.h; l.x=P.w/2; l.y=P.h/2;
  l.color='#FFFFFF'; l.shapeKind='rect';
  l.draw={ mode:'human', penSpeed:900, recordSpeed:1, brush:46,
    sketchColor:'#23232b', strokes:[], manual:[], cover:null,
    refData:null, sketchLen:0, coverLen:0, sketchMs:0, colorMs:0, rev:0 };
  return l;
}
function ensureDrawImage(l){
  const d=l.draw; if(!d||!d.refData||l._dimg||l._dloading) return;
  l._dloading=true;
  const img=new Image();
  img.onload=()=>{ l._dimg=img; l._dloading=false; if(S.active) renderFrame() };
  img.onerror=()=>{ l._dloading=false };
  img.src=d.refData;
}
// unit kotak -> px kerja
function drawDrawing(c, l, T){
  const d=l.draw; if(!d) return;
  const W2=360, H2=360;
  const u=W2/100; // px kerja per unit kotak
  const key=W2+'x'+H2+':'+(d.rev||0)+':'+(d.mode||'human');
  let cache=l._drawCache;
  if(!cache||cache.key!==key||T<cache.t-0.001||!cache.mask||!cache.sk){
    cache=l._drawCache={ key, t:-1,
      mask:Object.assign(document.createElement('canvas'),{width:W2,height:H2}),
      sk:Object.assign(document.createElement('canvas'),{width:W2,height:H2}),
      man:Object.assign(document.createElement('canvas'),{width:W2,height:H2}),
      ki:-1, si:0, skDone:0 };
  }
  ensureDrawImage(l);
  const mctx=cache.mask.getContext('2d'), sctx=cache.sk.getContext('2d');
  const f=revealAt(T-(l.startMs||0), d.sketchMs||0, d.colorMs||0, d.mode);
  // --- 1. topeng reveal (inkremental bila T maju) ---
  if(d.cover&&d.cover.pts&&l._dimg){
    const target=Math.floor(f.color*(d.cover.pts.length-1));
    mctx.fillStyle='#fff'; mctx.strokeStyle='#fff';
    mctx.lineWidth=Math.max(2,(d.brush||46)*0.62/(Math.abs(l.sx||200)/200)*u);
    mctx.lineCap='round'; mctx.lineJoin='round';
    let k=cache.ki; // indeks terakhir yg sudah digambar
    if(target<k){ mctx.clearRect(0,0,W2,H2); k=-1 }
    if(target>=0){
      mctx.beginPath();
      const s0=Math.max(0,k);
      mctx.moveTo((d.cover.pts[s0][0]+50)*u,(d.cover.pts[s0][1]+50)*u);
      for(let j=s0+1;j<=target;j++) mctx.lineTo((d.cover.pts[j][0]+50)*u,(d.cover.pts[j][1]+50)*u);
      mctx.stroke();
    }
    cache.ki=target;
  }
  // --- 2. sketsa vektor (inkremental) ---
  if(d.strokes&&d.strokes.length){
    const targetLen=f.sketch*(d.sketchLen||0);
    let si=cache.si, acc=cache.skDone;
    if(targetLen<acc-0.001){ sctx.clearRect(0,0,W2,H2); si=0; acc=0 }
    sctx.strokeStyle=d.sketchColor||'#23232b'; sctx.lineCap='round'; sctx.lineJoin='round';
    sctx.lineWidth=Math.max(1,(d.brush||46)*0.16/(Math.abs(l.sx||200)/200)*u);
    for(;si<d.strokes.length;si++){
      const st=d.strokes[si];
      const rest=targetLen-acc;
      if(rest<=0) break;
      const drawLen=Math.min(rest,st.len);
      sctx.beginPath();
      sctx.moveTo((st.pts[0][0]+50)*u,(st.pts[0][1]+50)*u);
      let a2=0, partial=false;
      for(let i=1;i<st.pts.length;i++){
        const segL=Math.hypot(st.pts[i][0]-st.pts[i-1][0],st.pts[i][1]-st.pts[i-1][1]);
        if(a2+segL<=drawLen+1e-6){ sctx.lineTo((st.pts[i][0]+50)*u,(st.pts[i][1]+50)*u); a2+=segL }
        else { const r=(drawLen-a2)/Math.max(1e-6,segL);
          sctx.lineTo((st.pts[i-1][0]+(st.pts[i][0]-st.pts[i-1][0])*r+50)*u,(st.pts[i-1][1]+(st.pts[i][1]-st.pts[i-1][1])*r+50)*u);
          a2=drawLen; partial=true; break }
      }
      sctx.stroke();
      if(partial){ acc+=drawLen; break }
      acc+=st.len;
    }
    cache.si=si; cache.skDone=acc;
  }
  cache.t=T;
  // --- 3. komposit ke kanvas kerja ---
  const work=_drawWork._cv, wctx=_drawWork._cx;
  if(work.width!==W2||work.height!==H2){ work.width=W2; work.height=H2 }
  wctx.setTransform(1,0,0,1,0,0); wctx.globalAlpha=1; wctx.globalCompositeOperation='source-over';
  wctx.clearRect(0,0,W2,H2);
  if(l._dimg&&d.cover){
    const tmp=_drawWork._tmp, tctx=_drawWork._tx;
    if(tmp.width!==W2||tmp.height!==H2){ tmp.width=W2; tmp.height=H2 }
    tctx.setTransform(1,0,0,1,0,0); tctx.globalAlpha=1; tctx.globalCompositeOperation='source-over';
    tctx.clearRect(0,0,W2,H2);
    tctx.drawImage(l._dimg,0,0,W2,H2);
    tctx.globalCompositeOperation='destination-in';
    tctx.drawImage(cache.mask,0,0);
    wctx.drawImage(tmp,0,0);
  }
  // sketsa memudar saat warna selesai
  const mctx2=cache.man.getContext('2d');
  mctx2.setTransform(1,0,0,1,0,0); mctx2.clearRect(0,0,W2,H2);
  drawManualInto(mctx2,l,W2);
  wctx.save();
  wctx.globalAlpha=1-0.8*f.color;
  wctx.drawImage(cache.sk,0,0);
  wctx.restore();
  wctx.drawImage(cache.man,0,0);
  // --- 4. pena di kepala gambar ---
  if(d.mode!=='instant'&&(f.sketch<1||f.color<1)&&(f.sketch>0||f.color>0)){
    let hx=null,hy=null;
    if(f.color>0&&d.cover&&d.cover.pts.length){ const k=Math.min(d.cover.pts.length-1,Math.floor(f.color*(d.cover.pts.length-1))); hx=d.cover.pts[k][0]; hy=d.cover.pts[k][1] }
    else if(d.strokes&&d.strokes.length){ const s=d.strokes[Math.min(d.strokes.length-1,Math.floor(f.sketch*d.strokes.length))]; const p=s.pts[s.pts.length-1]; hx=p[0]; hy=p[1] }
    if(hx!==null){
      const br=Math.max(2,(d.brush||46)/2/(Math.abs(l.sx||200)/200)*u);
      const cxp=(hx+50)*u, cyp=(hy+50)*u;
      wctx.save();
      wctx.strokeStyle='#111'; wctx.lineWidth=Math.max(1.5,br*0.16);
      wctx.beginPath(); wctx.arc(cxp,cyp,Math.max(3,br*0.62),0,Math.PI*2); wctx.stroke();
      wctx.fillStyle='#111';
      wctx.beginPath(); wctx.arc(cxp,cyp,Math.max(1.5,br*0.14),0,Math.PI*2); wctx.fill();
      wctx.restore();
    }
  }
  c.save(); c.beginPath(); c.rect(-50,-50,100,100); c.clip();
  c.drawImage(work,-50,-50,100,100);
  c.restore();
}
const _drawWork={ _cv:document.createElement('canvas'), _tmp:document.createElement('canvas'),
  get _cx(){ return this._cv.getContext('2d') }, get _tx(){ return this._tmp.getContext('2d') } };
// Ubah gambar input jadi rencana auto-draw (sketsa tepi + sapuan warna).
// Berjalan bertahap (onProg 0..1) agar UI tidak macet.
async function autoDrawFromImage(imgEl, l, onProg){
  const d=l.draw, P=S.active;
  const prog=(f,m)=>{ try{ onProg&&onProg(f,m) }catch{} };
  const tick=()=>new Promise(r=>setTimeout(r,0));
  prog(0.05,'Menyiapkan citra…'); await tick();
  const iw=imgEl.naturalWidth||imgEl.width, ih=imgEl.naturalHeight||imgEl.height;
  const rs=Math.min(1,480/Math.max(iw,ih));
  const rc=document.createElement('canvas');
  rc.width=Math.max(2,Math.round(iw*rs)); rc.height=Math.max(2,Math.round(ih*rs));
  rc.getContext('2d').drawImage(imgEl,0,0,rc.width,rc.height);
  try{ d.refData=rc.toDataURL('image/jpeg',0.85) }catch{ d.refData=null }
  l._dimg=imgEl;
  const upc=1/(Math.abs(l.sx||200)/200);
  prog(0.15,'Mendeteksi tepi…'); await tick();
  const ew=220, eh=Math.max(2,Math.round(220*ih/iw));
  const ec=document.createElement('canvas'); ec.width=ew; ec.height=eh;
  const ectx=ec.getContext('2d',{willReadFrequently:true});
  ectx.drawImage(imgEl,0,0,ew,eh);
  const id=ectx.getImageData(0,0,ew,eh).data;
  const gray=new Uint8Array(ew*eh);
  for(let i=0;i<ew*eh;i++) gray[i]=(id[i*4]+id[i*4+1]+id[i*4+2])/3;
  const edge=sobelEdges(gray,ew,eh,110);
  prog(0.45,'Merangkai sketsa…'); await tick();
  const raw=chainStrokes(edge,ew,eh,2.2,3,6000);
  d.strokes=raw.map(pts=>{
    const bp=pts.map(p=>[p[0]/ew*100-50,p[1]/eh*100-50]);
    return { pts:bp, len:polyLen(bp), cum:null };
  });
  d.sketchLen=strokesTotalLen(d.strokes);
  prog(0.65,'Menyusun sapuan warna…'); await tick();
  const spacing=Math.max(1.2,(d.brush||46)*0.6*upc);
  const cov=serpentinePath(100,100,spacing);
  d.cover={ pts:cov.pts, cum:cov.cum };
  d.coverLen=cov.total;
  // waktu: panjang comp-px / kecepatan pena, dibagi recordSpeed (timelapse)
  const skComp=d.sketchLen/upc, cvComp=cov.total/upc;
  const plan=planTiming(skComp,cvComp,d.penSpeed||900,d.recordSpeed||1);
  d.sketchMs=plan.sketchMs; d.colorMs=plan.colorMs;
  d.rev=(d.rev||0)+1;
  prog(1,'Selesai');
  return plan;
}
function drawEtaText(l){
  const d=l.draw; if(!d) return '';
  if(d.mode==='instant') return 'Mode Instant: hasil langsung penuh.';
  const total=(d.sketchMs||0)+(d.colorMs||0);
  return 'Human Draw: sketsa '+fmtEta(d.sketchMs||0)+' + warna '+fmtEta(d.colorMs||0)+' = video '+fmtEta(total)+'.';
}
/* Panel alat gambar (AM-style, bottom sheet). */
function renderDrawPanel(el,l){
  const d=l.draw;
  if(!d){ el.innerHTML='<div class="iq-status">Layer ini bukan gambar.</div>'; return }
  el.innerHTML='';
  const head=document.createElement('div'); head.className='mini-row';
  const tTools=document.createElement('button'); tTools.className='mini';
  tTools.textContent='Alat: '+(S.drawTool==='brush'?'Kuas':S.drawTool==='eraser'?'Penghapus':'Pilih');
  tTools.onclick=()=>{ S.drawTool=S.drawTool==='brush'?'eraser':S.drawTool==='eraser'?null:'brush'; renderBottom(); toast(S.drawTool?'Gambar langsung di preview':'Alat gambar mati') };
  const tMode=document.createElement('button'); tMode.className='mini';
  tMode.textContent='Mode: '+(d.mode==='human'?'Human Draw':'Instant');
  tMode.onclick=()=>{ pushUndo(); d.mode=d.mode==='human'?'instant':'human'; d.rev=(d.rev||0)+1; afterChange(); renderBottom() };
  const tClear=document.createElement('button'); tClear.className='mini'; tClear.textContent='Bersihkan';
  tClear.onclick=()=>{ pushUndo(); d.strokes=[]; d.manual=[]; d.cover=null; d.sketchLen=0; d.coverLen=0; d.sketchMs=0; d.colorMs=0; d.rev=(d.rev||0)+1; afterChange(); renderBottom() };
  head.append(tTools,tMode,tClear); el.appendChild(head);
  const row2=document.createElement('div'); row2.className='mini-row';
  const bAuto=document.createElement('button'); bAuto.className='mini'; bAuto.textContent='Auto Draw (dari gambar)';
  bAuto.onclick=()=>$('#drawPick').click();
  const bBack=document.createElement('button'); bBack.className='mini'; bBack.textContent='Kembali';
  bBack.onclick=()=>{ S.sub='edit'; S.drawTool=null; renderBottom() };
  row2.append(bAuto,bBack); el.appendChild(row2);
  const cols=['#111111','#E14E7A','#3DDC84','#6ACDE0','#FFFFFF','#FFB020'];
  const cRow=document.createElement('div'); cRow.className='mini-row';
  cols.forEach(cc=>{
    const b=document.createElement('button'); b.className='mini'; b.style.background=cc; b.textContent=' ';
    b.onclick=()=>{ d.brushColor=cc; renderBottom() };
    cRow.appendChild(b);
  });
  el.appendChild(cRow);
  sliderRow(el,'Ukuran',d.brush||46,4,160,v=>{ d.brush=v },{live:true});
  sliderRow(el,'Speed',d.penSpeed||900,60,4000,v=>{ pushUndo(); d.penSpeed=v; replanDraw(l); renderBottom() });
  const rsRow=document.createElement('div'); rsRow.className='mini-row';
  const rsLb=document.createElement('span'); rsLb.style.cssText='color:#fff;font-size:13px;align-self:center';
  rsLb.textContent='Record: '+d.recordSpeed+'x';
  rsRow.appendChild(rsLb);
  [0.5,1,2,4,8].forEach(rv=>{
    const b=document.createElement('button'); b.className='mini'; b.textContent=rv+'x';
    b.onclick=()=>{ pushUndo(); d.recordSpeed=rv; replanDraw(l); renderBottom() };
    rsRow.appendChild(b);
  });
  el.appendChild(rsRow);
  // Target durasi custom: mis. pas 60 dtk -> recordSpeed dihitung otomatis.
  const tgRow=document.createElement('div'); tgRow.className='mini-row';
  const tgLb=document.createElement('span'); tgLb.style.cssText='color:#fff;font-size:13px;align-self:center';
  tgLb.textContent='Target:';
  const tgIn=document.createElement('input'); tgIn.type='number'; tgIn.min='1'; tgIn.max='3600';
  tgIn.value=Math.round((S.active?.durationMs||5000)/1000);
  tgIn.style.cssText='width:76px;background:#2E3450;border:none;border-radius:8px;color:#fff;padding:10px';
  const tgU=document.createElement('span'); tgU.style.cssText='color:#fff;font-size:13px;align-self:center'; tgU.textContent='dtk';
  const tgGo=document.createElement('button'); tgGo.className='mini'; tgGo.textContent='Pas';
  const applyTg=()=>{
    const sec=Math.max(1,Math.min(3600,+tgIn.value||0));
    if(!sec) return;
    pushUndo();
    if(d.mode==='instant'){ S.active.durationMs=sec*1000; l.endMs=S.active.durationMs; afterChange(); renderBottom(); return }
    const upc=1/(Math.abs(l.sx||200)/200);
    const base=planTiming((d.sketchLen||0)/upc,(d.coverLen||0)/upc,d.penSpeed||900,1);
    d.recordSpeed=recordSpeedForTarget(base.sketchMs+base.colorMs,sec*1000);
    replanDraw(l); renderBottom();
  };
  tgIn.onchange=applyTg; tgGo.onclick=applyTg;
  tgRow.append(tgLb,tgIn,tgU,tgGo); el.appendChild(tgRow);
  const eta=document.createElement('div'); eta.className='iq-status';
  eta.textContent=drawEtaText(l)+' Kuas '+(d.brush||46)+'px · warna '+(d.brushColor||'#111111');
  el.appendChild(eta);
  const prog=document.createElement('div'); prog.className='iq-status'; prog.id='drawProg'; prog.hidden=true;
  el.appendChild(prog);
}
// Hitung ulang durasi dari kecepatan tanpa mengubah goresan.
function replanDraw(l){
  const d=l.draw, P=S.active; if(!d||!P) return;
  const upc=1/(Math.abs(l.sx||200)/200);
  const plan=planTiming((d.sketchLen||0)/upc,(d.coverLen||0)/upc,d.penSpeed||900,d.recordSpeed||1);
  d.sketchMs=plan.sketchMs; d.colorMs=plan.colorMs;
  if(d.mode==='human'){ P.durationMs=Math.max(1000,plan.totalMs); l.endMs=P.durationMs }
  d.rev=(d.rev||0)+1;
  afterChange();
}
function drawManualInto(g,l,W2){
  const u=W2/100;
  for(const s of (l.draw.manual||[])){
    if(!s.pts||s.pts.length<1) continue;
    g.strokeStyle=s.color||'#111'; g.lineWidth=Math.max(1,(s.w||6)*u);
    g.lineCap='round'; g.lineJoin='round';
    g.globalCompositeOperation=s.eraser?'destination-out':'source-over';
    g.beginPath();
    g.moveTo((s.pts[0][0]+50)*u,(s.pts[0][1]+50)*u);
    for(let i=1;i<s.pts.length;i++) g.lineTo((s.pts[i][0]+50)*u,(s.pts[i][1]+50)*u);
    g.stroke();
  }
  g.globalCompositeOperation='source-over';
}
function pushUndo(){ if(!S.active) return; S.undoStack.push(JSON.stringify(S.active)); if(S.undoStack.length>40)S.undoStack.shift(); S.redoStack.length=0; }

/* ---------- home ---------- */
function renderTpl(){
  const row=$('#tplRow'); row.innerHTML='';
  const items=[{t:'Untuk Anda',c:'#FF8AC2'},{t:'Anime Romantis',c:'#2A3A66'},{t:'Chibi',c:'#4A3A55'},{t:'Mobil',c:'#DDD'}];
  items.forEach(o=>{ const d=document.createElement('div');d.className='tpl';d.innerHTML='<div class="c" style="background:'+o.c+'">'+o.t[0]+'</div><small>'+o.t+'</small>';row.appendChild(d)});
}
function renderProjects(){
  const list=$('#projectList'); list.innerHTML='';
  const docs=drawStoreLoad();
  if(docs.length){
    const h=document.createElement('div');h.className='home-row-head';
    h.innerHTML='<h2>Gambar</h2>';list.appendChild(h);
    docs.forEach(d=>{
      const el=document.createElement('div');el.className='proj-card';
      el.innerHTML='<div class="proj-thumb"><canvas width="92" height="92"></canvas><span class="proj-dur">'+fmtClock(d.durationMs||1000)+'</span></div><div><h3>'+escapeHtml(d.name||'Gambar')+'</h3><div class="proj-meta"><span>'+d.w+'x'+d.h+'</span><span>Drawing</span><span>'+(d.layers||[]).length+' layer</span></div></div>';
      el.onclick=()=>openDrawDoc(d.id);
      list.appendChild(el);
    });
  }
  if(!S.projects.length&&!docs.length){ const e=document.createElement('div');e.className='iq-status';e.textContent='Belum ada proyek. Buat baru atau muat preset dari link.';list.appendChild(e);return }
  S.projects.forEach(p=>{
    const d=document.createElement('div');d.className='proj-card';
    d.innerHTML='<div class="proj-thumb"><canvas width="92" height="92"></canvas><span class="proj-dur">'+fmtTC(p.durationMs||2000,p.fps||60)+'</span></div><div><h3>'+escapeHtml(p.name)+'</h3><div class="proj-meta"><span>'+p.w+'x'+p.h+'</span><span>'+p.fps+'fps</span><span>'+p.layers.length+' layer</span></div></div>';
    d.onclick=()=>openProject(p.id);
    list.appendChild(d);
    const cv=d.querySelector('canvas');
    drawThumb(cv,p);
  });
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function drawThumb(cv,p){
  const ctx=cv.getContext('2d');ctx.fillStyle=p.bg||'#000';ctx.fillRect(0,0,92,92);
  p.layers.slice(-3).forEach((l,i)=>{ ctx.fillStyle=l.color||'#E14E7A'; const s=22+i*6; ctx.fillRect(46-s/2,46-s/2,s,s) });
}

/* ---------- create sheet ---------- */
let cpAspect='9:16', cpW=960, cpH=1560, cpFps=60, cpBg='#00A651', cpBgName='Hijau';
// Setup kertas drawing: preset + DPI + orientasi + custom W/H.
// Internal canvas TETAP apa pun ukuran layar (sumber kebenaran).
let drPreset='portrait', drDpi=300, drOrient='portrait', drW=1080, drH=1920, drBg='#FFFFFF';
function syncDrawSetup(fromWH){
  const d=paperDimsFor(drPreset==='custom'?'custom':drPreset,drDpi,drOrient,drW,drH);
  if(!fromWH||drPreset!=='custom'){ drW=d.w; drH=d.h }
  $('#drW').value=drW; $('#drH').value=drH;
  $('#drDpiSub').textContent=drDpi+' dpi'+(d.dpi?'':' (non-A)')+' · '+drOrient;
  $('#drDimSub').textContent=d.w+' X '+d.h+' px canvas (tetap, tak ikut layar)';
  return d;
}
// Dokumen gambar baru -> buka Drawing workspace (bukan video editor).
function createDrawPaper(){
  const d=syncDrawSetup(false);
  const name=($('#cpName').value||'Gambar Baru').slice(0,48);
  const doc=newDrawDoc(name,d.w,d.h,d.dpi,drBg);
  const list=drawStoreLoad(); list.unshift(doc); drawStoreSave(list);
  closeCreate();
  openDrawDoc(doc.id);
  toast('Kertas '+d.w+'×'+d.h+' siap — Kuas atau Auto Draw');
}
const AR_MAP={'16:9':[960,540],'9:16':[960,1560],'4:5':[1080,1350],'1:1':[1080,1080],'4:3':[960,720]};
function openCreate(){ $('#sheetCreate').hidden=false; }
function closeCreate(){ $('#sheetCreate').hidden=true; }
function bindCreate(){
  $('#btnNewProject').onclick=openCreate; $('#navPlus').onclick=openCreate;
  $('#sheetClose').onclick=closeCreate; $('#cpClear').onclick=()=>{$('#cpName').value=''};
  $$('#aspectRow button').forEach(b=>b.onclick=()=>{ $$('#aspectRow button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); cpAspect=b.dataset.ar; if(AR_MAP[cpAspect]){cpW=AR_MAP[cpAspect][0];cpH=AR_MAP[cpAspect][1];$('#cpW').value=cpW;$('#cpH').value=cpH;$('#cpResSub').textContent='Ukuran Komposisi: '+cpW+' X '+cpH} });
  $('#cpW').oninput=e=>{cpW=+e.target.value||960;$('#cpResSub').textContent='Ukuran Komposisi: '+cpW+' X '+cpH};
  $('#cpH').oninput=e=>{cpH=+e.target.value||1560;$('#cpResSub').textContent='Ukuran Komposisi: '+cpW+' X '+cpH};
  $('#cpSwap').onclick=()=>{const t=cpW;cpW=cpH;cpH=t;$('#cpW').value=cpW;$('#cpH').value=cpH};
  $('#cpFps').onclick=()=>{ const opts=[24,30,60,120]; const i=(opts.indexOf(cpFps)+1)%opts.length; cpFps=opts[i]; $('#cpFps').textContent=cpFps+' fps' };
  $('#cpBg').onclick=()=>{ const opts=[['Hijau','#00A651'],['Hitam','#000000'],['Putih','#FFFFFF'],['Biru','#1E90FF']]; const cur=opts.findIndex(o=>o[1]===cpBg); const nx=opts[(cur+1)%opts.length]; cpBg=nx[1];cpBgName=nx[0]; $('#cpBg').innerHTML='<span class="dot" style="background:'+cpBg+'"></span> '+cpBgName };
  $('#cpCreate').onclick=()=>{
    const name=$('#cpName').value||'Proyek Baru';
    const p=defaultProject(name,cpW,cpH,cpFps,cpBg);
    S.projects.unshift(p); saveProjects(S.projects); renderProjects(); closeCreate(); openProject(p.id);
  };
  $('#cpLoadLink').onclick=()=>loadShareToCreate($('#cpLink').value);
  $('#iqLoad').onclick=()=>loadShareToCreate($('#iqLink').value);
  $('#iqClear').onclick=clearPresetCache;
  $('#cpFile').onchange=e=>{ const f=e.target.files[0]; if(f) loadFilePreset(f, $('#cpStatus')) };
  $('#iqFile').onchange=e=>{ const f=e.target.files[0]; if(f) loadFilePreset(f, $('#iqStatus')) };
  $$('.seg-btn').forEach(b=>b.onclick=()=>{$$('.seg-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');
    const tab=b.dataset.tab==='drawing'?'drawing':'proyek';
    $('#cpProyekWrap').hidden=tab!=='proyek'; $('#cpDrawWrap').hidden=tab!=='drawing' });
  // --- tab drawing: setup kertas (viewport ≠ geometri) ---
  $$('#drawPresetRow button').forEach(b=>b.onclick=()=>{ $$('#drawPresetRow button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); drPreset=b.dataset.dp; syncDrawSetup(false) });
  $$('#drDpiRow button').forEach(b=>b.onclick=()=>{ drDpi=+b.dataset.ddpi||300; syncDrawSetup(false) });
  $('#drOrient').onclick=()=>{ drOrient=drOrient==='portrait'?'landscape':'portrait'; $('#drOrient').textContent=drOrient==='portrait'?'Portrait':'Landscape'; syncDrawSetup(false) };
  $('#drW').oninput=e=>{ drW=+e.target.value||drW; drPreset='custom'; $$('#drawPresetRow button').forEach(x=>x.classList.toggle('active',x.dataset.dp==='custom')); syncDrawSetup(true) };
  $('#drH').oninput=e=>{ drH=+e.target.value||drH; drPreset='custom'; $$('#drawPresetRow button').forEach(x=>x.classList.toggle('active',x.dataset.dp==='custom')); syncDrawSetup(true) };
  $('#drSwap').onclick=()=>{ const t=drW; drW=drH; drH=t; drPreset='custom'; syncDrawSetup(true) };
  $('#drBg2').onclick=()=>{ const opts=[['Putih','#FFFFFF'],['Hitam','#000000'],['Krem','#F5EFE0'],['Abu','#9AA0AA']]; const cur=opts.findIndex(o=>o[1]===drBg); const nx=opts[(cur+1)%opts.length]; drBg=nx[1]; $('#drBg2').innerHTML='<span class="dot" style="background:'+drBg+'"></span> '+nx[0] };
  $('#cpDrawCreate').onclick=createDrawPaper;
}
/* Preset tersimpan di local device (localStorage), BUKAN di server.
   Tombol ini mengosongkannya + meminta server membuang cache paket
   in-memory milik sesi ini. */
async function clearPresetCache(){
  const set=(m)=>{ if($('#iqStatus'))$('#iqStatus').textContent=m };
  try{ localStorage.removeItem('am_projects2') }catch{}
  try{ localStorage.removeItem('am_projects') }catch{}
  S.projects=[]; S.pkgCache=null;
  try{ renderProjects() }catch{}
  try{ await fetch('/api/cache',{method:'DELETE'}) }catch{}
  set('Cache preset di perangkat ini dikosongkan.');
  try{ toast('Cache preset dikosongkan') }catch{}
}
async function loadShareToCreate(link){  const st=$('#cpStatus')||$('#iqStatus');
  const set=(m)=>{ if($('#cpStatus'))$('#cpStatus').textContent=m; if($('#iqStatus'))$('#iqStatus').textContent=m };
  set('Memuat paket...');
  try{
    const r=await fetch('/api/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link})});
    const j=await r.json();
    if(j.error){ set('Gagal: '+j.error); return }
    S.pkgCache={id:j.packageId, link, meta:j.meta, projects:j.projects, files:j.files};
    set('Paket dimuat: '+(j.meta.title||'tanpa judul')+' | '+j.projects.length+' proyek XML');
    renderPkgList();
  }catch(e){ set('Gagal jaringan: '+e.message) }
}
function closeImportSheet(){ const m=$('#sheetImport'); if(m) m.hidden=true }
function renderPkgList(){
  if(!S.pkgCache) return;
  const n=S.pkgCache.projects.length;
  if(n===1){ importXmlFromPkg(S.pkgCache.id, S.pkgCache.projects[0].name); return }
  // modal "Impor N Proyek" seperti aplikasi AM (lihat screenshot referensi)
  const m=$('#sheetImport'); if(!m) return;
  $('#impCount').textContent=n+' Proyek';
  const list=$('#impList'); list.innerHTML='';
  S.pkgCache.projects.forEach(p=>{
    const b=document.createElement('button'); b.className='imp-item';
    const nm=(p.title||p.name||'').replace(/\.xml$/i,'');
    b.innerHTML='<span class="imp-ico">XML</span><span class="imp-nm">'+escapeHtml(nm)+'</span><span class="imp-sz">'+(p.size/1024).toFixed(0)+' KB</span>';
    b.onclick=async()=>{ closeImportSheet(); await importXmlFromPkg(S.pkgCache.id, p.name) };
    list.appendChild(b);
  });
  const files=S.pkgCache.files||[];
  const total=(files.reduce((a,f)=>a+(f.size||0),0))/1048576;
  $('#impTotal').textContent='Total: '+total.toFixed(1).replace('.',',')+' MB';
  m.hidden=false;
  $('#impClose').onclick=closeImportSheet;
}
async function importXmlFromPkg(pkgId, name){
  const set=(m)=>{ if($('#cpStatus'))$('#cpStatus').textContent=m };
  set('Mengambil XML '+name+'...');
  const r=await fetch('/api/link/'+encodeURIComponent(pkgId)+'/xml/'+encodeURIComponent(name));
  const txt=await r.text();
  finishXmlImport(txt, name, pkgId, S.pkgCache?.link||null);
}
async function loadFilePreset(file, statusEl){
  const set=(m)=>{ if(statusEl)statusEl.textContent=m; if($('#cpStatus'))$('#cpStatus').textContent=m };
  set('Membaca '+file.name+'...');
  try{
    let txt='';
    if(file.name.toLowerCase().endsWith('.zip')){
      const buf=await file.arrayBuffer();
      const { default:JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
      const zip=await JSZip.loadAsync(buf);
      const names=Object.keys(zip.files).filter(n=>n.toLowerCase().endsWith('.xml'));
      if(!names.length){ set('ZIP tidak berisi XML'); return }
      if(names.length===1){ txt=await zip.files[names[0]].async('string'); finishXmlImport(txt, names[0]); return }
      S._zipFiles=[]; for(const n of names){ S._zipFiles.push({name:n, text:await zip.files[n].async('string')}) }
      const box=$('#cpProjList'); box.innerHTML=''; S._zipFiles.forEach(o=>{ const b=document.createElement('button');b.textContent=o.name;b.onclick=()=>finishXmlImport(o.text,o.name);box.appendChild(b) });
      set('ZIP dimuat: '+names.length+' XML. Pilih salah satu.');
      return;
    } else { txt=await file.text() }
    finishXmlImport(txt, file.name);
  }catch(e){ set('Gagal baca file: '+e.message) }
}
function finishXmlImport(txt, name, pkgId=null, shareLink=null){
  try{
    const proj=parseAMXML(txt, name, pkgId||S.pkgCache?.id||null);
    proj.id=uid(); proj.name=(proj.name||name||'Preset').replace(/\.xml$/i,'').slice(0,40)||'Preset';
    proj.pkgId=pkgId||S.pkgCache?.id||null;
    proj.shareLink=shareLink||S.pkgCache?.link||null;
    hydratePresetMedia(proj);
    S.projects.unshift(proj); saveProjects(S.projects); renderProjects();
    const m='Preset dimuat: '+proj.name+' | '+proj.layers.length+' layer';
    if($('#cpStatus'))$('#cpStatus').textContent=m; if($('#iqStatus'))$('#iqStatus').textContent=m;
    toast(m); closeCreate(); closeImportSheet(); openProject(proj.id);
  }catch(e){ const m='XML tidak valid: '+e.message; if($('#cpStatus'))$('#cpStatus').textContent=m; toast(m) }
}

/* ---------- editor open ---------- */
function hydratePresetMedia(proj){
  (proj.layers||[]).forEach(l=>{
    const hasImg=l._img&&typeof l._img.addEventListener==='function';
    const hasVid=l._vid&&typeof l._vid.addEventListener==='function';
    const hasAud=l._aud&&typeof l._aud.play==='function';
    if(l.mediaSrc&&!hasImg&&!hasVid&&!hasAud){
      l._imgErr=false; l._audErr=false;
      const low=(l.mediaSrc||'').toLowerCase();
      const refresh=()=>{ if(S.active===proj){ renderLayerBar(); renderFrame(); } };
      if(l.mediaKind==='audio'||l.type==='audio'){
        const a=document.createElement('audio');
        a.src=l.mediaSrc; a.preload='auto';
        a.addEventListener('loadedmetadata',refresh);
        a.addEventListener('error',()=>{ l._audErr=true; refresh(); });
        l._aud=a; l.type='audio';
        if(!l.wave) buildWaveform(l);
      } else if(l.mediaKind==='video'||l.type==='video'||low.includes('.mp4')||low.includes('.mov')||low.includes('.webm')){
        const v=document.createElement('video');
        v.src=l.mediaSrc; v.muted=true; v.loop=false; v.preload='auto'; v.playsInline=true;
        v.setAttribute('playsinline','');
        v.addEventListener('loadedmetadata',refresh);
        v.addEventListener('loadeddata',refresh);
        v.addEventListener('canplay',refresh);
        v.addEventListener('seeked',refresh);
        v.addEventListener('timeupdate',refresh);
        v.addEventListener('error',()=>{ l._imgErr=true; refresh(); });
        try{ v.load() }catch{}
        l._vid=v; l.type='video';
      } else {
        const img=new Image();
        img.decoding='async';
        img.onload=()=>{ l._ready=true; l._imgErr=false; refresh(); };
        img.onerror=()=>{ l._imgErr=true; refresh(); };
        img.src=l.mediaSrc;
        l._img=img; if(l.type!=='video') l.type='image';
      }
    } else if(l.type==='audio'&&l.mediaSrc&&!l.wave&&!l._audErr){
      buildWaveform(l);
    }
  });
}
const _audioCtx={ctx:null};
async function buildWaveform(l){
  try{
    if(l._waveBusy) return; l._waveBusy=true;
    const r=await fetch(l.mediaSrc);
    if(!r.ok){ l._waveBusy=false; return }
    const buf=await r.arrayBuffer();
    _audioCtx.ctx=_audioCtx.ctx||new (window.AudioContext||window.webkitAudioContext)();
    const ab=await _audioCtx.ctx.decodeAudioData(buf.slice(0));
    const ch=ab.getChannelData(0);
    const N=160, peaks=new Array(N).fill(0);
    const step=Math.max(1,Math.floor(ch.length/N));
    for(let i=0;i<N;i++){
      let m=0;
      for(let j=i*step;j<Math.min(ch.length,(i+1)*step);j+=7){ const v=Math.abs(ch[j]); if(v>m)m=v }
      peaks[i]=m;
    }
    l.wave=peaks; l._waveBusy=false;
  }catch{ l._waveBusy=false; }
}
async function ensureProjectPackage(p){
  if(!p?.pkgId||!p?.shareLink) return;
  const r=await fetch('/api/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link:p.shareLink})});
  if(!r.ok) throw new Error('package unavailable');
  const j=await r.json();
  if(j.error) throw new Error(j.error);
  S.pkgCache={id:j.packageId, link:p.shareLink, meta:j.meta, projects:j.projects, files:j.files};
}
async function openProject(id){
  const p=S.projects.find(x=>x.id===id); if(!p) return;
  if(!p.pkgId){
    const mediaPath=p.layers.find(l=>l.mediaSrc?.startsWith('/api/link/'))?.mediaSrc||'';
    const match=mediaPath.match(/^\/api\/link\/([^/]+)\//);
    if(match) p.pkgId=match[1];
  }
  try{ await ensureProjectPackage(p); }catch{}
  if(!p.projW){ p.projW=p.w; p.projH=p.h } // proyek lama (pra-patch): anggap w/h tersimpan = native
  S.active=p; S.T=0; S.playing=false; S.sel=null; S.sub=null; S.showAdd=false; S.undoStack=[]; S.redoStack=[];
  S.tl.pps=0; const _vp=$('#tlViewport'); if(_vp) _vp.scrollLeft=0; // zoom fit + scroll awal
  hydratePresetMedia(p);
  $('#viewHome').classList.remove('active'); $('#viewEditor').classList.add('active');
  $('#edName').value=p.name;
  sizePreview(); renderLayerBar(); renderBottom(); requestAnimationFrame(loop);
  warmGL(); // preload shader AM + render pertama via WebGL
  const add=$('#layerAdd'); if(add) add.hidden=false;
}
function backHome(){ saveProjects(S.projects); $('#viewEditor').classList.remove('active'); $('#viewHome').classList.add('active'); S.playing=false; renderProjects(); }
function sizePreview(){
  if(!S.active) return;
  const box=$('#previewBox'), cv=$('#preview'), outer=$('.preview-outer');
  if(!outer) return;
  // ukur container sebenarnya (di antara top bar dan transport) — bukan tebakan % window
  const availW=Math.max(60, outer.clientWidth-16);
  const availH=Math.max(60, outer.clientHeight-16);
  const scale=Math.min(availW/S.active.w, availH/S.active.h);
  if(cv.width!==S.active.w||cv.height!==S.active.h){ cv.width=S.active.w; cv.height=S.active.h }
  const cssW=Math.max(2,Math.floor(S.active.w*scale));
  const cssH=Math.max(2,Math.floor(S.active.h*scale));
  cv.style.width=cssW+'px'; cv.style.height=cssH+'px';
  box.style.width=cssW+'px'; box.style.height=cssH+'px';
  sizeRuler();
}
window.addEventListener('resize',()=>{ if($('#viewEditor').classList.contains('active')) sizePreview() });
// ukuran preview ikut berubah saat timeline/panel mengubah tinggi container
try{
  const _po=document.querySelector('.preview-outer');
  if(_po && window.ResizeObserver) new ResizeObserver(()=>{ if($('#viewEditor').classList.contains('active')) sizePreview() }).observe(_po);
}catch{}

/* ---------- transport + loop ---------- */
function bindEditor(){
  $('#edBack').onclick=backHome;
  $('#edName').oninput=e=>{ if(S.active){S.active.name=e.target.value; saveProjects(S.projects)} };
  $('#edSettings').onclick=()=>{ $('#sheetSettings').hidden=false; syncSettings() };
  $('#setClose').onclick=()=>$('#sheetSettings').hidden=true;
  $('#edExport').onclick=()=>{ $('#sheetExport').hidden=false; exportSheetDefaults() };
  $('#expClose').onclick=()=>$('#sheetExport').hidden=true;
  $('#tUndo').onclick=()=>{ const p=S.undoStack.pop(); if(!p)return; S.redoStack.push(JSON.stringify(S.active)); const o=JSON.parse(p); const keepId=S.active.id; Object.assign(S.active,o); S.active.id=keepId; hydratePresetMedia(S.active); afterChange() };
  $('#tRedo').onclick=()=>{ const p=S.redoStack.pop(); if(!p)return; S.undoStack.push(JSON.stringify(S.active)); Object.assign(S.active,JSON.parse(p)); hydratePresetMedia(S.active); afterChange() };
  $('#tPrev').onclick=()=>{ S.T=0; updateTime() };
  $('#tNext').onclick=()=>{ if(S.active)S.T=S.active.durationMs; updateTime() };
  $('#tPlay').onclick=togglePlay;
  $('#tDup').onclick=duplicateSel;
  $('#tFull').onclick=()=>{ const el=$('#phone'); if(document.fullscreenElement)document.exitFullscreen(); else el.requestFullscreen?.() };
  $('#expGo').onclick=doExport;
  $('#expServerGo').onclick=doExportViaServer;
  $('#expRes').onclick=()=>{ const l=$('#expResList'); l.hidden=!l.hidden };
  $$('#expResList button').forEach(b=>b.onclick=()=>{ $('#expRes').textContent=b.textContent; $('#expResList').hidden=true });
  $('#mediaPick').onchange=handleMediaPick;
  $('#drawPick').onchange=handleDrawPick;
  $('#layerAdd').onclick=()=>{ S.showAdd=true; renderBottom() };
  document.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea')) return;
    if(e.code==='Space'){ e.preventDefault(); togglePlay() }
    if(e.key==='ArrowLeft'){ S.T=Math.max(0,S.T-(e.shiftKey?500:1000/60)); updateTime() }
    if(e.key==='ArrowRight'){ S.T=Math.min(S.active?.durationMs||0,S.T+(e.shiftKey?500:1000/60)); updateTime() }
    if(e.key==='Escape'){ if(S.sel){S.sel=null;S.sub=null;S.showAdd=false;afterChange()} }
  });
  bindTimelineScrub();
  bindTimelineGestures();
  bindPreviewDrag();
  $('#expBack').onclick=()=>{ expHideAll(); $('#sheetExport').hidden=true }; // kembali ke timeline, proyek utuh
  $('#expCancel').onclick=()=>{ S.expCancel=true };
  $('#expTryRt').onclick=()=>{ const st=$('#expStatus'); expHideAll(); doExportRealtime(st) };
  $('#expSave').onclick=()=>{ const e=window.__amLastExport; if(e?.blob) downloadBlob(e.blob,(S.active?.name||'ekspor')+'.mp4') };
  $('#expFps').onclick=()=>{ const l=$('#expFpsList'); l.hidden=!l.hidden };
  $$('#expFpsList button').forEach(b=>b.onclick=()=>{ $('#expFps').textContent=b.textContent; $('#expFpsList').hidden=true; syncExportSub() });
  $$('#expResList button').forEach(b2=>b2.onclick=()=>{ $('#expRes').textContent=b2.textContent; $('#expResList').hidden=true; syncExportSub() });
  $('#expQuality').onclick=()=>{ const l=$('#expQualityList'); l.hidden=!l.hidden };
  $$('#expQualityList button').forEach(b3=>b3.onclick=()=>{ $('#expQuality').textContent=b3.textContent; $('#expQualityList').hidden=true; syncExportSub() });
}
function exportSheetDefaults(){
  // FPS proyek ditampilkan eksplisit, tidak diubah diam-diam
  if(!S.active) return;
  const pfps=Math.round(S.active.fps||60);
  const fpsBtns=[...document.querySelectorAll('#expFpsList button')];
  fpsBtns.forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===pfps));
  const cand=fpsBtns.find(b=>parseInt(b.textContent)===pfps);
  $('#expFps').textContent=cand?cand.textContent:(pfps+' fps (Proyek)');
  const short=Math.min(S.active.projW||S.active.w,S.active.projH||S.active.h);
  const resBtns=[...document.querySelectorAll('#expResList button')];
  resBtns.forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===short));
  const rc=resBtns.find(b=>parseInt(b.textContent)===short);
  if(rc) $('#expRes').textContent=rc.textContent;
  syncExportSub();
  // Status kapabilitas server-render (async, best-effort).
  try{
    const hint=$('#expServerHint'), btn=$('#expServerGo');
    if(hint) hint.textContent='Memeriksa server render...';
    fetch('/api/render-capable').then(r=>r.json()).then(j=>{
      if(!j.serverRender){
        if(hint) hint.textContent='Server render belum siap (butuh Playwright+Chromium+ffmpeg di server).';
        if(btn) btn.style.opacity='0.5';
      } else {
        if(hint) hint.textContent='Server render siap: Full Render 60fps dikerjakan server.';
        if(btn) btn.style.opacity='';
      }
    }).catch(()=>{ if(hint) hint.textContent='' });
  }catch{}
}
function exportSelQuality(){
  return qualityKeyOf($('#expQuality')?.textContent||'');
}
function syncExportSub(){
  if(!S.active) return;
  const res=$('#expRes')?.textContent||'';
  const fps=($('#expFps')?.textContent||'').replace(' (Proyek)','');
  const sub=$('#expVideoSub'); if(sub) sub.textContent='MP4 '+res+' '+fps;
  // Estimasi ukuran nyata (dulu statis "19.8MB"): bitrate video+kualitas × durasi.
  try{
    const dims=exportDims();
    const hasAudio=S.active.layers.some(l=>l.mediaSrc&&(l.type==='audio'||l.type==='video'||l.mediaKind==='audio'||l.mediaKind==='video'));
    const el=$('#expSize');
    if(el) el.textContent=fmtSize(estimateBytes(videoBitrate(dims.w,dims.h,exportSelQuality()),S.active.durationMs,hasAudio));
  }catch{}
}
function togglePlay(){
  if(!S.active) return;
  if(!S.playing && S.T>=S.active.durationMs-1) S.T=0; // play lagi dari awal kalau sudah di akhir
  S.playing=!S.playing;
  setPlayIcon(S.playing);
  if(S.playing){ S.lastTs=0; syncAudio(); }
}
function afterChange(){
  sizePreview(); renderLayerBar(); renderBottom(); updateTime();
  const add=$('#layerAdd'); if(add) add.hidden=!!(S.sel||S.showAdd);
}
function duplicateSel(){
  if(!S.active||!S.sel) return toast('Pilih layer dulu');
  pushUndo(); const src=S.active.layers.find(l=>l.id===S.sel); if(!src)return;
  const c=JSON.parse(JSON.stringify(stripLayer(src))); c.id=uid(); c.name=src.name+' copy'; c.x+=40; c.y+=40;
  S.active.layers.push(c); afterChange();
}

/* main loop */
let offMain=document.createElement('canvas'), offLayer=document.createElement('canvas'), offComp=document.createElement('canvas');
function setPlayIcon(playing){
  $('#playTri').setAttribute('d', playing?'M9 8h2.5v8H9zM13.5 8H16v8h-2.5z':'M10 8.5l6 3.5-6 3.5z');
}
function loop(ts){
  if(!$('#viewEditor').classList.contains('active')) return;
  if(S.exporting){
    // saat ekspor: tick ekspor yang menggerakkan waktu; preview tidak dirender ulang tiap frame
    syncAudio();
    requestAnimationFrame(loop);
    return;
  }
  if(S.playing){
    if(!S.lastTs)S.lastTs=ts;
    const dt=ts-S.lastTs; S.lastTs=ts;
    // playback speed = preview saja (zoom timeline TIDAK mengubah kecepatan);
    // T tetap maju mengikuti waktu nyata × rate yang dipilih user
    S.T+=dt*(S.playRate||1);
    if(S.T>=S.active.durationMs){
      // FIX: berhenti di akhir (dulu loop selamanya -> ekspor ikut kepanjangan)
      S.T=S.active.durationMs;
      S.playing=false; setPlayIcon(false);
    }
    updateTime();
  } else S.lastTs=ts;
  if(!window.__amRenderPaused) renderFrame(); // pause utk capture deterministik
  updateSelectBox();
  syncAudio();
  requestAnimationFrame(loop);
}
function updateTime(){
  if(!S.active)return;
  $('#timecode').textContent=fmtTC(S.T,S.active.fps||60);
  positionPlayhead();            // murah: transform saja, tanpa re-render timeline
  if(S.playing) autoScrollTimeline();
  updateSelectBox();
}
function evalProp(layer, key, T){
  const arr=(layer.kf&&layer.kf[key])||[];
  const base=layer[key];
  if(!arr.length) return base;
  const sorted=[...arr].sort((a,b)=>a.t-b.t);
  if(T<=sorted[0].t) return sorted[0].v;
  if(T>=sorted[sorted.length-1].t) return sorted[sorted.length-1].v;
  let i=0; while(i<sorted.length-1 && T>sorted[i+1].t) i++;
  const a=sorted[i], b=sorted[i+1];
  const p=(T-a.t)/Math.max(1,(b.t-a.t));
  // KALIBRASI zervida: ease milik kf KANAN (segmen masuk kf tsb)
  const e=easeOf(b.ease||'linear', p);
  return lerp(a.v,b.v,e);
}
function easeOf(type, t){
  // cubicBezier AM asli: "cubicbezier x1 y1 x2 y2" (+ prefiks "reverse")
  if(typeof type==='string'){
    // AM "random x1 y1 x2 y2 ..." -> bezier dgn kontrol tsb (chaos diabaikan;
    // terkalibrasi zervida: random 0.5x4 0.0 = LINEAR)
    const rm=type.match(/^(?:reverse )?random (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/);
    if(rm){ return easeOf('cubicbezier '+rm.slice(1).join(' '), t) }
    const m=type.match(/^(reverse )?cubicbezier (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/);
    if(m){
      const x1=+m[2],y1=+m[3],x2=+m[4],y2=+m[5];
      // cari s sehingga kurva-x(s) = t (biseksi)
      let lo=0,hi=1,s=t;
      for(let i=0;i<24;i++){
        s=(lo+hi)/2;
        const xs=(3*(1-s)*(1-s)*s*x1)+(3*(1-s)*s*s*x2)+(s*s*s);
        if(xs<t) lo=s; else hi=s;
      }
      let e=(3*(1-s)*(1-s)*s*y1)+(3*(1-s)*s*s*y2)+(s*s*s);
      if(m[1]) e=1-easeOf(type.slice(8), 1-t); // reverse = cermin kurva
      return Math.max(0,Math.min(1,e));
    }
    if(type.startsWith('reverse ')) return 1-easeOf(type.slice(8), 1-t);
  }
  switch(type){
    case 'cubic': return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    case 'bounce': { const n=4; return Math.abs(Math.sin(t*Math.PI*n))*(1-t*0.4)+t*0.2 }
    case 'cyclic': return (Math.sin(t*Math.PI*4)+1)/2;
    case 'steps': return Math.floor(t*4)/4;
    case 'elastic': return t===0?0:t===1?1:Math.pow(2,-10*t)*Math.sin((t*10-0.75)*(2*Math.PI/3))+1;
    case 'random': return (Math.sin(t*39.7)*43758.5)%1*0.5+0.5;
    case 'hold': return 0;
    default: return t;
  }
}

/* ---------- render engine ---------- */
function renderAt(time, targetCanvas){
  // Path utama: engine WebGL shader asli AM (amgl.js).
  // Throttle token: satu render GL berjalan; frame berikutnya masuk
  // antrian (pending) dan dijalankan saat selesai — preview tetap
  // responsif meski frame berat (fallback otomatis ke Canvas2D).
  const P=S.active;
  if(!P||!targetCanvas) return;
  if(GL.useGL && !GL.fail){
    if(GL.busy){ GL.pending=[time,targetCanvas]; return }
    GL.busy=true;
    AMGL.renderFrameGL(P, time, rasterContent, evalFxParam).then(cv=>{
      GL.busy=false; GL.done++;
      if(cv){ blitGL(cv, targetCanvas, P, time) }
      else{ GL.fail=true; render2D(time, targetCanvas) }
      flushGLPending();
    }).catch(()=>{ GL.busy=false; GL.fail=true; render2D(time, targetCanvas); flushGLPending() });
    // catat selesai
    return;
  }
  render2D(time, targetCanvas);
}
const GL={ useGL:true, fail:false, busy:false, pending:null, done:0 };
window.__gl = GL; // debug: status engine GL (useGL/fail/busy/pending)
window.__amgldbg = AMGL.dbg;
function flushGLPending(){
  if(GL.pending && !GL.busy){
    const [t,c]=GL.pending; GL.pending=null;
    if(GL.useGL && !GL.fail) renderAt(t,c); else render2D(t,c);
  }
}
function blitGL(cv, targetCanvas, P, T){
  const ctx=targetCanvas.getContext('2d');
  if(targetCanvas.width!==P.w||targetCanvas.height!==P.h){ targetCanvas.width=P.w; targetCanvas.height=P.h }
  ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  ctx.clearRect(0,0,P.w,P.h);
  ctx.fillStyle=P.bg||'#000'; ctx.fillRect(0,0,P.w,P.h);
  const cam=S.active?activeCameraAt(T??S.T):null;
  if(cam){
    // koordinat kamera dalam piksel proyek -> skala ke piksel comp
    const sc=P.w/((P.projW||P.w)||1);
    ctx.save(); applyCameraTransform(ctx,P.w,P.h,cam,T??S.T,sc); ctx.drawImage(cv,0,0); ctx.restore();
  } else ctx.drawImage(cv,0,0);
}
async function renderAtAsync(time, targetCanvas){
  // versi await (PNG export): pastikan frame GL SELESAI sebelum capture
  const P=S.active;
  if(!P||!targetCanvas) return;
  if(GL.useGL && !GL.fail){
    try{
      const cv=await AMGL.renderFrameGL(P, time, rasterContent, evalFxParam);
      if(cv){ blitGL(cv, targetCanvas, P, time); return }
      GL.fail=true;
    }catch{ GL.fail=true }
  }
  render2D(time, targetCanvas);
}
async function warmGL(){
  // preload semua def efek proyek + kompilasi program + render pertama
  if(!S.active) return;
  try{
    await AMGL.preloadFx(S.active);
    const cv=await AMGL.renderFrameGL(S.active, S.T, rasterContent, evalFxParam);
    if(!cv) GL.fail=true;
  }catch(e){ console.warn('[gl] warm:', e.message) }
  renderFrame();
}

/* rasterContent — konten layer pada transform final, canvas comp-size.
   Dipakai amgl.js sebagai tekstur inputImg + sumber metrik kotak layer. */
const _rastCv=document.createElement('canvas');
function rasterContent(l, T, tf, metricsOnly){
  const P=S.active; if(!P) return null;
  if(T<l.startMs||T>l.endMs) return null;
  const x=evalProp(l,'x',T)+(tf?.dx||0), y=evalProp(l,'y',T)+(tf?.dy||0);
  const sx=evalProp(l,'sx',T), sy=evalProp(l,'sy',T);
  const rot=evalProp(l,'rot',T)+(tf?.drot||0);
  const op=evalProp(l,'opacity',T);
  const skx=evalProp(l,'skewX',T)||0, sky=evalProp(l,'skewY',T)||0;
  // skala comp vs ruang proyek asli (XML scene): render resolusi beda
  // (mis. export 360p) harus identik dgn 1080p yang di-downscale —
  // posisi/ukuran kotak layer ada di pixel proyek, comp bisa lebih kecil.
  const sc=P.w/(P.projW||P.w);
  const fw=sx/2*(tf?.sx??1)*sc, fh=sy/2*(tf?.sy??1)*sc;
  const out={ cv:null, cx:x*sc, cy:y*sc, rot, fw, fh,
    opacity:clamp(op??100,0,100), blend:l.blend||'normal' };
  if(metricsOnly) return out;
  const Wc=P.w, Hc=P.h;
  if(_rastCv.width!==Wc||_rastCv.height!==Hc){ _rastCv.width=Wc; _rastCv.height=Hc }
  const c=_rastCv.getContext('2d');
  c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,Wc,Hc);
  c.save();
  c.translate(x*sc,y*sc);
  c.rotate(rot*Math.PI/180);
  c.transform(1,Math.tan(sky*Math.PI/180),Math.tan(skx*Math.PI/180),1,0,0);
  c.scale(fw/100,fh/100);
  c.globalAlpha=clamp(l.fillAlpha??100,0,100)/100;
  if(l.shadow?.on){ c.shadowColor=l.shadow.color||'#000'; c.shadowBlur=(l.shadow.blur||12)*sc; c.shadowOffsetX=(l.shadow.dx||0)*sc; c.shadowOffsetY=(l.shadow.dy||0)*sc }
  if(l.type==='text'&&l.text){ drawText(c,l,T) }
  else if((l.type==='image'||l.type==='video')&&l.mediaSrc){ drawMedia(c,l,T) }
  else if(l.type==='drawing'&&l.draw){ drawDrawing(c,l,T) }
  else { drawShape(c,l) }
  if(l.border?.on){ c.shadowColor='transparent'; c.shadowBlur=0; c.lineWidth=l.border.width||4; c.strokeStyle=l.border.color||'#fff'; strokeShape(c,l) }
  c.restore();
  out.cv=_rastCv;
  return out;
}

/* ---------- kamera (behavioral equivalent AM camera object) ----------
   Layer type==='camera' yang visible & aktif pada T memfilmkan SELURUH
   komposisi: inverse-transform (posisi, zoom dari sx/sy dgn 200==1x,
   rotasi) dipakai BERSAMA oleh preview dan export (deterministik).
   Diterapkan post-transform di blitGL (jalur GPU) dan inline di render2D
   (jalur CPU) dgn matematika yang sama. Layer kamera tidak digambar. */
function activeCameraAt(T){
  const P=S.active; if(!P) return null;
  for(let i=P.layers.length-1;i>=0;i--){
    const l=P.layers[i];
    if(l.type==='camera'&&l.visible!==false&&T>=l.startMs&&T<=l.endMs) return l;
  }
  return null;
}
function applyCameraTransform(ctx,w,h,cam,T,spaceScale){
  const cx=evalProp(cam,'x',T)*spaceScale, cy=evalProp(cam,'y',T)*spaceScale;
  const z=cameraZoomOf(evalProp(cam,'sx',T),evalProp(cam,'sy',T));
  const rot=evalProp(cam,'rot',T)||0;
  ctx.translate(w/2,h/2); ctx.scale(z,z); ctx.rotate(-rot*Math.PI/180); ctx.translate(-cx,-cy);
}

function render2D(time, targetCanvas){
  const P=S.active;
  if(!P||!targetCanvas) return;
  const ctx=targetCanvas.getContext('2d');
  const w=P.w,h=P.h;
  if(targetCanvas.width!==w||targetCanvas.height!==h){ targetCanvas.width=w; targetCanvas.height=h }
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle=P.bg||'#000'; ctx.fillRect(0,0,w,h);
  const cam=activeCameraAt(time);
  if(cam){ ctx.save(); applyCameraTransform(ctx,w,h,cam,time,1); }
  for(let i=0;i<P.layers.length;i++){
    const l=P.layers[i];
    if(!l.visible) continue;
    if(time<l.startMs||time>l.endMs) continue;
    if(l.type==='audio'||l.type==='camera') continue;
    // Layer copy-background (lift fill=0) & adjustment (displacemap3 tanpa map):
    // isi = SALINAN composite di bawah + efek piksel (ground-truth player AM)
    if(l.copyBg||l.adjFx){ drawCompositeFxLayer(ctx,l,time); continue }
    drawLayer(ctx,l,time);
  }
  if(cam) ctx.restore();
}
function renderFrame(){ renderAt(S.T,$('#preview')) }
function drawCompositeFxLayer(ctx, l, time){
  const w=ctx.canvas.width, h=ctx.canvas.height;
  if(offComp.width!==w||offComp.height!==h){ offComp.width=w; offComp.height=h }
  const oc=offComp.getContext('2d');
  oc.setTransform(1,0,0,1,0,0);
  oc.clearRect(0,0,w,h);
  oc.drawImage(ctx.canvas,0,0);
  let src=offComp;
  try{
    if(l.fx&&l.fx.length) src=applyFxStack(offComp, l.fx, time, evalFxParam, l);
  }catch{}
  let op=clamp(evalProp(l,'opacity',time),0,100)/100;
  // Kanal alpha efek transform (fade/pulse-opacity) berlaku juga di sini.
  try{ const tr=applyTransformFx(l.fx||[],time,evalFxParam,S.active.durationMs,l); op*=(tr.alpha==null?1:tr.alpha) }catch{}
  if(op<=0) return;
  ctx.save();
  ctx.globalAlpha=op;
  ctx.globalCompositeOperation=blendMap(l.blend||'normal');
  ctx.drawImage(src,0,0);
  ctx.restore();
}
function drawLayer(ctx, l, time=S.T){
  const T=time;
  let x=evalProp(l,'x',T), y=evalProp(l,'y',T);
  const sx=evalProp(l,'sx',T), sy=evalProp(l,'sy',T);
  let rot=evalProp(l,'rot',T);
  const op=evalProp(l,'opacity',T);
  const skx=evalProp(l,'skewX',T)||0, sky=evalProp(l,'skewY',T)||0;
  let alpha=clamp(op,0,100)/100 * clamp(l.fillAlpha??100,0,100)/100;
  let dx=0, dy=0, drot=0, tsx=1, tsy=1;
  try{
    if(l.fx&&l.fx.length){
      const tr=applyTransformFx(l.fx,T,evalFxParam,S.active.durationMs,l);
      dx=tr.dx||0; dy=tr.dy||0; drot=tr.drot||0;
      tsx=tr.sx||1; tsy=tr.sy||1; alpha*= (tr.alpha==null?1:tr.alpha);
    }
  }catch{}
  try{
    if(l.fx) for(const f of l.fx){
      if(f.on!==false&&(f.id==='blink2')){
        // AM: alpha 0 saat fraksi (freq*t) > 0.5 (dulu sin<0, salah fase).
        const fr=evalFxParam(f,'freq',T)??2;
        if(((T/1000*fr)%1+1)%1>0.5) alpha=0;
      }
    }
  }catch{}
  const blend=l.blend||'normal';
  // offscreen 100x100 unit (kode gambar memakai koordinat -50..50)
  const W=offLayer;
  if(W.width!==100){ W.width=100; W.height=100 }
  const wctx=W.getContext('2d');
  wctx.setTransform(1,0,0,1,0,0);
  wctx.clearRect(0,0,100,100);
  wctx.save();
  wctx.translate(50,50); // kode gambar (drawShape/drawMedia) memakai koordinat -50..50
  // HANYA alpha fill warna di sini. Opacity layer dipakai saat draw final
  // (fx seperti tile mengisi latar opaque -> alpha 0.6 akan hilang bila di-bake duluan)
  wctx.globalAlpha=clamp(l.fillAlpha??100,0,100)/100;
  if(l.shadow?.on){ wctx.shadowColor=l.shadow.color||'#000'; wctx.shadowBlur=l.shadow.blur||12; wctx.shadowOffsetX=l.shadow.dx||0; wctx.shadowOffsetY=l.shadow.dy||0 }
  if(l.type==='text'&&l.text){ drawText(wctx,l,T) }
  else if((l.type==='image'||l.type==='video')&&l.mediaSrc){ drawMedia(wctx,l,T) }
  else if(l.type==='drawing'&&l.draw){ drawDrawing(wctx,l,T) }
  else { drawShape(wctx,l) }
  if(l.border?.on){ wctx.shadowColor='transparent'; wctx.shadowBlur=0; wctx.lineWidth=l.border.width||4; wctx.strokeStyle=l.border.color||'#fff'; strokeShape(wctx,l) }
  wctx.restore();
  let src=W;
  if(l.fx?.length){
    try{
      for(const f of l.fx){
        if(f.on!==false&&/^motionblur/.test(f.id)) f._vel=layerVel(l,T);
      }
    }catch{}
    src=applyFxStack(W, l.fx, T, evalFxParam, l);
  }
  ctx.save();
  ctx.globalAlpha=alpha; // opacity layer + gerbang blink2
  ctx.globalCompositeOperation=blendMap(blend);
  ctx.translate(x+dx,y+dy);
  ctx.rotate((rot+drot)*Math.PI/180);
  ctx.transform(1,Math.tan(sky*Math.PI/180),Math.tan(skx*Math.PI/180),1,0,0);
  ctx.scale(sx/200*tsx,sy/200*tsy);
  ctx.drawImage(src,-50,-50,100,100);
  ctx.restore();
}
function blendMap(b){
  return {
    normal:'source-over',
    multiply:'multiply', darken:'darken', 'darker-color':'darken', 'color-burn':'color-burn', 'burn-linear':'color-burn',
    screen:'screen', 'color-dodge':'color-dodge', 'dodge-linear':'lighter', add:'lighter', lighten:'lighten', 'lighter-color':'lighten',
    overlay:'overlay', 'soft-light':'soft-light', 'hard-light':'hard-light', 'vivid-light':'hard-light', 'pin-light':'hard-light',
    difference:'difference', exclusion:'exclusion', subtract:'difference', divide:'difference',
    hue:'hue', saturation:'saturation', color:'color', luminosity:'luminosity'
  }[b]||'source-over'
}
const BLEND_GROUPS=[
  ['Normal',[['normal','Normal']]],
  ['Gelapkan',[['multiply','Multiply'],['darken','Darken'],['darker-color','Darker Color'],['color-burn','Color Burn'],['burn-linear','Burn Linear']]],
  ['Cerahkan',[['screen','Screen'],['color-dodge','Color Dodge'],['dodge-linear','Dodge Linear'],['lighten','Lighten'],['lighter-color','Lighter Color']]],
  ['Kontras',[['overlay','Overlay'],['soft-light','Soft Light'],['hard-light','Hard Light'],['vivid-light','Vivid Light'],['pin-light','Pin Light']]],
  ['Perbedaan',[['difference','Difference'],['exclusion','Exclusion'],['subtract','Subtract'],['divide','Divide']]],
  ['Warna',[['hue','Hue'],['saturation','Saturation'],['color','Color'],['luminosity','Luminosity']]],
];
function layerVel(l,T){
  const h=33, t0=Math.max(0,T-h), t1=T+h, dt=Math.max(1,t1-t0)/1000;
  let x0=evalProp(l,'x',t0), y0=evalProp(l,'y',t0);
  let x1=evalProp(l,'x',t1), y1=evalProp(l,'y',t1);
  try{
    const a=applyTransformFx(l.fx||[],t0,evalFxParam,S.active.durationMs,l);
    const b=applyTransformFx(l.fx||[],t1,evalFxParam,S.active.durationMs,l);
    x0+=a.dx||0; y0+=a.dy||0; x1+=b.dx||0; y1+=b.dy||0;
  }catch{}
  return {vx:(x1-x0)/dt, vy:(y1-y0)/dt};
}
function evalFxParam(fx, key, T){
  const arr=(fx.kf&&fx.kf[key])||[];
  const raw=fx.params[key];
  const base=(raw===undefined||raw===null)?(fxDefault(fx.id,key)??0):raw;
  if(!arr.length) return base;
  const s=[...arr].sort((a,b)=>a.t-b.t);
  if(T<=s[0].t)return s[0].v; if(T>=s[s.length-1].t)return s[s.length-1].v;
  let i=0; while(i<s.length-1&&T>s[i+1].t)i++;
  const a=s[i],b=s[i+1]; const p=(T-a.t)/Math.max(1,b.t-a.t);
  return lerp(a.v,b.v,easeOf(b.ease||'linear',p)); // ease = kf kanan (kalibrasi zervida)
}
function hexA(hex,pc){
  const a=Math.max(0,Math.min(100,pc??100))/100;
  const h=(hex||'#000').replace('#','');
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return `rgba(${r||0},${g||0},${b||0},${a})`;
}
function drawShape(c,l){
  if(l.grad){
    // KALIBRASI g540: gradien AM = EUCLIDEAN dlm ruang piksel nominal
    // `size` (bukan per-axis ternormalisasi). Arah di ruang unit +/-50
    // harus dibobot size^2 per komponen; titik awal tetap fraksi kotak.
    const g=l.grad;
    const nw=Math.max(1,Math.abs(l.sizeRaw? l.sizeRaw[0] : 100));
    const nh=Math.max(1,Math.abs(l.sizeRaw? l.sizeRaw[1] : 100));
    const gx=v=>v*100-50, gy=v=>v*100-50;
    // d = vektor gradien dlm piksel nominal; M = peta p->unit (diag(100/size)).
    // Canvas2D: t = dot(u-g1, Dg)/|Dg|^2. Agar = dot(p-p1, d)/|d|^2
    // (Euclidean, kalibrasi g540) -> Dg = k*(M^-1 d), k = |d|^2/|M^-1 d|^2.
    const dpx=[(g.x2-g.x1)*nw, (g.y2-g.y1)*nh];
    const minvd=[dpx[0]*nw/100, dpx[1]*nh/100];
    const kk=(dpx[0]*dpx[0]+dpx[1]*dpx[1])/Math.max(1e-9, minvd[0]*minvd[0]+minvd[1]*minvd[1]);
    const dgx=minvd[0]*kk, dgy=minvd[1]*kk;
    if(g.type==='radial'){
      const r0=0, r1=Math.hypot(dgx,dgy)||70;
      const rg=c.createRadialGradient(gx(g.x1),gy(g.y1),r0,gx(g.x1),gy(g.y1),Math.max(1,r1));
      rg.addColorStop(0,hexA(g.c1,g.a1??100)); rg.addColorStop(1,hexA(g.c2,g.a2??100));
      c.fillStyle=rg;
    } else {
      const lg=c.createLinearGradient(gx(g.x1),gy(g.y1),gx(g.x1)+dgx,gy(g.y1)+dgy);
      lg.addColorStop(0,hexA(g.c1,g.a1??100)); lg.addColorStop(1,hexA(g.c2,g.a2??100));
      c.fillStyle=lg;
    }
  } else c.fillStyle=l.color||'#E14E7A';
  const s=100, r=l.corner??24;
  c.beginPath();
  let fr='nonzero';
  const polyPath=(n,ro,rot0=-Math.PI/2)=>{ for(let i=0;i<n;i++){ const a=rot0+i*Math.PI*2/n, px=Math.cos(a)*ro, py=Math.sin(a)*ro; i?c.lineTo(px,py):c.moveTo(px,py) } c.closePath() };
  switch(l.shapeKind){
    case 'circle': c.arc(0,0,50,0,Math.PI*2); break;
    case 'tri': case 'triangle': c.moveTo(0,-55); c.lineTo(50,40); c.lineTo(-50,40); c.closePath(); break;
    case 'star': starPath(c,0,0,5,50,22); break;
    case 'plus': plusPath(c,50); break;
    case 'donut': c.arc(0,0,50,0,Math.PI*2); c.arc(0,0,28,0,Math.PI*2,true); fr='evenodd'; break;
    case 'moon': c.arc(0,0,50,0,Math.PI*2); c.arc(22,-12,42,0,Math.PI*2,true); fr='evenodd'; break;
    case 'pie': c.moveTo(0,0); c.arc(0,0,50,-Math.PI/2,-Math.PI/2+Math.PI*1.5); c.closePath(); break;
    case 'teardrop': c.moveTo(0,-52); c.bezierCurveTo(34,-10,50,8,50,22); c.arc(0,22,50,0,Math.PI); c.bezierCurveTo(-50,8,-34,-10,0,-52); c.closePath(); break;
    case 'quad': c.moveTo(0,-50); c.lineTo(50,0); c.lineTo(0,50); c.lineTo(-50,0); c.closePath(); break;
    case 'penta': polyPath(5,50); break;
    case 'poly': polyPath(6,50); break;
    case 'multifoil': for(const [px,py] of [[0,-24],[23,8],[-23,8],[0,0]]){ c.moveTo(px+30,py); c.arc(px,py,30,0,Math.PI*2) } break;
    case 'calloutrr': roundRect(c,-50,-42,100,84,18); c.moveTo(-14,42); c.lineTo(-30,58); c.lineTo(6,42); c.closePath(); break;
    case 'stamp': c.arc(0,0,50,0,Math.PI*2); c.arc(0,0,36,0,Math.PI*2,true); fr='evenodd'; break;
    case 'arrow': c.moveTo(-40,-18);c.lineTo(10,-18);c.lineTo(10,-32);c.lineTo(45,0);c.lineTo(10,32);c.lineTo(10,18);c.lineTo(-40,18);c.closePath(); break;
    case 'line': c.rect(-50,-6,100,12); break;
    case 'wideline': c.rect(-50,-15,100,30); break;
    case 'arc': c.lineWidth=20; c.strokeStyle=c.fillStyle; c.beginPath(); c.arc(0,0,38,Math.PI*0.15,Math.PI*1.35); c.stroke(); return;
    default:
      if(l.shapeKind==='rect') c.rect(-50,-50,100,100);
      else roundRect(c,-50,-50,100,100,r);
  }
  c.fill(fr);
}
function strokeShape(c,l){
  c.beginPath();
  if(l.shapeKind==='circle')c.arc(0,0,50,0,Math.PI*2);
  else if(l.shapeKind==='rect')c.rect(-50,-50,100,100);
  else roundRect(c,-50,-50,100,100,l.corner??24);
  c.stroke();
}
function roundRect(c,x,y,w,h,r){ c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath() }
function starPath(c,x,y,n,ro,ri){ for(let i=0;i<n*2;i++){const r=i%2?ri:ro;const a=i*Math.PI/n-Math.PI/2;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?c.lineTo(px,py):c.moveTo(px,py)}c.closePath() }
function plusPath(c,s){ const t=s*0.32; c.moveTo(-t,-s);c.lineTo(t,-s);c.lineTo(t,-t);c.lineTo(s,-t);c.lineTo(s,t);c.lineTo(t,t);c.lineTo(t,s);c.lineTo(-t,s);c.lineTo(-t,t);c.lineTo(-s,t);c.lineTo(-s,-t);c.lineTo(-t,-t);c.closePath() }
// Evaluasi satu param fx skalar dgn keyframe (mirip evalFxParam, tanpa katalog).
function fxScalar(f,key,T,def){
  try{
    const kf=(f.kf&&f.kf[key])||[];
    if(kf.length){
      const s=[...kf].sort((a,b)=>a.t-b.t);
      if(T<=s[0].t) return s[0].v;
      if(T>=s[s.length-1].t) return s[s.length-1].v;
      let i=0; while(i<s.length-1&&T>s[i+1].t)i++;
      const a=s[i],b=s[i+1],p=(T-a.t)/Math.max(1,b.t-a.t);
      return lerp(a.v,b.v,easeOf(b.ease||'linear',p));
    }
    if(f.params&&f.params[key]!==undefined&&f.params[key]!==null) return f.params[key];
  }catch{}
  return def;
}
// Muat font Google Fonts sesuai attr AM (best-effort; offline -> fallback).
const _fontAsked=new Set();
function ensureWebFont(fontAttr){
  try{
    const key=String(fontAttr||'');
    if(!key||_fontAsked.has(key)||!document.fonts) return;
    _fontAsked.add(key);
    const m=key.match(/name=([^&]+).*?weight=(\d+)/);
    if(!m) return;
    const fam=decodeURIComponent(m[1].replace(/\+/g,' ')), wt=m[2];
    const url='https://fonts.googleapis.com/css2?family='+encodeURIComponent(fam)+':wght@'+wt+'&display=swap';
    const ff=document.createElement('link'); ff.rel='stylesheet'; ff.href=url;
    ff.onload=()=>{ try{ document.fonts.load(wt+' 32px "'+fam+'"').then(()=>{ if(S.active) renderFrame() }).catch(()=>{}) }catch{} };
    document.head.appendChild(ff);
  }catch{}
}
function drawText(c,l,T){
  const t=l.text||{};
  ensureWebFont(t.font);
  const fxs=(l.fx||[]).filter(f=>f.on!==false);
  const ff=(id)=>fxs.find(f=>f.id===id);
  let txt=String(t.content??'Teks');
  // --- efek teks behavioral ( spesifikasi script asli AM ) ---
  const tp=ff('textprogress');
  if(tp){
    const st=fxScalar(tp,'start',T,0)??0, en=fxScalar(tp,'end',T,1)??1;
    const cur=fxScalar(tp,'cursor',T,0)??0;
    const cc=['','_','█','▌','▁','▏','▕','▯','▎'][Math.max(0,Math.min(8,Math.round(cur)))]||'';
    let blink='';
    if(fxScalar(tp,'blink',T,0)){
      const dur=Math.max(1,((l.endMs??T+1)-(l.startMs??T)));
      if(((T/1000)*dur*2)%2>1) blink='';
      else blink=cc;
      txt=txt.slice(Math.round(txt.length*st),Math.round(txt.length*en))+blink;
    } else txt=txt.slice(Math.round(txt.length*st),Math.round(txt.length*en))+cc;
  }
  const cnt=ff('counter');
  if(cnt&&/[-+0-9]/.test(txt)){
    const sc=fxScalar(cnt,'scale',T,1)??1, off=fxScalar(cnt,'offset',T,0)??0;
    txt=txt.split(/([-+]?[0-9,]*\.[0-9,]*|[-+]?[0-9,]+)/g).map(seg=>{
      if(!seg||!/^[-+]?[0-9,]*\.?[0-9,]+$/.test(seg)) return seg;
      const hasComma=seg.includes(',');
      const fx=parseFloat(seg.replace(/,/g,''));
      if(!Number.isFinite(fx)) return seg;
      const adj=fx*sc+off;
      const dp=(seg.split('.')[1]||'').replace(/,/g,'').length;
      let out=adj.toFixed(dp);
      if(hasComma) out=out.replace(/\B(?=(\d{3})+(?!\d))/g,',');
      return out;
    }).join('');
  }
  const tr=ff('textrand');
  if(tr){
    const amt=fxScalar(tr,'amount',T,0)??0;
    if(amt>0.001){
      const st=fxScalar(tr,'start',T,0)??0, en=fxScalar(tr,'end',T,1)??1;
      const cs=fxScalar(tr,'charset',T,0)??0, evo=fxScalar(tr,'evo',T,0)??0;
      const seed=fxScalar(tr,'seed',T,0)??0;
      const sets=['ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','0123456789'];
      const chars=sets[Math.max(0,Math.min(3,Math.round(cs)))]||sets[0];
      const i0=Math.round(txt.length*st), i1=Math.round(txt.length*en);
      const h=(n)=>{ const x=Math.sin(n*7.3921+seed*13.7+evo*2.9)*43758.5453; return x-Math.floor(x) };
      txt=txt.split('').map((ch,i)=>{
        if(i<i0||i>=i1||ch===' ') return ch;
        return (h(i)+1)/2>=amt?ch:chars[Math.floor(h(i+99)*chars.length)%chars.length];
      }).join('');
    }
  }
  // --- layout: wrap + align + spacing (unit lokal: 1 AM px = 2 unit) ---
  const fam=fontStackFor(t.font||'');
  const fsPx=Math.max(4,(t.size||48)*2);
  const weight=(fam.weight>=600||/bold/i.test(String(t.font||'')))?'700':'400';
  c.fillStyle=t.color||'#fff';
  c.font=weight+' '+fsPx+'px '+fam.stack;
  c.textBaseline='middle';
  const align=String(t.align||'center').toLowerCase();
  c.textAlign=align==='left'?'left':align==='right'?'right':'center';
  const wrapU=Math.max(0,(t.wrapWidth||0)*2);
  const tsp=ff('text-spacing');
  const lsEm=tsp?(fxScalar(tsp,'letterspacing',T,0)??0):0;
  const lhMul=tsp?(fxScalar(tsp,'linespacing',T,1)??1):1;
  // bungkus manual (measureText) agar wrapWidth AM dihormati
  const words=txt.split(/(\s+)/);
  const lines=[]; let cur='';
  const meas=(s)=>{ try{ return c.measureText(s).width }catch{ return s.length*fsPx*0.6 } };
  for(const wd of words){
    const trial=cur+wd;
    if(wrapU>0&&cur&&meas(trial)+(trial.length*lsEm*fsPx)>wrapU&&cur.trim()){
      lines.push(cur); cur=wd.trimStart();
    } else cur=trial;
  }
  if(cur||!lines.length) lines.push(cur);
  const lh=fsPx*Math.max(0.5,lhMul);
  const y0=-((lines.length-1)*lh)/2;
  const drawLine=(line,y)=>{
    if(!(lsEm>0.001)){ c.fillText(line,0,y); return }
    const adv=lsEm*fsPx;
    let total=meas(line)+adv*Math.max(0,line.length-1);
    let x=align==='right'?-total:align==='left'?0:-total/2;
    const prev=c.textAlign; c.textAlign='left';
    for(const ch of line){ c.fillText(ch,x,y); x+=meas(ch)+adv }
    c.textAlign=prev;
  };
  lines.forEach((ln,i)=>drawLine(ln,y0+i*lh));
}
function drawMedia(c,l,time=S.T){
  const el=l._img||l._vid;
  if(!el||l._imgErr) return;
  try{
    if(l._vid){
      const v=l._vid;
      // waktu sumber = trim inTime + (waktu layer x speed), dibekukan di outTime
      const want=((time-l.startMs)*(l.speed||1)+(l.inMs||0))/1000;
      const maxS=Math.min(Number.isFinite(l.outMs)?l.outMs/1000:Infinity, (v.duration||Infinity))-0.03;
      const target=clamp(want,0,Math.max(0,maxS));
      const tolerance=S.playing?0.3:0.04;
      if(Number.isFinite(target)&&Math.abs((v.currentTime||0)-target)>tolerance){
        try{ v.currentTime=target }catch{}
      }
      if(v.readyState<2||!v.videoWidth) return;
    } else if(!el.complete||!el.naturalWidth) return;
    c.save(); c.beginPath(); c.rect(-50,-50,100,100); c.clip();
    const iw=el.videoWidth||el.naturalWidth||100, ih=el.videoHeight||el.naturalHeight||100;
    const mode=(l.mediaFillMode||'stretch').toLowerCase();
    // FIX: crop/fit harus mengikuti ASPEK kotak layer (bukan kotak 1:1),
    // kalau tidak foto terpotong/ditarik tidak sesuai box preview
    const la=Math.abs((l.sy||200))/Math.abs((l.sx||200)); // tinggi/lebar layer
    if(mode==='fill'||mode==='crop'){
      const s=Math.max(100/iw,(100*la)/ih), dw=iw*s, dh=ih*s;
      c.drawImage(el,-dw/2,-dh/2,dw,dh);
    } else if(mode==='fit'||mode==='contain'){
      const s=Math.min(100/iw,(100*la)/ih), dw=iw*s, dh=ih*s;
      c.drawImage(el,-dw/2,-dh/2,dw,dh);
    } else {
      c.drawImage(el,-50,-50,100,100);
    }
    c.restore();
  }catch{}
}
function syncAudio(){
  if(!S.active) return;
  // Export offline frame-accurate: semua media DI-PAUSE (render manual per
  // frame via seek). Tanpa guard ini loop() memutar video realtime saat
  // ekspor -> balapan seek -> hasil choppy/beku.
  if(S.expOffline){ return }
  const pr=S.exporting?1:(S.playRate||1); // saat ekspor selalu 1x; playRate hanya utk preview
  S.active.layers.forEach(l=>{
    if(l.type!=='audio'||!l._aud) return;
    const a=l._aud;
    const on=S.T>=l.startMs&&S.T<=l.endMs;
    if((S.playing||S.exporting)&&on){
      const want=(S.T-l.startMs)/1000;
      if(Math.abs((a.playbackRate||1)-pr)>0.02){ try{a.playbackRate=pr}catch{} }
      if(a.paused){ try{a.currentTime=want;a.play().catch(()=>{})}catch{} }
      else if(Math.abs(a.currentTime-want)>0.35){ try{a.currentTime=want}catch{} } // koreksi drift
    }
    else { if(!a.paused) a.pause() }
    if(!on&&S.T<l.startMs){ try{a.currentTime=0}catch{} }
  });
  S.active.layers.forEach(l=>{
    if(l._vid&&l.type==='video'){
      const on=S.T>=l.startMs&&S.T<=l.endMs;
      if((S.playing||S.exporting)&&on){
        const rate=clamp((l.speed||1)*pr,0.0625,16);
        if(Math.abs(l._vid.playbackRate-rate)>0.01) try{l._vid.playbackRate=rate}catch{}
        if(l._vid.paused) l._vid.play().catch(()=>{});
      }
      else { if(!l._vid.paused) l._vid.pause() }
    }
  });
}

/* ---------- ruler + layer bar ---------- */
const EYE_SVG='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>';
const EYE_OFF='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10 6c1 0 1 0 2 0 6.5 0 10 6 10 6a17 17 0 0 1-3 3M6 7C3.5 8.5 2 12 2 12s3.5 6 10 6c1.5 0 3-.3 4.2-.8"/></svg>';
/* ============================================================
   TIMELINE — zoom (px/detik), ruler adaptif, playhead, autoscroll
   Zoom hanya representasi visual; durasi & playback tak berubah.
   ============================================================ */
function tlFitPps(){
  const vp=$('#tlViewport'); if(!vp) return 12;
  const D=Math.max(1000,S.active?.durationMs||5000);
  return Math.max(S.tl.minPps,(vp.clientWidth-S.tl.laneW-14)/(D/1000));
}
function tlPps(){ return S.tl.pps>0?S.tl.pps:(S.tl.pps=tlFitPps()) }
function tlContentWidth(){
  const D=Math.max(1000,S.active?.durationMs||5000);
  const vp=$('#tlViewport');
  return Math.max(vp?vp.clientWidth:360, Math.ceil(S.tl.laneW+(D/1000)*tlPps()+18));
}
function updateTimelineLayout(){
  const P=S.active; if(!P) return;
  const c=$('#tlContent'); if(!c) return;
  c.style.width=tlContentWidth()+'px';
  drawRuler(); positionPlayhead();
}
function fmtRulerLabel(sec,major){
  const m=Math.floor(sec/60), s=sec-m*60;
  if(major<1) return major<=0.1? (m+':'+s.toFixed(2).padStart(5,'0')) : (m+':'+s.toFixed(1).padStart(4,'0'));
  return m+':'+String(Math.round(s)).padStart(2,'0');
}
function drawRuler(){
  const P=S.active; const r=$('#ruler'); if(!P||!r) return;
  const pps=tlPps(), D=Math.max(1000,P.durationMs||5000), x0=S.tl.laneW;
  const w=tlContentWidth();
  if(r.width!==w) r.width=w; r.height=26;
  const c=r.getContext('2d'); c.clearRect(0,0,w,26);
  // adaptive time scale: zoom rendah -> interval besar; zoom tinggi -> ms
  const steps=[0.05,0.1,0.2,0.5,1,2,5,10,15,30,60,120,300];
  const major=steps.find(s=>s*pps>=58)||300;
  const div=(major*pps>=34)?4:5, minor=major/div;
  const tEnd=D/1000;
  if(minor*pps>=7){ // minor tick = tipis/subtle
    c.fillStyle='rgba(255,255,255,.13)';
    for(let t=minor;t<=tEnd+1e-9;t+=minor){
      if(Math.abs(t/major-Math.round(t/major))<1e-6) continue;
      c.fillRect(Math.round(x0+t*pps),18,1,8);
    }
  }
  c.fillStyle='#8A90A8'; c.font='500 10px system-ui,sans-serif'; c.textBaseline='top';
  for(let t=0;t<=tEnd+1e-9;t+=major){ // major tick = jelas + label
    const x=Math.round(x0+t*pps);
    c.fillRect(x,12,1,14);
    c.fillText(fmtRulerLabel(t,major),x+4,3);
  }
  // BEAT/bookmark marker (merah) — sengaja DIBEDAKAN dari playhead
  c.fillStyle='rgba(255,59,92,.9)';
  (P.bookmarks||[]).forEach(t=>{ const x=Math.round(x0+(t/1000)*pps); c.fillRect(x-1,5,2,21) });
}
function positionPlayhead(){
  const P=S.active, ph=$('#playhead'); if(!P||!ph) return;
  const x=S.tl.laneW+(S.T/1000)*tlPps();
  ph.style.transform='translateX('+x.toFixed(1)+'px)';
}
function autoScrollTimeline(){
  const P=S.active, vp=$('#tlViewport'); if(!P||!vp||!S.playing) return;
  const x=S.tl.laneW+(S.T/1000)*tlPps();
  const viewL=vp.scrollLeft+S.tl.laneW, viewR=vp.scrollLeft+vp.clientWidth;
  if(x>viewR-24) vp.scrollLeft=Math.max(0,x-S.tl.laneW-(vp.clientWidth-S.tl.laneW)*0.75);
  else if(x<viewL) vp.scrollLeft=Math.max(0,x-S.tl.laneW-16);
}
function sizeRuler(){ updateTimelineLayout() }
function layerThumbHTML(l){
  if((l.type==='image'||l.type==='video')&&(l._img||l._vid)){
    const el=l._img||l._vid;
    try{
      const cv=document.createElement('canvas'); cv.width=28; cv.height=28;
      const c=cv.getContext('2d');
      const iw=el.videoWidth||el.naturalWidth, ih=el.videoHeight||el.naturalHeight;
      if(iw&&ih){ const s=Math.max(28/iw,28/ih); c.drawImage(el,(28-iw*s)/2,(28-ih*s)/2,iw*s,ih*s); return cv.toDataURL() }
    }catch{}
  }
  return null;
}
function tlSegBox(l){
  // posisi px clip RELATIF THD .tl-track (bukan konten!), dijepit ke durasi proyek
  const pps=tlPps(), D=S.active?.durationMs||5000;
  const a=(Math.max(0,l.startMs)/1000)*pps;
  const b=(Math.min(l.endMs,D)/1000)*pps;
  return {a,b:Math.max(a+8,b)};
}
function renderLayerBar(){
  const bar=$('#layerBar'); if(!bar) return; bar.innerHTML='';
  if(!S.active) return;
  updateTimelineLayout();
  const P=S.active, pps=tlPps();
  const displayLayers=[...P.layers].reverse();
  displayLayers.forEach((l)=>{
    const row=document.createElement('div'); row.className='tl-row'+(S.sel===l.id?' sel':'');
    const left=document.createElement('button'); left.className='tl-left';
    const th=layerThumbHTML(l);
    left.innerHTML='<span class="tl-eye">'+(l.visible?EYE_SVG:EYE_OFF)+'</span>'
      +(th?'<img class="tl-thumb" src="'+th+'">'
         :(l.type==='audio'?'<span class="tl-audio-ico">N</span>'
           :'<span class="tl-dot" style="background:'+(l.color||'#E14E7A')+'"></span>'))
      +'<span class="tl-nm">'+escapeHtml(l.name.slice(0,16))+'</span>';
    left.onclick=(e)=>{ e.stopPropagation(); pushUndo(); l.visible=!l.visible; renderLayerBar(); };
    const track=document.createElement('div'); track.className='tl-track';
    const seg=document.createElement('div'); seg.className='tl-seg'+(l.type==='audio'?' audio':'');
    const segPlace=()=>{ const {a,b}=tlSegBox(l); seg.style.left=a+'px'; seg.style.width=(b-a)+'px' };
    segPlace();
    if(l.type==='audio'&&l.wave){
      const wc=document.createElement('canvas'); wc.width=200; wc.height=26; wc.className='tl-wave';
      const wc2=wc.getContext('2d'); wc2.fillStyle='#fff';
      l.wave.forEach((v,i)=>{ const h=Math.max(1,v*24); wc2.fillRect(i*(200/l.wave.length),13-h/2,1.5,h) });
      seg.appendChild(wc);
      const nm=document.createElement('span'); nm.className='tl-name'; nm.textContent=l.name.slice(0,18); seg.appendChild(nm);
    } else {
      seg.textContent=l.name.slice(l.type==='audio'?20:16);
    }
    seg.addEventListener('pointerdown',e=>beginClipDrag(e,l,seg,'move'));
    if(S.sel===l.id){ // handle trim hanya pada layer terpilih (touch target 18px)
      const hl=document.createElement('div'); hl.className='tl-trim l';
      hl.addEventListener('pointerdown',e=>beginClipDrag(e,l,seg,'l'));
      const hr=document.createElement('div'); hr.className='tl-trim r';
      hr.addEventListener('pointerdown',e=>beginClipDrag(e,l,seg,'r'));
      seg.append(hl,hr);
    }
    track.appendChild(seg);
    track.onclick=(e)=>{ if(e.target===track){ S.sel=null; S.sub=null; renderLayerBar(); renderBottom(); } };
    row.append(left,track);
    row.onclick=(e)=>{ if(e.target.closest('.tl-left')||e.target.closest('.tl-seg')) return; S.sel=l.id; S.sub='edit'; renderLayerBar(); renderBottom(); };
    bar.appendChild(row);
  });
}
/* drag clip (geser waktu) + trim handle — hanya mengubah startMs/endMs,
   field yang sama dengan panel edit, jadi logic inti tidak berubah */
function beginClipDrag(e,l,seg,mode){
  if(e.pointerType==='mouse'&&e.button!==0) return;
  e.stopPropagation(); e.preventDefault();
  const pps=tlPps(), D=S.active.durationMs||5000;
  const xStart=e.clientX, s0=l.startMs, e0=l.endMs, MIN=50;
  let moved=false, snapshotted=false;
  const target=e.currentTarget;
  try{ target.setPointerCapture(e.pointerId) }catch{}
  const place=()=>{ const {a,b}=tlSegBox(l); seg.style.left=a+'px'; seg.style.width=(b-a)+'px' };
  const mv=(ev)=>{
    if(!moved && Math.abs(ev.clientX-xStart)<4) return;
    if(!moved){ moved=true; if(!snapshotted){ pushUndo(); snapshotted=true } } // snapshot SEBELUM modifikasi
    const dx=(ev.clientX-xStart)/pps*1000;
    if(mode==='move'){ const len=e0-s0; l.startMs=Math.round(clamp(s0+dx,0,D-len)); l.endMs=l.startMs+len; }
    else if(mode==='l'){ l.startMs=Math.round(clamp(s0+dx,0,e0-MIN)); }
    else { l.endMs=Math.round(clamp(e0+dx,s0+MIN,D)); }
    place();
  };
  const up=()=>{
    target.removeEventListener('pointermove',mv);
    target.removeEventListener('pointerup',up);
    target.removeEventListener('pointercancel',up);
    if(moved) afterChange();
    else { S.sel=l.id; S.sub='edit'; renderLayerBar(); renderBottom(); } // tap = pilih
  };
  target.addEventListener('pointermove',mv);
  target.addEventListener('pointerup',up);
  target.addEventListener('pointercancel',up);
}
function updateSelectBox(){
  const box=$('#selectBox');   const l=S.active?.layers.find(x=>x.id===S.sel);
  if(!l){box.hidden=true;return}
  if(l.type==='audio'){box.hidden=true;return}
  const cv=$('#preview'); const r=cv.getBoundingClientRect();
  const sx=r.width/S.active.w, sy=r.height/S.active.h;
  // FIX: ikuti nilai keyframe + rotasi supaya kotak seleksi nempel di layer
  const x=evalProp(l,'x',S.T)*sx, y=evalProp(l,'y',S.T)*sy;
  const w=Math.abs(evalProp(l,'sx',S.T)||200)*sx*0.5, h=Math.abs(evalProp(l,'sy',S.T)||200)*sy*0.5;
  const rot=evalProp(l,'rot',S.T)||0;
  box.hidden=false; box.style.left=(x-w/2)+'px'; box.style.top=(y-h/2)+'px';
  box.style.width=(w)+'px'; box.style.height=(h)+'px';
  box.style.transform=rot?('rotate('+rot+'deg)'):'';
}

/* ---------- bottom panel ---------- */
function renderBottom(){
  const P=S.active, el=$('#bottomPanel');   if(!P){el.innerHTML='';return}
  el.hidden=false;
  const add=$('#layerAdd');
  if(add) add.hidden=!!(P.layers.find(l=>l.id===S.sel)||S.showAdd);
  const sel=P.layers.find(l=>l.id===S.sel);
  if(sel){
    if(S.sub==='draw'){ renderDrawPanel(el,sel); return }
    if(!S.sub||S.sub==='edit'){ renderEditMenu(el,sel); return }
    if(S.sub==='move'){ renderMove(el,sel); return }
    if(S.sub==='color'){ renderColor(el,sel); return }
    if(S.sub==='border'){ renderBorder(el,sel); return }
    if(S.sub==='blend'){ renderBlend(el,sel); return }
    if(S.sub==='fx'){ renderFxPanel(el,sel); return }
    if(S.sub==='presets'){ renderPresets(el,sel); return }
    if(S.sub==='shape'){ renderShapeEdit(el,sel); return }
    return;
  }
  // Tidak ada seleksi: jika proyek berisi layer preset, tampilkan ringkasan timeline.
  // Panel tambah Bentuk hanya dibuka via tombol plus agar tidak menutupi timeline.
  if(!P.layers.length&&!S.showAdd){
    el.hidden=false;
    renderAddPanel(el);
    const add=$('#layerAdd'); if(add) add.hidden=true;
    return;
  }
  if(!sel && P.layers.length && !S.showAdd){
    el.innerHTML='';
    el.hidden=true; // panel kosong: sembunyikan total agar preview tidak tergerus
    const add=$('#layerAdd'); if(add) add.hidden=false;
    sizePreview();
    return;
  }
  el.hidden=false;
  renderAddPanel(el);
  const add2=$('#layerAdd'); if(add2) add2.hidden=true;
}
function tabBtn(id, label, active, onclick, svg){
  const b=document.createElement('button'); b.className='bp-tab'+(active?' active':''); b.innerHTML=(svg||'')+'<span>'+label+'</span>'; b.onclick=onclick; return b;
}
function renderAddPanel(el){
  el.innerHTML='';
  const tabs=document.createElement('div'); tabs.className='bp-tabs';
  const wrap=document.createElement('div'); wrap.className='bp-side';
  const main=document.createElement('div'); main.className='bp-main';
  const right=document.createElement('div'); right.className='bp-right';
  let cur='bentuk';
  const t1=tabBtn('','Bentuk',true,()=>{cur='bentuk';draw()});
  const t2=tabBtn('','Media',false,()=>{cur='media';draw()});
  const t3=tabBtn('','Audio',false,()=>{cur='audio';draw()});
  const t4=tabBtn('','Objek / Elemen',false,()=>{cur='obj';draw()});
  const t5=tabBtn('','Template',false,()=>{cur='tpl';draw()});
  const t6=tabBtn('','Gambar',false,()=>{cur='gambar';draw()});
  tabs.append(t1,t2,t3,t4,t5,t6);
  function draw(){
    [t1,t2,t3,t4,t5,t6].forEach(b=>b.classList.remove('active'));
    ({bentuk:t1,media:t2,audio:t3,obj:t4,tpl:t5,gambar:t6}[cur]).classList.add('active');
    main.innerHTML='';
    if(cur==='bentuk'){
      const g=document.createElement('div');g.className='shape-grid';
      const kinds=[['circle',''],['rect',''],['plus',''],['donut',''],['tri',''],['pie',''],['hex',''],['star8',''],['arrow',''],['trap',''],['square',''],['star',''],['line',''],['bar',''],['tri2','']];
      kinds.forEach(([k])=>{ const b=document.createElement('button'); b.innerHTML='<svg viewBox="-60 -60 120 120"><g fill="#2A2E44"><circle cx="0" cy="0" r="34"/></g></svg>'; b.title=k;
        b.onclick=()=>addShape(k); g.appendChild(b) });
      // replace icons with simple shapes via css text
      [...g.children].forEach((b,i)=>{ b.textContent=['O','R','+','C','T','P','H','*','A','V','S','X','/','-','Y'][i] });
      main.appendChild(g);
    }
    if(cur==='media'){ const g=document.createElement('div');g.className='media-grid';
      const add=document.createElement('button');add.className='media-cell';add.innerHTML='<div style="padding:22px">+</div><small>Impor</small>';add.onclick=()=>$('#mediaPick').click();g.appendChild(add);
      for(let i=0;i<3;i++){const c=document.createElement('div');c.className='media-cell';c.innerHTML='<div style="height:72px;background:#3A405E"></div><small>Contoh '+(i+1)+'</small>';g.appendChild(c)}
      main.appendChild(g) }
    if(cur==='audio'){ const g=document.createElement('div');g.className='audio-grid';
      ['Get2on 00:16','Mili 02:49','Nad 01:15','Rui 00:42'].forEach(t=>{const c=document.createElement('div');c.className='media-cell';c.innerHTML='<small>'+t+'</small><div style="padding:14px">+</div>';c.onclick=()=>addAudio(t);g.appendChild(c)});
      main.appendChild(g) }
    if(cur==='obj'){ const g=document.createElement('div');g.className='obj-grid';
      [['Kamera','cam'],['Nol','nol'],['Grup Kosong','grp'],['Elemen / Proyek','elm']].forEach(([t,k])=>{const b=document.createElement('button');b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.4"><rect x="4" y="7" width="12" height="9" rx="2"/></svg>'+t;b.onclick=()=>addObj(k,t);main.appendChild(b);g.appendChild(b)});
      main.appendChild(g) }
    if(cur==='tpl'){ const g=document.createElement('div');g.className='media-grid';
      ['New Pr 117','Get2on Cc','My Min','New Pr 111'].forEach(t=>{const c=document.createElement('div');c.className='media-cell';c.innerHTML='<div style="height:72px;background:#3AA655"></div><small>'+t+'</small>';c.onclick=()=>toast('Template '+t+' dimuat sebagai proyek baru');g.appendChild(c)});
      main.appendChild(g) }
    if(cur==='gambar'){ const g=document.createElement('div');g.className='media-grid';
      const bPaper=document.createElement('button');bPaper.className='media-cell';bPaper.innerHTML='<div style="padding:22px">+</div><small>Kertas Gambar</small>';
      bPaper.onclick=()=>{ pushUndo(); const l=makeDrawingLayer(); S.active.layers.push(l); S.sel=l.id; S.sub='draw'; S.showAdd=false; afterChange() };
      const bAuto=document.createElement('button');bAuto.className='media-cell';bAuto.innerHTML='<div style="padding:22px">✎</div><small>Auto Draw</small>';
      bAuto.onclick=()=>runAutoDraw();
      const note=document.createElement('div');note.className='iq-status';note.textContent='Engine menggambar ulang citra goresan demi goresan.';
      g.append(bPaper,bAuto); main.append(g,note) }
  }
  right.innerHTML='<button>Gambar Freehand</button><button>Gambar Vektor</button><button>Teks</button><button id="bpX">X</button>';
  right.querySelectorAll('button')[2].onclick=()=>{ pushUndo(); const l=makeText('Teks baru'); S.active.layers.push(l); S.sel=l.id; S.sub='edit'; afterChange() };
  right.querySelector('#bpX').onclick=()=>{ S.showAdd=false; S.sel=null; renderBottom() };
  wrap.append(main,right); el.append(tabs,wrap); draw();
}
function addShape(k){
  pushUndo();
  const map={circle:'circle',rect:'roundrect',square:'rect',plus:'plus',donut:'donut',tri:'tri',pie:'circle',hex:'circle',star8:'star',arrow:'arrow',trap:'rect',star:'star',line:'line',bar:'rect',tri2:'tri'};
  const l=makeShape(map[k]||'roundrect', ['#E14E7A','#3DDC84','#6ACDE0'][Math.floor(Math.random()*3)]);
  l.shapeKind=map[k]||'roundrect';
  S.active.layers.push(l); S.sel=l.id; S.sub='edit'; afterChange();
}
function addAudio(t){ pushUndo(); const l=makeShape('rect'); l.type='audio'; l.name=t; l.color='#6ACDE0'; S.active.layers.push(l); afterChange(); toast('Audio ditambah: '+t) }
function addObj(k,t){ pushUndo(); const l=makeShape('rect'); l.type=k==='cam'?'camera':k; l.name=t; l.color='#3A405E'; S.active.layers.push(l); S.sel=l.id; S.sub='edit'; afterChange() }
function runAutoDraw(){
  if(!S.active) return;
  let l=S.active.layers.find(x=>x.id===S.sel&&x.type==='drawing');
  if(!l){ pushUndo(); l=makeDrawingLayer(); S.active.layers.push(l); S.sel=l.id }
  S.sub='draw'; S.showAdd=false; renderBottom();
  $('#drawPick').click();
}
async function handleDrawPick(e){
  const f=e.target.files[0]; e.target.value='';
  if(!f||!S.active) return;
  const l=S.active.layers.find(x=>x.id===S.sel&&x.type==='drawing');
  if(!l){ toast('Pilih layer gambar dulu'); return }
  const url=URL.createObjectURL(f);
  const img=new Image();
  img.onload=async()=>{
    const prog=()=>$( '#drawProg');
    try{
      pushUndo();
      const plan=await autoDrawFromImage(img,l,(fr,m)=>{ const p=prog(); if(p){p.hidden=false;p.textContent='Auto Draw '+Math.round(fr*100)+'% — '+m} });
      if(l.draw.mode==='human'){ S.active.durationMs=Math.max(1000,plan.totalMs); l.endMs=S.active.durationMs }
      l.draw.rev=(l.draw.rev||0)+1;
      afterChange(); renderBottom();
      toast('Auto Draw siap: '+drawEtaText(l));
    }catch(err){ toast('Auto Draw gagal: '+((err&&err.message)||err)) }
    finally{ const p=prog(); if(p) p.hidden=true; try{URL.revokeObjectURL(url)}catch{} }
  };
  img.onerror=()=>{ toast('Gambar tidak terbaca'); try{URL.revokeObjectURL(url)}catch{} };
  img.src=url;
}
function handleMediaPick(e){
  const f=e.target.files[0]; if(!f||!S.active)return;
  pushUndo(); const url=URL.createObjectURL(f);
  const isV=f.type.startsWith('video'), isA=f.type.startsWith('audio');
  const l=makeShape('rect'); l.type=isV?'video':isA?'audio':'image'; l.name=f.name.slice(0,18); l.mediaSrc=url; l.mediaKind=l.type;
  if(!isA){ const img=new Image(); img.onload=()=>{l._img=img}; img.src=url; if(isV){const v=document.createElement('video');v.src=url;v.muted=true;v.loop=true;v.play().catch(()=>{});l._vid=v} }
  S.active.layers.push(l); S.sel=l.id; S.sub='edit'; afterChange(); toast('Media dimuat');
  e.target.value='';
}

/* edit menu grid */
function renderEditMenu(el, l){
  el.innerHTML='';
  const top=document.createElement('div'); top.className='mini-row';
  const b1=document.createElement('button');b1.className='mini';b1.textContent='Graph';b1.onclick=()=>{S.sub='move';renderBottom()};
  const b2=document.createElement('button');b2.className='mini';b2.textContent='Awal';b2.onclick=()=>{pushUndo();l.startMs=S.T;afterChange()};
  const b3=document.createElement('button');b3.className='mini';b3.textContent='Tengah';b3.onclick=()=>{pushUndo();l.startMs=Math.max(0,S.T-500);l.endMs=S.T+500;afterChange()};
  const b4=document.createElement('button');b4.className='mini';b4.textContent='Akhir';b4.onclick=()=>{pushUndo();l.endMs=S.T;afterChange()};
  top.append(b1,b2,b3,b4);
  const grid=document.createElement('div');grid.className='prop-grid';
  const items=[
    ['Color and Fill',()=>{S.sub='color';renderBottom()}],
    ['Border and Bayangan',()=>{S.sub='border';renderBottom()}],
    ['Blending and Opacity',()=>{S.sub='blend';renderBottom()}],
    ['Move and Transform',()=>{S.sub='move';S.moveTab='pos';renderBottom()}],
    ['Edit Bentuk',()=>{S.sub='shape';renderBottom()}],
    ['Presets',()=>{S.sub='presets';renderBottom()}],
    ['Efek',()=>{S.sub='fx';renderBottom()}],
  ];
  if(l.type==='drawing') items.unshift(['Menggambar',()=>{S.sub='draw';renderBottom()}]);
  items.forEach(([t,fn])=>{const b=document.createElement('button');b.className='prop-btn';b.innerHTML='<span>'+t+'</span>';b.onclick=fn;grid.appendChild(b)});
  const del=document.createElement('div');del.className='mini-row';
  const bd=document.createElement('button');bd.className='mini';bd.textContent='Hapus layer';bd.onclick=()=>{pushUndo();S.active.layers=S.active.layers.filter(x=>x.id!==l.id);S.sel=null;S.sub=null;afterChange()};
  const bn=document.createElement('button');bn.className='mini';bn.textContent='Kembali';bn.onclick=()=>{S.sel=null;S.sub=null;renderLayerBar();renderBottom()};
  del.append(bd,bn);
  el.append(top,grid,del);
}

/* Move */
function renderMove(el,l){
  el.innerHTML='';
  el.appendChild(rowHead('< Kembali','Move and Transform',l));
  const tabs=document.createElement('div');tabs.className='mini-row';
  [['pos','Posisi'],['rot','Putar'],['scl','Skala'],['skw','Skew']].forEach(([k,t])=>{const b=document.createElement('button');b.className='mini'+(S.moveTab===k?' accent':'');b.textContent=t;b.style.color=S.moveTab===k?'var(--accent)':'';b.onclick=()=>{S.moveTab=k;renderBottom()};tabs.appendChild(b)});
  el.appendChild(tabs);

  // baris properti ala AM: label + input hijau (nilai di playhead) + tombol "+" (tambah keyframe)
  const groups={
    pos:[['x','Geser X'],['y','Geser Y']],
    rot:[['rot','Putar']],
    scl:[['sx','Skala X'],['sy','Skala Y']],
    skw:[['skewX','Skew X'],['skewY','Skew Y']],
  }[S.moveTab]||[['x','Geser X'],['y','Geser Y']];
  const rows=document.createElement('div');rows.className='mt-rows';
  groups.forEach(([key,label])=>{
    const row=document.createElement('div');row.className='mt-row';
    const lb=document.createElement('span');lb.className='mt-lb';lb.textContent=label;
    const inp=document.createElement('input');inp.className='mt-val';inp.inputMode='decimal';
    inp.value=fmt2(evalProp(l,key,S.T));
    inp.onchange=()=>{ setPropAtPlayhead(l,key,parseNum(inp.value)); afterChange(); };
    const add=document.createElement('button');add.className='mt-add';add.title='Tambah keyframe';add.textContent='+';
    const kfN=(l.kf&&l.kf[key]||[]).length;
    if(kfN) add.classList.add('has');
    add.onclick=()=>{ addKeyframe(l,S.moveTab); };
    row.append(lb,inp,add); rows.appendChild(row);
  });
  el.appendChild(rows);
  if(S.moveTab==='pos'){
    const hint=document.createElement('div');hint.className='pos-hint';hint.textContent='Geser ke sini untuk memindahkan layer';
    el.appendChild(hint);
  }

  // alat easing + preview kurva (fitur lanjutan, tetap tersedia)
  const mid=document.createElement('div');mid.className='kf-panel';
  const left=document.createElement('div');left.className='kf-left';
  left.innerHTML='<button data-a="back">&lt;</button><button data-a="add">+</button><button data-a="curve">C</button>';
  left.querySelector('[data-a="back"]').onclick=()=>{S.sub='edit';renderBottom()};
  left.querySelector('[data-a="add"]').onclick=()=>addKeyframe(l,S.moveTab);
  left.querySelector('[data-a="curve"]').onclick=()=>{S.easeSel=nextEase(S.easeSel);drawCurve()};
  const center=document.createElement('div');center.className='kf-mid';
  const easeName=document.createElement('div');easeName.style.cssText='color:#9AA0B5;font-size:12px;text-align:center';
  center.appendChild(easeName);
  const right=document.createElement('div');right.className='kf-right';
  ['cubic','bounce','cyclic','steps','elastic','random'].forEach(e=>{
    const b=document.createElement('button');b.textContent=e.slice(0,4);b.className=e===S.easeSel?'active':'';
    b.onclick=()=>{S.easeSel=e;drawCurve();[...right.children].forEach(x=>x.classList.remove('active'));b.classList.add('active')};
    right.appendChild(b)
  });
  mid.append(left,center,right); el.appendChild(mid);
  const curveBox=document.createElement('div');curveBox.className='kf-mid';curveBox.style.margin='0 12px';
  const cc=document.createElement('canvas');cc.width=320;cc.height=110;curveBox.appendChild(cc);el.appendChild(curveBox);
  function drawCurve(){ drawEasePreview(cc, S.easeSel); easeName.textContent='Easing: '+S.easeSel }
  drawCurve();
}
function fmt2(v){ return (Math.round((Number(v)||0)*100)/100).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function parseNum(s){ return parseFloat(String(s).replace(/\s/g,'').replace(',','.'))||0 }
function setPropAtPlayhead(l,key,val){
  pushUndo();
  const arr=(l.kf&&l.kf[key])||[];
  if(arr.length){
    const t=Math.round(S.T);
    const hit=arr.find(k=>Math.abs(k.t-t)<40);
    if(hit) hit.v=val; else { arr.push({t,v:val,ease:S.easeSel==='cubic'?'cubic':S.easeSel}); arr.sort((a,b)=>a.t-b.t) }
    l.kf[key]=arr;
  } else l[key]=val;
  renderBottom();
}
function nextEase(e){const o=['cubic','bounce','cyclic','steps','elastic','random'];return o[(o.indexOf(e)+1)%o.length]}
function addKeyframe(l,tab){
  pushUndo();
  const map={pos:['x','y'],rot:['rot'],scl:['sx','sy'],skw:['skewX','skewY']};
  (map[tab]||['x']).forEach(k=>{
    l.kf[k]=l.kf[k]||[];
    const cur=evalProp(l,k,S.T); // nilai di playhead -> kf mulus
    const t=Math.round(S.T);
    const hit=l.kf[k].find(q=>Math.abs(q.t-t)<40);
    if(hit) hit.v=cur; else { l.kf[k].push({t,v:cur,ease:S.easeSel==='cubic'?'cubic':S.easeSel}); l.kf[k].sort((a,b)=>a.t-b.t) }
  });
  toast('Keyframe ditambah di '+fmtTC(S.T)); renderBottom(); renderLayerBar();
}
function drawEasePreview(cv,type){
  const c=cv.getContext('2d');c.clearRect(0,0,cv.width,cv.height);c.fillStyle='#4A5170';c.fillRect(0,0,cv.width,cv.height);
  c.strokeStyle='#6A6E83';for(let i=0;i<cv.width;i+=16){c.beginPath();c.moveTo(i,0);c.lineTo(i,cv.height);c.stroke()}
  c.strokeStyle='#00E08A';c.lineWidth=3;c.beginPath();
  for(let i=0;i<=100;i++){const t=i/100;const v=1-easeOf(type==='cubic'?'cubic':type,t);const x=10+t*(cv.width-20),y=10+v*(cv.height-20);i?c.lineTo(x,y):c.moveTo(x,y)}
  c.stroke();c.fillStyle='#fff';c.font='12px Arial';c.fillText(type.toUpperCase()+' EASING',12,cv.height-10);
}
function drawDial(cv,l){
  const c=cv.getContext('2d');c.clearRect(0,0,cv.width,cv.height);
  c.strokeStyle='#333';c.lineWidth=3;c.beginPath();c.arc(150,85,60,0,Math.PI*2);c.stroke();
  c.fillStyle='#2E3450';c.fillRect(110,65,80,40);c.fillStyle='#00E08A';c.font='bold 22px Arial';c.textAlign='center';c.fillText(Math.round(l.rot)+'o',150,93);
  cv.onclick=(e)=>{pushUndo();l.rot=(l.rot+15)%360;afterChange()};
}
function drawScaleLines(cv){const c=cv.getContext('2d');c.clearRect(0,0,cv.width,cv.height);c.strokeStyle='#6A6E83';for(let i=0;i<cv.width;i+=6){c.beginPath();c.moveTo(i,10);c.lineTo(i,110);c.stroke()}c.strokeStyle='#00E08A';c.beginPath();c.moveTo(cv.width/2,10);c.lineTo(cv.width/2,110);c.stroke()}

/* Color */
const PALETTE=['#FF3B3B','#FFB13B','#FFEF5A','#00E11A','#00E5E5','#3B5BFF','#FF3BFF','#FFFFFF','#C9C9C9','#8A8A8A','#4A4A4A','#000000','#6ACDE0','#9AC89A','#2B2BFF'];
function renderColor(el,l){
  el.innerHTML='';
  const head=rowHead('< Kembali','Color and Fill',l);
  el.appendChild(head);
  const hex=document.createElement('div');hex.style.cssText='background:#fff;margin:8px 12px;padding:10px;border-radius:8px;text-align:center;font-weight:700';hex.textContent=(l.color||'#FFFFFF')+' ('+(l.fillAlpha??100)+'%)';el.appendChild(hex);
  const g=document.createElement('div');g.className='col-grid';g.style.padding='8px 12px';
  PALETTE.forEach(c=>{const b=document.createElement('button');b.style.background=c;b.onclick=()=>{pushUndo();l.color=c;renderBottom()};g.appendChild(b)});
  el.appendChild(g);
  sliderRow(el,'Opacity',l.opacity??100,0,100,v=>{l.opacity=v},{live:true});
  const full=document.createElement('button');full.className='mini';full.style.margin='8px 12px';full.textContent='Buka pemilih warna lengkap';full.onclick=()=>openColor(l, v=>{l.color=v;renderBottom()});
  el.appendChild(full);
}
function rowHead(backT,title,l){
  const h=document.createElement('div');h.className='mini-row';
  const b=document.createElement('button');b.className='mini';b.textContent=backT;b.onclick=()=>{S.sub='edit';renderBottom()};
  const t=document.createElement('div');t.style.cssText='flex:2;text-align:center;color:#fff;font-weight:700';t.textContent=title;
  h.append(b,t);return h;
}
function sliderRow(el,label,val,min,max,on,p){
  const r=document.createElement('div');r.className='slider-row';
  const lb=document.createElement('span');lb.style.cssText='color:#fff;min-width:80px;font-size:13px';lb.textContent=label;
  const inp=document.createElement('input');inp.type='range';inp.min=min;inp.max=max;inp.value=val;
  const box=document.createElement('span');box.className='val-box';box.textContent=val;
  inp.oninput=()=>{box.textContent=inp.value;on(+inp.value)};
  inp.onchange=()=>{pushUndo();on(+inp.value)};
  if(p?.live) inp.oninput=()=>{box.textContent=inp.value;on(+inp.value)};
  r.append(lb,inp,box);el.appendChild(r);return r;
}

/* Border */
function renderBorder(el,l){
  el.innerHTML=''; el.appendChild(rowHead('< Kembali','Border and Bayangan',l));
  const b=l.border||(l.border={on:false,width:4,color:'#fff',pos:'DI DALAM'});
  const t=document.createElement('div');t.className='slider-row';
  const sw=document.createElement('button');sw.className='switch'+(b.on?' on':'');sw.onclick=()=>{pushUndo();b.on=!b.on;renderBottom()};
  const lb=document.createElement('span');lb.style.color='#fff';lb.textContent='Stroke';
  t.append(lb,sw);el.appendChild(t);
  sliderRow(el,'Ukuran',b.width,0,60,v=>{b.width=v});
  const seg=document.createElement('div');seg.className='seg3';
  ['DI DALAM','TENGAH','DI LUAR'].forEach(o=>{const btn=document.createElement('button');btn.textContent=o;if(b.pos===o)btn.classList.add('active');btn.onclick=()=>{b.pos=o;renderBottom()};seg.appendChild(btn)});
  el.appendChild(seg);
  const cbtn=document.createElement('button');cbtn.className='mini';cbtn.style.margin='8px 12px';cbtn.textContent='Warna: '+b.color;cbtn.onclick=()=>openColor(l,v=>{b.color=v;renderBottom()});
  el.appendChild(cbtn);
  const s=l.shadow||(l.shadow={on:false,blur:12,dx:0,dy:6,color:'#000',op:50});
  const t2=document.createElement('div');t2.className='slider-row';const sw2=document.createElement('button');sw2.className='switch'+(s.on?' on':'');sw2.onclick=()=>{s.on=!s.on;renderBottom()};const lb2=document.createElement('span');lb2.style.color='#fff';lb2.textContent='Bayangan';t2.append(lb2,sw2);el.appendChild(t2);
  sliderRow(el,'Blur',s.blur,0,60,v=>{s.blur=v});
  sliderRow(el,'Opacity bayangan',s.op,0,100,v=>{s.op=v});
}

/* Blend — ter-kategori seperti aplikasi AM asli */
function renderBlend(el,l){
  el.innerHTML='';el.appendChild(rowHead('< Kembali','Blending & Opacity',l));
  sliderRow(el,'Opacity',l.opacity??100,0,100,v=>{l.opacity=v},{live:true});
  const wrap=document.createElement('div');wrap.className='blend-wrap';
  BLEND_GROUPS.forEach(([groupName,modes])=>{
    const h=document.createElement('div');h.className='blend-group-h';h.textContent=groupName;wrap.appendChild(h);
    const g=document.createElement('div');g.className='blend-group';
    modes.forEach(([key,label])=>{
      const b=document.createElement('button');b.className='blend-btn'+(l.blend===key?' active':'');b.textContent=label;
      b.onclick=()=>{pushUndo();l.blend=key;renderBottom()};
      g.appendChild(b);
    });
    wrap.appendChild(g);
  });
  el.appendChild(wrap);
}

/* FX */
function renderFxPanel(el,l){
  el.innerHTML='';el.appendChild(rowHead('< Kembali','Efek ('+l.fx.length+')',l));
  const add=document.createElement('button');add.className='btn-dark';add.style.margin='8px 12px';add.textContent='+ Tambah Efek';add.onclick=()=>{$('#sheetFx').hidden=false;renderFxBrowser(l)};
  el.appendChild(add);
  l.fx.forEach((f,idx)=>{
    const box=document.createElement('div');box.className='fx-item';
    const h=document.createElement('div');h.className='fx-head';
    const sw=document.createElement('button');sw.className='switch'+(f.on!==false?' on':'');sw.onclick=()=>{f.on=!f.on;};
    const b=document.createElement('b');b.textContent=f.name;
    const del=document.createElement('button');del.className='mini';del.textContent='X';del.onclick=()=>{pushUndo();l.fx.splice(idx,1);renderBottom()};
    h.append(sw,b,del);box.appendChild(h);
    const def=FX_CATALOG.find(x=>x.id===f.id);
    (def?.params||[]).forEach(p=>{
      const r=document.createElement('div');r.className='slider-row';
      const lb=document.createElement('span');lb.style.cssText='color:#fff;font-size:12px;min-width:90px';lb.textContent=p.label;
      const inp=document.createElement('input');inp.type='range';inp.min=p.min;inp.max=p.max;inp.step=(p.max-p.min)/100;inp.value=f.params[p.key]??p.def;
      const bx=document.createElement('span');bx.className='val-box';bx.textContent=Math.round(inp.value*100)/100;
      const kf=document.createElement('button');kf.className='mini';kf.textContent='+K';kf.style.maxWidth='44px';
      kf.onclick=()=>{pushUndo();f.kf=f.kf||{};f.kf[p.key]=f.kf[p.key]||[];f.kf[p.key].push({t:Math.round(S.T),v:+inp.value,ease:'linear'});toast('Key efek ditambah')};
      inp.oninput=()=>{f.params[p.key]=+inp.value;bx.textContent=inp.value};
      r.append(lb,inp,bx,kf);box.appendChild(r);
    });
    el.appendChild(box);
  });
}
function renderFxBrowser(l){
  // kategori ala aplikasi AM asli (lihat screenshot referensi)
  const CAT_MAP={'Warna':'Warna & Cahaya','Cahaya':'Warna & Cahaya','Gaya':'Gambar & Tepi','Blur':'Blur','Distorsi':'Distorsi / Warp','Gerak':'Move / Transform','Kunci':'Kunci / Matte'};
  const cats=['Semua',...[...new Set(FX_CATALOG.map(f=>CAT_MAP[f.cat]||f.cat))]];
  const cc=$('#fxCats');cc.innerHTML='';
  cats.forEach(c=>{const b=document.createElement('button');b.textContent=c;if(S.fxFilter===c)b.classList.add('active');b.onclick=()=>{S.fxFilter=c;renderFxBrowser(l)};cc.appendChild(b)});
  const q=($('#fxSearch').value||'').toLowerCase();
  const list=$('#fxList');list.innerHTML='';
  FX_CATALOG.filter(f=>{
    const fc=CAT_MAP[f.cat]||f.cat;
    return (S.fxFilter==='Semua'||S.fxFilter===fc)&&f.name.toLowerCase().includes(q);
  }).forEach(f=>{
    const r=document.createElement('div');r.className='fx-row';
    r.innerHTML='<b>'+f.name+'<small>'+(CAT_MAP[f.cat]||f.cat)+' | '+f.desc+'</small></b>';
    const a=document.createElement('button');a.className='fx-add';a.textContent='Tambah';a.onclick=()=>{pushUndo();l.fx.push({id:f.id,name:f.name,on:true,params:Object.fromEntries(f.params.map(p=>[p.key,p.def])),kf:{}});$('#sheetFx').hidden=true;S.sub='fx';renderBottom()};
    r.appendChild(a);list.appendChild(r);
  });
  $('#fxSearch').oninput=()=>renderFxBrowser(l);
  $('#fxBack').onclick=$('#fxClose').onclick=()=>$('#sheetFx').hidden=true;
}
function renderPresets(el,l){
  el.innerHTML='';el.appendChild(rowHead('< Kembali','Presets',l));
  const info=document.createElement('div');info.className='pos-hint';info.textContent='Preset gerakan tersimpan. Pilih untuk terapkan keyframe siap pakai.';
  el.appendChild(info);
  [['Shake cepat','shake'],['Fade masuk','fade'],['Pop skala','pop'],['Putar 360','spin'],['Bounce masuk','bounce']].forEach(([t,k])=>{
    const b=document.createElement('button');b.className='mini';b.style.margin='6px 12px';b.textContent=t;b.onclick=()=>applyPreset(l,k);el.appendChild(b)
  });
}
function applyPreset(l,k){
  pushUndo();const D=S.active.durationMs;
  if(k==='shake'){l.kf.x=[{t:0,v:l.x,ease:'linear'},{t:D/4,v:l.x-40,ease:'cyclic'},{t:D/2,v:l.x+40,ease:'cyclic'},{t:D,v:l.x,ease:'linear'}]}
  if(k==='fade'){l.opacity=0;l.kf.opacity=[{t:0,v:0,ease:'cubic'},{t:800,v:100,ease:'cubic'}]}
  if(k==='pop'){l.kf.sx=[{t:0,v:0,ease:'bounce'},{t:800,v:l.sx,ease:'bounce'}];l.kf.sy=[{t:0,v:0,ease:'bounce'},{t:800,v:l.sy,ease:'bounce'}]}
  if(k==='spin'){l.kf.rot=[{t:0,v:0,ease:'linear'},{t:D,v:360,ease:'linear'}]}
  if(k==='bounce'){l.kf.y=[{t:0,v:l.y-300,ease:'bounce'},{t:800,v:l.y,ease:'bounce'}]}
  toast('Preset diterapkan: '+k);S.sub='move';renderBottom();
}
function renderShapeEdit(el,l){
  el.innerHTML='';el.appendChild(rowHead('< Kembali','Edit Bentuk',l));
  sliderRow(el,'Sudut bulat',l.corner??24,0,50,v=>{l.corner=v},{live:true});
  sliderRow(el,'Lebar',l.sx??200,10,800,v=>{l.sx=v},{live:true});
  sliderRow(el,'Tinggi',l.sy??200,10,800,v=>{l.sy=v},{live:true});
  if(l.type==='text'&&l.text){
    const inp=document.createElement('input');inp.value=l.text.content;inp.style.cssText='margin:8px 12px;padding:10px;border-radius:8px;border:1px solid var(--line);background:#2E3450;color:#fff;width:calc(100% - 24px)';
    inp.onchange=()=>{pushUndo();l.text.content=inp.value};el.appendChild(inp);
    sliderRow(el,'Ukuran font',l.text.size||64,12,200,v=>{l.text.size=v},{live:true});
  }
}

/* color full sheet */
let colCb=null;
function openColor(l,cb){
  colCb=cb; $('#sheetColor').hidden=false; drawColWheel(l.color||'#3D4CF5'); drawColGrid();
  $('#colBack').onclick=$('#colOk').onclick=()=>$('#sheetColor').hidden=true;
}
function drawColWheel(hex){
  const cv=$('#colWheel'),c=cv.getContext('2d');const R=140,cx=160,cy=160;
  c.clearRect(0,0,320,320);
  for(let a=0;a<360;a+=2){c.strokeStyle='hsl('+a+',90%,55%)';c.lineWidth=26;c.beginPath();c.arc(cx,cy,R-13,a*Math.PI/180,(a+2)*Math.PI/180);c.stroke()}
  const rgb=hexToRgb(hex);$('#colPrev').style.background=hex;$('#colHex').textContent=hex+' (100%)';
  cv.onclick=(e)=>{const r=cv.getBoundingClientRect();const x=(e.clientX-r.left)*(320/r.width)-cx,y=(e.clientY-r.top)*(320/r.height)-cy;let ang=Math.atan2(y,x)*180/Math.PI;if(ang<0)ang+=360;const nh='hsl('+Math.round(ang)+',90%,55%)';const tmp=document.createElement('canvas');tmp.width=tmp.height=1;const tc=tmp.getContext('2d');tc.fillStyle=nh;tc.fillRect(0,0,1,1);const d=tc.getImageData(0,0,1,1).data;const h2=rgbToHex(d[0],d[1],d[2]);$('#colPrev').style.background=h2;$('#colHex').textContent=h2+' (100%)';colCb&&colCb(h2)};
}
function drawColGrid(){
  const g=$('#colGrid');g.innerHTML='';PALETTE.forEach(c=>{const b=document.createElement('button');b.style.background=c;b.onclick=()=>{colCb&&colCb(c);$('#sheetColor').hidden=true};g.appendChild(b)});
  const s=$('#colSliders');s.innerHTML='';
  [['R',61],['G',76],['B',245]].forEach(([k,v])=>{const d=document.createElement('div');d.className='cslider';d.innerHTML='<span style="color:#fff;width:20px">'+k+'</span><input type="range" min="0" max="255" value="'+v+'"><span style="color:#fff">'+v+'</span>';s.appendChild(d)});
}

/* settings + export */
function syncSettings(){
  if(!S.active)return;
  $('#setTotal').textContent='Total Waktu Pengeditan: '+fmtDur(S.active.durationMs);
}
function waitMs(ms){ return new Promise(resolve=>setTimeout(resolve,Math.max(0,ms))) }
function downloadBlob(blob, name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name;
  // FIX mobile/Termux browser: anchor harus di DOM agar klik programatik jalan
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ try{a.remove()}catch{}; URL.revokeObjectURL(url) },30000);
}
const _srcCache=new WeakMap(); // elemen -> MediaElementAudioSourceNode (hanya bisa dibuat 1x per elemen)
let _expCtx=null; // satu AudioContext dipakai ulang antar ekspor
function buildExportAudioStream(){
  const els=S.active.layers.filter(l=>l.mediaKind==='audio'||l.type==='audio'||l.mediaKind==='video'||l.type==='video').map(l=>l._aud||l._vid).filter(Boolean);
  if(!els.length) return null;
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx) return null;
    if(!_expCtx||_expCtx.state==='closed') _expCtx=new AudioCtx();
    const ctx=_expCtx;
    const dest=ctx.createMediaStreamDestination();
    const restore=els.map(el=>({el,muted:el.muted}));
    for(const el of els){
      let source=_srcCache.get(el);
      if(!source){ source=ctx.createMediaElementSource(el); _srcCache.set(el,source) }
      try{ source.disconnect() }catch{}
      source.connect(dest);
      el.muted=false;
    }
    ctx.resume().catch(()=>{});
    return {stream:dest.stream, restore:()=>{
      for(const x of restore) x.el.muted=x.muted;
      // FIX BUG: setelah ekspor, elemen media tetap terhubung ke MediaStreamDestination
      // (yang sudah berhenti) -> suara timeline HILANG. Sambungkan ulang ke speaker.
      try{
        for(const x of restore){
          const src=_srcCache.get(x.el);
          if(src){ try{src.disconnect()}catch{}; src.connect(ctx.destination); }
        }
        ctx.resume().catch(()=>{});
      }catch{}
    }};
  }catch{ return null }
}
async function finishExportVideo(blob, mime, name, st, restore, fpsHint){
  restore();
  const directName=mime.includes('mp4')?name+'.mp4':name+'.webm';
  // Jalur REALTIME (fallback): hasil = rekaman preview apa adanya, BUKAN
  // full render. Label jujur agar user bisa bedakan dari FULL RENDER.
  const why=S.expFallbackReason?(' ('+S.expFallbackReason+')'):'';
  st.textContent='Memfinalisasi MP4 (mode Realtime'+why+')...';
  const fpsQ=Math.max(1,Math.min(120,Math.round(fpsHint||exportSelFps()||60)));
  const qkey=exportSelQuality();
  try{
    const r=await fetch('/api/export/mp4?fps='+fpsQ+'&q='+qkey,{method:'POST',headers:{'Content-Type':mime||'video/webm'},body:blob});
    if(!r.ok) throw new Error('conversion failed');
    const out=await r.blob();
    if(out.size>1024){
      window.__amLastExport={blob:out,mode:'realtime',fps:fpsQ,quality:qkey,size:out.size};
      downloadBlob(out,name+'.mp4');
      st.textContent='Video diekspor (mode Realtime'+why+' — bukan Full Render).';
      expShowDone(true,'Export Selesai (Realtime)',
        'Rekaman preview '+fmtSize(out.size)+'. Untuk kualitas render penuh seperti AM, ulangi saat Full Render tersedia di browser ini.',true);
      return;
    }
    throw new Error('empty');
  }catch{
    downloadBlob(blob,directName);
    st.textContent='Video diekspor ('+directName.split('.').pop().toUpperCase()+').';
  }
}
/* ============================================================
   EXPORT FRAME-ACCURATE (WebCodecs + mp4-muxer)
   - Video: setiap frame dirender offline pada t = n/fps lalu
     di-encode dengan timestamp presisi -> hasil 100% @fps
     proyek (60fps), TIDAK tergantung kecepatan preview/render.
   - Audio: dirender offline (OfflineAudioContext) dari file media
     layer -> timeline tidak disentuh sama sekali (bug "suara
     hilang setelah ekspor" tidak mungkin terjadi di jalur ini).
   - Fallback otomatis ke MediaRecorder bila WebCodecs tak ada.
   ============================================================ */
let _muxMod=null;
async function loadMuxer(){
  if(_muxMod) return _muxMod;
  _muxMod=await import('./vendor/mp4-muxer.mjs');
  return _muxMod;
}
async function pickVideoEncCfg(w,h,fps){
  // Tuning quality-first utk export offline (bukan realtime):
  // latencyMode 'quality' + prefer-hardware bila ada. Bitrate mengikuti
  // pilihan Kualitas user (Hemat 0.5x … Ultra 2.5x dari basis resolusi).
  const bitrate=videoBitrate(w,h,exportSelQuality());
  const cands=['avc1.640028','avc1.4D0028','avc1.42E028','vp09.00.10.08'];
  for(const codec of cands){
    const cfg={codec,width:w,height:h,bitrate,framerate:fps,
      latencyMode:'quality',hardwareAcceleration:'prefer-hardware'};
    try{
      const s=await VideoEncoder.isConfigSupported(cfg);
      if(s.supported) return {cfg, muxCodec: codec.startsWith('avc')?'avc':'vp9'};
    }catch{}
  }
  return null;
}
async function pickAudioEncCfg(){
  const cands=[{codec:'mp4a.40.2',muxCodec:'aac'},{codec:'opus',muxCodec:'opus'}];
  for(const c of cands){
    const cfg={codec:c.codec,sampleRate:48000,numberOfChannels:2,bitrate:128000};
    try{
      const s=await AudioEncoder.isConfigSupported(cfg);
      if(s.supported) return {cfg,muxCodec:c.muxCodec};
    }catch{}
  }
  return null;
}
async function renderAudioOffline(P,durMs){
  // mixdown semua layer audio/video -> AudioBuffer 48kHz stereo.
  // Mengikuti logika drawMedia: want=((t-start)*speed+in)/1000, sehingga
  // durasi timeline (end-start) SELALU penuh meski file sumber lebih pendek
  // dari layer (sumber bug "media cuma 7 detik").
  const layers=P.layers.filter(l=>l.mediaSrc&&(l.type==='audio'||l.type==='video'||l.mediaKind==='audio'||l.mediaKind==='video'));
  if(!layers.length) return null;
  const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!OAC) return null;
  const SR=48000;
  const ctx=new OAC(2,Math.max(1,Math.ceil(durMs/1000*SR)),SR);
  let any=false;
  for(const l of layers){
    let buf=null;
    try{
      const r=await fetch(l.mediaSrc,{cache:'force-cache'});
      if(!r.ok) continue;
      buf=await ctx.decodeAudioData(await r.arrayBuffer());
    }catch{ continue }
    const rate=Math.min(16,Math.max(0.0625,l.speed||1));
    const inS=(l.inMs||0)/1000;
    const outS=Number.isFinite(l.outMs)?l.outMs/1000:Infinity;
    // panjang timeline layer ini (detik) — inilah yang harus terisi penuh
    const tlDur=Math.max(0,((l.endMs??durMs)-(l.startMs||0))/1000);
    if(tlDur<=0.001) continue;
    // kebutuhan sumber = tlDur*rate, dibatasi trim out & durasi file
    const avail=Math.max(0,Math.min(outS,buf.duration)-inS);
    if(avail<=0.001) continue;
    const srcDur=Math.min(avail,tlDur*rate);
    if(srcDur<=0.001) continue;
    const src=ctx.createBufferSource();
    src.buffer=buf; src.playbackRate.value=rate;
    try{
      const g=ctx.createGain();
      g.gain.value=clamp(l.volume??100,0,100)/100;
      src.connect(g); g.connect(ctx.destination);
    }catch{ src.connect(ctx.destination) }
    // start(when=tiletine, offset=inS, duration=srcDur) -> berbunyi tlDur detik
    src.start(Math.max(0,(l.startMs||0)/1000),inS,srcDur);
    any=true;
  }
  if(!any) return null;
  try{ return await ctx.startRendering() }catch{ return null }
}
// Tunggu seek semua layer video ke waktu t SEBELUM render frame.
// Tanpa ini export offline menggambar frame BASI (video beku/hitam) karena
// drawMedia hanya set currentTime tanpa await — preview terlihat benar
// (realtime) tapi hasil export choppy/salah.
function seekVideoLayersTo(time){
  const jobs=[];
  for(const l of S.active?.layers||[]){
    const v=l._vid;
    if(!v||l.type!=='video') continue;
    if(time<l.startMs||time>l.endMs) continue;
    try{
      const want=((time-l.startMs)*(l.speed||1)+(l.inMs||0))/1000;
      const maxS=Math.min(Number.isFinite(l.outMs)?l.outMs/1000:Infinity,(v.duration||Infinity))-0.03;
      const target=clamp(want,0,Math.max(0,maxS));
      if(!Number.isFinite(target)) continue;
      if(Math.abs((v.currentTime||0)-target)<=0.03) continue;
      if(v.readyState<1||!Number.isFinite(v.duration)||!v.duration) continue;
      jobs.push(new Promise((res)=>{
        let done=false;
        const to=setTimeout(()=>{ if(!done){ done=true; try{v.removeEventListener('seeked',on)}catch{}; res() } },900);
        const on=()=>{ if(!done){ done=true; clearTimeout(to); res() } };
        v.addEventListener('seeked',on,{once:true});
        try{ v.currentTime=target }catch{ if(!done){ done=true; clearTimeout(to); res() } }
      }));
    }catch{}
  }
  return Promise.all(jobs);
}
function pauseAllMedia(){
  for(const l of S.active?.layers||[]){
    try{ l._vid?.pause?.() }catch{}
    try{ l._aud?.pause?.() }catch{}
  }
}
/* ---------- UI progress export ---------- */
function expHideAll(){
  const p=$('#expProgWrap'), d=$('#expDoneWrap'); if(p) p.hidden=true; if(d) d.hidden=true;
  const rt=$('#expTryRt'); if(rt) rt.style.display='none';
  const sh=document.querySelector('.export-sheet'); if(sh) sh.classList.remove('busy');
  S.expCancel=false;
}
function expShowProgress(title){
  expHideAll();
  const p=$('#expProgWrap'); if(!p) return;
  $('#expProgTitle').textContent=title||'Mengekspor video…';
  $('#expBarFill').style.width='0%';
  $('#expPct').textContent='0%';
  $('#expEta').textContent='Menghitung sisa waktu…';
  $('#expElapsed').textContent='00:00';
  $('#expFrame').textContent='';
  p.hidden=false;
  const sh=document.querySelector('.export-sheet'); if(sh) sh.classList.add('busy');
}
function expClock(ms){ const s=Math.max(0,Math.round(ms/1000)); return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0') }
function expSetProgress(frac,elapsedMs,frameTxt,etaMs){
  const pct=Math.round(clamp(frac,0,1)*100);
  const f=$('#expBarFill'); if(f) f.style.width=pct+'%';
  const p=$('#expPct'); if(p) p.textContent=pct+'%';
  const e=$('#expEta'); if(e) e.textContent=(etaMs!=null&&etaMs>=0)?('ETA '+expClock(etaMs)):'Menghitung sisa waktu…';
  const el=$('#expElapsed'); if(el) el.textContent=expClock(elapsedMs);
  const fr=$('#expFrame'); if(fr&&frameTxt) fr.textContent=frameTxt;
}
function expShowDone(ok,title,info,canSave){
  expHideAll();
  const d=$('#expDoneWrap'); if(!d) return;
  $('#expDoneTick').textContent=ok?'✓':'!';
  $('#expDoneTick').style.background=ok?'#00C67A':'#E14E7A';
  $('#expDoneTitle').textContent=title;
  $('#expDoneInfo').textContent=info||'';
  const sv=$('#expSave'); if(sv) sv.style.display=canSave?'':'none';
  d.hidden=false;
  const sh=document.querySelector('.export-sheet'); if(sh) sh.classList.remove('busy');
}
function exportSelFps(){
  const m=($('#expFps')?.textContent||'').match(/(\d+)\s*fps/i);
  const f=m?+m[1]:Math.round(S.active?.fps||60);
  return Math.max(1,Math.min(120,Math.round(f)));
}
function shortOfExpRes(){
  const m=($('#expRes')?.textContent||'').match(/(\d+)\s*p/i);
  return m?+m[1]:null;
}
function exportDims(){
  // Resolusi export = render target SEBENARNYA: native (projW/H) diskala
  // sehingga sisi pendek == pilihan (naik maupun turun), aspek tetap,
  // sisi genap. Bukan upscale preview — scene dievaluasi ulang di target.
  const P=S.active;
  const nativeW=P.projW||P.w, nativeH=P.projH||P.h;
  return dimsForTargetShort(nativeW,nativeH,shortOfExpRes());
}
async function resolveExportDims(fps){
  // Pilih target tertinggi yang didukung encoder (step-down ala
  // device_capabilities AM). Menjamin dimensi yang dipakai SELALU valid.
  const P=S.active;
  const nativeW=P.projW||P.w, nativeH=P.projH||P.h;
  const want=exportDims();
  if(await pickVideoEncCfg(want.w,want.h,fps)) return want;
  const cur=shortOfExpRes()||Math.min(nativeW,nativeH);
  for(const s of RES_SHORT_STEPS){
    if(s>=cur) continue;
    const d=dimsForTargetShort(nativeW,nativeH,s);
    if(await pickVideoEncCfg(d.w,d.h,fps)) return d;
  }
  return want;
}
function expErrText(e){
  // Pesan error yang bisa dibaca user (VideoEncoder memberi DOMException;
  // event error bisa tanpa message -> jangan tampilkan "[object Object]").
  if(!e) return 'encoder error';
  if(typeof e==='string') return e.slice(0,120)||'encoder error';
  try{
    const m=String(e.message||e.name||'').slice(0,120);
    if(m) return (/^\[object /.test(m)||m==='[object Event]')?'encoder error':m;
    return 'encoder error';
  }catch{ return 'encoder error' }
}
// Tunggu antrean encode menyusut. BATAL (reject) bila encoder error atau
// timeout — versi lama `await dequeue` BISA GANTUNG SELAMANYA saat encoder
// mati (= progres export stuck, tidak pernah selesai/gagal).
function waitEncQueue(enc, getErr, ms=15000, limit=6){
  return new Promise((resolve,reject)=>{
    let done=false;
    const safeErr=()=>{ try{ return getErr&&getErr() }catch{ return null } };
    const finish=(fn,v)=>{ if(done) return; done=true; clearTimeout(to); clearInterval(iv); try{enc.removeEventListener('dequeue',onDeq)}catch{}; fn(v) };
    const to=setTimeout(()=>finish(reject,new Error('encoder macet (timeout antrean)')),ms);
    const iv=setInterval(()=>{ const e=safeErr(); if(e) finish(reject,e) },250);
    const onDeq=()=>{ const e=safeErr(); if(e){ finish(reject,e); return } let q=99; try{ q=enc.encodeQueueSize }catch{} if(q<=limit) finish(resolve) };
    const e0=safeErr(); if(e0){ finish(reject,e0); return }
    try{ if(enc.encodeQueueSize<=limit){ finish(resolve); return } }catch{ finish(resolve); return }
    try{ enc.addEventListener('dequeue',onDeq) }catch{ finish(resolve) }
  });
}
async function doExportVideoAccurate(st){
  // JALUR UTAMA — deterministic full render, independen dari preview:
  // frame i dievaluasi pada tMs[i]=i*1000/fps lalu diencode dgn timestamp
  // CFR tsUs[i]=round(i*1e6/fps). Tepat N=round(dur*fps/1000) frame.
  // Lambat = boleh (menunggu seek+GL per frame); drop = tidak.
  // GAGAL = error eksplisit + tombol "Coba Mode Realtime". TIDAK ADA
  // lagi silent fallback (sumber bug "kecentang tapi isinya preview").
  const P=S.active;
  const fps=exportSelFps();
  const durMs=Math.max(1,Math.round(P.durationMs));
  const plan=framePlanForExport(durMs,fps);
  const N=plan.N;
  const {w:outW,h:outH}=await resolveExportDims(plan.fps);
  if(outW<2||outH<2) throw new Error('resolusi ekspor tidak valid');
  const {Muxer,ArrayBufferTarget}=await loadMuxer();
  const v=await pickVideoEncCfg(outW,outH,plan.fps);
  if(!v) throw new Error('tidak ada encoder video yang didukung');
  const a=await pickAudioEncCfg();
  const muxer=new Muxer({target:new ArrayBufferTarget(),fastStart:'in-memory',
    video:{codec:v.muxCodec,width:outW,height:outH},
    ...(a?{audio:{codec:a.muxCodec,sampleRate:48000,numberOfChannels:2}}:{})});
  let encErr=null;
  const venc=new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m),error:e=>{encErr=e}});
  venc.configure(v.cfg);
  const prev={playing:S.playing,T:S.T,w:P.w,h:P.h};
  S.exporting=true; S.expOffline=true; S.playing=false; setPlayIcon(false); S.expCancel=false;
  pauseAllMedia();
  expShowProgress(`FULL RENDER ${outW}×${outH} @${fps}fps · ${N} frame · ${qualityDef(exportSelQuality()).label}`);
  const t0=performance.now();
  try{
    // tunggu render GL in-flight selesai (loop utama sudah pause via S.exporting)
    let guard=0;
    while((GL.busy||GL.pending)&&!GL.fail&&guard++<250) await waitMs(40);
    // pastikan semua video siap (metadata) sebelum render offline
    try{
      await Promise.all((P.layers||[]).filter(l=>l._vid&&l.type==='video').map(l=>{
        const v=l._vid;
        if(v.readyState>=1) return null;
        return new Promise((res)=>{
          const to=setTimeout(res,2500);
          v.addEventListener('loadedmetadata',()=>{clearTimeout(to);res()},{once:true});
          try{ v.load?.() }catch{}
        });
      }));
    }catch{}
    pauseAllMedia();
    const cv=document.createElement('canvas'); cv.width=outW; cv.height=outH;
    P.w=outW; P.h=outH;
    const keyInt=Math.max(1,Math.round(plan.fps*2)); // GOP 2 detik
    for(let i=0;i<N;i++){
      if(encErr) throw encErr;
      if(S.expCancel){ const e=new Error('dibatalkan'); e.cancel=true; throw e }
      const t=plan.tMs[i];
      await seekVideoLayersTo(t); // <-- kunci full-render: frame video tepat
      await renderAtAsync(t,cv);
      if(encErr) throw encErr;
      const frame=new VideoFrame(cv,{timestamp:plan.tsUs[i],duration:plan.frameDurUs});
      venc.encode(frame,{keyFrame:i%keyInt===0});
      frame.close();
      await waitEncQueue(venc,()=>encErr);
      // Progres + ETA SETIAP frame (dulu tiap 10 frame + ETA baru dari
      // frame ke-10 -> pada proyek berat terlihat "stuck menghitung sisa waktu").
      {
        const el=performance.now()-t0;
        const frac=(i+1)/N;
        const avg=el/(i+1);
        const eta=(i>=2)?Math.max(0,avg*(N-i-1)):-1;
        const spd=(1000/Math.max(1,avg)).toFixed(1);
        expSetProgress(frac,el,`Rendering frame ${(i+1).toLocaleString('id-ID')} / ${N.toLocaleString('id-ID')} · ${spd} fps`,eta);
      }
    }
    $('#expProgTitle').textContent='Encoding video…';
    await Promise.race([venc.flush(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('encoder macet saat flush video')),60000))]);
    if(encErr) throw encErr;
    // audio: mixdown offline (elemen timeline TIDAK disentuh)
    let audioBuf=null;
    try{ audioBuf=await renderAudioOffline(P,durMs) }catch{}
    if(audioBuf&&a&&window.AudioEncoder){
      $('#expProgTitle').textContent='Encoding audio…';
      const aenc=new AudioEncoder({output:(c,m)=>muxer.addAudioChunk(c,m),error:e=>{encErr=e}});
      aenc.configure(a.cfg);
      const ch0=audioBuf.getChannelData(0);
      const ch1=audioBuf.numberOfChannels>1?audioBuf.getChannelData(1):ch0;
      const block=48000; // 1 detik per chunk
      for(let off=0;off<audioBuf.length;off+=block){
        if(encErr) break;
        const n=Math.min(block,audioBuf.length-off);
        const data=new Float32Array(n*2);
        data.set(ch0.subarray(off,off+n),0);
        data.set(ch1.subarray(off,off+n),n);
        // timestamp MIKRODETIK: us = off/48000*1e6 (bug lama off/48
        // menumpuk semua audio di 1ms pertama).
        const ad=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:audioChunkTimestampUs(off,48000),data});
        aenc.encode(ad); ad.close();
        await waitEncQueue(aenc,()=>encErr,15000,8);
      }
      await aenc.flush();
      if(encErr) throw encErr;
      try{aenc.close()}catch{}
    }
    muxer.finalize();
    const blob=new Blob([muxer.target.buffer],{type:'video/mp4'});
    if(blob.size<1024) throw new Error('hasil mux kosong');
    window.__amLastExport={blob,w:outW,h:outH,fps:plan.fps,frames:N,audio:!!audioBuf,size:blob.size,tsUs:plan.tsUs.slice(0,8),frameDurUs:plan.frameDurUs,mode:'full-render',quality:exportSelQuality()}; // debug/harness
    downloadBlob(blob,P.name+'.mp4');
    expSetProgress(1,performance.now()-t0,null,0);
    expShowDone(true,'Export Complete (Full Render)',
      `${N} frame @ ${plan.fps}fps · ${outW}×${outH} · ${qualityDef(exportSelQuality()).label}${audioBuf?' · audio':''} · ${(blob.size/1e6).toFixed(1)}MB · ${expClock(performance.now()-t0)}`,true);
  }catch(e){
    if(e&&e.cancel){
      expShowDone(false,'Ekspor dibatalkan','Sebagian hasil dibuang. Proyek kamu tidak berubah.',false);
      return; // selesai — jangan fallback
    }
    throw e; // error lain: biarkan caller memutuskan (fallback realtime / pesan error)
  }finally{
    P.w=prev.w; P.h=prev.h;
    S.exporting=false; S.expOffline=false; S.playing=prev.playing; setPlayIcon(prev.playing); S.T=prev.T; updateTime();
    try{venc.close()}catch{}
  }
}
async function doExport(){
  const type=document.querySelector('input[name=expType]:checked')?.value||'video';
  const st=$('#expStatus');
  if(!S.active)return;
  if(type==='png'){
    const out=document.createElement('canvas');
    await renderAtAsync(S.T,out); // tunggu frame GL selesai (bukan kosong)
    const a=document.createElement('a');a.download=S.active.name+'.png';a.href=out.toDataURL('image/png');a.click();
    st.textContent='PNG diekspor.';return;
  }
  if(type==='paket'){
    const blob=new Blob([JSON.stringify(S.active)],{type:'application/json'});
    const a=document.createElement('a');a.download=S.active.name+'.amweb.json';a.href=URL.createObjectURL(blob);a.click();
    st.textContent='Paket proyek diunduh sebagai JSON.';return;
  }
  if(type==='video'||type==='seq'){
    if(S.exporting){ st.textContent='Export sedang berjalan, tunggu selesai.'; return }
    if(type==='video' && !window.VideoEncoder){
      // Tanpa WebCodecs tidak ada Full Render — tawarkan Realtime eksplisit.
      S.expFallbackReason='browser tanpa WebCodecs';
      expShowDone(false,'Full Render tidak tersedia',
        'Browser ini tidak mendukung WebCodecs. Mode Realtime = rekaman preview (kualitas & fps mengikuti kemampuan HP, bukan 60fps render).',false);
      const rt0=$('#expTryRt'); if(rt0) rt0.style.display='';
      return;
    }
    if(type==='video' && window.VideoEncoder){
      // validasi + step-down resolusi SEBELUM mulai (hasil selalu dimensi valid)
      const fpsSel=exportSelFps();
      const dims=await resolveExportDims(fpsSel);
      const chk=await pickVideoEncCfg(dims.w,dims.h,fpsSel);
      if(!chk){
        expShowDone(false,'Kombinasi tidak didukung',
          `${dims.w}×${dims.h} @${fpsSel}fps tidak didukung encoder browser ini. Turunkan resolusi atau FPS.`,false);
        return;
      }
      expHideAll();
      // jalur utama: FULL RENDER. Gagal = BERHENTI + tombol Coba Realtime.
      // (Dulu: otomatis pindah Realtime -> dikira "sudah ke-export" padahal
      // isinya rekaman preview, ukuran & fps tidak sesuai.)
      S.expFallbackReason='';
      try{ await doExportVideoAccurate(st); return }
      catch(e){
        if(e&&e.cancel) return; // sudah ditangani (UI done)
        S.expFallbackReason=expErrText(e);
        console.warn('[export] full render gagal:', e);
        expShowDone(false,'Full Render Gagal',
          'Penyebab: '+S.expFallbackReason+'. Proyek tidak berubah.',false);
        const rt=$('#expTryRt'); if(rt) rt.style.display='';
        return;
      }
    }
    // type==='seq' (urutan gambar) memakai jalur realtime kanvas.
    await doExportRealtime(st);
    return;
  }
  st.textContent='Opsi cloud belum tersedia di web. Gunakan Ekspor Video atau PNG.';
}
// Jalur REALTIME eksplisit: merekam preview apa adanya selama durasi.
// Hasil = kualitas preview (fps unik mengikuti kemampuan render HP),
// BUKAN 60fps render frame-demi-frame. Hanya jalan bila user menekan
// "Coba Mode Realtime" atau tipe 'seq'.
async function doExportRealtime(st){
    if(S.exporting){ st.textContent='Export sedang berjalan, tunggu selesai.'; return }
    st.textContent='Menyiapkan frame video...';
    // FIX: fallback realtime HARUS memakai pilihan user (resolusi+fps),
    // bukan w/h/fps proyek. Versi lama mengabaikan #expRes/#expFps ->
    // "hasil tidak sesuai" (resolusi & fps salah).
    const fbDims=exportDims();
    const out=document.createElement('canvas'); out.width=fbDims.w; out.height=fbDims.h;
    const fps=exportSelFps();
    const durMs=Math.max(0,Number(S.active.durationMs)||0);
    if(!(durMs>0)){ st.textContent='Durasi proyek tidak valid.'; return }
    const previous={playing:S.playing,T:S.T,w:S.active.w,h:S.active.h};
    let audioPack=null, watchdog=0;
    const restore=()=>{ S.exporting=false; S.expOffline=false; S.playing=previous.playing; setPlayIcon(S.playing); S.T=previous.T; try{ S.active.w=previous.w; S.active.h=previous.h }catch{}; updateTime(); try{audioPack?.restore()}catch{} if(watchdog)clearTimeout(watchdog); };
    // render fallback pada resolusi pilihan (P.w/h sementara = dims)
    S.active.w=fbDims.w; S.active.h=fbDims.h;
    let baseStream=null, videoTrack=null;
    try{
      baseStream=out.captureStream(0);
      videoTrack=baseStream.getVideoTracks()[0];
      if(!videoTrack||typeof videoTrack.requestFrame!=='function'){
        // fallback: capture otomatis pada fps
        try{ baseStream=out.captureStream(fps); videoTrack=baseStream.getVideoTracks()[0] }catch{}
      }
    }catch{}
    audioPack=buildExportAudioStream();
    const tracks=[videoTrack,...(audioPack?.stream?.getAudioTracks()||[])].filter(Boolean);
    let stream=null;
    try{ stream=new MediaStream(tracks) }catch{}
    const mime=[
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ].find(m=>{ try{return MediaRecorder.isTypeSupported(m)}catch{return false} })||'';
    if(!videoTrack||!stream||!window.MediaRecorder||!mime){ expHideAll(); restore(); st.textContent='Browser tidak mendukung ekspor video ini.'; return }
    let rec=null;
    try{ rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:videoBitrate(fbDims.w,fbDims.h,exportSelQuality())}) }
    catch{ expHideAll(); restore(); st.textContent='Browser tidak mendukung ekspor video ini.'; return }
    const chunks=[]; let finished=false;
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    rec.onerror=()=>{ if(finished)return; finished=true; expHideAll(); restore(); st.textContent='Ekspor video gagal.'; };
    rec.onstop=async()=>{
      if(finished)return; finished=true;
      const blob=new Blob(chunks,{type:mime||'video/webm'});
      await finishExportVideo(blob,mime,S.active.name,st,restore,fps);
    };
    S.exporting=true; S.playing=true; setPlayIcon(true); S.T=0; updateTime();
    // watchdog: rekaman dibatasi durasi + 15s (jangan sampai file kepanjangan)
    watchdog=setTimeout(()=>{ try{if(rec.state!=='inactive')rec.stop()}catch{} },durMs+15000);
    try{ rec.start(250) }catch{ expHideAll(); restore(); st.textContent='Ekspor video gagal dimulai.'; return }
    expShowProgress(`REALTIME ${fbDims.w}×${fbDims.h} — merekam preview (bukan Full Render)`);
    // ============================================================
    // FIX DURASI: waktu mengikuti JAM NYATA (wall clock), bukan
    // kecepatan render. Versi lama request frame sesuai kecepatan
    // render -> video hasil bisa 2-6x lebih panjang dari durasi
    // proyek. Sekarang: T = waktu berjalan, berhenti tepat di
    // durasi lalu rec.stop().
    // ============================================================
    const t0=performance.now();
    const canReq=typeof videoTrack.requestFrame==='function';
    // ============================================================
    // ASYNC-AWARE: tunggu frame GL selesai (renderAtAsync) sebelum
    // requestFrame — tanpa ini MediaRecorder merekam frame basi
    // (duplikat frame lama) saat render GL berat >16ms.
    // Waktu tetap JAM NYATA: T = waktu berjalan; frame berat hanya
    // menurunkan jumlah frame unik, bukan memperpanjang video.
    // ============================================================
    const tickExport=async()=>{
      if(finished) return;
      const el=performance.now()-t0;
      if(el>=durMs+120){
        try{if(rec.state!=='inactive')rec.stop();else if(!finished){finished=true;restore()}}catch{}
        return;
      }
      S.T=Math.min(durMs, el);
      try{ await renderAtAsync(S.T,out); }catch{}
      if(finished) return; // bisa selesai selama await
      if(canReq) videoTrack.requestFrame();
      if((S.T|0)%250<20) updateTime(); // playhead ikut jalan (hemat kerja)
      expSetProgress(el/durMs,el,`Merekam preview ${(el/1000).toFixed(1)}s / ${(durMs/1000).toFixed(1)}s`,-1);
      st.textContent='Merekam '+(el/1000).toFixed(1)+'s / '+(durMs/1000).toFixed(1)+'s — '+Math.round(el/durMs*100)+'%';
      requestAnimationFrame(tickExport);
    };
    requestAnimationFrame(tickExport);
    return;
}

/* Export via SERVER (Railway + Playwright headless):
   proyek + media diunggah, server merender frame-demi-frame dgn engine
   yg sama lalu mengembalikan MP4. Untuk HP tanpa WebCodecs. */
async function doExportViaServer(){
  const st=$('#expStatus');
  if(!S.active){ if(st) st.textContent='Tidak ada proyek aktif.'; return }
  if(S.exporting){ if(st) st.textContent='Export sedang berjalan, tunggu selesai.'; return }
  const P=S.active;
  const dims=exportDims();
  const fps=exportSelFps();
  const qkey=exportSelQuality();
  const durMs=Math.max(1,Math.round(P.durationMs));
  expShowProgress(`SERVER RENDER ${dims.w}×${dims.h} @${fps}fps · mengunggah…`);
  S.exporting=true; S.expCancel=false;
  try{
    const proj=JSON.parse(JSON.stringify({ ...P, layers:P.layers.map(stripLayer) }));
    const seen=new Map(); // url -> filename
    let mi=0;
    for(const l of proj.layers){
      const u=l.mediaSrc;
      if(!u||seen.has(u)) { if(u&&seen.has(u)) l.mediaSrc=seen.get(u); continue }
      let fn='media-'+(mi++)+'.bin';
      try{
        const base=decodeURIComponent(String(u).split('/').pop().split('?')[0]);
        if(base&&base.includes('.')) fn=base;
        else {
          const low=String(u).toLowerCase();
          const ext=low.includes('.mp4')?'.mp4':low.includes('.mov')?'.mov':low.includes('.webm')?'.webm':low.includes('.png')?'.png':low.includes('.jpg')||low.includes('.jpeg')?'.jpg':low.includes('.webp')?'.webp':low.includes('.gif')?'.gif':low.includes('.mp3')?'.mp3':low.includes('.wav')?'.wav':'.bin';
          fn='media-'+mi+ext;
        }
      }catch{}
      seen.set(u,fn); l.mediaSrc=fn;
    }
    const fd=new FormData();
    fd.append('project',JSON.stringify(proj));
    fd.append('fps',String(fps)); fd.append('width',String(dims.w)); fd.append('height',String(dims.h));
    fd.append('quality',qkey); fd.append('durationMs',String(durMs));
    for(const [u,fn] of seen){
      const r=await fetch(u);
      if(!r.ok) throw new Error('media tidak terbaca: '+fn);
      fd.append('media',await r.blob(),fn);
    }
    expShowProgress(`SERVER RENDER ${dims.w}×${dims.h} @${fps}fps · antre…`);
    const pr=await fetch('/api/export/server-render',{method:'POST',body:fd});
    const pj=await pr.json().catch(()=>null);
    if(!pr.ok||!pj||!pj.jobId) throw new Error((pj&&pj.error)||'server menolak job');
    const t0=performance.now();
    for(;;){
      if(S.expCancel){ S.exporting=false; expShowDone(false,'Ekspor dibatalkan','Job server tetap jalan hingga selesai di antrean.',false); return }
      await waitMs(2000);
      const sr=await fetch('/api/export/server-render/'+pj.jobId);
      const sj=await sr.json().catch(()=>null);
      if(!sr.ok||!sj) throw new Error('gagal memantau job');
      if(sj.status==='error') throw new Error('server: '+(sj.error||'gagal render'));
      const frac=Math.max(0,Math.min(1,sj.progress||0));
      const el=performance.now()-t0;
      expSetProgress(frac,el,`Server merender frame ${Math.round(frac*(sj.frames||0)).toLocaleString('id-ID')} / ${(sj.frames||0).toLocaleString('id-ID')}`,frac>0.02?el/frac*(1-frac):-1);
      if(sj.status==='done'){
        const a=document.createElement('a');
        a.href='/api/export/server-render/'+pj.jobId+'/file';
        a.download=(P.name||'ekspor')+'.mp4';
        document.body.appendChild(a); a.click();
        setTimeout(()=>{ try{a.remove()}catch{} },5000);
        window.__amLastExport={mode:'server-render',fps:sj.fps,w:sj.w,h:sj.h,frames:sj.frames,size:sj.fileSize,quality:qkey};
        expSetProgress(1,el,null,0);
        expShowDone(true,'Export Complete (Server Render)',
          `${sj.frames} frame @ ${sj.fps}fps · ${sj.w}×${sj.h} · ${fmtSize(sj.fileSize||0)} · ${expClock(el)}`,false);
        break;
      }
    }
  }catch(e){
    expShowDone(false,'Server Render Gagal','Penyebab: '+expErrText(e)+'. Proyek tidak berubah.',false);
  }finally{
    S.exporting=false;
  }
}

function bindTimelineScrub(){
  const ruler=$('#ruler'); if(!ruler) return;
  const seek=(e)=>{
    if(!S.active) return;
    const r=ruler.getBoundingClientRect();
    S.T=clamp(((e.clientX-r.left)-S.tl.laneW)/tlPps()*1000,0,S.active.durationMs);
    updateTime();
  };
  ruler.addEventListener('pointerdown',e=>{ try{ ruler.setPointerCapture(e.pointerId) }catch{}; seek(e) });
  ruler.addEventListener('pointermove',e=>{ if(ruler.hasPointerCapture(e.pointerId)) seek(e) });
}
/* ============================================================
   GESTURE TIMELINE — pinch zoom horizontal (2 jari), scroll
   horizontal/vertical native, tombol zoom & kecepatan putar.
   Zoom mengubah pps (px/detik) saja: durasi & playback tetap.
   ============================================================ */
function timeAtClientX(cx){
  const vp=$('#tlViewport'); if(!vp) return 0;
  const r=vp.getBoundingClientRect();
  return Math.max(0,((cx-r.left)+vp.scrollLeft-S.tl.laneW)/tlPps()*1000);
}
function setTimelineZoom(pps,cx,anchorT){
  const vp=$('#tlViewport'); if(!vp) return;
  S.tl.pps=Math.min(S.tl.maxPps,Math.max(S.tl.minPps,pps));
  updateTimelineLayout(); renderLayerBar();
  // jaga titik waktu (anchor) tetap di posisi layar yang sama
  const r=vp.getBoundingClientRect();
  vp.scrollLeft=Math.max(0,S.tl.laneW+(anchorT/1000)*tlPps()-(cx-r.left));
}
function zoomTimelineCenter(k){
  const vp=$('#tlViewport'); if(!vp) return;
  const r=vp.getBoundingClientRect();
  const cx=r.left+vp.clientWidth/2;
  setTimelineZoom(tlPps()*k,cx,timeAtClientX(cx));
}
function bindTimelineGestures(){
  const vp=$('#tlViewport'); if(!vp) return;
  const ptrs=new Map(); let pinch=null;
  vp.addEventListener('pointerdown',e=>{
    if(e.target.closest('.tl-seg')||e.target.closest('.tl-left')||e.target.id==='ruler') return;
    ptrs.set(e.pointerId,e.clientX);
    if(ptrs.size===2){
      const xs=[...ptrs.values()];
      pinch={d0:Math.max(24,Math.abs(xs[0]-xs[1])), pps0:tlPps(), anchor:timeAtClientX((xs[0]+xs[1])/2)};
      vp.style.overflow='hidden'; // cegah native scroll saat pinch
    }
  });
  vp.addEventListener('pointermove',e=>{
    if(!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId,e.clientX);
    if(pinch&&ptrs.size>=2){
      const xs=[...ptrs.values()];
      const d=Math.max(24,Math.abs(xs[0]-xs[1]));
      setTimelineZoom(pinch.pps0*d/pinch.d0,(xs[0]+xs[1])/2,pinch.anchor);
    }
  });
  const end=e=>{
    ptrs.delete(e.pointerId);
    if(ptrs.size<2){ pinch=null; vp.style.overflow='' }
  };
  vp.addEventListener('pointerup',end);
  vp.addEventListener('pointercancel',end);
  vp.addEventListener('pointerleave',end);
  if($('#tlZoomIn')) $('#tlZoomIn').onclick=()=>zoomTimelineCenter(1.4);
  if($('#tlZoomOut')) $('#tlZoomOut').onclick=()=>zoomTimelineCenter(1/1.4);
  if($('#tlFit')) $('#tlFit').onclick=()=>{ S.tl.pps=tlFitPps(); $('#tlViewport').scrollLeft=0; updateTimelineLayout(); renderLayerBar() };
  const sb=$('#tlSpeed');
  if(sb) sb.onclick=()=>{
    const R=[0.25,0.5,1,1.5,2];
    S.playRate=R[(R.indexOf(S.playRate||1)+1)%R.length]||1;
    sb.textContent=S.playRate+'\u00d7';
    syncAudio();
  };
  let rto=0;
  window.addEventListener('resize',()=>{
    clearTimeout(rto);
    rto=setTimeout(()=>{ if(!S.active) return; updateTimelineLayout(); renderLayerBar(); },150);
  });
}

/* preview drag */
function compToBox(l,px,py){
  // px comp -> unit kotak -50..50 (abaikan skew; rotasi diperhitungkan).
  const T=S.T;
  const x=evalProp(l,'x',T), y=evalProp(l,'y',T);
  let dx=0,dy=0,drot=0,tsx=1,tsy=1;
  try{ const tr=applyTransformFx(l.fx||[],T,evalFxParam,S.active.durationMs,l);
    dx=tr.dx||0; dy=tr.dy||0; drot=tr.drot||0; tsx=tr.sx||1; tsy=tr.sy||1 }catch{}
  const rot=((evalProp(l,'rot',T)||0)+drot)*Math.PI/180;
  const sxu=Math.max(0.2,Math.abs(evalProp(l,'sx',T)||200)/200*tsx);
  const syu=Math.max(0.2,Math.abs(evalProp(l,'sy',T)||200)/200*tsy);
  const qx=px-x-dx, qy=py-y-dy;
  const ca=Math.cos(-rot), sa=Math.sin(-rot);
  return [(qx*ca-qy*sa)/sxu,(qx*sa+qy*ca)/syu,sxu];
}
function bindPreviewDrag(){
  const cv=$('#preview');let drag=null;
  cv.addEventListener('pointerdown',e=>{
    const l=S.active?.layers.find(x=>x.id===S.sel);if(!l)return;
    // Mode kuas: gambar langsung di preview, bukan geser layer.
    if(l.type==='drawing'&&l.draw&&S.drawTool){
      e.preventDefault();
      pushUndo();
      const r=cv.getBoundingClientRect();
      const px=(e.clientX-r.left)*(S.active.w/r.width), py=(e.clientY-r.top)*(S.active.h/r.height);
      const [bx,by,sxu]=compToBox(l,px,py);
      const st={pts:[[bx,by]],color:S.drawTool==='eraser'?'#000000':(l.draw.brushColor||'#111111'),
        w:(l.draw.brush||46)/sxu,eraser:S.drawTool==='eraser'};
      l.draw.manual.push(st);
      drag={draw:true};
      try{cv.setPointerCapture(e.pointerId)}catch{}
      renderFrame(); return;
    }
    drag={x:e.clientX,y:e.clientY,lx:l.x,ly:l.y};try{cv.setPointerCapture(e.pointerId)}catch{}
  });
  cv.addEventListener('pointermove',e=>{
    if(!drag)return;
    if(drag.draw){
      const l=S.active?.layers.find(x=>x.id===S.sel);
      if(!l||!l.draw) return;
      const r=cv.getBoundingClientRect();
      const px=(e.clientX-r.left)*(S.active.w/r.width), py=(e.clientY-r.top)*(S.active.h/r.height);
      const [bx,by]=compToBox(l,px,py);
      const st=l.draw.manual[l.draw.manual.length-1];
      if(st){ const q=st.pts[st.pts.length-1];
        if(Math.hypot(bx-q[0],by-q[1])>0.35){ st.pts.push([bx,by]); renderFrame() } }
      return;
    }
    const r=cv.getBoundingClientRect();const sx=S.active.w/r.width,sy=S.active.h/r.height;const l=S.active.layers.find(x=>x.id===S.sel);if(!l)return;l.x=drag.lx+(e.clientX-drag.x)*sx;l.y=drag.ly+(e.clientY-drag.y)*sy;updateSelectBox()});
  cv.addEventListener('pointerup',()=>{if(drag){const wasDraw=drag.draw;drag=null;if(wasDraw){const l=S.active?.layers.find(x=>x.id===S.sel);if(l&&l.draw)l.draw.rev=(l.draw.rev||0)+1;afterChange()}else{pushUndo();renderBottom()}}});
}

/* ============================================================
   HEADLESS API utk server-render (Railway + Playwright).
   Dipakai driver server, BUKAN user: memuat proyek + media dari job,
   merender PNG per frame & WAV mixdown dgn engine yg SAMA persis
   (preview/export/full-render), lalu ffmpeg di server yg mux jadi MP4.
   Aktif selalu (tanpa DOM) — aman di headless Chromium.
   ============================================================ */
function encodeWavBuffer(ab){
  const nCh=Math.min(2,ab.numberOfChannels), sr=ab.sampleRate, n=ab.length;
  const buf=new ArrayBuffer(44+n*nCh*2), dv=new DataView(buf);
  const wstr=(o,s)=>{ for(let i=0;i<s.length;i++) dv.setUint8(o+i,s.charCodeAt(i)) };
  wstr(0,'RIFF'); dv.setUint32(4,36+n*nCh*2,true); wstr(8,'WAVEfmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,nCh,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*nCh*2,true);
  dv.setUint16(32,nCh*2,true); dv.setUint16(34,16,true); wstr(36,'data');
  dv.setUint32(40,n*nCh*2,true);
  const chs=[]; for(let c=0;c<nCh;c++) chs.push(ab.getChannelData(c));
  let o=44;
  for(let i=0;i<n;i++) for(let c=0;c<nCh;c++){
    const v=Math.max(-1,Math.min(1,chs[c][i]));
    dv.setInt16(o,v<0?v*0x8000:v*0x7FFF,true); o+=2;
  }
  return new Uint8Array(buf);
}
window.__amHeadless = {
  // job: {project, mediaBase, w?, h?} — mediaBase diakhiri '/'.
  async loadJob(job){
    const P=job&&job.project;
    if(!P||!P.layers) throw new Error('proyek job tidak valid');
    const base=String(job.mediaBase||'');
    for(const l of P.layers){
      delete l._img; delete l._vid; delete l._aud;
      delete l._imgErr; delete l._audErr; delete l._waveBusy; delete l.wave;
      if(l.mediaSrc){
        try{
          const raw=decodeURIComponent(String(l.mediaSrc).split('/').pop().split('?')[0]);
          l.mediaSrc=base+encodeURIComponent(raw);
        }catch{ /* pertahankan */ }
      }
    }
    if(job.w) P.w=job.w;
    if(job.h) P.h=job.h;
    S.projects=[P]; S.pkgCache=null; S.sel=null; S.showAdd=false;
    window.__amRenderPaused=true; // hentikan loop preview (hemat CPU)
    S.playing=false; S.T=0;
    try{ openProject(P.id) }catch(e){ throw new Error('openProject: '+e.message) }
    // tunggu media siap (siap-tayang, bukan sempurna): video metadata,
    // gambar complete; batas 30 dtk agar job tak gantung.
    const t0=performance.now();
    for(;;){
      let pending=0;
      for(const l of P.layers){
        if(l._vid&&l.type==='video'&&!l._imgErr){ try{ if(l._vid.readyState<1) pending++ }catch{ pending++ } }
        if(l._img&&!l._img.complete&&!l._imgErr) pending++;
      }
      if(!pending) break;
      if(performance.now()-t0>30000) break;
      await waitMs(250);
    }
    try{ await warmGL() }catch{}
    return { w:P.w, h:P.h, fps:P.fps, durationMs:P.durationMs, layers:P.layers.length };
  },
  setSize(w,h){ if(S.active){ S.active.w=w; S.active.h=h } },
  getInfo(){
    const P=S.active;
    if(!P) throw new Error('belum ada proyek');
    const plan=framePlanForExport(Math.max(1,Math.round(P.durationMs)),Math.round(P.fps||60));
    return { w:P.w, h:P.h, fps:plan.fps, durationMs:plan.durMs, frames:plan.N };
  },
  async renderPng(tMs){
    const P=S.active;
    if(!P) throw new Error('belum ada proyek');
    S.expOffline=true;
    try{
      await seekVideoLayersTo(tMs);
      const cv=document.createElement('canvas');
      await renderAtAsync(tMs,cv);
      const blob=await new Promise((res,rej)=>cv.toBlob((b)=>b?res(b):rej(new Error('toBlob gagal')),'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
    } finally { S.expOffline=false }
  },
  async renderWav(){
    const P=S.active;
    if(!P) throw new Error('belum ada proyek');
    const buf=await renderAudioOffline(P,Math.max(1,Math.round(P.durationMs)));
    if(!buf) return null;
    return encodeWavBuffer(buf);
  },
};

/* ============================================================
   DRAWING STUDIO — workspace terpisah (ibis-style).
   Koordinat NATIVE canvas (0..w × 0..h) = sumber kebenaran.
   Viewport {zoom,panX,panY} hanya tampilan. Replay/export/scrub
   memakai doc-time + canvas coords. Bukan timeline video.
   ============================================================ */
const DW = { doc:null, tool:'brush', color:'#111111', size:14, layerId:null,
  playing:false, lastTs:0, dirty:true, undo:[], recState:null, autoImg:null };
function drawStoreLoad(){ try{ return JSON.parse(localStorage.getItem('am_draw_docs')||'[]') }catch{ return [] } }
function drawStoreSave(list){ try{ localStorage.setItem('am_draw_docs',JSON.stringify(list)) }catch(e){ toast('Penyimpanan penuh — hapus gambar lama') } }
function dwSave(){
  if(!DW.doc) return;
  const list=drawStoreLoad();
  const i=list.findIndex(d=>d.id===DW.doc.id);
  const snap=JSON.parse(JSON.stringify(DW.doc));
  if(i>=0) list[i]=snap; else list.unshift(snap);
  drawStoreSave(list);
}
function dwUndoPush(){
  if(!DW.doc) return;
  DW.undo.push(JSON.stringify(DW.doc));
  if(DW.undo.length>20) DW.undo.shift();
}
function dwUndo(){
  const p=DW.undo.pop(); if(!p||!DW.doc) return;
  const vp=DW.doc.viewport, rp=DW.doc.replay;
  DW.doc=JSON.parse(p); DW.doc.viewport=DW.doc.viewport||vp; DW.doc.replay=DW.doc.replay||rp;
  DW.dirty=true; dwSave(); renderDrawAll();
}
function newDrawDoc(name,w,h,dpi,bg){
  return { id:uid(), name:(name||'Gambar').slice(0,48), w, h, dpi:dpi||null, bg:bg||'#FFFFFF',
    createdAt:Date.now(), durationMs:1000,
    layers:[{ id:uid(), name:'Layer 1', visible:true, opacity:100, strokes:[] }],
    viewport:{zoom:1,panX:0,panY:0}, replay:{t:0,playing:false,speed:1} };
}
function openDrawDoc(id){
  const doc=drawStoreLoad().find(d=>d.id===id);
  if(!doc){ toast('Gambar tidak ada'); return }
  DW.doc=doc; DW.layerId=(doc.layers[0]||{}).id||null;
  DW.tool='brush'; DW.playing=false; DW.undo=[]; DW.dirty=true;
  doc.viewport=doc.viewport||{zoom:1,panX:0,panY:0};
  doc.replay=doc.replay||{t:0,playing:false,speed:1};
  $('#viewHome').classList.remove('active'); $('#viewEditor').classList.remove('active');
  $('#viewDraw').classList.add('active');
  $('#drName').value=doc.name;
  buildDrawTools(); fitDrawView(false); renderDrawLayers();
  requestAnimationFrame(drawLoop);
}
function closeDraw(){
  dwSave(); DW.doc=null; DW.playing=false;
  $('#viewDraw').classList.remove('active'); $('#viewHome').classList.add('active');
  renderProjects();
}
/* ---------- viewport: murni tampilan ---------- */
function drawFit(){ // zoom agar pas + origin tengah
  const wrap=$('#drWrap'), doc=DW.doc;
  if(!wrap||!doc) return {z:1,ox:0,oy:0};
  const r=wrap.getBoundingClientRect();
  const z=Math.min(r.width/doc.w,r.height/doc.h)||1;
  return { z, ox:(r.width-doc.w*z)/2, oy:(r.height-doc.h*z)/2 };
}
function drawTransform(){
  const doc=DW.doc, f=drawFit(), vp=doc.viewport;
  const z=f.z*(vp.zoom||1);
  return { z, ox:f.ox+(vp.panX||0), oy:f.oy+(vp.panY||0) };
}
function screenToCanvas(sx,sy){
  const r=$('#drWrap').getBoundingClientRect(), t=drawTransform();
  return [(sx-r.left-t.ox)/t.z,(sy-r.top-t.oy)/t.z];
}
function zoomDrawAt(sx,sy,factor){
  const doc=DW.doc; if(!doc) return;
  const [cx,cy]=screenToCanvas(sx,sy);
  doc.viewport.zoom=Math.max(0.1,Math.min(8,(doc.viewport.zoom||1)*factor));
  const r=$('#drWrap').getBoundingClientRect(), t=drawTransform();
  doc.viewport.panX+= (sx-r.left)-(cx*t.z+t.ox);
  doc.viewport.panY+= (sy-r.top)-(cy*t.z+t.oy);
  DW.dirty=true;
}
function fitDrawView(reset){
  const doc=DW.doc; if(!doc) return;
  if(reset){ doc.viewport.zoom=1; doc.viewport.panX=0; doc.viewport.panY=0 }
  DW.dirty=true;
}
/* ---------- render ---------- */
function drawBacking(){
  // Resolusi raster tampilan (geometri tetap native).
  const doc=DW.doc;
  const k=Math.min(1,2048/Math.max(doc.w,doc.h));
  return { W:Math.max(2,Math.round(doc.w*k)), H:Math.max(2,Math.round(doc.h*k)), k };
}
function drawRefImage(layer){
  if(layer._img) return layer._img;
  const ref=layer.auto&&layer.auto.refData;
  if(!ref||layer._loading) return null;
  layer._loading=true;
  const img=new Image();
  img.onload=()=>{ layer._img=img; layer._loading=false; DW.dirty=true };
  img.onerror=()=>{ layer._loading=false };
  img.src=ref;
  return null;
}
// Render dokumen ke ctx berukuran W×H pada doc-time T.
function renderDocTo(ctx,W,H,T,speed){
  const doc=DW.doc;
  ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=doc.bg||'#FFFFFF';
  ctx.fillRect(0,0,W,H);
  const k=W/doc.w;
  const tmp=_drawStudioTmp();
  for(const L of doc.layers){
    if(L.visible===false) continue;
    if(tmp.width!==W||tmp.height!==H){ tmp.width=W; tmp.height=H }
    const g=tmp.getContext('2d');
    g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.globalCompositeOperation='source-over';
    g.clearRect(0,0,W,H);
    // goresan timed (manual + sketsa auto)
    for(const s of (L.strokes||[])){
      const pts=visiblePoints(s,T,speed);
      if(pts.length<1) continue;
      g.strokeStyle=s.color||'#111'; g.lineWidth=Math.max(0.5,(s.size||8)*k);
      g.lineCap='round'; g.lineJoin='round';
      g.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';
      g.globalAlpha=Math.max(0,Math.min(1,(s.opacity==null?100:s.opacity)/100));
      g.beginPath();
      g.moveTo(pts[0][0]*k,pts[0][1]*k);
      if(pts.length===1) g.lineTo(pts[0][0]*k+0.01,pts[0][1]*k+0.01);
      for(let i=1;i<pts.length;i++) g.lineTo(pts[i][0]*k,pts[i][1]*k);
      g.stroke();
    }
    g.globalCompositeOperation='source-over'; g.globalAlpha=1;
    // wash reveal auto (topeng inkremental per-render, murah: ≤~1500 cakram)
    const au=L.auto;
    if(au&&au.wash&&au.wash.pts){
      const img=drawRefImage(L);
      const fr=docRevealAt(T,au).wash;
      const kk=Math.floor(fr*(au.wash.pts.length-1));
      if(img&&kk>=0){
        const m=_drawStudioMask();
        if(m.width!==W||m.height!==H){ m.width=W; m.height=H }
        const mg=m.getContext('2d');
        mg.setTransform(1,0,0,1,0,0); mg.globalCompositeOperation='source-over';
        mg.clearRect(0,0,W,H);
        mg.fillStyle='#fff'; mg.strokeStyle='#fff';
        mg.lineWidth=Math.max(2,(au.brush||40)*1.1*k); mg.lineCap='round'; mg.lineJoin='round';
        mg.beginPath();
        mg.moveTo(au.wash.pts[0][0]*k,au.wash.pts[0][1]*k);
        for(let j=1;j<=kk;j++) mg.lineTo(au.wash.pts[j][0]*k,au.wash.pts[j][1]*k);
        mg.stroke();
        const cut=document.createElement('canvas'); cut.width=W; cut.height=H;
        const cg=cut.getContext('2d');
        const mp=au.map||{x:0,y:0,w:doc.w,h:doc.h,rotation:0};
        cg.save();
        cg.translate((mp.x+mp.w/2)*k,(mp.y+mp.h/2)*k);
        cg.rotate((mp.rotation||0)*Math.PI/180);
        cg.drawImage(img,-mp.w/2*k,-mp.h/2*k,mp.w*k,mp.h*k);
        cg.restore();
        cg.globalCompositeOperation='destination-in';
        cg.drawImage(m,0,0);
        g.drawImage(cut,0,0);
      }
    }
    ctx.save();
    ctx.globalAlpha=Math.max(0,Math.min(1,(L.opacity==null?100:L.opacity)/100));
    ctx.drawImage(tmp,0,0);
    ctx.restore();
  }
  // pena di kepala gambar (mode human yg sedang berjalan)
  for(const L of doc.layers){
    if(L.visible===false||!L.auto||L.auto.mode!=='human') continue;
    const au=L.auto, fr=docRevealAt(T,au);
    if((fr.sketch<=0&&fr.wash<=0)||(fr.sketch>=1&&fr.wash>=1)) continue;
    let hx=null, hy=null;
    if(fr.wash>0&&au.wash&&au.wash.pts.length){
      const p=au.wash.pts[Math.min(au.wash.pts.length-1,Math.floor(fr.wash*(au.wash.pts.length-1)))];
      hx=p[0]; hy=p[1];
    } else {
      outer: for(let i=L.strokes.length-1;i>=0;i--){
        const pts=visiblePoints(L.strokes[i],T,speed);
        if(pts.length){ const q=pts[pts.length-1]; hx=q[0]; hy=q[1]; break outer }
      }
    }
    if(hx===null) continue;
    const br=Math.max(3,(au.brush||40)*0.62*k);
    ctx.save();
    ctx.strokeStyle='rgba(17,17,17,.9)'; ctx.lineWidth=Math.max(1.5,br*0.14);
    ctx.beginPath(); ctx.arc(hx*k,hy*k,br,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#111';
    ctx.beginPath(); ctx.arc(hx*k,hy*k,Math.max(1.5,br*0.13),0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}
function _drawStudioTmp(){
  if(!_drawStudioTmp._c) _drawStudioTmp._c=document.createElement('canvas');
  return _drawStudioTmp._c;
}
function _drawStudioMask(){
  if(!_drawStudioMask._c) _drawStudioMask._c=document.createElement('canvas');
  return _drawStudioMask._c;
}
/* ---------- loop + kanvas layar ---------- */
function drawLoop(ts){
  if(!$('#viewDraw').classList.contains('active')||!DW.doc) return;
  const rp=DW.doc.replay;
  if(DW.playing){
    if(!DW.lastTs) DW.lastTs=ts;
    const dt=ts-DW.lastTs; DW.lastTs=ts;
    rp.t+=dt*(rp.speed||1);
    if(rp.t>=DW.doc.durationMs){ rp.t=DW.doc.durationMs; DW.playing=false; setDrawPlayIcon() }
    DW.dirty=true; syncDrawTransport();
  } else DW.lastTs=ts;
  if(DW.dirty){ renderDrawScreen(); DW.dirty=false }
  requestAnimationFrame(drawLoop);
}
function renderDrawScreen(){
  const doc=DW.doc; if(!doc) return;
  const cv=$('#drawCanvas'), wrap=$('#drWrap');
  const r=wrap.getBoundingClientRect();
  const {W,H}=drawBacking();
  if(cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H }
  renderDocTo(cv.getContext('2d'),W,H,doc.replay.t,doc.replay.speed||1);
  const t=drawTransform();
  cv.style.width=(doc.w*t.z)+'px'; cv.style.height=(doc.h*t.z)+'px';
  cv.style.left=t.ox+'px'; cv.style.top=t.oy+'px';
  void r;
}
function renderDrawAll(){ buildDrawTools(); renderDrawLayers(); syncDrawTransport(); DW.dirty=true }
function setDrawPlayIcon(){ $('#drPlay').textContent=DW.playing?'⏸':'▶' }
function syncDrawTransport(){
  const doc=DW.doc; if(!doc) return;
  $('#drTime').textContent=fmtClock(doc.replay.t)+' / '+fmtClock(doc.durationMs);
  $('#drProgFill').style.width=Math.round(Math.max(0,Math.min(1,doc.replay.t/doc.durationMs))*100)+'%';
  $('#drSpeed').textContent=(doc.replay.speed||1)+'×';
  setDrawPlayIcon();
}
/* ---------- gesture: 1 jari gambar, 2 jari pan/pinch ---------- */
function bindDrawGestures(){
  const wrap=$('#drWrap');
  const ptrs=new Map(); let pinch=null, stroke=null;
  const pos=(e)=>[e.clientX,e.clientY];
  wrap.addEventListener('pointerdown',e=>{
    if(!DW.doc) return;
    try{ wrap.setPointerCapture(e.pointerId) }catch{}
    ptrs.set(e.pointerId,pos(e));
    if(ptrs.size===2){
      const xs=[...ptrs.values()];
      pinch={ d0:Math.max(24,Math.hypot(xs[0][0]-xs[1][0],xs[0][1]-xs[1][1])),
        zoom0:DW.doc.viewport.zoom||1, cx:(xs[0][0]+xs[1][0])/2, cy:(xs[0][1]+xs[1][1])/2,
        px:(xs[0][0]+xs[1][0])/2, py:(xs[0][1]+xs[1][1])/2 };
      stroke=null; return;
    }
    if(DW.tool==='pan'||!drawTargetLayer()){ stroke=null; return }
    // 1 jari + tool gambar -> goresan baru (waktu doc = replay.t)
    const [cx,cy]=screenToCanvas(e.clientX,e.clientY);
    dwUndoPush();
    stroke={ id:uid(), tool:DW.tool==='eraser'?'eraser':'brush',
      color:DW.tool==='eraser'?'#000000':DW.color,
      size:DW.size, opacity:100, startT:DW.doc.replay.t, pts:[[cx,cy,0]], t0:performance.now() };
    const L=drawTargetLayer(); L.strokes.push(stroke);
    DW.doc.durationMs=Math.max(DW.doc.durationMs,stroke.startT+1);
    DW.dirty=true;
  });
  wrap.addEventListener('pointermove',e=>{
    if(!DW.doc||!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId,pos(e));
    if(pinch&&ptrs.size>=2){
      const xs=[...ptrs.values()];
      const d=Math.max(24,Math.hypot(xs[0][0]-xs[1][0],xs[0][1]-xs[1][1]));
      const cx=(xs[0][0]+xs[1][0])/2, cy=(xs[0][1]+xs[1][1])/2;
      // jangkar: titik canvas di tengah jari harus tetap di tengah jari
      const [acx,acy]=screenToCanvas(cx,cy);
      DW.doc.viewport.zoom=Math.max(0.1,Math.min(8,pinch.zoom0*d/pinch.d0));
      const r=$('#drWrap').getBoundingClientRect(), t=drawTransform();
      DW.doc.viewport.panX+=(cx-r.left)-(acx*t.z+t.ox);
      DW.doc.viewport.panY+=(cy-r.top)-(acy*t.z+t.oy);
      // pan dua jari mengikuti gerakan tengah
      DW.doc.viewport.panX+=(cx-pinch.px); DW.doc.viewport.panY+=(cy-pinch.py);
      pinch.px=cx; pinch.py=cy;
      DW.dirty=true; return;
    }
    if(stroke){
      const [cx,cy]=screenToCanvas(e.clientX,e.clientY);
      const q=stroke.pts[stroke.pts.length-1];
      if(Math.hypot(cx-q[0],cy-q[1])>Math.max(0.75,1.5/((drawTransform().z)||1))){
        stroke.pts.push([cx,cy,performance.now()-stroke.t0]);
        const L=drawTargetLayer();
        if(L) DW.doc.durationMs=Math.max(DW.doc.durationMs,stroke.startT+stroke.pts[stroke.pts.length-1][2]);
        DW.dirty=true;
      }
      return;
    }
    if(ptrs.size===1&&(DW.tool==='pan')){
      // geser 1 jari saat tool Geser
      const [px,py]=ptrs.get(e.pointerId);
      DW.doc.viewport.panX+=e.clientX-px; DW.doc.viewport.panY+=e.clientY-py;
      ptrs.set(e.pointerId,pos(e));
      DW.dirty=true;
    }
  });
  const end=e=>{
    ptrs.delete(e.pointerId);
    if(ptrs.size<2) pinch=null;
    if(stroke){ stroke=null; dwSave(); DW.dirty=true }
  };
  wrap.addEventListener('pointerup',end);
  wrap.addEventListener('pointercancel',end);
  wrap.addEventListener('wheel',e=>{
    if(!DW.doc) return;
    e.preventDefault();
    zoomDrawAt(e.clientX,e.clientY,e.deltaY<0?1.15:1/1.15);
  },{passive:false});
}
function drawTargetLayer(){
  const doc=DW.doc; if(!doc) return null;
  return doc.layers.find(l=>l.id===DW.layerId&&l.visible!==false)
    || doc.layers.find(l=>l.visible!==false) || null;
}
/* ---------- toolbar, layer, transport ---------- */
function buildDrawTools(){
  const bar=$('#drTools'); if(!bar) return;
  bar.innerHTML='';
  const mk=(label,active,fn)=>{
    const b=document.createElement('button'); b.textContent=label;
    if(active) b.classList.add('active'); b.onclick=fn; bar.appendChild(b); return b;
  };
  mk('Kuas',DW.tool==='brush',()=>{DW.tool='brush';buildDrawTools()});
  mk('Penghapus',DW.tool==='eraser',()=>{DW.tool='eraser';buildDrawTools()});
  mk('Geser',DW.tool==='pan',()=>{DW.tool='pan';buildDrawTools()});
  const col=document.createElement('input'); col.type='color'; col.value=DW.color;
  col.oninput=()=>{DW.color=col.value}; bar.appendChild(col);
  const sz=document.createElement('button'); sz.textContent='∅ '+(DW.size|0);
  sz.onclick=()=>{
    const v=prompt('Ukuran kuas (px canvas):',String(DW.size));
    const n=Math.max(1,Math.min(400,+v||DW.size)); DW.size=n; buildDrawTools();
  };
  bar.appendChild(sz);
  mk('↩ Undo',false,()=>dwUndo());
  const vb=document.createElement('div'); vb.className='dr-viewbtns'; vb.style.flex='1';
  const bFit=document.createElement('button'); bFit.textContent='Fit';
  bFit.onclick=()=>fitDrawView(true);
  const bIn=document.createElement('button'); bIn.textContent='＋';
  bIn.onclick=()=>{ const r=$('#drWrap').getBoundingClientRect(); zoomDrawAt(r.left+r.width/2,r.top+r.height/2,1.25) };
  const bOut=document.createElement('button'); bOut.textContent='－';
  bOut.onclick=()=>{ const r=$('#drWrap').getBoundingClientRect(); zoomDrawAt(r.left+r.width/2,r.top+r.height/2,1/1.25) };
  const b11=document.createElement('button'); b11.textContent='1:1';
  b11.onclick=()=>{ if(DW.doc){ DW.doc.viewport.zoom=1/Math.max(0.01,drawFit().z); DW.doc.viewport.panX=0; DW.doc.viewport.panY=0; DW.dirty=true } };
  vb.append(bFit,bIn,bOut,b11); bar.appendChild(vb);
}
function renderDrawLayers(){
  const p=$('#drLayersPanel'); if(!p||!DW.doc) return;
  p.innerHTML='';
  const add=document.createElement('button'); add.className='mini'; add.textContent='+ Layer';
  add.onclick=()=>{ dwUndoPush(); DW.doc.layers.push({id:uid(),name:'Layer '+(DW.doc.layers.length+1),visible:true,opacity:100,strokes:[]}); DW.layerId=DW.doc.layers[DW.doc.layers.length-1].id; dwSave(); renderDrawLayers(); DW.dirty=true };
  p.appendChild(add);
  [...DW.doc.layers].reverse().forEach(L=>{
    const d=document.createElement('div');
    d.className='dr-layer'+(L.id===DW.layerId?' active':'');
    const eye=document.createElement('button'); eye.textContent=L.visible===false?'🚫':'👁';
    eye.onclick=(e)=>{ e.stopPropagation(); L.visible=L.visible===false?true:false; dwSave(); renderDrawLayers(); DW.dirty=true };
    const nm=document.createElement('span'); nm.style.flex='1'; nm.textContent=L.name+' ('+(L.strokes||[]).length+')';
    const del=document.createElement('button'); del.textContent='✕';
    del.onclick=(e)=>{ e.stopPropagation(); if(DW.doc.layers.length<=1){ toast('Minimal 1 layer'); return } dwUndoPush(); DW.doc.layers=DW.doc.layers.filter(x=>x.id!==L.id); if(DW.layerId===L.id) DW.layerId=DW.doc.layers[0].id; DW.doc.durationMs=docDuration(DW.doc); dwSave(); renderDrawLayers(); DW.dirty=true };
    d.onclick=()=>{ DW.layerId=L.id; renderDrawLayers() };
    d.append(eye,nm,del); p.appendChild(d);
  });
}
function bindDrawChrome(){
  $('#drBack').onclick=closeDraw;
  $('#drName').oninput=e=>{ if(DW.doc){ DW.doc.name=e.target.value.slice(0,48); dwSave() } };
  $('#drLayers').onclick=()=>{ const p=$('#drLayersPanel'); p.hidden=!p.hidden };
  $('#drExport').onclick=drawExportMenu;
  $('#drPlay').onclick=()=>{
    if(!DW.doc) return;
    if(!DW.playing&&DW.doc.replay.t>=DW.doc.durationMs-1) DW.doc.replay.t=0;
    DW.playing=!DW.playing; DW.lastTs=0; setDrawPlayIcon();
  };
  $('#drRestart').onclick=()=>{ if(DW.doc){ DW.doc.replay.t=0; DW.dirty=true; syncDrawTransport() } };
  $('#drSpeed').onclick=()=>{
    if(!DW.doc) return;
    const i=(REPLAY_SPEEDS.indexOf(DW.doc.replay.speed)+1)%REPLAY_SPEEDS.length;
    DW.doc.replay.speed=REPLAY_SPEEDS[i<0?2:i]||1; syncDrawTransport();
  };
  $('#drProgWrap').onclick=(e)=>{
    if(!DW.doc) return;
    const r=e.currentTarget.getBoundingClientRect();
    DW.doc.replay.t=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*DW.doc.durationMs;
    DW.dirty=true; syncDrawTransport();
  };
  $('#drAuto').onclick=openAutoSheet;
  $('#autoClose').onclick=()=>{ $('#sheetAuto').hidden=true };
}
/* ---------- auto draw: mapping + generate ---------- */
const AUTO = { img:null, iw:0, ih:0, mode:'fit', scale:1, tx:0.5, ty:0.5, rot:0,
  speedId:'normal', customSpeed:700, recordSpeed:1, drawMode:'human', brush:40 };
function openAutoSheet(){
  if(!DW.doc){ toast('Buka gambar dulu'); return }
  $('#sheetAuto').hidden=false;
  const body=$('#autoBody'); body.innerHTML='';
  const pick=document.createElement('button'); pick.className='btn-export'; pick.textContent='Pilih gambar referensi';
  pick.onclick=()=>$('#drawPickStudio').click();
  let fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='image/*';
  fileInput.id='drawPickStudio'; fileInput.hidden=true;
  fileInput.onchange=(e)=>{ const f=e.target.files[0]; e.target.value=''; if(f) loadAutoRef(f) };
  body.append(pick,fileInput);
  const cfg=document.createElement('div'); cfg.id='autoCfg'; cfg.hidden=true; body.appendChild(cfg);
  if(AUTO.img) buildAutoCfg();
}
function loadAutoRef(f){
  const url=URL.createObjectURL(f);
  const img=new Image();
  img.onload=()=>{
    AUTO.img=img; AUTO.iw=img.naturalWidth; AUTO.ih=img.naturalHeight;
    try{URL.revokeObjectURL(url)}catch{}
    buildAutoCfg();
  };
  img.onerror=()=>toast('Gambar tidak terbaca');
  img.src=url;
}
function autoMapping(){
  const doc=DW.doc;
  return mapImageToCanvas(AUTO.iw,AUTO.ih,doc.w,doc.h,
    {mode:AUTO.mode,scale:AUTO.scale,tx:AUTO.tx,ty:AUTO.ty,offX:0,offY:0,rotation:AUTO.rot});
}
function buildAutoCfg(){
  const cfg=$('#autoCfg'); if(!cfg||!AUTO.img) return;
  cfg.hidden=false; cfg.innerHTML='';
  const doc=DW.doc;
  const thumb=document.createElement('canvas'); thumb.width=180;
  thumb.height=Math.max(40,Math.round(180*doc.h/doc.w));
  thumb.style.cssText='width:180px;border-radius:8px;background:#222';
  cfg.appendChild(thumb);
  const drawThumb=()=>{
    const mp=autoMapping();
    const g=thumb.getContext('2d');
    g.setTransform(1,0,0,1,0,0); g.fillStyle='#222'; g.fillRect(0,0,thumb.width,thumb.height);
    const k=thumb.width/doc.w;
    g.save();
    g.translate((mp.x+mp.w/2)*k,(mp.y+mp.h/2)*k); g.rotate(mp.rotation*Math.PI/180);
    g.drawImage(AUTO.img,-mp.w/2*k,-mp.h/2*k,mp.w*k,mp.h*k);
    g.restore();
    g.strokeStyle='#00E08A'; g.setLineDash([5,4]);
    g.strokeRect(mp.x*k,mp.y*k,mp.w*k,mp.h*k); g.setLineDash([]);
  };
  const rowMode=document.createElement('div'); rowMode.className='mini-row';
  ['fit','fill','original','custom'].forEach(m=>{
    const b=document.createElement('button'); b.className='mini';
    b.textContent={fit:'Fit',fill:'Fill',original:'Asli',custom:'Custom'}[m]+(AUTO.mode===m?' ✓':'');
    b.onclick=()=>{ AUTO.mode=m; buildAutoCfg() };
    rowMode.appendChild(b);
  });
  cfg.appendChild(rowMode);
  const eta=document.createElement('div'); eta.className='iq-status'; eta.id='autoEta';
  const updEta=()=>{ eta.textContent=autoEtaText() };
  if(AUTO.mode==='custom') sliderRow(cfg,'Skala',AUTO.scale,0.1,3,v=>{AUTO.scale=v;drawThumb()},{live:true});
  sliderRow(cfg,'Pos X',AUTO.tx,0,1,v=>{AUTO.tx=v;drawThumb()},{live:true});
  sliderRow(cfg,'Pos Y',AUTO.ty,0,1,v=>{AUTO.ty=v;drawThumb()},{live:true});
  sliderRow(cfg,'Rotasi',AUTO.rot,-180,180,v=>{AUTO.rot=v;drawThumb()},{live:true});
  const rowSp=document.createElement('div'); rowSp.className='mini-row';
  DRAW_SPEEDS.forEach(s=>{
    const b=document.createElement('button'); b.className='mini';
    b.textContent=s.label+(AUTO.speedId===s.id?' ✓':'');
    b.onclick=()=>{ AUTO.speedId=s.id; buildAutoCfg() };
    rowSp.appendChild(b);
  });
  cfg.appendChild(rowSp);
  sliderRow(cfg,'Custom px/dtk',AUTO.customSpeed,30,6000,v=>{AUTO.customSpeed=v;AUTO.speedId='custom';updEta()},{live:true});
  const rowRs=document.createElement('div'); rowRs.className='mini-row';
  const rsLb=document.createElement('span'); rsLb.style.cssText='color:#111;font-size:13px;align-self:center';
  rsLb.textContent='Record:'; rowRs.appendChild(rsLb);
  [0.5,1,2,4,8].forEach(rv=>{
    const b=document.createElement('button'); b.className='mini'; b.textContent=rv+'x'+(AUTO.recordSpeed===rv?' ✓':'');
    b.onclick=()=>{ AUTO.recordSpeed=rv; buildAutoCfg() };
    rowRs.appendChild(b);
  });
  cfg.appendChild(rowRs);
  const rowMd=document.createElement('div'); rowMd.className='mini-row';
  [['human','Human Draw'],['instant','Instant']].forEach(([v,t])=>{
    const b=document.createElement('button'); b.className='mini';
    b.textContent=t+(AUTO.drawMode===v?' ✓':'');
    b.onclick=()=>{ AUTO.drawMode=v; buildAutoCfg() };
    rowMd.appendChild(b);
  });
  cfg.appendChild(rowMd);
  cfg.appendChild(eta); updEta();
  const go=document.createElement('button'); go.className='btn-export'; go.textContent='Generate';
  go.onclick=generateAutoDraw;
  cfg.appendChild(go);
  const st=document.createElement('div'); st.className='iq-status'; st.id='autoProg'; st.hidden=true;
  cfg.appendChild(st);
  drawThumb();
}
function autoSpeedPx(){
  if(AUTO.speedId==='custom') return AUTO.customSpeed;
  return (DRAW_SPEEDS.find(s=>s.id===AUTO.speedId)||DRAW_SPEEDS[2]).px;
}
function autoEtaText(){
  const doc=DW.doc; if(!doc||!AUTO.img) return '';
  // Estimasi dari kompleksitas aktual (tepi dihitung cepat di res kecil).
  return 'Kecepatan '+(AUTO.speedId==='custom'?AUTO.customSpeed+' px/dtk':(DRAW_SPEEDS.find(s=>s.id===AUTO.speedId)||{}).label||'')
    +' · mode '+AUTO.drawMode+' · record '+AUTO.recordSpeed+'x. Estimasi tepat dihitung saat Generate.';
}
async function generateAutoDraw(){
  const doc=DW.doc, L=drawTargetLayer();
  if(!doc||!L||!AUTO.img){ toast('Pilih gambar dulu'); return }
  const st=$('#autoProg');
  const say=(m)=>{ if(st){st.hidden=false;st.textContent=m} };
  try{
    say('Analyzing…'); await new Promise(r=>setTimeout(r,0));
    const mp=autoMapping();
    // tepi pada res kerja (koordinat dipetakan ke canvas native)
    const ww=240, wh=Math.max(2,Math.round(240*AUTO.ih/AUTO.iw));
    const wc=document.createElement('canvas'); wc.width=ww; wc.height=wh;
    const wg=wc.getContext('2d',{willReadFrequently:true});
    wg.drawImage(AUTO.img,0,0,ww,wh);
    const id=wg.getImageData(0,0,ww,wh).data;
    const gray=new Uint8Array(ww*wh);
    for(let i=0;i<ww*wh;i++) gray[i]=(id[i*4]+id[i*4+1]+id[i*4+2])/3;
    say('Generating sketsa…'); await new Promise(r=>setTimeout(r,0));
    const raw=chainStrokes(sobelEdges(gray,ww,wh,110),ww,wh,2.2,3,6000);
    // peta ke canvas: rotasi di sekitar pusat rect bila perlu
    const rot=(mp.rotation||0)*Math.PI/180, ca=Math.cos(rot), sa=Math.sin(rot);
    const toCanvas=(px,py)=>{
      let x=mp.x+px/ww*mp.w, y=mp.y+py/wh*mp.h;
      if(rot){ const cx=mp.x+mp.w/2, cy=mp.y+mp.h/2;
        x=cx+(x-cx)*ca-(y-cy)*sa; y=cy+(x-cx)*sa+(y-cy)*ca }
      return [x,y];
    };
    const edgeStrokes=raw.map(pts=>pts.map(p=>toCanvas(p[0],p[1])));
    // sapuan warna serpentine LANGSUNG di koordinat canvas native
    // (di atas rect mapping — posisi/proporsi = reference).
    const spacing=Math.max(6,Math.min(mp.w,mp.h)/36);
    const coverPts=[], coverCum=[0]; let covTotal=0, qx=1e18, qy=0;
    let row=0;
    for(let y=mp.y+spacing/2;y<mp.y+mp.h;y+=spacing,row++){
      const xs=[];
      for(let x=mp.x+spacing/2;x<mp.x+mp.w;x+=spacing) xs.push(x);
      if(row%2) xs.reverse();
      for(const x of xs){
        coverPts.push([x,y]);
        if(qx<1e17) covTotal+=Math.hypot(x-qx,y-qy);
        coverCum.push(covTotal); qx=x; qy=y;
      }
    }
    if(rot){ const cx=mp.x+mp.w/2, cy=mp.y+mp.h/2;
      for(const p of coverPts){ const dx=p[0]-cx, dy=p[1]-cy;
        p[0]=cx+dx*ca-dy*sa; p[1]=cy+dx*sa+dy*ca } }
    say('Menyusun timing…'); await new Promise(r=>setTimeout(r,0));
    const plan=planAutoStrokes(edgeStrokes,coverPts,coverCum,autoSpeedPx(),AUTO.recordSpeed);
    dwUndoPush();
    // referensi warna (persist, ≤1024px)
    const rs=Math.min(1,1024/Math.max(AUTO.iw,AUTO.ih));
    const rc2=document.createElement('canvas');
    rc2.width=Math.max(2,Math.round(AUTO.iw*rs)); rc2.height=Math.max(2,Math.round(AUTO.ih*rs));
    rc2.getContext('2d').drawImage(AUTO.img,0,0,rc2.width,rc2.height);
    const refData=rc2.toDataURL('image/jpeg',0.85);
    L.strokes.push(...plan.strokes.map(s=>({ id:uid(), tool:'brush', color:'#23232b',
      size:Math.max(1.5,Math.min(mp.w,mp.h)/280), opacity:100, startT:s.startT,
      pts:s.pts.map(p=>[p[0],p[1],p[2]]) })));
    L.auto={ mode:AUTO.drawMode, sketchMs:plan.sketchMs, colorMs:plan.colorMs,
      brush:Math.max(8,spacing*1.6), refData, map:{x:mp.x,y:mp.y,w:mp.w,h:mp.h,rotation:mp.rotation},
      wash:plan.wash };
    L._img=null; L._loading=false;
    doc.durationMs=Math.max(doc.durationMs,plan.totalMs);
    doc.replay.t=0;
    dwSave(); renderDrawLayers(); DW.dirty=true; syncDrawTransport();
    $('#sheetAuto').hidden=true;
    toast(AUTO.drawMode==='instant'?'Instant selesai':'Human Draw siap: '+fmtClock(plan.totalMs));
  }catch(e){ say('Gagal: '+((e&&e.message)||e)) }
}
function drawExportMenu(){
  if(!DW.doc) return;
  const d=DW.doc;
  $('#drExpPngSub').textContent=d.w+'×'+d.h+' px';
  $('#sheetDrawExport').hidden=false;
}
function bindDrawExport(){
  $('#drExpClose').onclick=()=>{ $('#sheetDrawExport').hidden=true };
  $('#drExpGo').onclick=()=>{
    const t=document.querySelector('input[name=drExpType]:checked')?.value||'png';
    $('#sheetDrawExport').hidden=true;
    if(t==='png') drawExportPng();
    else if(t==='video') drawExportVideo();
    else drawToVideoProject();
  };
}
function drawExportPng(){
  const doc=DW.doc; if(!doc) return;
  const st=$('#drStatus'); st.textContent='Merender PNG '+doc.w+'×'+doc.h+'…';
  setTimeout(()=>{
    try{
      const cv=document.createElement('canvas'); cv.width=doc.w; cv.height=doc.h;
      renderDocTo(cv.getContext('2d'),doc.w,doc.h,doc.durationMs,1);
      cv.toBlob(b=>{
        if(!b){ st.textContent='Gagal membuat PNG.'; return }
        downloadBlob(b,(doc.name||'gambar')+'.png');
        st.textContent='PNG tersimpan ('+(b.size/1e6).toFixed(1)+'MB).';
      },'image/png');
    }catch(e){ st.textContent='Gagal: '+(e.message||e) }
  },30);
}
async function drawExportVideo(){
  const doc=DW.doc; if(!doc) return;
  const st=$('#drStatus');
  const speed=doc.replay.speed||1;
  const cv=$('#drawCanvas');
  let stream=null;
  try{ stream=cv.captureStream(30) }catch{ st.textContent='Browser tidak mendukung rekam kanvas.'; return }
  const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9','video/webm']
    .find(m=>{ try{return MediaRecorder.isTypeSupported(m)}catch{return false} })||'';
  if(!mime){ st.textContent='Browser tidak mendukung MediaRecorder.'; return }
  const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  const chunks=[];
  rec.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data) };
  const done=new Promise(res=>{ rec.onstop=res });
  doc.replay.t=0; DW.playing=true; DW.lastTs=0; setDrawPlayIcon();
  st.textContent='Merekam replay '+speed+'x…';
  try{ rec.start(250) }catch{ st.textContent='Gagal merekam.'; return }
  const t0=performance.now();
  const watch=setInterval(()=>{
    st.textContent='Merekam '+( (performance.now()-t0)/1000).toFixed(1)+' dtk…';
    if(!DW.playing){ clearInterval(watch); try{rec.stop()}catch{} }
  },500);
  await done;
  clearInterval(watch);
  const blob=new Blob(chunks,{type:mime.split(';')[0]||'video/webm'});
  const ext=blob.type.includes('mp4')?'.mp4':'.webm';
  downloadBlob(blob,(doc.name||'gambar')+ext);
  st.textContent='Video tersimpan ('+(blob.size/1e6).toFixed(1)+'MB).';
}
// Jembatan: gambar -> proyek video (image layer full-bleed).
function drawToVideoProject(){
  const doc=DW.doc; if(!doc) return;
  const st=$('#drStatus'); st.textContent='Menyiapkan proyek video…';
  setTimeout(()=>{
    const cv=document.createElement('canvas'); cv.width=doc.w; cv.height=doc.h;
    renderDocTo(cv.getContext('2d'),doc.w,doc.h,doc.durationMs,1);
    cv.toBlob(b=>{
      if(!b){ st.textContent='Gagal.'; return }
      const url=URL.createObjectURL(b);
      const p=defaultProject(doc.name,doc.w,doc.h,60,'#000000');
      S.projects.unshift(p); saveProjects(S.projects);
      S.active=p; S.T=0; S.playing=false; S.sel=null; S.showAdd=false; S.undoStack=[]; S.redoStack=[];
      const l=makeShape('rect'); l.type='image'; l.mediaKind='image';
      l.name='Dari Drawing'; l.mediaSrc=url; l.sx=2*doc.w; l.sy=2*doc.h;
      p.layers.push(l);
      const img=new Image(); img.onload=()=>{ l._img=img; renderFrame() }; img.src=url;
      $('#viewDraw').classList.remove('active'); $('#viewEditor').classList.add('active');
      $('#edName').value=p.name;
      DW.doc=null; DW.playing=false;
      sizePreview(); renderLayerBar(); renderBottom(); requestAnimationFrame(loop);
      warmGL();
      toast('Dikirim ke Video Editor');
    },'image/png');
  },30);
}
/* boot */
function boot(){
  renderTpl(); renderProjects(); bindCreate(); bindEditor();
  bindDrawChrome(); bindDrawGestures(); bindDrawExport();
  $('#iqLink').value=EXAMPLE_LINK; $('#cpLink').value=EXAMPLE_LINK;
  // seed demo if empty
  if(!S.projects.length){
    const d=defaultProject('Proyek Baru 91',960,1560,60,'#00A651');
    const a=makeShape('roundrect','#E14E7A');a.name='Persegi...ulat 1';a.x=480;a.y=700;a.sx=200;a.sy=200;d.layers.push(a);
    const b=makeShape('roundrect','#3DDC84');b.name='Persegi...ulat 2';b.x=560;b.y=560;d.layers.push(b);
    d.durationMs=2000;
    // keep in memory only, not saved until edited
  }
  sizePreview();
}
boot();
