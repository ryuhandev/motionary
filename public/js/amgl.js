// ============================================================
// amgl.js — Engine WebGL yang menjalankan SHADER + SCRIPT ASLI
// Alight Motion (dari /amfx/<efek>.xml: GLSL CDATA + animate()).
//
// Arsitektur per layer:
//   1. evalTransformAM(): jalankan <script> AM asli (animate(env,el,p))
//      -> delta transform {dx,dy,drot,sx,sy,alpha} + f._groups
//      (motionblur4 memilih grup shader via el.shaderGroups).
//      PARAM type="hz" dikalikan waktu detik (TERKALIBRASI zervida:
//      oscillate3 freq=1 -> periode 1s; blink2 p.freq%1>0.5).
//   2. rasterContent(l,T,tf) [callback app] -> canvas comp-size
//      konten pada transform final + metrik {cx,cy,rot,fw,fh,...}.
//   3. Rantai efek piksel: tiap efek = 1 fullscreen-pass FBO
//      comp-size dengan shader AM asli.
//   4. Komposit ping-pong dengan opacity + blend.
// Layer lift (Copy BG): uniform `comp` = composite bawah.
// Layer adjFx (adjustment): input = composite bawah.
// ============================================================

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// acScreenNorm = 0..1 Y-NAIK (gl_FragCoord) — konsisten upload flipY.
const PRELUDE = `
precision highp float;
uniform vec2 acScreenSize;
uniform vec4 uLayerBox;
uniform mat4 acLayerToScreen;
uniform vec2 acLayerSize;
uniform vec2 acLayerPivot;
uniform vec3 acVelocity;
uniform float acAngularVelocity;
uniform float acScaleVelocity;
struct acTexture { sampler2D texture; vec2 size; };
uniform acTexture inputImg;
uniform acTexture comp;
uniform sampler2D src;
#define acScreenNorm (gl_FragCoord.xy / acScreenSize)
#define acLayerNorm ((acScreenNorm - uLayerBox.xy) / mix(vec2(1e-6), uLayerBox.zw, step(vec2(1e-6), abs(uLayerBox.zw))))
#define acLayerCenterNorm (uLayerBox.xy + uLayerBox.zw*0.5)
#define acLayerSizeNorm uLayerBox.zw
vec4 texture2DCv(sampler2D t, vec2 uv){ return texture2D(t, uv); }
vec2 getTexSize(vec2 s){ return s; }
`;

// Shim kompatibilitas GLSL ES 1.0 utk shader AM:
// 1) batas loop non-konstan -> loop tetap + break
// 2) acVelocity (vec3) dibagi vec2 -> pakai .xy
function patchShaderSource(src){
  let out = src.replace(
    /for\s*\(\s*int\s+(\w+)\s*=\s*(\d+)\s*;\s*\1\s*<\s*([^;]+?)\s*;\s*\1\s*(?:\+\+|\+=\s*1)\s*\)\s*\{/g,
    (m, iv, init, bound)=>{
      if(/^\s*\d+\s*$/.test(bound)) return m;
      return `for (int ${iv} = ${init}; ${iv} < 9999; ${iv}++) { if (${iv} >= (${bound})) break;`;
    });
  out = out.replace(/acVelocity\s*\*\s*(\w+)\s*\/\s*acScreenSize/g,
    '(acVelocity.xy * $1) / acScreenSize');
  return out;
}

const COMPOSITE_FRAG = `
precision highp float;
uniform float uOpacity;
void main(){
  vec4 c = texture2D(src, gl_FragCoord.xy / acScreenSize);
  gl_FragColor = vec4(c.rgb, c.a * uOpacity);
}
`;

// ------------------------------------------------------------
// AM.simplexNoise — tabel permutasi KLASIK (Gustavson, fixed):
// kandidat paling mungkin untuk runtime AM (kode publik domain).
// ------------------------------------------------------------
const P_CLASSIC = new Uint8Array([
151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
190, 6,148,247,120,234,75, 0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,
88,237,149,56,87,174,20,125,136,171,168, 68,175,74,165,71,134,139,48,27,166,
77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,
102,143,54, 65,25,63,161, 1,216, 80,73,209, 76,132,187,208, 89, 18,169,200,196,
135,130,116,188,159,86,164,100,109,198,173,186, 3,64,52,217,226,250,124,123,
5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,
223,183,170,213,119,248,152, 2,44,154,163, 70,221,153,101,155,167, 43,172,9,
129,22,39,253, 19,98,108,110,79,113,224,232,178,185, 112,104,218,246,97,228,
251,34,242,193,238,210,144,12,191,179,162,241, 81,51,145,235,249,14,239,107,
49,192,214, 31,181,199,106,157,184, 84,204,176,115,121,50,45,127, 4,150,254,
138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
]);
const PERM = new Uint8Array(512), PERM_MOD12 = new Uint8Array(512);
for(let i=0;i<512;i++){ PERM[i]=P_CLASSIC[i&255]; PERM_MOD12[i]=PERM[i]%12; }
const GRAD3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
function simplexNoise3(x, y, z){
  // AM memanggil dengan 2 argumen (shake2: simplexNoise(t, seed)) —
  // slice z=0. (NaN sebelumnya membuat layer shake2 hilang total.)
  if(z===undefined || z===null || !Number.isFinite(z)) z=0;
  const F3=1/3, G3=1/6;
  const s=(x+y+z)*F3;
  const i=Math.floor(x+s), j=Math.floor(y+s), k=Math.floor(z+s);
  const t=(i+j+k)*G3;
  const x0=x-(i-t), y0=y-(j-t), z0=z-(k-t);
  let i1,j1,k1,i2,j2,k2;
  if(x0>=y0){
    if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;}
    else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;}
    else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;}
  }else{
    if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;}
    else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;}
    else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;}
  }
  const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
  const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
  const x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;
  const ii=i&255, jj=j&255, kk=k&255;
  let n=0, t0=0.6-x0*x0-y0*y0-z0*z0;
  if(t0>0){ t0*=t0; const gi=PERM_MOD12[ii+PERM[jj+PERM[kk]]]*3; n+=t0*t0*(GRAD3[gi]*x0+GRAD3[gi+1]*y0+GRAD3[gi+2]*z0); }
  let t1=0.6-x1*x1-y1*y1-z1*z1;
  if(t1>0){ t1*=t1; const gi=PERM_MOD12[ii+i1+PERM[jj+j1+PERM[kk+k1]]]*3; n+=t1*t1*(GRAD3[gi]*x1+GRAD3[gi+1]*y1+GRAD3[gi+2]*z1); }
  let t2=0.6-x2*x2-y2*y2-z2*z2;
  if(t2>0){ t2*=t2; const gi=PERM_MOD12[ii+i2+PERM[jj+j2+PERM[kk+k2]]]*3; n+=t2*t2*(GRAD3[gi]*x2+GRAD3[gi+1]*y2+GRAD3[gi+2]*z2); }
  let t3=0.6-x3*x3-y3*y3-z3*z3;
  if(t3>0){ t3*=t3; const gi=PERM_MOD12[ii+1+PERM[jj+1+PERM[kk+1]]]*3; n+=t3*t3*(GRAD3[gi]*x3+GRAD3[gi+1]*y3+GRAD3[gi+2]*z3); }
  return 32*n;
}
const AM_HELPERS = {
  simplexNoise: simplexNoise3,
  triangle(x){ const t=x-Math.floor(x); return t<0.5? 2*t : 2-2*t; },
};

