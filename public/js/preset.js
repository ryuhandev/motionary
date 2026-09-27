// ============================================================
// preset.js — parse XML scene Alight Motion -> project editor.
//
// FIX vs versi lama:
//  1. sx/sy = size*scale*2 (dulu *4 -> semua layer preset tampil
//     2x lebih besar dari kotak preview = "foto & box tidak sesuai")
//  2. Urutan layer DIBALIK saat import (dokumen XML AM = panel
//     layer atas->bawah; array layers = urutan paint bawah->atas)
//  3. Keyframe location/scale/rotation kini DIPARSE (dulu di-skip
//     -> animasi shake/zoom preset tidak jalan)
//  4. Trim media inTime/outTime + speed ikut dibawa
// ============================================================
export const EXAMPLE_LINK = 'https://alightcreative.com/am/share/u/6JkzSLrotfTuykgz8jqCmBktchJ3/p/fwzw6tN4ha-c791f96b154ca7ce';
const uid = ()=> 'id'+Math.random().toString(36).slice(2,9);
function num(v, d=0){ const n=parseFloat(v); return Number.isFinite(n)?n:d }
function scalar(v, d=0){ const s=String(v).trim().toLowerCase(); if(s==='true')return 1; if(s==='false')return 0; return num(v,d) }
function attr(el, names, d){
  if(!el||!el.getAttribute) return d;
  for(const n of names){ const v=el.getAttribute(n); if(v!=null&&v!=='') return v }
  return d;
}
function mapEase(e){
  e=String(e||'linear').toLowerCase().trim();
  // cubicBezier AM asli: "cubicBezier x1 y1 x2 y2" (opsional prefiks "reverse")
  const bz=e.match(/^(reverse\s+)?cubicbezier\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)$/);
  if(bz) return (bz[1]?'reverse ':'')+'cubicbezier '+bz.slice(2).map(Number).join(' ');
  if(e.startsWith('reverse ')){
    const inner=mapEase(e.slice(8));
    return inner==='linear'?'linear':'reverse '+inner;
  }
  if(e.includes('elastic')) return 'elastic';
  if(e.includes('cubic')||e.includes('bezier')) return 'cubic';
  if(e.includes('bounce')) return 'bounce';
  if(e.includes('cyclic')||e.includes('cycle')) return 'cyclic';
  if(e.startsWith('random')){
    // AM: "random x1 y1 x2 y2 chaos seed" — bagian bezier dipakai,
    // chaos (mis. 0.0) tak menambah acakan (terkalibrasi: hasil linear)
    const m=e.match(/^random\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
    return m? ('random '+m.slice(1).join(' ')) : 'random';
  }
  if(e.includes('random')||e.includes('acak')) return 'random';
  if(e.includes('step')||e.includes('hold')) return 'steps';
  return 'linear';
}
function argbToHex(v, fb='#E14E7A'){
  if(v==null) return fb;
  v=String(v).trim();
  if(v.startsWith('#')){
    const h=v.slice(1);
    if(h.length===8) return '#'+h.slice(2,8).toUpperCase();
    if(h.length===6) return '#'+h.toUpperCase();
    return fb;
  }
  return fb;
}
function argbAlpha(v){
  v=String(v||'').trim();
  if(v.startsWith('#')){
    const h=v.slice(1);
    if(h.length===8) return parseInt(h.slice(0,2),16)/255;
  }
  return 1;
}
// Normalisasi blending AM -> kunci blendMap app (pure, bisa diuji).
// 'linear-dodge' (dipakai preset) = add/lighter; tak dikenal -> normal
// (JANGAN fallback ke exposure — itu yang merusak render).
export function normalizeBlend(b){
  const n=String(b||'normal').toLowerCase().replace(/[^a-z]/g,'');
  const map={normal:'normal',multiply:'multiply',darken:'darken',darkercolor:'darken',
    colorburn:'color-burn',burnlinear:'color-burn',linearburn:'burn-linear',
    screen:'screen',colordodge:'color-dodge',dodgelinear:'add',add:'add',
    lineardodge:'add',lighten:'lighten',lightercolor:'lighten',
    overlay:'overlay',softlight:'soft-light',softoverlay:'soft-light',
    hardlight:'hard-light',vividlight:'hard-light',pinlight:'hard-light',
    difference:'difference',exclusion:'exclusion',subtract:'difference',
    divide:'difference',hue:'hue',saturation:'saturation',color:'color',
    luminosity:'luminosity'};
  return map[n]||'normal';
}
// 'googlefonts?name=Roboto&weight=400' -> {family, weight, stack CSS}.
// Font proprietary AM tidak dibundel; mapping ini + FontFace best-effort
// (Google Fonts CDN) + fallback sistem.
export function fontStackFor(fontAttr){
  const s=String(fontAttr||'');
  const m=s.match(/name=([^&]+).*?weight=(\d+)/);
  const fam=m?decodeURIComponent(m[1].replace(/\+/g,' ')):'sans-serif';
  const wt=m?+m[2]:400;
  const generic=/mono/i.test(fam)?'monospace':(/\bserif\b/i.test(fam)&&!/sans/i.test(fam))?'serif':'sans-serif';
  return { family:fam, weight:wt, stack:'"'+fam+'",'+generic };
}
// s=".rect" AM -> kind renderer. Tak dikenal -> 'rect' (terdokumentasi).
export function shapeKindOf(sAttr){
  const n=String(sAttr||'.rect').toLowerCase().replace(/^\./,'');
  const known=['rect','roundrect','circle','tri','triangle','star','plus','donut',
    'arrow','line','wideline','moon','pie','teardrop','arc','quad','poly','penta',
    'multifoil','calloutrr','stamp'];
  if(known.includes(n)) return n;
  if(n==='ellipse') return 'circle';
  return 'rect';
}
function vec(s){
  if(!s) return null;
  const p=String(s).split(/[,\s]+/).map(Number);
  if(p.length>=2&&p.every(Number.isFinite)) return p;
  return null;
}
function normToMs(tN, sMs, eMs){
  const t=parseFloat(tN);
  if(!Number.isFinite(t)) return Math.round(sMs);
  return Math.round(sMs + t*(eMs-sMs));
}
function parseKfList(propEl, sMs, eMs, vScale=1){
  const out=[];
  propEl.querySelectorAll('kf').forEach(k=>{
    const tN=k.getAttribute('t')??'0';
    const v=num(k.getAttribute('v'),0)*vScale;
    const e=k.getAttribute('e')||'linear';
    out.push({t:normToMs(tN,sMs,eMs), v, ease:mapEase(e)});
  });
  out.sort((a,b)=>a.t-b.t);
  return out;
}
// keyframe vec2/vec3 -> dua list skalar (komponen 0 & 1)
function parseKfVec(propEl, sMs, eMs){
  const A=[], B=[];
  propEl.querySelectorAll('kf').forEach(k=>{
    const t=normToMs(k.getAttribute('t')??'0',sMs,eMs);
    const v=vec(k.getAttribute('v'))||[0,0];
    const e=mapEase(k.getAttribute('e')||'linear');
    A.push({t, v:v[0], ease:e});
    B.push({t, v:v[1], ease:e});
  });
  A.sort((a,b)=>a.t-b.t); B.sort((a,b)=>a.t-b.t);
  return [A,B];
}
function mapFxId(name){
  const n=String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  // ---- pencocokan EKSAK dulu (sebelum includes() liar). N =(normalized).
  // Alasan: 'pulsate' mengandung 'sat', 'spinblur' mengandung 'spin',
  // 'stretchsegment' mengandung 'stretch', 'shakeparts' mengandung 'shake' —
  // semuanya dulu jatuh ke id yang SALAH (audit efek).
  if(n.includes('shakeparts')) return 'shake-parts';
  if(n.includes('spinblur2')) return 'spinblur2';
  if(n.includes('spinblur')) return 'spinblur';
  if(n.includes('stretchsegment')) return 'stretchsegment';
  if(n.includes('pulsate2')) return 'pulsate2';
  if(n.includes('pulsate')) return 'pulsate';
  if(n.includes('pulseopacity2')||n.includes('pulseopacity')) return n.includes('2')?'pulse-opacity2':'pulse-opacity';
  if(n.includes('movealongpath3')) return 'move-along-path3';
  if(n.includes('movealongpath2')) return 'move-along-path2';
  if(n.includes('movealongpath')) return 'move-along-path';
  if(n.endsWith('effectstransform')||n.endsWith('effecttransform')) return 'transform';
  if(n.endsWith('effectsoffset')||n.endsWith('effectoffset')) return 'offset';
  if(n.includes('growparts')) return 'grow-parts';
  if(n.includes('fade')) return 'fade';
  if(n.includes('oscillate3')) return 'oscillate3';
  if(n.includes('oscillate2')) return 'oscillate2';
  if(n.includes('oscillate')) return 'oscillate';
  if(n.includes('swirl4')) return 'swirl4';
  if(n.includes('swirl')) return 'swirl3';
  if(n.includes('turbulentdisplace3')) return 'turbulentdisplace3';
  if(n.includes('turbulentdisplace')) return 'turbulentdisplace';
  if(n.includes('shake2')) return 'shake2';
  if(n.includes('shake')) return 'shake';
  if(n.includes('spin')) return 'spin';
  if(n.includes('stretch2')) return 'stretch2';
  if(n.includes('stretch')) return 'stretch2';
  if(n.includes('pixelate')) return 'pixel';
  if(n.includes('pixel')) return 'pixel';
  if(n.includes('pixel')) return 'pixel';
  if(n.includes('posterize')) return 'poster';
  if(n.includes('poster')) return 'poster';
  if(n.includes('blink')) return 'blink2';
  if(n.includes('rgbsep')) return 'rgbsep';
  if(n.includes('chromakey')||n.includes('chroma')||n.includes('greenscreen')) return 'chroma';
  if(n.includes('colorize')) return 'colorize';
  if(n.includes('colorhot')) return 'colorhot';
  if(n.includes('textprogress')) return 'textprogress';
  if(n.includes('textspacing')) return 'text-spacing';
  if(n.includes('textrand')) return 'textrand';
  if(n.includes('texttransform')) return 'text-transform';
  if(n.includes('counter')) return 'counter';
  if(n.includes('tile')) return 'tile';
  if(n.includes('motionblur4')) return 'motionblur4';
  if(n.includes('motionblur2')) return 'motionblur2';
  if(n.includes('motionblur')) return 'motionblur3';
  if(n.includes('exposure')) return 'exposure';
  if(n.includes('randomdisplace')) return 'randomdisplace';
  if(n.includes('turbulent')) return 'turbulentdisplace3';
  if(n.includes('displace')) return 'displacemap3';
  if(n.includes('swing2')) return 'swing2';
  if(n.includes('swing')) return 'swing';
  if(n.includes('hueshift')||n.includes('hue')) return 'hue';
  if(n.includes('lift')) return 'lift';
  if(n.includes('sat')) return 'satvib';
  if(n.includes('invert')) return 'invert';
  if(n.includes('colortune')) return 'colortune2';
  if(n.includes('threshold')) return 'threshold';
  if(n.includes('findedge')) return 'findedges';
  if(n.includes('gaussian')||n==='blur') return 'gaussianblur';
  if(n.includes('halftone')) return n.includes('line')?'halftonelines':'halftonedots';
  if(n.includes('wavewarp')||n.includes('wave')) return 'wavewarp2';
  if(n.includes('lumakey')||n.includes('luma')) return 'lumakey3';
  if(n.includes('scatter')) return 'scatter';
  if(n.includes('bright')) return 'brightness';
  if(n.includes('contrast')) return 'contrast';
  if(n.includes('vignette')) return 'vignette';
  if(n.includes('noise')) return 'noise';
  if(n.includes('mirror')) return 'mirror';
  if(n.includes('sharpen')) return 'sharpen';
  return 'exposure';
}
function prettyFx(id, raw){
  const m={lift:'Lift',exposure:'Exposure',satvib:'Saturasi',invert:'Invert',colortune2:'Color Tune',threshold:'Threshold',findedges:'Find Edges',gaussianblur:'Gaussian Blur',motionblur3:'Motion Blur',motionblur2:'Motion Blur 2',motionblur4:'Motion Blur 4',blink2:'Blink',tile:'Tiles',halftonedots:'Halftone Dots',halftonelines:'Halftone Lines',wavewarp2:'Wave Warp',turbulentdisplace3:'Turbulent Displace',turbulentdisplace:'Turbulent Displace',randomdisplace:'Random Displace',displacemap3:'Displace Map',lumakey3:'Luma Key',spin:'Spin',spinblur:'Spin Blur',spinblur2:'Spin Blur 2',swirl4:'Swirl',swirl3:'Swirl',scatter:'Repeat Scatter',brightness:'Brightness',contrast:'Contrast',hue:'Hue Shift',chroma:'Chroma Key',vignette:'Vignette',pixel:'Pixelate',noise:'Noise',poster:'Posterize',mirror:'Mirror',shake:'Shake',shake2:'Shake',oscillate:'Oscillate',oscillate2:'Oscillate 2',oscillate3:'Oscillate',stretch2:'Stretch',stretchsegment:'Stretch Segment',rgbsep:'RGB Split',sharpen:'Sharpen',zoomblur:'Zoom Blur',boxblur:'Box Blur',dblur:'Directional Blur',fade:'Fade',vibrance:'Vibrance',gamma:'Gamma',colortemperature:'Color Temperature',colorhot:'Color Hot',flip:'Flip',tint:'Tint',pulsate:'Pulsate',pulsate2:'Pulsate 2','pulse-opacity':'Pulse Opacity','pulse-opacity2':'Pulse Opacity 2',transform:'Transform',offset:'Offset','move-along-path':'Move Along Path','move-along-path2':'Move Along Path 2','move-along-path3':'Move Along Path 3','grow-parts':'Grow Parts','shake-parts':'Shake Parts',counter:'Counter',textprogress:'Typewriter','text-spacing':'Text Spacing',textrand:'Text Random','text-transform':'Text Transform',colorize:'Colorize',colorhot:'Color Hot'};
  return m[id]||String(raw||id).split('.').pop();
}
function mediaFileFromUri(uri){
  if(!uri) return null;
  return uri.startsWith('amproj:')?uri.slice(7):uri;
}