// ------------------------------------------------------------
// Definisi efek: index + XML + alias nama pendek app -> AM
// ------------------------------------------------------------
const FX_ALIAS = {
  hue:'hueshift', pixel:'pixelate', poster:'posterize',
  chroma:'chromakey', tint:'colortint', gamma:'rgb-gamma',
  satvib:'vibrance-saturation', pixelate2:'pixelate',
};
const fxIndex = new Map();     // id AM lengkap -> file xml
const fxDefs = new Map();      // id AM lengkap -> def terparse
const fxNameCache = new Map(); // nama pendek -> id lengkap
let indexLoaded = false;

async function loadIndex(){
  if(indexLoaded) return;
  const r = await fetch('/amfx/index.json');
  const j = await r.json();
  for(const e of j.effects){
    fxIndex.set(e.id, e.file);
    const short = e.id.replace(/^com\.alightcreative\.effects\./,'');
    fxNameCache.set(short, e.id);
  }
  indexLoaded = true;
}
function resolveFxId(fxIdShort){
  // alias app -> nama AM, tangguh thd varian singular/plural + hyphen.
  // (Audit: ...effect.shakeparts singular & pulseopacity tanpa-hyphen dulu
  // gagal resolve -> efek hilang diam-diam.)
  if(_resolveCache.has(fxIdShort)) return _resolveCache.get(fxIdShort);
  const aliased = FX_ALIAS[fxIdShort] || fxIdShort;
  let out = null;
  if(fxNameCache.has(aliased)) out = fxNameCache.get(aliased);
  if(!out){
    const cands = [
      'com.alightcreative.effects.'+aliased,
      'com.alightcreative.effect.'+aliased,
      'com.alightcreative.effects.'+aliased.replace(/-/g,''),
      'com.alightcreative.effect.'+aliased.replace(/-/g,''),
    ];
    for(const c of cands){ if(fxNameCache.has(c)){ out = fxNameCache.get(c); break } }
  }
  if(!out){
    const norm = aliased.replace(/-/g,'');
    for(const [short,full] of fxNameCache){ if(short.replace(/-/g,'')===norm){ out = full; break } }
  }
  if(!out) out = 'com.alightcreative.effects.'+aliased;
  _resolveCache.set(fxIdShort, out);
  return out;
}
const _resolveCache = new Map();
// nilai param utk shader/script AM: RAW XML dulu (satuan AM asli),
// baru fallback nilai terkonversi app, terakhir default XML efek.
function paramValue(evalFxParam, f, id, defVal, T){
  if(f && f.raw){
    if(f.raw.kf && f.raw.kf[id] && f.raw.kf[id].length) return evalRawKf(f.raw.kf[id], T);
    if(f.raw.params && Object.prototype.hasOwnProperty.call(f.raw.params, id))
      return f.raw.params[id];
  }
  const has = f && f.params && Object.prototype.hasOwnProperty.call(f.params, id);
  const hasKf = f && f.kf && f.kf[id] && f.kf[id].length;
  if(has || hasKf){
    try{ const v = evalFxParam(f, id, T); if(v!==undefined && v!==null) return v }catch(e){}
  }
  return defVal;
}
// kf raw: t ms, ease string AM (cubicBezier/reverse/...) — evaluator
// identik dengan app easeOf (ground truth ronde 3)
function easeOfAM(type, t){
  if(typeof type==='string'){
    const rm=type.match(/^(?:reverse )?random (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/);
    if(rm){ return easeOfAM('cubicbezier '+rm.slice(1).join(' '), t) }
    const m=type.match(/^(reverse )?cubicbezier (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/);
    if(m){
      const x1=+m[2],y1=+m[3],x2=+m[4],y2=+m[5];
      let lo=0,hi=1,s=t;
      for(let i=0;i<24;i++){
        s=(lo+hi)/2;
        const xs=(3*(1-s)*(1-s)*s*x1)+(3*(1-s)*s*s*x2)+(s*s*s);
        if(xs<t) lo=s; else hi=s;
      }
      let e=(3*(1-s)*(1-s)*s*y1)+(3*(1-s)*s*s*y2)+(s*s*s);
      if(m[1]) e=1-easeOfAM(type.slice(8), 1-t);
      return Math.max(0,Math.min(1,e));
    }
    if(type.startsWith('reverse ')) return 1-easeOfAM(type.slice(8), 1-t);
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
function evalRawKf(kfs, T){
  const s=[...kfs].sort((a,b)=>a.t-b.t);
  if(T<=s[0].t) return s[0].v;
  if(T>=s[s.length-1].t) return s[s.length-1].v;
  let i=0; while(i<s.length-1 && T>s[i+1].t) i++;
  const a=s[i], b=s[i+1];
  const p=(T-a.t)/Math.max(1,b.t-a.t);
  // KALIBRASI zervida (ease_calib): ease milik kf KANAN (segmen yang
  // MASUK ke kf tsb), bukan kf kiri.
  return a.v+(b.v-a.v)*easeOfAM(b.ease||'linear', p);
}
const pendingDefs = new Map();
async function getFxDef(fxIdShort){
  await loadIndex();
  const id = resolveFxId(fxIdShort);
  if(fxDefs.has(id)) return fxDefs.get(id);
  const file = fxIndex.get(id);
  if(!file) return null;
  if(pendingDefs.has(id)) return pendingDefs.get(id);
  const prom = (async()=>{
    try{
      const r = await fetch('/amfx/'+encodeURIComponent(file));
      const txt = await r.text();
      const doc = new DOMParser().parseFromString(txt, 'application/xml');
      const params = [];
      doc.querySelectorAll('params > *').forEach(el=>{
        const tag = el.tagName.toLowerCase();
        if(tag==='spinner'||tag==='slider'){
          params.push({ id: el.getAttribute('id'), kind:'number',
            def: parseFloat(el.getAttribute('default')??'0')||0,
            type: el.getAttribute('type')||'' });
        } else if(tag==='switch'){
          params.push({ id: el.getAttribute('id'), kind:'bool', def: el.getAttribute('default')==='true'?1:0 });
        } else if(tag==='selector'){
          const opts=[...el.querySelectorAll('option')].map(o=>({v:parseInt(o.getAttribute('value')), id:o.getAttribute('id')}));
          params.push({ id: el.getAttribute('id'), kind:'selector', def: parseInt(el.getAttribute('default')??'0')||0, opts });
        } else if(tag==='texture'){
          params.push({ id: el.getAttribute('id'), kind:'texture', srcType: el.getAttribute('srcType') });
        } else if(tag==='point'){
          params.push({ id: el.getAttribute('id'), kind:'point', def:[0,0] });
        } else if(tag==='hue-disc'){
          // cakram hue AM: triplet bias (vec3). Tanpa ini shader yg
          // memakainya (colorize/colorhot/…) gagal kompilasi -> efek hilang.
          const dv=String(el.getAttribute('default')||'0,1,0').split(',').map(x=>parseFloat(x)||0);
          params.push({ id: el.getAttribute('id'), kind:'vec3', def:[dv[0]||0,dv[1]||0,dv[2]||0] });
        } else if(tag==='color'){
          params.push({ id: el.getAttribute('id'), kind:'color', def: el.getAttribute('default')||'#ffffffff' });
        }
      });
      const shaders = [...doc.querySelectorAll('shader')].map(s=>({
        group: parseInt(s.getAttribute('group')??'0')||0,
        precision: s.getAttribute('precision')||'mediump',
        code: s.textContent
      }));
      const scriptEl = doc.querySelector('script');
      const def = {
        id, params, shaders,
        script: scriptEl?scriptEl.textContent:null,
        category: doc.documentElement.getAttribute('category')||'',
        autoTransform: doc.documentElement.getAttribute('auto-transform')==='true',
      };
      // prelude per-efek: engine AM auto-deklarasi uniform dari <params>
      let pre = '';
      for(const p of def.params){
        if(p.kind==='number') pre += `uniform float ${p.id};\n`;
        else if(p.kind==='bool') pre += `uniform bool ${p.id};\n`;
        else if(p.kind==='selector') pre += `uniform int ${p.id};\n`;
        else if(p.kind==='point') pre += `uniform vec2 ${p.id};\n`;
        else if(p.kind==='vec3') pre += `uniform vec3 ${p.id};\n`;
        else if(p.kind==='color') pre += `uniform vec4 ${p.id};\n`;
        else if(p.kind==='texture' && p.id!=='inputImg' && p.id!=='comp')
          pre += `uniform acTexture ${p.id};\n`; // map eksternal: bind dummy
      }
      def.prelude = pre;
      if(def.script){
        try{
          def._fn = new Function('env','el','p','AM',
            def.script + '\n;return (typeof animate==="function")? animate(env,el,p) : el;');
        }catch(e){ console.warn('[amgl] script parse', id, e.message) }
      }
      fxDefs.set(id, def);
      return def;
    }catch(e){ console.warn('[amgl] gagal muat efek', id, e.message); return null }
  })();
  pendingDefs.set(id, prom);
  const d = await prom;
  pendingDefs.delete(id);
  return d;
}
function getFxDefCached(fxIdShort){
  const id = resolveFxId(fxIdShort);
  return fxDefs.get(id) || null;
}

// ------------------------------------------------------------
// evalTransformAM — jalankan script animate() AM untuk layer.
// Kembalikan {dx,dy,drot,sx,sy,alpha} + set f._groups.
// ------------------------------------------------------------
function evalTransformAM(l, T, evalFxParam, fps, velCtx){
  const out = { dx:0, dy:0, drot:0, sx:1, sy:1, alpha:1, dz:0 };
  if(!l.fx || !l.fx.length) return out;
  const tSec = T/1000;
  for(const f of l.fx){
    if(f.on===false) continue;
    const def = getFxDefCached(f.id);
    if(!def || !def._fn) continue;
    // param utk script: nilai kf/default; type hz -> dikali waktu (s);
    // type rpm -> derajat/detik (60rpm = 360°/s); durasi layer disediakan
    // (swing v1 / fade / pulsate v1 memakainya; dulu undefined -> NaN).
    const p = {};
    for(const pd of def.params){
      if(pd.kind==='texture' || pd.kind==='point' || pd.kind==='color') continue;
      let v = paramValue(evalFxParam, f, pd.id, pd.def, T);
      if(pd.type==='hz') v = (+v) * tSec;
      else if(pd.type==='rpm') v = (+v) * tSec * 6;
      p[pd.id] = v;
    }
    const layerDur = Math.max(1e-3, ((l.endMs??T+1000)-(l.startMs??T))/1000);
    const env = {
      frame: Math.round(tSec*fps), fps, time: tSec,
      duration: layerDur, selected: false, editMode: false,
      velocity: velCtx? velCtx.velocity : {x:0,y:0,z:0},
      scaleVelocity: velCtx? velCtx.scaleVelocity : 0,
      angularVelocity: velCtx? velCtx.angularVelocity : 0,
    };
    const el = {
      transform:{ location:{x:0,y:0,z:0}, angle:0, scale:{x:1,y:1}, pivot:{x:0,y:0} },
      alpha: 1, shaderGroups: [],
    };
    let res;
    try{ res = def._fn(env, el, p, AM_HELPERS) }catch(e){ continue }
    if(dbg.on) (dbg.pinfo = dbg.pinfo||[]).push({fx:f.id, p:JSON.parse(JSON.stringify(p)),
      out:{dx:el.transform.location.x, dy:el.transform.location.y, drot:el.transform.angle}});
    const r = res || el;
    const tr = r.transform || el.transform;
    out.dx += (tr.location?.x||0);
    out.dy += (tr.location?.y||0);
    out.dz += (tr.location?.z||0);
    out.drot += (tr.angle||0);
    out.sx *= (tr.scale?.x||1);
    out.sy *= (tr.scale?.y||1);
    out.alpha *= (r.alpha!==undefined? r.alpha : el.alpha);
    if(Array.isArray(r.shaderGroups) && r.shaderGroups.length) f._groups = r.shaderGroups;
    else if(f.id==='motionblur4' || f.id==='motionblur2' || f.id==='motionblur3') f._groups = [];
    else if(f._groups) delete f._groups;
  }
  return out;
}

// ------------------------------------------------------------
// Konteks GL
// ------------------------------------------------------------
let gl=null, glCanvas=null, quadBuf=null;
let progComposite=null;
let fbos=[];
let W=0, H=0;
let curComp=0;               // index FBO komposit aktif (0 / 1)
const COMP_A=0, COMP_B=1;    // ping-pong komposit
const CHAIN_START=2;         // FBO rantai efek mulai sini

function makeShader(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    throw new Error('shader: '+gl.getShaderInfoLog(s).slice(0,300));
  }
  return s;
}
function makeProgram(fragSrc){
  const p = gl.createProgram();
  gl.attachShader(p, makeShader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, makeShader(gl.FRAGMENT_SHADER, fragSrc));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
    throw new Error('link: '+gl.getProgramInfoLog(p).slice(0,300));
  }
  return p;
}
function makeTarget(w,h){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, width:w, height:h };
}

export function initGL(w, h){
  if(!glCanvas){
    glCanvas = document.createElement('canvas');
    gl = glCanvas.getContext('webgl', { preserveDrawingBuffer:true, premultipliedAlpha:false, alpha:true });
    if(!gl) return false;
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    try{ progComposite = makeProgram(PRELUDE+COMPOSITE_FRAG); }
    catch(e){ console.warn('[amgl]', e.message); return false }
  }
  if(W!==w || H!==h || !fbos.length){
    W=w; H=h; glCanvas.width=w; glCanvas.height=h;
    fbos.forEach(f=>{ gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex) });
    fbos=[];
    // 2 komposit + 10 rantai efek
    for(let i=0;i<12;i++) fbos.push(makeTarget(w,h));
  }
  return true;
}
function bindQuad(){
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}
function uploadCanvas(cv){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
function delTexSafe(t){ try{ gl.deleteTexture(t) }catch{} }

// ------------------------------------------------------------
// Kompilasi program efek (cache per efek+grup)
// ------------------------------------------------------------
const progCache = new Map();
async function getFxPrograms(fxIdShort){
  const def = await getFxDef(fxIdShort);
  if(!def || !def.shaders.length) return null;
  let entry = progCache.get(def.id);
  if(entry===undefined){
    const progs = new Map();
    for(const sh of def.shaders){
      try{ progs.set('g'+sh.group, makeProgram(PRELUDE+(def.prelude||'')+patchShaderSource(sh.code))); }
      catch(e){ console.warn('[amgl] skip grup shader', def.id, sh.group, e.message); }
    }
    entry = progs.size? progs : null;
    progCache.set(def.id, entry);
  }
  if(!entry) return null;
  return { def, progs: entry };
}
// versi sync: def harus ter-cache; program dikompilasi on-demand bila perlu
function getFxProgramsCached(fxIdShort){
  const def = getFxDefCached(fxIdShort);
  if(!def || !def.shaders.length) return null;
  let entry = progCache.get(def.id);
  if(entry===undefined){
    const progs = new Map();
    for(const sh of def.shaders){
      try{ progs.set('g'+sh.group, makeProgram(PRELUDE+(def.prelude||'')+patchShaderSource(sh.code))); }
      catch(e){ console.warn('[amgl] skip grup shader', def.id, sh.group, e.message); }
    }
    entry = progs.size? progs : null;
    progCache.set(def.id, entry);
  }
  if(!entry) return null;
  return { def, progs: entry };
}
// kumpulkan SEMUA id fx sebuah proyek (termasuk lift copyBg & adjFx)
function collectFxIds(project){
  const ids = new Set();
  for(const l of project.layers){
    (l.fx||[]).forEach(f=>{ if(f.on!==false) ids.add(f.id) });
    if(l.fxLift) ids.add(l.fxLift.id||'lift');
    if(l.adjFxDef) ids.add(l.adjFxDef.id);
  }
  return [...ids];
}

// ------------------------------------------------------------
// Uniform
// ------------------------------------------------------------
function setCommonUniforms(prog, layerCtx){
  let loc;
  if(loc=gl.getUniformLocation(prog,'acScreenSize')) gl.uniform2f(loc, W, H);
  if(loc=gl.getUniformLocation(prog,'uLayerBox')) gl.uniform4f(loc, layerCtx.box[0], layerCtx.box[1], layerCtx.box[2], layerCtx.box[3]);
  if(loc=gl.getUniformLocation(prog,'acLayerToScreen')) gl.uniformMatrix4fv(loc, false, layerCtx.l2s);
  if(loc=gl.getUniformLocation(prog,'acLayerSize')) gl.uniform2f(loc, layerCtx.layerW, layerCtx.layerH);
  if(loc=gl.getUniformLocation(prog,'acLayerPivot')) gl.uniform2f(loc, layerCtx.pivot[0], layerCtx.pivot[1]);
  if(loc=gl.getUniformLocation(prog,'acVelocity')) gl.uniform3f(loc, layerCtx.vel[0], layerCtx.vel[1], layerCtx.vel[2]);
  if(loc=gl.getUniformLocation(prog,'acAngularVelocity')) gl.uniform1f(loc, layerCtx.angularVel);
  if(loc=gl.getUniformLocation(prog,'acScaleVelocity')) gl.uniform1f(loc, layerCtx.scaleVel);
}
function setParamUniforms(prog, def, fxObj, T, evalFxParam){
  for(const p of def.params){
    if(p.kind==='texture'){
      // param tekstur eksternal (mis. 'map'): bind dummy composite
      if(p.id!=='inputImg' && p.id!=='comp'){
        let loc=gl.getUniformLocation(prog, p.id+'.texture');
        if(loc){ gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fbos[curComp].tex); gl.uniform1i(loc, 2); }
        loc=gl.getUniformLocation(prog, p.id+'.size');
        if(loc) gl.uniform2f(loc, W, H);
      }
      continue;
    }
    const loc = gl.getUniformLocation(prog, p.id);
    if(!loc) continue;
    let v = paramValue(evalFxParam, fxObj, p.id, p.def, T);
    if(p.kind==='point'){
      let pt=v;
      if(typeof v==='string'){
        const m=v.split(',').map(x=>parseFloat(x));
        pt=(m.length>=2 && m.slice(0,2).every(x=>!isNaN(x)))? m : [0,0];
      } else if(typeof v==='number'){
        pt=[v,0]; // scalar() XML "x,y" -> angka komponen-x
      }
      pt=(pt && typeof pt==='object')? pt : [0,0];
      gl.uniform2f(loc, pt.x??pt[0]??0, pt.y??pt[1]??0);
    } else if(p.kind==='color'){
      const cc=parseColorParam(v);
      gl.uniform4f(loc, cc[0],cc[1],cc[2],cc[3]);
    } else if(p.kind==='vec3'){
      let a=v;
      if(typeof a==='string') a=a.split(',').map(x=>parseFloat(x)||0);
      if(typeof a==='number') a=[a,0,0];
      a=(Array.isArray(a)?a:[0,0,0]);
      gl.uniform3f(loc, +a[0]||0, +a[1]||0, +a[2]||0);
    } else if(p.kind==='bool' || p.kind==='selector'){
      gl.uniform1i(loc, Math.round(+v||0));
    } else gl.uniform1f(loc, +v);
  }
}
function parseColorParam(v){
  if(Array.isArray(v) && v.length>=3) return [+v[0]||0, +v[1]||0, +v[2]||0, v[3]===undefined?1:+v[3]];
  if(typeof v==='string'){
    let h=v.replace('#','');
    if(h.length===3) h=h.split('').map(c=>c+c).join('');
    if(h.length===6) h+='ff';
    const n=parseInt(h,16);
    if(!isNaN(n)) return [((n>>24)&255)/255, ((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
  }
  return [1,1,1,1];
}

// blend mode layer -> GL blendFunc (straight alpha)
function applyBlendMode(blend){
  gl.enable(gl.BLEND);
  switch((blend||'normal').toLowerCase()){
    case 'add': case 'lighten': case 'linear dodge':
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE); break;
    case 'multiply':
      gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA); break;
    case 'screen':
      gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); break;
    default:
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}

// ------------------------------------------------------------
// Render satu frame penuh.
//   rasterContent(l, T, tf, metricsOnly)
//     -> {cv, cx, cy, rot, fw, fh, opacity, blend} | null
//     (cv=null bila metricsOnly)
//   evalFxParam(fxObj, key, T) -> nilai param (kf+ease) — app side
// ------------------------------------------------------------
export async function renderFrameGL(project, T, rasterContent, evalFxParam){
  if(!initGL(project.w, project.h)) return null;
  try{
    // pastikan semua def siap (biasanya sudah via preload)
    await Promise.all(collectFxIds(project).map(id=>getFxDef(id)));
    return renderFrameInner(project, T, rasterContent, evalFxParam);
  }catch(e){
    console.warn('[amgl] fallback Canvas2D:', e.message);
    return null;
  }
}

function renderFrameInner(project, T, rasterContent, evalFxParam){
  const fps = project.fps || 60;
  dbg.calls++; dbg.lastT = T; dbg.layers = 0; dbg.linfo = [];
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[COMP_A].fb);
  gl.viewport(0,0,W,H);
  gl.disable(gl.BLEND);
  const bg = hexToRgbArr(project.bg||'#000000');
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  curComp = COMP_A;

  for(const l of project.layers){
    if(!l.visible || l.type==='audio' || l.type==='camera') continue;
    if(T<l.startMs || T>l.endMs) continue;
    if(l.adjFx){ drawAdjFxLayerGL(l, T, rasterContent, evalFxParam, fps); continue }
    drawLayerGL(l, T, rasterContent, evalFxParam, fps);
  }

  // salin ke canvas GL utama
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0,0,W,H);
  gl.disable(gl.BLEND);
  const p = progComposite;
  gl.useProgram(p);
  setCommonUniforms(p, defaultLayerCtx());
  let loc = gl.getUniformLocation(p, 'uOpacity'); if(loc) gl.uniform1f(loc, 1);
  loc = gl.getUniformLocation(p, 'src'); if(loc) gl.uniform1i(loc, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fbos[curComp].tex);
  bindQuad();
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  dbg.frames++;
  // debug: sampel piksel komposit (readPixels kecil)
  try{
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[curComp].fb);
    const px = new Uint8Array(4*9);
    for(let i=0;i<9;i++){
      gl.readPixels(Math.floor(W*(i%3+0.5)/3), Math.floor(H*Math.floor(i/3+0.5)/3), 1,1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(i*4,i*4+4));
    }
    dbg.comp = Array.from(px).join(',');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }catch(e){ dbg.comp = 'ERR '+e.message }
  return glCanvas;
}

function defaultLayerCtx(){
  return { box:[0,0,1,1], l2s:identMat(), layerW:W, layerH:H, pivot:[0,0], vel:[0,0,0], angularVel:0, scaleVel:0 };
}
function identMat(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function hexToRgbArr(h){
  h=(h||'').replace('#','');
  if(h.length===3) h=h.split('').map(c=>c+c).join('');
  const n=parseInt(h,16)||0;
  return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
}

// metrik layer (posisi/ukuran final) + velocity per frame
function layerMetrics(l, T, tf, rasterContent, evalFxParam, fps){
  const m = rasterContent(l, T, tf, true);
  if(!m) return null;
  const df = 1000/fps;
  let vel=[0,0,0], angularVel=0, scaleVel=0;
  const inRange=(t)=> t>=l.startMs && t<=l.endMs;
  if(inRange(T-df) && inRange(T+df)){
    const mp = rasterContent(l, T-df, evalTransformAM(l, T-df, evalFxParam, fps), true);
    const mn = rasterContent(l, T+df, evalTransformAM(l, T+df, evalFxParam, fps), true);
    if(mp && mn){
      vel = [ (mn.cx-mp.cx)/2, -(mn.cy-mp.cy)/2, 0 ]; // Y-up utk shader
      angularVel = (mn.rot-mp.rot)/2;                  // deg/frame
      // fw/fh bisa NEGATIF (scale flip horizontal/vertikal) — pakai abs,
      // klamp Math.max(fw,1) dulu menghasilkan pembagi ~1 -> sv meledak.
      const fw = Math.max(Math.abs(m.fw),1), fh = Math.max(Math.abs(m.fh),1);
      scaleVel = ((Math.abs(mn.fw)-Math.abs(mp.fw))/2)/fw + ((Math.abs(mn.fh)-Math.abs(mp.fh))/2)/fh;
    }
  }
  return { m, vel, angularVel, scaleVel };
}

function drawLayerGL(l, T, rasterContent, evalFxParam, fps){
  dbg.layers = (dbg.layers||0)+1;
  // pass-1: metrik + velocity (transform fx tanpa env velocity)
  const tf0 = evalTransformAM(l, T, evalFxParam, fps);
  const met = layerMetrics(l, T, tf0, rasterContent, evalFxParam, fps);
  if(!met) return;
  // pass-2: script dgn velocity asli (motionblur4 memilih shaderGroups
  // dari env.velocity/angularVelocity/scaleVelocity)
  const velCtx = { velocity:{x:met.vel[0], y:met.vel[1], z:0},
                   angularVelocity: met.angularVel, scaleVelocity: met.scaleVel };
  const tf = evalTransformAM(l, T, evalFxParam, fps, velCtx);
  if(dbg.on){
    const mb=(l.fx||[]).find(f=>/^motionblur/.test(f.id));
    (dbg.vinfo = dbg.vinfo||[]).push({ id:String(l.id).slice(0,6),
      vel:[+met.vel[0].toFixed(1), +met.vel[1].toFixed(1)], av:+met.angularVel.toFixed(2),
      sv:+met.scaleVel.toFixed(4), mbGroups: mb? (mb._groups||[]) : null });
  }
  const m = met.m;
  const contentCanvas = rasterContent(l, T, tf, false);
  if(!contentCanvas || !contentCanvas.cv) return;
  if(dbg.on){
    try{
      const rc = contentCanvas.cv.getContext('2d');
      const p = rc.getImageData(Math.floor(contentCanvas.cv.width/2), Math.floor(contentCanvas.cv.height/2), 1, 1).data;
      (dbg.linfo = dbg.linfo||[]).push({ id:l.id, type:l.type, fx:(l.fx||[]).filter(f=>f.on!==false).map(f=>f.id).join('+'),
        op:m.opacity, tfdx:+(tf.dx||0).toFixed(1), tfdy:+(tf.dy||0).toFixed(1), c:[p[0],p[1],p[2],p[3]] });
    }catch(e){}
  }

  // ---- layerCtx: box & matrix (Y-up normalized) ----
  const rot = (m.rot||0)*Math.PI/180;
  const cxn = m.cx/W, cyn = 1 - m.cy/H;
  const hwn = m.fw/2/W, hhn = m.fh/2/H;
  const ca=Math.cos(rot), sa=Math.sin(rot);
  const ex = hwn*Math.abs(ca)+hhn*Math.abs(sa);
  const ey = hwn*Math.abs(sa)+hhn*Math.abs(ca);
  const box = [cxn-ex, cyn-ey, ex*2, ey*2];
  // l2s: layerNorm(0..1, y-up dlm box) -> screenNorm(0..1, y-up)
  // Shader AM memakai `v*M` (= dot(v, kolom M)) -> translasi HARUS
  // di baris terakhir (R[3],R[7]), bukan kolom terakhir (dulu salah ->
  // tile men-sample offset tanpa translasi -> transparan).
  // Peta: (u,v) -> cxn + M·((u-.5)·fw, (v-.5)·fh)/(W,H), M rot -rot (y-up).
  const c2=Math.cos(-rot), s2=Math.sin(-rot);
  const c0x=m.fw*c2/W, c0y=m.fw*s2/H, c1x=m.fh*(-s2)/W, c1y=m.fh*c2/H;
  const tx=cxn-(c0x+c1x)*0.5, ty=cyn-(c0y+c1y)*0.5;
  const R = new Float32Array(16);
  // v*M: result.x = dot(v,col0) -> col0=(c0x, c1x, 0, tx)
  R[0]=c0x; R[1]=c1x; R[3]=tx;
  R[4]=c0y; R[5]=c1y; R[7]=ty;
  R[10]=1; R[15]=1;
  const layerCtx = {
    box, l2s: R, layerW: m.fw, layerH: m.fh,
    pivot:[0,0], vel: met.vel, angularVel: met.angularVel, scaleVel: met.scaleVel,
  };

  // ---- tekstur input ----
  let srcTex = uploadCanvas(contentCanvas.cv);
  let srcIsOwned = true;

  // ---- rantai efek piksel ----
  // copyBg (lift fill=0): shader lift ASLI di depan rantai —
  // mix(comp × texA, texColor, fill) dgn tekstur comp = composite bawah.
  const fxList = (l.fx||[]).filter(f=>f.on!==false);
  if(l.copyBg && l.fxLift) fxList.unshift(l.fxLift);
  let chain = 0;
  let lastFbo = null;
  for(const f of fxList){
    const pr = getFxProgramsCached(f.id);
    if(!pr) continue;
    const groups = f._groups ?? [0];
    for(const g of groups){
      const prog = pr.progs.get('g'+g);
      if(!prog) continue;
      const target = fbos[CHAIN_START + (chain % (fbos.length-CHAIN_START))];
      // jangan tulis ke FBO yang sedang dibaca
      if(target.tex===srcTex){ chain++; continue }
      chain++;
      lastFbo = target;
      if(dbg.on && f.id.includes('turbulentdisplace')){
        try{
          const src=fbos.find(b=>b.tex===srcTex);
          if(src){
            gl.bindFramebuffer(gl.FRAMEBUFFER, src.fb);
            const px=new Uint8Array(12);
            for(let i=0;i<3;i++) gl.readPixels(Math.floor(W*(i+0.5)/3), Math.floor(H*0.5),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px.subarray(i*4,i*4+4));
            (dbg.tin = dbg.tin||[]).push('IN:'+Array.from(px).join(','));
          } else (dbg.tin = dbg.tin||[]).push('IN:bukan-fbo');
        }catch(e){ (dbg.tin = dbg.tin||[]).push('IN:ERR'); }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0,0,W,H);
      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      setCommonUniforms(prog, layerCtx);
      let loc = gl.getUniformLocation(prog, 'inputImg.texture');
      if(loc){ gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(loc, 0); }
      loc = gl.getUniformLocation(prog, 'inputImg.size');
      if(loc) gl.uniform2f(loc, W, H);
      loc = gl.getUniformLocation(prog, 'comp.texture');
      if(loc){ gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fbos[curComp].tex); gl.uniform1i(loc, 1); }
      loc = gl.getUniformLocation(prog, 'comp.size');
      if(loc) gl.uniform2f(loc, W, H);
      setParamUniforms(prog, pr.def, f, T, evalFxParam);
      bindQuad();
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if(dbg.on && f.id.includes('turbulentdisplace')){
        try{
          const un={};
          const n=gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
          for(let u=0;u<n;u++){
            const info=gl.getActiveUniform(prog,u);
            const ul=gl.getUniformLocation(prog, info.name);
            try{ un[info.name]=gl.getUniform(prog,ul); }catch(e){ un[info.name]='?'; }
          }
          (dbg.unifo = dbg.unifo||[]).push(un);
        }catch(e){}
      }
      if(dbg.on){
        try{
          const px=new Uint8Array(4*3);
          let k=0;
          for(let i=0;i<3;i++){
            gl.readPixels(Math.floor(W*(i+0.5)/3), Math.floor(H*0.5), 1,1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(k*4,k*4+4)); k++;
          }
          (dbg.fxo = dbg.fxo||[]).push(String(l.id).slice(0,4)+'/'+f.id.split('.').pop()+'/g'+g+':'+Array.from(px).join(','));
        }catch(e){}
      }
      if(srcIsOwned) delTexSafe(srcTex), srcIsOwned=false;
      srcTex = target.tex;
    }
  }

  // ---- komposit dengan opacity + blend ----
  // Gambar LANGSUNG ke komposit aktif (srcTex selalu tekstur terpisah —
  // rantai fx menulis ke FBO chain, bukan ke comp). Dulu pakai ping-pong
  // tanpa menyalin isi lama -> layer pertama tertimpa (bug "top half hitam").
  const opacity = clamp01((m.opacity??100)/100) * (tf.alpha??1);
  if(opacity>0.001){
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[curComp].fb);
    gl.viewport(0,0,W,H);
    applyBlendMode(m.blend);
    const p = progComposite;
    gl.useProgram(p);
    setCommonUniforms(p, layerCtx);
    let loc = gl.getUniformLocation(p, 'uOpacity'); if(loc) gl.uniform1f(loc, opacity);
    loc = gl.getUniformLocation(p, 'src'); if(loc) gl.uniform1i(loc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    bindQuad();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  if(srcIsOwned) delTexSafe(srcTex);
}

// Layer adjustment (adjFx, mis. displacemap3 tanpa map):
// input = composite di bawah, efek diterapkan fullscreen, hasil
// dikomposit kembali dengan opacity layer.
function drawAdjFxLayerGL(l, T, rasterContent, evalFxParam, fps){
  const tf = evalTransformAM(l, T, evalFxParam, fps);
  const m = rasterContent(l, T, tf, true);
  if(!m) return;
  let srcTex = fbos[curComp].tex; // composite saat ini (bukan milik kita)
  const ctx0 = defaultLayerCtx();
  // adjustment layer: definisi displacemap3 (raw) + fx lain pada layer
  const fxList = [];
  if(l.adjFxDef) fxList.push(l.adjFxDef);
  for(const f of (l.fx||[])) if(f.on!==false) fxList.push(f);
  let chain = 0;
  let owned = false;
  for(const f of fxList){
    const pr = getFxProgramsCached(f.id);
    if(!pr) continue;
    const groups = f._groups ?? [0];
    for(const g of groups){
      const prog = pr.progs.get('g'+g);
      if(!prog) continue;
      const target = fbos[CHAIN_START + (chain % (fbos.length-CHAIN_START))];
      if(target.tex===srcTex){ chain++; continue }
      chain++;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0,0,W,H);
      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      setCommonUniforms(prog, ctx0);
      let loc = gl.getUniformLocation(prog, 'inputImg.texture');
      if(loc){ gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(loc, 0); }
      loc = gl.getUniformLocation(prog, 'inputImg.size');
      if(loc) gl.uniform2f(loc, W, H);
      loc = gl.getUniformLocation(prog, 'comp.texture');
      if(loc){ gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(loc, 1); }
      loc = gl.getUniformLocation(prog, 'comp.size');
      if(loc) gl.uniform2f(loc, W, H);
      setParamUniforms(prog, pr.def, f, T, evalFxParam);
      bindQuad();
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      srcTex = target.tex; owned=false;
    }
  }
  // komposit hasil kembali (langsung ke comp aktif; src = FBO chain)
  const opacity = clamp01((m.opacity??100)/100) * (tf.alpha??1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[curComp].fb);
  gl.viewport(0,0,W,H);
  applyBlendMode(m.blend || 'normal');
  const p = progComposite;
  gl.useProgram(p);
  setCommonUniforms(p, ctx0);
  let loc = gl.getUniformLocation(p, 'uOpacity'); if(loc) gl.uniform1f(loc, opacity);
  loc = gl.getUniformLocation(p, 'src'); if(loc) gl.uniform1i(loc, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  bindQuad();
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function clamp01(v){ return Math.max(0, Math.min(1, v)) }

// debug counters
export const dbg = { calls:0, frames:0, lastT:-1, err:'', on:false, layers:0, linfo:null };

// ------------------------------------------------------------
// Preload: fetch + parse + kompilasi SEMUA efek sebuah proyek
// ------------------------------------------------------------
export async function preloadFx(project){
  await loadIndex();
  const ids = collectFxIds(project);
  await Promise.all(ids.map(id=>getFxDef(id)));
  await Promise.all(ids.map(id=>getFxPrograms(id)));
}

export function glReady(){ return !!gl }
export function isPreloaded(project){
  for(const id of collectFxIds(project)){
    const d = getFxDefCached(id);
    if(!d) return false;
    if(d.shaders.length && !progCache.has(d.id)) return false;
  }
  return true;
}
export function getNoiseHelpers(){ return AM_HELPERS }