function parseEffectList(el, sMs, eMs, u2off, u2comp){
  const fx=[]; let copyBg=false, adjFx=false, adjFxDef=null, fxLift=null;
  el.querySelectorAll(':scope > effect').forEach(fn=>{
    const raw=fn.getAttribute('id')||'effect';
    const id=mapFxId(raw);
    const f={id, name:prettyFx(id,raw), on:fn.getAttribute('hidden')!=='true', params:{}, kf:{},
             raw:{params:{}, kf:{}}};
    fn.querySelectorAll(':scope > property').forEach(p=>{
      const k=p.getAttribute('name')||'amount';
      const kfNodes=p.querySelectorAll('kf');
      if(kfNodes.length){
        const rk=[];
        kfNodes.forEach(kf=>{
          rk.push({t:normToMs(kf.getAttribute('t')??'0',sMs,eMs), v:scalar(kf.getAttribute('v'),0), ease:mapEase(kf.getAttribute('e')||'linear')});
        });
        rk.sort((a,b)=>a.t-b.t);
        f.raw.kf[k]=rk;
        f.raw.params[k]=rk[0].v;
      } else if((p.getAttribute('type')||'')==='vec2'||(p.getAttribute('type')||'')==='vec3'){
        const vv=String(p.getAttribute('value')||'0,0').split(',').map(x=>parseFloat(x)||0);
        f.raw.params[k]=vv.length>=3? [vv[0]||0,vv[1]||0,vv[2]||0] : (vv.length>=2? [vv[0],vv[1]] : [vv[0]||0,0]);
      } else {
        f.raw.params[k]=scalar(p.getAttribute('value'),0);
      }
      if(FX_IGNORE.has(id+':'+k.toLowerCase())) return;
      if(kfNodes.length){
        const key=mapParamKey(id,k);
        const scale=paramScale(id,k);
        const kfs=[];
        kfNodes.forEach(kf=>{
          kfs.push({t:normToMs(kf.getAttribute('t')??'0',sMs,eMs), v:convertParam(id,key,scalar(kf.getAttribute('v'),0)*scale,u2off,u2comp), ease:mapEase(kf.getAttribute('e')||'linear')});
        });
        kfs.sort((a,b)=>a.t-b.t);
        f.kf[key]=kfs;
        f.params[key]=kfs[0].v;
      } else {
        const key=mapParamKey(id,k);
        f.params[key]=convertParam(id,key,scalar(p.getAttribute('value'),0)*paramScale(id,k),u2off,u2comp);
      }
    });
    if(id==='displacemap3'){ adjFx=true; adjFxDef=f; return }
    if(id==='lift'){
      const fill=Number(f.raw.params.fill??0);
      if(fill<=0.001){ copyBg=true; fxLift=f; return }
    }
    if(!Object.keys(f.params).length) f.params={amount:50};
    fx.push(f);
  });
  return {fx, copyBg, adjFx, adjFxDef, fxLift};
}
function parseTextEl(el, idx, proj, pkgId){
  // Layer <text>: format ground-truth dari preset AM
  // (attr size/font/wrapWidth/align + <content>).
  const sMs=num(el.getAttribute('startTime'),0);
  let eMs=num(el.getAttribute('endTime'),proj.durationMs);
  if(eMs<=sMs) eMs=sMs+200;
  const label=el.getAttribute('label')||('Teks '+(idx+1));
  const fillColorEl=el.querySelector(':scope > fillColor');
  const fillHex=argbToHex(fillColorEl?.getAttribute('value'), '#FFFFFF');
  const fillA=Math.round(argbAlpha(fillColorEl?.getAttribute('value'))*100);
  const tr=el.querySelector(':scope > transform');
  const locV=vec(tr?.querySelector('location')?.getAttribute('value'))||[proj.w/2,proj.h/2];
  const sclV=vec(tr?.querySelector('scale')?.getAttribute('value'))||[1,1];
  let rotV=0;
  const rotEl=tr?.querySelector('rotation, angle, rot');
  if(rotEl) rotV=num(rotEl.getAttribute('value')??rotEl.textContent,0);
  const contentEl=el.querySelector(':scope > content');
  const L={ id:uid(), name:label.slice(0,32), type:'text', shapeKind:'rect',
    visible:true, startMs:Math.round(sMs), endMs:Math.round(eMs),
    x:locV[0], y:locV[1], z:locV[2]||0,
    sizeRaw:[200,80],
    sx:clampSigned((sclV[0]||1)*200,2,60000), sy:clampSigned((sclV[1]||1)*200,2,60000),
    rot:rotV, skewX:0, skewY:0, opacity:100,
    color:fillHex, fillAlpha:fillA,
    border:{on:false,width:4,color:'#fff',pos:'DI DALAM'},
    shadow:{on:false,blur:12,dx:0,dy:6,color:'#000',op:50},
    blend:normalizeBlend(el.getAttribute('blending')), text:{
      content:contentEl?String(contentEl.textContent||''):'',
      color:fillHex,
      size:num(el.getAttribute('size'),48)||48,
      font:el.getAttribute('font')||'',
      align:(el.getAttribute('align')||'center').toLowerCase(),
      wrapWidth:num(el.getAttribute('wrapWidth'),0)||0,
    }, mediaSrc:null, mediaKind:null,
    mediaFillMode:'stretch',
    speed:1, inMs:0, outMs:Infinity,
    kf:{}, fx:[],
    corner:6, copyBg:false, adjFx:false };
  const opEl=tr?.querySelector('opacity');
  if(opEl){
    const kfs=parseKfList(opEl,sMs,eMs,100);
    if(kfs.length){ L.kf.opacity=kfs; L.opacity=Math.round(kfs[0].v) }
    else { const v=num(opEl.getAttribute('value'),1); L.opacity=Math.round(clampNum(v,0,1)*100) }
  }
  const locEl=tr?.querySelector('location');
  if(locEl&&locEl.querySelector('kf')){
    const [kx,ky]=parseKfVec(locEl,sMs,eMs);
    if(kx.length){ L.kf.x=kx; L.x=kx[0].v }
    if(ky.length){ L.kf.y=ky; L.y=ky[0].v }
  }
  const rotKfEl=tr?.querySelector('rotation');
  if(rotKfEl&&rotKfEl.querySelector('kf')){
    const kfs=parseKfList(rotKfEl,sMs,eMs,1);
    if(kfs.length){ L.kf.rot=kfs; L.rot=kfs[0].v }
  }
  const pe=parseEffectList(el,sMs,eMs,1,2);
  L.fx=pe.fx; L.copyBg=pe.copyBg; L.adjFx=pe.adjFx; L.adjFxDef=pe.adjFxDef; L.fxLift=pe.fxLift;
  return L;
}
export function parseAMXML(txt, name='Preset', pkgId=null){
  const doc=new DOMParser().parseFromString(txt,'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('XML rusak');
  const scene=doc.querySelector('scene')||doc.documentElement;
  const W=num(scene.getAttribute('width'),960);
  const H=num(scene.getAttribute('height'),1080);
  const fps=num(scene.getAttribute('fps'),60);
  const total=num(scene.getAttribute('totalTime'),5000);
  const bg=argbToHex(scene.getAttribute('bgcolor'), '#000000');
  const title=scene.getAttribute('title')||name.replace(/\.xml$/i,'');
  const proj={ id:uid(), name:title.slice(0,48)||'Preset', w:Math.round(W)||960, h:Math.round(H)||1080, projW:Math.round(W)||960, projH:Math.round(H)||1080, fps:Math.round(fps)||60, bg, durationMs:Math.round(total)||5000, createdAt:Date.now(), layers:[], bookmarks:[] };
  try{
    scene.querySelectorAll('bookmark').forEach(b=>{
      const t=num(b.getAttribute('t'),NaN);
      if(Number.isFinite(t)) proj.bookmarks.push(Math.round(t));
    });
    proj.bookmarks.sort((a,b)=>a-b);
  }catch{}
  const mediaMap={};
  scene.querySelectorAll('media').forEach(m=>{
    const uri=m.getAttribute('uri')||'';
    const fn=m.getAttribute('filename')||mediaFileFromUri(uri);
    mediaMap[uri]=fn;
    mediaMap[mediaFileFromUri(uri)]=fn;
    // simpan ukuran media utuk fill mode
    const mw=num(m.getAttribute('width'),0), mh=num(m.getAttribute('height'),0);
    if(mw&&mh){ mediaMap[uri+'#w']=mw; mediaMap[uri+'#h']=mh }
  });
  const audios=[...doc.querySelectorAll('scene > audio')];
  audios.forEach((a,i)=>{
    const sMs=num(a.getAttribute('startTime'),0), eMs=num(a.getAttribute('endTime'),proj.durationMs);
    const src=a.getAttribute('src')||'';
    const fn=mediaMap[src]||mediaFileFromUri(src);
    proj.layers.push({ id:uid(), name:a.getAttribute('label')||('Audio '+(i+1)), type:'audio', shapeKind:'rect', visible:true, startMs:Math.round(sMs), endMs:Math.round(eMs), x:proj.w/2, y:proj.h/2, z:0, sx:200, sy:60, rot:0, skewX:0, skewY:0, opacity:100, color:'#6ACDE0', fillAlpha:100, border:{on:false,width:4,color:'#fff',pos:'DI DALAM'}, shadow:{on:false,blur:12,dx:0,dy:6,color:'#000',op:50}, blend:'normal', text:null, mediaSrc:pkgId&&fn?('/api/link/'+pkgId+'/media/'+encodeURIComponent(fn)):null, mediaKind:'audio', kf:{}, fx:[], corner:8 });
  });

  const shapes=[...doc.querySelectorAll('scene > shape')];
  const texts=[...doc.querySelectorAll('scene > text')];
  // ============================================================
  // URUTAN (ground-truth via player referensi): XML belakangan
  // digambar DI ATAS (paint order = urutan dokumen). JANGAN dibalik.
  // renderLayerBar membalik sendiri untuk tampilan panel (atas=dulu).
  // Layer <text> disisip sesuai posisi dokumennya (bukan selalu di atas).
  // ============================================================
  const items=[...shapes.map(el=>({el,text:false})),...texts.map(el=>({el,text:true}))];
  try{ items.sort((a,b)=>(a.el.compareDocumentPosition(b.el)&4)?-1:1) }catch{}
  items.forEach((it,idx)=>{
    const el=it.el;
    if(it.text){ proj.layers.push(parseTextEl(el,idx,proj,pkgId)); return }
    const sMs=num(el.getAttribute('startTime'),0);
    let eMs=num(el.getAttribute('endTime'),proj.durationMs);
    if(eMs<=sMs) eMs=sMs+200;
    const label=el.getAttribute('label')||el.getAttribute('tag')||('Layer '+(idx+1));
    const fillType=el.getAttribute('fillType')||'color';
    const fillImage=el.getAttribute('fillVideo')||el.getAttribute('fillImage')||'';
    const sAttr=el.getAttribute('s')||'.rect';
    const fillColorEl=el.querySelector(':scope > fillColor');
    // Tanpa fillColor -> HITAM (dulu pink #E14E7A -> overlay raksasa acak).
    const fillHex=argbToHex(fillColorEl?.getAttribute('value'), '#000000');
    const fillA=Math.round(argbAlpha(fillColorEl?.getAttribute('value'))*100);
    const sizeEl=el.querySelector(':scope > property[name="size"]');
    const sizeV=vec(sizeEl?.getAttribute('value'))||[270,270];
    const tr=el.querySelector(':scope > transform');
    const locV=vec(tr?.querySelector('location')?.getAttribute('value'))||[proj.w/2,proj.h/2];
    const sclV=vec(tr?.querySelector('scale')?.getAttribute('value'))||[1,1];
    const skV=vec(tr?.querySelector('skew')?.getAttribute('value'))||[0,0];
    let rotV=0;
    const rotEl=tr?.querySelector('rotation, angle, rot');
    if(rotEl) rotV=num(rotEl.getAttribute('value')??rotEl.textContent,0);

    // ---- UKURAN (ground-truth via player referensi):
    // properti "size" AM disimpan dalam unit = piksel comp DIBAGI 2
    // (apapun ukuran comp). final_px = size*scale*2.
    // Konvensi app: sx = final_px*2 -> sx = rw*4.
    const rw=sizeV[0]*(sclV[0]||1), rh=sizeV[1]*(sclV[1]||1);
    const L={ id:uid(), name:label.slice(0,32), type:'shape', shapeKind:shapeKindOf(sAttr),
      visible:true, startMs:Math.round(sMs), endMs:Math.round(eMs),
      x:locV[0], y:locV[1], z:locV[2]||0,
      sizeRaw:[sizeV[0]||100, sizeV[1]||100],
      sx:clampSigned(rw*4,2,60000), sy:clampSigned(rh*4,2,60000),
      rot:rotV, skewX:skV[0]||0, skewY:skV[1]||0, opacity:100,
      color:fillHex, fillAlpha:fillA,
      border:{on:false,width:4,color:'#fff',pos:'DI DALAM'},
      shadow:{on:false,blur:12,dx:0,dy:6,color:'#000',op:50},
      blend:normalizeBlend(el.getAttribute('blending')), text:null, mediaSrc:null, mediaKind:null,
      mediaFillMode:el.getAttribute('mediaFillMode')||'stretch',
      speed:num(el.getAttribute('speed'),1)||1,
      inMs:el.hasAttribute('inTime')?num(el.getAttribute('inTime'),0):0,
      outMs:el.hasAttribute('outTime')?num(el.getAttribute('outTime'),Infinity):Infinity,
      kf:{}, fx:[],
      corner:sAttr.includes('roundrect')?28:6 };

    if(fillType==='media'&&fillImage){
      const fn=mediaMap[fillImage]||mediaFileFromUri(fillImage);
      const low=(fn||'').toLowerCase();
      const kind=low.endsWith('.mp4')||low.endsWith('.mov')||low.endsWith('.webm')||low.endsWith('.m4v')?'video':'image';
      L.type=kind; L.mediaKind=kind;
      if(pkgId&&fn){
        L.mediaSrc='/api/link/'+pkgId+'/media/'+encodeURIComponent(fn);
      } else if(/^https?:\/\/.+$/i.test(fillImage.trim())){
        // URL absolut (mis. media zervida) — dipakai utk preset uji lokal
        L.mediaSrc=fillImage.trim();
      } else if(/^\/?[\w\-./ %]+\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)$/i.test(fillImage.trim())){
        // path relatif — utk preset uji lokal
        L.mediaSrc=fillImage.trim().startsWith('/')?fillImage.trim():('/'+fillImage.trim());
      } else L.mediaSrc=null;
      L.color='#3A405E';
      if(!L.mediaSrc) L.color='#4A5170';
    } else if(fillType==='gradient'){
      L.color=fillHex; // fallback warna solid di UI
      const gEl=el.querySelector(':scope > gradient');
      if(gEl){
        const sc=vec(gEl.getAttribute('start'))||[0.5,0.5];
        const ec=vec(gEl.getAttribute('end'))||[1,1];
        L.grad={
          type:gEl.getAttribute('type')||'linear',
          c1:argbToHex(gEl.getAttribute('startColor'),'#FFFFFF'),
          a1:Math.round(argbAlpha(gEl.getAttribute('startColor'))*100),
          c2:argbToHex(gEl.getAttribute('endColor'),'#000000'),
          a2:Math.round(argbAlpha(gEl.getAttribute('endColor'))*100),
          x1:sc[0], y1:sc[1], x2:ec[0], y2:ec[1],
        };
      }
    } else {
      L.color=fillHex;
    }

    // ---- keyframe transform (FIX: dulu di-skip) ----
    const locEl=tr?.querySelector('location');
    if(locEl){
      if(locEl.querySelector('kf')){
        const [kx,ky]=parseKfVec(locEl,sMs,eMs);
        if(kx.length){ L.kf.x=kx; L.x=kx[0].v }
        if(ky.length){ L.kf.y=ky; L.y=ky[0].v }
      } else {
        const v=vec(locEl.getAttribute('value'));
        if(v){ L.x=v[0]; L.y=v[1] }
      }
    }
    const sclEl=tr?.querySelector('scale');
    if(sclEl&&sclEl.querySelector('kf')){
      // nilai kf = multiplier terhadap size -> konversi ke unit app (x2)
      const [ka,kb]=parseKfVec(sclEl,sMs,eMs);
      const toU=(m)=>sizeV[0]*m*4;
      const toV2=(m)=>sizeV[1]*m*4;
      if(ka.length){ L.kf.sx=ka.map(k=>({t:k.t,v:toU(k.v),ease:k.ease})); L.sx=toU(ka[0].v) }
      if(kb.length){ L.kf.sy=kb.map(k=>({t:k.t,v:toV2(k.v),ease:k.ease})); L.sy=toV2(kb[0].v) }
    }
    const rotKfEl=tr?.querySelector('rotation');
    if(rotKfEl&&rotKfEl.querySelector('kf')){
      const kfs=parseKfList(rotKfEl,sMs,eMs,1);
      if(kfs.length){ L.kf.rot=kfs; L.rot=kfs[0].v }
    }
    const opEl=tr?.querySelector('opacity');
    if(opEl){
      const kfs=parseKfList(opEl,sMs,eMs,100);
      if(kfs.length){ L.kf.opacity=kfs; L.opacity=Math.round(kfs[0].v) }
      else { const v=num(opEl.getAttribute('value'),1); L.opacity=Math.round(clampNum(v,0,1)*100) }
    }

    // ---- efek (satuan: 1 unit AM = 2px comp; offscreen 200px) ----
    const u2off=100/Math.max(1,rw), u2comp=2;
    L.copyBg=false; L.adjFx=false;
    const peSh=parseEffectList(el,sMs,eMs,u2off,u2comp);
    L.fx=peSh.fx; L.copyBg=peSh.copyBg; L.adjFx=peSh.adjFx; L.adjFxDef=peSh.adjFxDef; L.fxLift=peSh.fxLift;

    proj.layers.push(L);
  });
  if(!proj.layers.length) throw new Error('Tidak ada layer di XML');
  return proj;
}
function clampSigned(v,lo,hi){
  const a=Math.abs(v);
  const c=Math.min(Math.max(a,lo),hi);
  return (v<0? -c : c);
}
function clampNum(v,a,b){ if(!Number.isFinite(v)) return a; return Math.max(a,Math.min(b,v)) }
function mapParamKey(fxId, raw){
  const r=String(raw).toLowerCase();
  const direct={
    tile:{scale:'scale',phase:'phase',angle:'angle',mirror:'mirror',vertoffs:'vertoffs'},
    exposure:{exposure:'exposure',gamma:'gamma',offset:'offset'},
    satvib:{saturation:'amount',saturate:'amount',vibrance:'vib',vib:'vib'},
    invert:{mix:'mix',invertred:'mix',invertgreen:'mix',invertblue:'mix'},
    colortune2:{temp:'temp',tint:'tint'},
    colortemperature:{amount:'amount'},
    threshold:{level:'level',threshold:'level',feather:'feather',invert:'invert',blendmode:'level'},
    findedges:{amount:'amount',smoothing:'amount',threshold:'amount',invert:'invert'},
    gaussianblur:{radius:'radius',strength:'strength'},
    boxblur:{radius:'radius',strength:'radius'},
    dblur:{radius:'radius',strength:'radius',angle:'angle'},
    motionblur2:{tune:'tune',usepos:'usePos',usescale:'useScale',useangle:'useAngle'},
    motionblur3:{tune:'tune',usepos:'usePos',usescale:'useScale',useangle:'useAngle'},
    motionblur4:{tune:'tune',usepos:'usePos',usescale:'useScale',useangle:'useAngle'},
    blink2:{freq:'freq'},
    pixel:{size:'size'},
    noise:{amount:'amount'},
    vignette:{strength:'amount',amount:'amount'},
    poster:{levels:'levels',stepcount:'levels',offset:'offset'},
    posterize:{levels:'levels',stepcount:'levels',offset:'offset'},
    mirror:{axis:'axis'},
    flip:{axis:'axis'},
    halftonedots:{size:'size',amount:'size',angle:'angle',phase:'phase',strength:'strength'},
    halftonelines:{size:'size',amount:'size',angle:'angle',phase:'phase',strength:'strength'},
    lift:{fill:'fill'},
    wavewarp2:{phase:'phase',a1d:'a1d',m1:'m1',m2:'m2',a2d:'a2d'},
    turbulentdisplace3:{intensity:'intensity',evolution:'evolution',scale:'scale',seed:'seed'},
    turbulentdisplace:{intensity:'intensity',evolution:'evolution',scale:'scale',seed:'seed'},
    randomdisplace:{mag:'mag',evolution:'evolution',seed:'seed',scatter:'scatter'},
    displacemap3:{edges:'amount',fromctr:'amount',invert:'amount',typex:'mode',typey:'mode',offs:'amount'},
    swirl4:{angle:'angle',radius:'radius',strength:'angle'},
    swirl3:{strength:'strength',radius:'radius',centerpoint:'center'},
    spin:{rpm:'rpm',speed:'rpm'},
    spinblur:{angle:'angle',radius:'radius',cx:'cx',cy:'cy'},
    spinblur2:{centerpoint:'center',angle:'angle',radius:'radius',cx:'cx',cy:'cy'},
    stretchsegment:{angle:'angle',stretch:'stretch',offset:'offset',smooth:'smooth'},
    pulsate:{freq:'freq',minsize:'minsize',maxsize:'maxsize',phase:'phase',type:'type'},
    pulsate2:{freq:'freq',minsize:'minsize',maxsize:'maxsize',phase:'phase',type:'type'},
    'pulse-opacity':{freq:'freq',strength:'strength',phase:'phase',type:'type'},
    'pulse-opacity2':{freq:'freq',strength:'strength',phase:'phase',type:'type'},
    transform:{scale:'scale',angle:'angle',offset:'offset',masktolayer:'mask',alpha:'alpha',fill:'fill',sample:'sample'},
    offset:{scale:'scale',offset:'offset',feather:'feather',mask:'mask'},
    'move-along-path':{progress:'progress',angle:'angle',tangent:'tangent',inset:'inset',offset:'offset'},
    'move-along-path2':{progress:'progress',angle:'angle',tangent:'tangent',inset:'inset',offset:'offset'},
    'move-along-path3':{progress:'progress',angle:'angle',tangent:'tangent',inset:'inset',offset:'offset'},
    'shake-parts':{magnitude:'mag',evolution:'evolution'},
    swing:{freq:'freq',a1:'a1',a2:'a2',phase:'phase',type:'type'},
    swing2:{freq:'freq',a1:'a1',a2:'a2',phase:'phase',type:'type'},
    shake:{mag:'mag',speed:'speed',angle:'angle',slack:'slack',seed:'seed',evolution:'evolution'},
    shake2:{mag:'mag',freq:'freq',evolution:'evolution',seed:'seed',angle:'angle',slack:'slack',zshake:'zshake'},
    oscillate3:{direction:'direction',angle:'angle',freq:'freq',mag:'mag',type:'type',phase:'phase'},
    stretch2:{scale:'scale',angle:'angle',contentonly:'contentOnly'},
    rgbsep:{strength:'strength',angle:'angle',centerchannel:'centerChannel',mode:'mode'},
    sharpen:{strength:'strength',radius:'radius'},
    lumakey3:{lowthreshold:'low',highthreshold:'high',low:'low',high:'high',feather:'feather',invert:'invert',weighted:'weighted'},
    chroma:{threshold:'threshold',feather:'feather',keycolor:'key',invert:'invert',defringe:'defringe'},
    scatter:{n:'n',dist:'dist',count:'n',radius:'dist'},
    brightness:{amount:'amount'},
    contrast:{amount:'amount'},
    tint:{mix:'mix'},
    fade:{intime:'inMs',outtime:'outMs'},
    colorize:{tint:'tint'},
    colorhot:{color:'color',tint:'tint'},
    textprogress:{start:'start',end:'end',cursor:'cursor',blink:'blink'},
    'text-spacing':{letterspacing:'letterspacing',linespacing:'linespacing'},
    counter:{scale:'scale',offset:'offset'},
    textrand:{amount:'amount',evo:'evo',seed:'seed',start:'start',end:'end',charset:'charset',preservespace:'preserveSpace'},
    'text-transform':{start:'start',end:'end',phase:'phase',component:'component',anchor:'anchor',offset:'offset',angle:'angle',scale:'scale',stretch:'stretch',alpha:'alpha',usefillcolor:'useFillColor',fillcolor:'fillColor',easein:'easeIn',easeout:'easeOut',overlap:'overlap',shape:'shape',randomorder:'randomOrder',seed:'seed'},
    vibrance:{amount:'amount'},
    gamma:{amount:'amount'},
    hue:{amount:'amount',shift:'amount'}
  };
  return direct[fxId]?.[r]||'amount';
}
function paramScale(fxId, raw){
  const r=String(raw).toLowerCase();
  if(fxId==='satvib'&&(r==='saturation'||r==='saturate')) return 100;
  if(fxId==='vignette'&&r==='strength') return 100;
  return 1;
}
// param yang diabaikan (tidak dipakai impl fx.js — jangan jadi 'amount' liar)
const FX_IGNORE=new Set([
  'wavewarp2:damping','wavewarp2:dampingspace','wavewarp2:dampingorigin','wavewarp2:screenspace',
  'motionblur4:usepos','motionblur4:usescale','motionblur4:useangle',
  'motionblur2:usepos','motionblur2:usescale','motionblur2:useangle',
  'lift:fill',
]);
// konversi satuan spasial AM (unit = comp px/2):
//  'off'  -> piksel offscreen 200px (efek piksel: wavewarp dst.)
//  'comp' -> piksel comp (efek transform: shake/randomdisplace/oscillate)
const FX_SPATIAL={
  'wavewarp2:m1':'off',
  'randomdisplace:mag':'off',
  'wavewarp2:m2':'off-mag',      // magnitudo: fraksi spasial — dikali m1 saat eval
  'randomdisplace:mag':'comp',
  'shake2:mag':'comp',
  'shake:mag':'comp',
  'oscillate3:mag':'comp',
  'turbulentdisplace:scale':'off',
  'turbulentdisplace3:scale':'off',
  'swirl3:radius':'off',
  'swirl4:radius':'off',
};
function convertParam(fxId, key, v, u2off=1, u2comp=2){
  if(fxId==='satvib'&&key==='vib') return (v-1)*100;
  const sp=FX_SPATIAL[fxId+':'+key];
  if(sp==='off') return v*u2off;
  if(sp==='off-mag') return v; // fraksi murni — dikalikan m1 di fx
  if(sp==='comp') return v*u2comp;
  return v;
}
export function xmlToProject(t,n,p){ return parseAMXML(t,n,p) }
// Hook pengujian (Node): verifikasi pemetaan id efek tanpa DOM.
export const __testHooks = { mapFxId, mapParamKey, prettyFx, normalizeBlend, fontStackFor, shapeKindOf };
