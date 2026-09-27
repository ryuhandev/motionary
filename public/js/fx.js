/* Katalog efek dari reverse engineering APK 5.0.273 (assets/effects).
   Param min/max/default disalin dari XML asli. Raster mengikuti rumus shader.
   Auto-transform (swing, randomdisplace, oscillate) diterapkan ke transform, bukan piksel. */

export const TRANSFORM_FX = ['swing','swing2','oscillate','oscillate2','oscillate3','shake','shake2','shake-parts','spin','pulsate','pulsate2','pulse-opacity','pulse-opacity2','fade','randomdisplace'];

function P(key,label,min,max,def){ return {key,label,min,max,def} }

export const FX_CATALOG = [
{id:'tile',name:'Tiles',cat:'Distorsi',desc:'Ulangi isi layer, cerminkan bila perlu',params:[P('scale','Skala',0.005,20,1),P('phase','Offset',-100,100,0),P('angle','Sudut',-1800,1800,0),P('mirror','Mirror',0,1,0),P('vertoffs','Offset vertikal',0,1,0)]},
{id:'exposure',name:'Exposure / Gamma',cat:'Warna',desc:'rgb tambah offset, pangkat 1/gamma, kali 2 exposure',params:[P('exposure','Exposure',-2,2,0),P('gamma','Gamma',0.01,9.99,1),P('offset','Offset',-0.9,0.9,0)]},
{id:'hue',name:'Hue Shift',cat:'Warna',desc:'Putar hue via matriks YUV',params:[P('amount','Hue',0,3600,0)]},
{id:'satvib',name:'Vibrance / Saturation',cat:'Warna',desc:'Saturasi dan vibrance',params:[P('amount','Saturasi',-100,100,0),P('vib','Vibrance',0,100,0)]},
{id:'invert',name:'Invert',cat:'Warna',desc:'Balik warna',params:[P('mix','Campuran',0,100,100)]},
{id:'colortune2',name:'Color Tune',cat:'Warna',desc:'Suhu dan tint',params:[P('temp','Suhu',-100,100,0),P('tint','Tint',-100,100,0)]},
{id:'colorhot',name:'Color Hot',cat:'Warna',desc:'Hangatkan highlight',params:[P('amount','Kekuatan',0,100,50)]},
{id:'colortemperature',name:'Color Temperature',cat:'Warna',desc:'Hangat dingin foto',params:[P('amount','Jumlah',-100,100,0)]},
{id:'colorize',name:'Colorize',cat:'Warna',desc:'Ubah hue, jaga luminance',params:[P('tint','Tint',0,360,0)]},
{id:'colorhot',name:'Color Hot',cat:'Warna',desc:'Panas warna (penuh di GPU)',params:[P('color','Warna',-180,180,0),P('tint','Tint',-180,180,60)]},
{id:'threshold',name:'Threshold',cat:'Gaya',desc:'Ambang hitam putih',params:[P('level','Ambang',0,255,128)]},
{id:'poster',name:'Posterize',cat:'Gaya',desc:'Kurangi level warna',params:[P('levels','Level',2,12,4)]},
{id:'findedges',name:'Find Edges',cat:'Gaya',desc:'Sobel 3x3',params:[P('amount','Kekuatan',0,100,80)]},
{id:'pixel',name:'Pixelate',cat:'Gaya',desc:'Kotak piksel',params:[P('size','Ukuran',2,60,12)]},
{id:'noise',name:'Noise',cat:'Gaya',desc:'Butir acak per frame',params:[P('amount','Jumlah',0,100,20)]},
{id:'vignette',name:'Vignette',cat:'Cahaya',desc:'Gelapkan tepi radial',params:[P('amount','Kekuatan',0,100,50)]},
{id:'gaussianblur',name:'Gaussian Blur',cat:'Blur',desc:'Buram halus',params:[P('radius','Radius',0,40,8)]},
{id:'boxblur',name:'Box Blur',cat:'Blur',desc:'Buram kotak',params:[P('radius','Radius',0,40,8)]},
{id:'dblur',name:'Directional Blur',cat:'Blur',desc:'Buram satu arah',params:[P('radius','Radius',0,40,10),P('angle','Sudut',0,360,0)]},
{id:'motionblur3',name:'Motion Blur',cat:'Blur',desc:'Otomatis dari kecepatan gerak',params:[P('tune','Tune',0,4,1),P('usePos','Posisi',0,1,1),P('useScale','Skala',0,1,1),P('useAngle','Sudut',0,1,1)]},
{id:'motionblur2',name:'Motion Blur 2',cat:'Blur',desc:'Otomatis dari kecepatan gerak',params:[P('tune','Tune',0,4,1),P('usePos','Posisi',0,1,1),P('useScale','Skala',0,1,1),P('useAngle','Sudut',0,1,1)]},
{id:'motionblur4',name:'Motion Blur 4',cat:'Blur',desc:'Otomatis dari kecepatan gerak',params:[P('tune','Tune',0,4,1),P('usePos','Posisi',0,1,1),P('useScale','Skala',0,1,1),P('useAngle','Sudut',0,1,1)]},
{id:'zoomblur',name:'Zoom Blur',cat:'Blur',desc:'Buram radial zoom',params:[P('amount','Jumlah',0,100,40)]},
{id:'sharpen',name:'Sharpen',cat:'Blur',desc:'Pertajam kontras lokal',params:[P('strength','Kekuatan',0,20,1),P('radius','Radius',1,10,1)]},
{id:'blink2',name:'Blink',cat:'Gerak',desc:'Alpha nol saat bagian pecahan frekuensi di atas 0.5',params:[P('freq','Frekuensi',0.1,16,2)]},
{id:'mirror',name:'Mirror',cat:'Distorsi',desc:'Cerminkan sumbu',params:[P('axis','Sumbu 0=X 1=Y',0,1,0)]},
{id:'flip',name:'Flip',cat:'Distorsi',desc:'Balik horizontal vertikal',params:[P('axis','Sumbu',0,1,0)]},
{id:'halftonedots',name:'Halftone Dots',cat:'Gaya',desc:'Titik cetak',params:[P('size','Ukuran',2,20,6)]},
{id:'halftonelines',name:'Halftone Lines',cat:'Gaya',desc:'Garis cetak',params:[P('size','Ukuran',2,20,6)]},
{id:'wavewarp2',name:'Wave Warp',cat:'Distorsi',desc:'Gelombang cosinus terarah',params:[P('phase','Fase',0,500,0),P('a1d','Arah',-1800,1800,0),P('m1','Spasi',0,500,20),P('m2','Magnitudo',0,30,4),P('a2d','Arah warp',-180,180,90)]},
{id:'turbulentdisplace3',name:'Turbulent Displace',cat:'Distorsi',desc:'Noise fraktal multi oktaf',params:[P('intensity','Kekuatan',0,2.5,0.25),P('evolution','Evolusi',-50,50,0),P('scale','Skala',0.01,50,1),P('seed','Seed',0,5,0)]},
{id:'randomdisplace',name:'Random Displace',cat:'Gerak',desc:'Geser posisi via simplex noise',params:[P('mag','Mag',0,2000,50),P('evolution','Evolusi',0,2000,0),P('seed','Seed',0,5,0),P('scatter','Scatter',0,2,0.5)]},
{id:'displacemap3',name:'Displace Map',cat:'Distorsi',desc:'Pita dan radial prosedural',params:[P('amount','Jumlah',0,100,40),P('mode','Mode',0,2,0)]},
{id:'swirl4',name:'Swirl',cat:'Distorsi',desc:'Pusaran sudut radius',params:[P('angle','Sudut',-360,360,120),P('radius','Radius',10,300,140)]},
{id:'spin',name:'Spin',cat:'Gerak',desc:'Putar waktu, satuan RPM',params:[P('rpm','RPM',-3600,3600,60)]},
{id:'swing',name:'Swing',cat:'Gerak',desc:'Ayun a1 ke a2 via sine',params:[P('freq','Frekuensi',0.1,16,2),P('a1','Sudut 1',-180,180,-30),P('a2','Sudut 2',-180,180,30),P('phase','Fase',0,2,0)]},
{id:'swing2',name:'Swing 2',cat:'Gerak',desc:'Ayun a1 ke a2 via sine',params:[P('freq','Frekuensi',0.1,16,2),P('a1','Sudut 1',-180,180,-30),P('a2','Sudut 2',-180,180,30),P('phase','Fase',0,2,0)]},
{id:'shake',name:'Shake',cat:'Gerak',desc:'Goyang simplex noise posisi',params:[P('mag','Mag',0,2000,50),P('speed','Kecepatan',0,16,2),P('angle','Sudut',0,3600,45),P('slack','Slack',0,1,0.25),P('seed','Seed',0,5,0),P('evolution','Evolusi',0,2000,0)]},
{id:'shake2',name:'Shake 2',cat:'Gerak',desc:'Goyang simplex noise posisi',params:[P('mag','Mag',0,2000,50),P('freq','Frekuensi',0,16,2),P('evolution','Evolusi',0,2000,0),P('seed','Seed',0,5,0),P('angle','Sudut',0,3600,45),P('slack','Slack',0,1,0.25),P('zshake','Z Shake',0,2000,0)]},
{id:'oscillate3',name:'Oscillate',cat:'Gerak',desc:'Osilasi arah sudut',params:[P('direction','Arah',0,2,0),P('angle','Sudut',-3600,3600,45),P('freq','Frekuensi',0,16,2),P('mag','Mag',0,4000,25),P('type','Gelombang',0,1,0),P('phase','Fase',0,1000,0)]},
{id:'swirl3',name:'Swirl',cat:'Distorsi',desc:'Pusaran strength dan radius fraksional',params:[P('strength','Kekuatan',-0.5,0.5,0.1),P('radius','Radius',0,0.8,0.3)]},
{id:'turbulentdisplace',name:'Turbulent Displace',cat:'Distorsi',desc:'Noise fraktal multi oktaf',params:[P('intensity','Kekuatan',0,2.5,0.25),P('evolution','Evolusi',-50,50,0),P('scale','Skala',0.01,50,1),P('seed','Seed',0,5,0)]},
{id:'stretch2',name:'Stretch',cat:'Distorsi',desc:'Regang satu sumbu',params:[P('scale','Skala',0.01,50,1),P('angle','Sudut',0,3600,0),P('contentOnly','Hanya isi',0,1,0)]},
{id:'rgbsep',name:'RGB Split',cat:'Warna',desc:'Geser kanal warna',params:[P('strength','Kekuatan',-8,8,0.15),P('angle','Sudut',0,3600,0),P('centerChannel','Kanal tengah',0,2,1),P('mode','Mode',0,3,2)]},
{id:'posterize',name:'Posterize',cat:'Gaya',desc:'Kurangi level warna',params:[P('stepCount','Langkah',2,255,10),P('offset','Offset',-1,1,0)]},
{id:'lift',name:'Lift',cat:'Komposit',desc:'Campur dengan komposit di bawahnya',params:[P('fill','Isi',0,1,0)]},
{id:'lumakey3',name:'Luma Key',cat:'Kunci',desc:'Kunci luma low high feather',params:[P('low','Bawah',0,1,0),P('high','Atas',0,1,1),P('feather','Feather',0,1,0.05),P('invert','Invert',0,1,0)]},
{id:'chroma',name:'Chroma Key',cat:'Kunci',desc:'Kunci warna threshold feather',params:[P('threshold','Ambang',0,1,0.1),P('feather','Feather',0.01,0.75,0.05)]},
{id:'scatter',name:'Repeat Scatter',cat:'Gerak',desc:'Sebar salinan',params:[P('n','Jumlah',1,6,3),P('dist','Jarak',0,120,30)]},
{id:'brightness',name:'Brightness',cat:'Warna',desc:'Terang gelap',params:[P('amount','Jumlah',-100,100,15)]},
{id:'contrast',name:'Contrast',cat:'Warna',desc:'Kontras',params:[P('amount','Jumlah',-100,100,20)]},
{id:'tint',name:'Tint',cat:'Warna',desc:'Tint satu warna',params:[P('mix','Campuran',0,100,60)]},
{id:'fade',name:'Fade',cat:'Gerak',desc:'Pudar masuk keluar',params:[P('inMs','Masuk ms',0,2000,400),P('outMs','Keluar ms',0,2000,400)]},
{id:'vibrance',name:'Vibrance',cat:'Warna',desc:'Vibrance saja',params:[P('amount','Jumlah',-100,100,20)]},
{id:'gamma',name:'Gamma',cat:'Warna',desc:'Kurva gamma',params:[P('amount','Gamma',0.01,9.99,1)]},
{id:'spinblur',name:'Spin Blur',cat:'Blur',desc:'Buram putar di sekitar pusat',params:[P('angle','Sudut',0,90,5),P('radius','Radius',0.01,1,0.15),P('cx','Pusat X',0,1,0.5),P('cy','Pusat Y',0,1,0.5)]},
{id:'spinblur2',name:'Spin Blur 2',cat:'Blur',desc:'Buram putar di sekitar pusat',params:[P('center','Pusat',0,1,0.5),P('angle','Sudut',0,90,5),P('radius','Radius',0.01,1,0.15),P('cx','Pusat X',0,1,0.5),P('cy','Pusat Y',0,1,0.5)]},
{id:'stretchsegment',name:'Stretch Segment',cat:'Distorsi',desc:'Regang segmen ber-smooth',params:[P('angle','Sudut',-180,180,0),P('stretch','Regang',-100,100,10),P('offset','Offset',-1000,1000,0),P('smooth','Halus',0,1,0)]},
{id:'offset',name:'Offset',cat:'Distorsi',desc:'Geser isi',params:[P('scale','Skala',0.01,50,1),P('offset','Offset',-1000,1000,0),P('feather','Feather',0,1,0),P('mask','Mask',0,1,0)]},
{id:'transform',name:'Transform',cat:'Gerak',desc:'Skala putar geser alpha',params:[P('scale','Skala',0.01,50,1),P('angle','Sudut',-180,180,0),P('offset','Offset',-1000,1000,0),P('mask','Mask',0,1,0),P('alpha','Alpha',0,1,1),P('fill','Isi',0,1,0),P('sample','Sampel',0,2,1)]},
{id:'pulsate',name:'Pulsate',cat:'Gerak',desc:'Denyut skala',params:[P('freq','Frekuensi',0.1,16,2),P('minsize','Min',0.1,3,0.9),P('maxsize','Maks',0.1,3,1.1),P('phase','Fase',0,2,0),P('type','Gelombang',0,1,0)]},
{id:'pulsate2',name:'Pulsate 2',cat:'Gerak',desc:'Denyut skala',params:[P('freq','Frekuensi',0.1,16,2),P('minsize','Min',0.1,3,0.9),P('maxsize','Maks',0.1,3,1.1),P('phase','Fase',0,2,0),P('type','Gelombang',0,1,0)]},
{id:'pulse-opacity',name:'Pulse Opacity',cat:'Gerak',desc:'Denyut alpha',params:[P('freq','Frekuensi',0.1,16,2),P('strength','Kekuatan',0,1,1),P('phase','Fase',0,2,0),P('type','Gelombang',0,1,0)]},
{id:'pulse-opacity2',name:'Pulse Opacity 2',cat:'Gerak',desc:'Denyut alpha',params:[P('freq','Frekuensi',0.1,16,2),P('strength','Kekuatan',0,1,1),P('phase','Fase',0,2,0),P('type','Gelombang',0,1,0)]},
{id:'oscillate',name:'Oscillate',cat:'Gerak',desc:'Osilasi arah sudut',params:[P('angle','Sudut',-3600,3600,45),P('freq','Frekuensi',0,16,2),P('mag','Mag',0,4000,25),P('type','Gelombang',0,1,0)]},
{id:'oscillate2',name:'Oscillate 2',cat:'Gerak',desc:'Osilasi arah sudut',params:[P('angle','Sudut',-3600,3600,45),P('freq','Frekuensi',0,16,2),P('mag','Mag',0,4000,25),P('type','Gelombang',0,1,0),P('phase','Fase',0,1000,0)]},
{id:'move-along-path',name:'Move Along Path',cat:'Gerak',desc:'Ikuti path (parsial: offset)',params:[P('progress','Progres',0,1,0),P('angle','Sudut',-180,180,0),P('tangent','Tangen',0,1,1),P('inset','Inset',0,100,0),P('offset','Offset',-1000,1000,0)]},
{id:'move-along-path2',name:'Move Along Path 2',cat:'Gerak',desc:'Ikuti path (parsial: offset)',params:[P('progress','Progres',0,1,0),P('angle','Sudut',-180,180,0),P('tangent','Tangen',0,1,1),P('inset','Inset',0,100,0),P('offset','Offset',-1000,1000,0)]},
{id:'move-along-path3',name:'Move Along Path 3',cat:'Gerak',desc:'Ikuti path (parsial: offset)',params:[P('progress','Progres',0,1,0),P('angle','Sudut',-180,180,0),P('tangent','Tangen',0,1,1),P('inset','Inset',0,100,0),P('offset','Offset',-1000,1000,0)]},
{id:'grow-parts',name:'Grow Parts',cat:'Gerak',desc:'Tumbuh (script eksternal AM tak tersedia)',params:[P('amount','Jumlah',0,100,50)]},
{id:'shake-parts',name:'Shake Parts',cat:'Gerak',desc:'Goyang magnitude+evolution',params:[P('mag','Mag',0,2000,10),P('evolution','Evolusi',0,2000,0)]},
{id:'counter',name:'Counter',cat:'Teks',desc:'Animasi angka',params:[P('scale','Skala',-100,100,1),P('offset','Offset',-1e9,1e9,0)]},
{id:'textprogress',name:'Typewriter',cat:'Teks',desc:'Ketik per karakter',params:[P('start','Mulai',0,1,0),P('end','Akhir',0,1,1),P('cursor','Kursor',0,8,0),P('blink','Kedip',0,1,0)]},
{id:'text-spacing',name:'Text Spacing',cat:'Teks',desc:'Spasi huruf/baris',params:[P('letterspacing','Spasi huruf',0,2,0),P('linespacing','Spasi baris',0.5,3,1)]},
{id:'textrand',name:'Text Random',cat:'Teks',desc:'Acak karakter',params:[P('amount','Jumlah',0,1,0),P('evo','Evolusi',0,100,0),P('seed','Seed',0,100,0),P('start','Mulai',0,1,0),P('end','Akhir',0,1,1),P('charset','Set',0,3,0),P('preserveSpace','Jaga spasi',0,1,1)]},
];

const byId={}; FX_CATALOG.forEach(f=>byId[f.id]=f);
export function getFx(id){ return byId[id] }
export function fxDefault(id,key){ const d=byId[id]; if(!d) return undefined; const p=d.params.find(p=>p.key===key); return p?p.def:undefined }
export function isTransformFx(id){ return TRANSFORM_FX.includes(id) }

function triWave(x){ const f=x-Math.floor(x); return f<0.5?f*4-1:3-f*4 }
/* Efek transform: kembalikan dx, dy, drot, sx, sy, alpha, dz.
   Rumus perilaku dari script JS APK (bukan salinan kode).
   tSec = detik timeline; layer boleh null (alpha fade -> 1). */
export function applyTransformFx(fxList, T, evalParam, durMs, layer){
  let dx=0, dy=0, drot=0, sx=1, sy=1, alpha=1, dz=0;
  const tSec=T/1000, dSec=Math.max(0.001,durMs/1000);
  void dSec;
  for(const f of fxList){
    if(f.on===false) continue;
    const g=(k)=>evalParam(f,k,T);
    if(f.id==='swing'||f.id==='swing2'){
      const freq=g('freq')??2, a1=g('a1')??-30, a2=g('a2')??30, ph=g('phase')??0;
      const m=Math.sin((tSec*freq+ph)*Math.PI);
      drot+=((a2-a1)*((m+1)/2))+a1;
    } else if(f.id==='shake'||f.id==='shake2'){
      const mag=g('mag')??50, seed=g('seed')??0, ang=(g('angle')??45)*Math.PI/180;
      const slack=g('slack')??0.25;
      // shake2: evolution + freq*WAKTU (dulu tanpa tSec -> statis).
      const evo=f.id==='shake2'?(g('evolution')??0)+(tSec*(g('freq')??2)):(g('evolution')??0)+(tSec*(g('speed')??2))-(g('speed')??2);
      const s1=Math.sin(evo*1.7+seed*54.6)*0.6+Math.sin(evo*3.1+seed*49.2)*0.4;
      const s2=Math.cos(evo*1.3+seed*19.3+7.4)*0.6+Math.cos(evo*2.7+seed*87.2)*0.4;
      const ox=s1*mag, oy=s2*mag*slack, ca=Math.cos(ang), sa=Math.sin(ang);
      dx+=ox*ca-oy*sa; dy+=ox*sa+oy*ca;
    } else if(f.id==='shake-parts'){
      // behavioral: magnitude + evolution (script eksternal AM tak tersedia).
      const mag=g('mag')??10, evo=g('evolution')??0;
      dx+=Math.sin(evo*1.7+tSec*2.1)*mag; dy+=Math.cos(evo*1.3+tSec*1.7)*mag;
    } else if(f.id==='randomdisplace'){
      // AM auto-transform (dulu salah dikerjakan sebagai piksel).
      const mag=g('mag')??50, evo=g('evolution')??0, seed=g('seed')??0;
      dx+=(Math.sin(evo*1.9+seed*12.7+tSec*2.3)*0.6+Math.sin(evo*3.7+seed*5.1+tSec*4.1)*0.4)*mag;
      dy+=(Math.cos(evo*1.5+seed*7.9+tSec*1.9)*0.6+Math.cos(evo*2.9+seed*3.3+tSec*3.3)*0.4)*mag;
    } else if(f.id==='oscillate3'||f.id==='oscillate'||f.id==='oscillate2'){
      // oscillate3: sudut = 90-angle; oscillate/2: sudut = angle (def asli).
      // Semua varian berjalan terhadap WAKTU (dulu tanpa tSec -> statis).
      const rawA=g('angle')??45;
      const ang=((f.id==='oscillate3')?(90-rawA):rawA)*Math.PI/180;
      const dir=(f.id==='oscillate3')?Math.round(g('direction')??0):0;
      const freq=g('freq')??2, mag=g('mag')??25, ph=g('phase')??0, ty=Math.round(g('type')??0);
      const cyc=tSec*freq*2+ph*2;
      const m=ty===0?Math.sin(cyc*Math.PI):triWave(cyc/2+ph);
      if(dir!==1){ dx+=Math.sin(ang)*mag*m; dy+=Math.cos(ang)*mag*m }
      else dz+=mag*m;
    } else if(f.id==='spin'){
      const rpm=g('rpm')??(g('speed')??60);
      drot+=tSec*rpm*6; // 60rpm = 360°/detik
    } else if(f.id==='pulsate'||f.id==='pulsate2'){
      const freq=g('freq')??2, mn=g('minsize')??0.9, mx=g('maxsize')??1.1, ph=g('phase')??0, ty=Math.round(g('type')??0);
      const cyc=tSec*freq+ph;
      const m=ty===0?Math.sin(cyc*Math.PI):triWave(cyc/2);
      const ds=mn+(mx-mn)*((m+1)/2);
      sx*=ds; sy*=ds;
    } else if(f.id==='pulse-opacity'||f.id==='pulse-opacity2'){
      const freq=g('freq')??2, st=g('strength')??1, ph=g('phase')??0, ty=Math.round(g('type')??0);
      const cyc=tSec*freq+ph;
      const m=(ty===0?Math.sin(cyc*Math.PI):triWave(cyc/2)+0)*0.5+0.5;
      alpha*=(1-st)+Math.max(0,Math.min(1,m))*st;
    } else if(f.id==='fade'){
      // inMs/outMs (detik di def asli) thd durasi layer.
      const L=layer||{};
      const dur=Math.max(1,((L.endMs??T+1000)-(L.startMs??T)));
      const t=dur>0?Math.max(0,Math.min(1,(T-(L.startMs??T))/dur)):1;
      const inN=Math.max(0,(g('inMs')??0.4))/ (dur/1000), outN=Math.max(0,(g('outMs')??0.4))/(dur/1000);
      const ez=(x)=>x<=0?0:x>=1?1:x*x*(3-2*x);
      if(inN>0&&t<inN) alpha*=ez(t/inN);
      if(outN>0&&t>1-outN) alpha*=ez((1-t)/outN);
    }
  }
  return {dx,dy,drot,sx,sy,alpha,dz};
}

export function applyFxStack(srcCanvas, fxList, T, evalParam, layer){
  let cur=srcCanvas;
  for(const f of fxList){
    if(f.on===false) continue;
    if(isTransformFx(f.id)) continue;
    const def=byId[f.id];
    if(!def) continue;
    const p={};
    for(const pr of def.params) p[pr.key]=evalParam(f,pr.key,T);
    if(f.id==='chroma'&&f.params.key!==undefined) p.key=f.params.key;
    cur=applyOne(cur,f.id,p,T,f,layer);
  }
  return cur;
}

const _c1=document.createElement('canvas');
function prep(w,h){ _c1.width=w; _c1.height=h; return _c1.getContext('2d',{willReadFrequently:true}) }

const _pool=[document.createElement('canvas'),document.createElement('canvas'),document.createElement('canvas')];
let _pi=0;
function nextBuf(src,w,h){
  for(let i=0;i<_pool.length;i++){
    const cv=_pool[(_pi+i)%_pool.length];
    if(cv!==src){
      _pi=(_pi+i+1)%_pool.length;
      if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
      return cv;
    }
  }
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h; _pool[_pi]=cv; _pi=(_pi+1)%_pool.length; return cv;
}
function applyOne(src,id,p,T,fx,layer){
  const w=src.width,h=src.height;
  const out=nextBuf(src,w,h);
  const c=out.getContext('2d',{willReadFrequently:true});
  c.setTransform(1,0,0,1,0,0); c.globalAlpha=1; c.globalCompositeOperation='source-over'; c.filter='none';
  c.clearRect(0,0,w,h);
  const putFiltered=(filter)=>{ c.clearRect(0,0,w,h); c.filter=filter; c.drawImage(src,0,0); c.filter='none' };
  switch(id){
    case 'invert': {
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const d=tmp.getImageData(0,0,w,h), o=d.data, m=(p.mix??100)/100;
      for(let i=0;i<o.length;i+=4){ o[i]=o[i]*(1-m)+(255-o[i])*m; o[i+1]=o[i+1]*(1-m)+(255-o[i+1])*m; o[i+2]=o[i+2]*(1-m)+(255-o[i+2])*m }
      tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'threshold': {
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const d=tmp.getImageData(0,0,w,h), o=d.data, lv=p.level??128;
      for(let i=0;i<o.length;i+=4){ const v=(o[i]+o[i+1]+o[i+2])/3>lv?255:0; o[i]=o[i+1]=o[i+2]=v }
      tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'exposure': {
      const ex=p.exposure??0, ga=Math.max(0.01,p.gamma??1), off=p.offset??0;
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const d=tmp.getImageData(0,0,w,h), o=d.data, mul=Math.pow(2,ex), ig=1/ga;
      for(let i=0;i<o.length;i+=4){
        const a=o[i+3]/255;
        let r=(o[i]/255+off*a), g=(o[i+1]/255+off*a), b=(o[i+2]/255+off*a);
        r=Math.pow(Math.max(0,r),ig)*mul; g=Math.pow(Math.max(0,g),ig)*mul; b=Math.pow(Math.max(0,b),ig)*mul;
        o[i]=Math.max(0,Math.min(255,r*255)); o[i+1]=Math.max(0,Math.min(255,g*255)); o[i+2]=Math.max(0,Math.min(255,b*255));
      }
      tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'brightness': { putFiltered('brightness('+(100+(p.amount??0))+ '%)'); return out }
    case 'contrast': { putFiltered('contrast('+(100+(p.amount??0))+ '%)'); return out }
    case 'satvib': case 'vibrance': {
      const s=100+(p.amount??0), v=p.vib??0;
      putFiltered('saturate('+s+'%) brightness('+(100+v*0.15)+'%)'); return out;
    }
    case 'sharpen': {
      const st=p.strength??p.amount??1, rd=Math.max(1,p.radius??1);
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const sd=tmp.getImageData(0,0,w,h), dd=tmp.createImageData(w,h), s=sd.data, d=dd.data;
      const cw=1+st*4, sw2=-st, ox=Math.round(rd), oy=Math.round(rd);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        const xm=Math.max(0,x-ox), xp=Math.min(w-1,x+ox), ym=Math.max(0,y-oy), yp=Math.min(h-1,y+oy);
        for(let k=0;k<4;k++){
          const ci=(y*w+x)*4+k;
          d[ci]=s[(ym*w+x)*4+k]*sw2+s[(yp*w+x)*4+k]*sw2+s[(y*w+xm)*4+k]*sw2+s[(y*w+xp)*4+k]*sw2+s[ci]*cw;
        }
      }
      tmp.putImageData(dd,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'noise': {
      c.drawImage(src,0,0);
      const amt=p.amount??20, a=amt<=1?amt*127:amt/100*60;
      const seed=Math.floor(T/66); let s=seed||1;
      const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967295-0.5 };
      const tmp=c.getImageData(0,0,w,h), o=tmp.data;
      for(let i=0;i<o.length;i+=4){ const n=rnd()*a; o[i]+=n; o[i+1]+=n; o[i+2]+=n }
      c.putImageData(tmp,0,0); return out;
    }
    case 'colorize': {
      // Putar hue sebesar tint (derajat), jaga luminance (aproksimasi CPU;
      // presisi penuh di GPU). Tanpa tint -> identitas (aman).
      const deg=((p.tint??0)%360+360)%360;
      if(deg<0.5&&deg>-0.5){ c.drawImage(src,0,0); return out }
      const rad=deg*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const d=tmp.getImageData(0,0,w,h), o=d.data;
      for(let i=0;i<o.length;i+=4){
        const r=o[i]/255,g=o[i+1]/255,b=o[i+2]/255;
        const y=0.299*r+0.587*g+0.114*b, u=-0.14713*r-0.28886*g+0.436*b, v=0.615*r-0.51499*g-0.10001*b;
        const u2=u*cos+v*sin, v2=-u*sin+v*cos;
        o[i]=Math.max(0,Math.min(255,(y+1.13983*v2)*255)); o[i+1]=Math.max(0,Math.min(255,(y-0.39465*u2-0.58060*v2)*255)); o[i+2]=Math.max(0,Math.min(255,(y+2.03211*u2)*255));
      }
      tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'colorhot': {
      // Triplet bias hue-disc hanya dimengerti shader asli (GPU).
      // CPU: passthrough terdokumentasi (bukan fallback exposure yg merusak).
      c.drawImage(src,0,0); return out;
    }
    case 'hue': case 'gamma': {
      if(id==='gamma'){ const g=Math.max(0.01,p.amount??1); const tmp=prep(w,h); tmp.drawImage(src,0,0); const d=tmp.getImageData(0,0,w,h),o=d.data; for(let i=0;i<o.length;i+=4){ o[i]=255*Math.pow(o[i]/255,1/g); o[i+1]=255*Math.pow(o[i+1]/255,1/g); o[i+2]=255*Math.pow(o[i+2]/255,1/g) } tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out }
      const deg=((p.amount??0)%360+360)%360, rad=deg*Math.PI/180;
      const cos=Math.cos(rad), sin=Math.sin(rad);
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const d=tmp.getImageData(0,0,w,h), o=d.data;
      for(let i=0;i<o.length;i+=4){
        const r=o[i]/255,g=o[i+1]/255,b=o[i+2]/255;
        const y=0.299*r+0.587*g+0.114*b, u=-0.14713*r-0.28886*g+0.436*b, v=0.615*r-0.51499*g-0.10001*b;
        const u2=u*cos+v*sin, v2=-u*sin+v*cos;
        o[i]=Math.max(0,Math.min(255,(y+1.13983*v2)*255)); o[i+1]=Math.max(0,Math.min(255,(y-0.39465*u2-0.58060*v2)*255)); o[i+2]=Math.max(0,Math.min(255,(y+2.03211*u2)*255));
      }
      tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'gaussianblur': case 'boxblur': { const st=p.strength; const r=st!==undefined?Math.max(0,st*8):Math.max(0,p.radius??8); if(r<0.3){c.drawImage(src,0,0);return out} putFiltered('blur('+r+'px)'); return out }

    case 'colortune2': case 'colortemperature': case 'colorhot': {
      const t=((p.temp??p.amount??0)/100)*30;
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const d=tmp.getImageData(0,0,w,h), o=d.data;
      for(let i=0;i<o.length;i+=4){ o[i]+=t; o[i+2]-=t }
      tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'tint': { c.drawImage(src,0,0); c.globalAlpha=(p.mix??60)/100*0.5; c.fillStyle='#00E08A'; c.fillRect(0,0,w,h); c.globalAlpha=1; return out }
    case 'poster': { const lv=Math.max(2,Math.round(p.levels??4)); const tmp=prep(w,h); tmp.drawImage(src,0,0); const d=tmp.getImageData(0,0,w,h),o=d.data; for(let i=0;i<o.length;i+=4){ o[i]=Math.round(o[i]/255*(lv-1))/(lv-1)*255; o[i+1]=Math.round(o[i+1]/255*(lv-1))/(lv-1)*255; o[i+2]=Math.round(o[i+2]/255*(lv-1))/(lv-1)*255 } tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out }
    case 'posterize': {
      const lv=Math.max(2,p.stepCount??10), off=(p.offset??0)+0.05;
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const d=tmp.getImageData(0,0,w,h), o=d.data;
      for(let i=0;i<o.length;i+=4){
        o[i]=(Math.floor(o[i]/255*lv+off)-off)/lv*255;
        o[i+1]=(Math.floor(o[i+1]/255*lv+off)-off)/lv*255;
        o[i+2]=(Math.floor(o[i+2]/255*lv+off)-off)/lv*255;
      }
      tmp.putImageData(d,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'swirl3': {
      const st=p.strength??0.1, rad=Math.max(0.01,p.radius??0.3);
      const A=st<=0.5?st/0.5:(1-(st-0.5)/0.5);
      const t2=document.createElement('canvas'); t2.width=w; t2.height=h;
      const tc=t2.getContext('2d'); tc.drawImage(src,0,0);
      const sd=tc.getImageData(0,0,w,h), dd=c.createImageData(w,h), s=sd.data, d=dd.data;
      const cx=w/2, cy=h/2, R=rad*Math.min(w,h), asp=h/Math.max(1,w);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        let ox=x-cx, oy=(y-cy)*asp;
        const dist=Math.sqrt(ox*ox+oy*oy);
        let sx=x, sy=y;
        if(dist<R&&R>0){ const pc=(R-dist)/R, th=pc*pc*A*8*Math.PI, ca=Math.cos(th), sa=Math.sin(th); sx=cx+ox*ca-oy*sa; sy=cy+(ox*sa+oy*ca)/asp }
        const ix=Math.max(0,Math.min(w-1,Math.round(sx))), iy=Math.max(0,Math.min(h-1,Math.round(sy))), si=(iy*w+ix)*4, di=(y*w+x)*4;
        d[di]=s[si]; d[di+1]=s[si+1]; d[di+2]=s[si+2]; d[di+3]=s[si+3];
      }
      c.putImageData(dd,0,0); return out;
    }
    case 'rgbsep': {
      const st=(p.strength??0.15)/8, ang=(p.angle??0)*Math.PI/180;
      const ox=Math.cos(ang)*st*w, oy=-Math.sin(ang)*st*w;
      const t2=document.createElement('canvas'); t2.width=w; t2.height=h;
      const tc=t2.getContext('2d'); tc.drawImage(src,0,0);
      c.drawImage(t2,0,0);
      const dd=c.getImageData(0,0,w,h), sd=tc.getImageData(0,0,w,h), d=dd.data, s=sd.data;
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        const lx=Math.max(0,Math.min(w-1,Math.round(x-ox))), ly=Math.max(0,Math.min(h-1,Math.round(y-oy)));
        const hx=Math.max(0,Math.min(w-1,Math.round(x+ox))), hy=Math.max(0,Math.min(h-1,Math.round(y+oy)));
        const di=(y*w+x)*4;
        d[di]=s[(ly*w+lx)*4]; d[di+2]=s[(hy*w+hx)*4];
      }
      c.putImageData(dd,0,0); return out;
    }
    case 'stretch2': {
      const sc=Math.max(0.01,p.scale??1), ang=(p.angle??0)*Math.PI/180;
      const ca=Math.cos(ang), sa=Math.sin(ang);
      const t2=document.createElement('canvas'); t2.width=w; t2.height=h;
      const tc=t2.getContext('2d'); tc.drawImage(src,0,0);
      const sd=tc.getImageData(0,0,w,h), dd=c.createImageData(w,h), s=sd.data, d=dd.data;
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        let nx=(x/w-0.5), ny=(y/h-0.5);
        let rx=nx*ca-ny*sa, ry=nx*sa+ny*ca;
        rx/=sc;
        nx=rx*ca+ry*sa; ny=-rx*sa+ry*ca;
        const ix=Math.max(0,Math.min(w-1,Math.round((nx+0.5)*w))), iy=Math.max(0,Math.min(h-1,Math.round((ny+0.5)*h)));
        const si=(iy*w+ix)*4, di=(y*w+x)*4;
        d[di]=s[si]; d[di+1]=s[si+1]; d[di+2]=s[si+2]; d[di+3]=s[si+3];
      }
      c.putImageData(dd,0,0); return out;
    }
    case 'lift': { c.drawImage(src,0,0); return out }
    case 'turbulentdisplace': {
      const inten=p.intensity??0.25, evo=p.evolution??0, sc=Math.max(0.01,p.scale??1), seed=p.seed??0;
      const slices=Math.min(72,h);
      for(let i=0;i<slices;i++){
        const sh=h/slices, yy=i*sh;
        const n=Math.sin(yy/sc*0.05+evo+seed*7)*0.6+Math.sin(yy/sc*0.13+evo*1.7+seed*3)*0.4;
        const off=n*inten*60;
        c.drawImage(src,0,yy,w,sh,off,yy,w,sh);
      }
      return out;
    }
    case 'pixel': { const s=Math.max(2,p.size??12); const tw=Math.max(1,Math.round(w/s)), th=Math.max(1,Math.round(h/s)); const t2=document.createElement('canvas'); t2.width=tw; t2.height=th; const tc=t2.getContext('2d'); tc.imageSmoothingEnabled=false; tc.drawImage(src,0,0,tw,th); c.imageSmoothingEnabled=false; c.drawImage(t2,0,0,tw,th,0,0,w,h); return out }
    case 'vignette': { c.drawImage(src,0,0); const g=c.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.max(w,h)*0.75); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,'+(((p.amount??50)/100)*0.85)+')'); c.fillStyle=g; c.fillRect(0,0,w,h); return out }
    case 'findedges': {
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const sd=tmp.getImageData(0,0,w,h), dd=tmp.createImageData(w,h), s=sd.data, d=dd.data;
      const k=[-1,0,1,-2,0,2,-1,0,1];
      for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
        let r=0,g2=0,b=0;
        for(let ky=-1;ky<=1;ky++) for(let kx=-1;kx<=1;kx++){ const o=((y+ky)*w+(x+kx))*4, kk=k[(ky+1)*3+(kx+1)]; r+=s[o]*kk; g2+=s[o+1]*kk; b+=s[o+2]*kk }
        const o=(y*w+x)*4, v=Math.min(255,Math.abs(r)+Math.abs(g2)+Math.abs(b));
        d[o]=d[o+1]=d[o+2]=v; d[o+3]=s[o+3];
      }
      tmp.putImageData(dd,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'dblur': case 'zoomblur': {
      const tune=p.tune??1;
      c.globalAlpha=0.35; c.drawImage(src,-3*tune,0); c.drawImage(src,3*tune,0);
      c.globalAlpha=1; c.drawImage(src,0,0); return out;
    }
    case 'motionblur3': case 'motionblur2': case 'motionblur4': {
      const tune=p.tune??1, v=(fx&&fx._vel)||{vx:0,vy:0};
      const sp=Math.sqrt(v.vx*v.vx+v.vy*v.vy);
      const spread=Math.min(24,sp*tune/60);
      if(spread<0.5){ c.drawImage(src,0,0); return out }
      const n=Math.min(8,Math.max(2,Math.round(spread)));
      const ux=v.vx/(sp||1), uy=v.vy/(sp||1);
      c.globalAlpha=1; c.drawImage(src,0,0);
      c.globalAlpha=0.3;
      for(let i=0;i<n;i++){ const o=(i/(n-1)-0.5)*spread; if(i/(n-1)===0.5) continue; c.drawImage(src,o*ux,o*uy) }
      c.globalAlpha=1; return out;
    }
    case 'blink2': {
      // AM: alpha 0 saat fraksi (freq*t) > 0.5 (dulu kunci speed/duty yg salah).
      const fr=p.freq??2;
      const gate=(((T/1000*fr)%1)+1)%1>0.5?0:1;
      c.globalAlpha=gate; c.drawImage(src,0,0); c.globalAlpha=1; return out;
    }
    case 'fade': { c.drawImage(src,0,0); return out }
    case 'tile': {
      const sc=Math.max(0.005,p.scale??1), ph=p.phase??0, ang=(p.angle??0)*Math.PI/180, mir=(p.mirror??1)>=0.5, vo=(p.vertoffs??0)>=0.5;
      const ca=Math.cos(ang), sa=Math.sin(ang);
      c.fillStyle='#000'; c.fillRect(0,0,w,h);
      const tw=w/sc, th=h/sc;
      const nx=Math.ceil(w/tw)+2, ny=Math.ceil(h/th)+2;
      for(let ix=-1;ix<nx;ix++) for(let iy=-1;iy<ny;iy++){
        let sx=ix*tw, sy=iy*th;
        if(!vo) sx+=((iy%2+2)%2)*ph/100*tw; else sy+=((ix%2+2)%2)*ph/100*th;
        const dx=sx-w/2, dy=sy-h/2, rx=dx*ca-dy*sa+w/2, ry=dx*sa+dy*ca+h/2;
        if(mir&&(((ix%2+2)%2)+((iy%2+2)%2))%2===1){ c.save(); c.translate(rx+tw/2,ry+th/2); c.scale(-1,1); c.drawImage(src,-tw/2,-th/2,tw,th); c.restore() }
        else c.drawImage(src,rx,ry,tw,th);
      }
      return out;
    }
    case 'mirror': case 'flip': { c.save(); if((p.axis??0)<0.5){c.translate(w,0);c.scale(-1,1)} else {c.translate(0,h);c.scale(1,-1)} c.drawImage(src,0,0); c.restore(); return out }
    case 'halftonedots': {
      const s=Math.max(2,p.size??6);
      const t2=document.createElement('canvas'); t2.width=w; t2.height=h;
      const tc=t2.getContext('2d',{willReadFrequently:true}); tc.drawImage(src,0,0);
      const d=tc.getImageData(0,0,w,h).data;
      c.fillStyle='#000'; c.fillRect(0,0,w,h); c.fillStyle='#fff';
      for(let y=0;y<h;y+=s) for(let x=0;x<w;x+=s){
        const o=((Math.min(h-1,y)|0)*w+(Math.min(w-1,x)|0))*4;
        const l=(d[o]+d[o+1]+d[o+2])/3/255, r=s*0.45*Math.sqrt(l);
        c.beginPath(); c.arc(x+s/2,y+s/2,Math.max(0.3,r),0,7); c.fill();
      }
      c.globalCompositeOperation='destination-in'; c.drawImage(src,0,0);
      c.globalCompositeOperation='source-over'; return out;
    }
    case 'halftonelines': { c.drawImage(src,0,0); c.fillStyle='rgba(0,0,0,0.35)'; const s=Math.max(2,p.size??6); for(let y=0;y<h;y+=s) c.fillRect(0,y,w,1); return out }
    case 'randomdisplace': {
      // AM "Random Displace" (simplex displace): geser PIKSEL dengan noise
      const mag=p.mag??50, evo=p.evolution??0, seed=p.seed??0, sc=p.scatter??0.5;
      const freq=0.012+ (2-sc)*0.02; // scatter besar = noise lebih halus
      const hash=(a,b)=>{ let h=Math.sin(a*127.1+b*311.7+seed*74.7+evo*57.3)*43758.5453; return h-Math.floor(h) };
      const sm=(a,b)=>{ const ix=Math.floor(a),iy=Math.floor(b),fx2=a-ix,fy2=b-iy;
        const u=fx2*fx2*(3-2*fx2), v=fy2*fy2*(3-2*fy2);
        return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v };
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const sd=tmp.getImageData(0,0,w,h), dd=c.createImageData(w,h), s=sd.data, d=dd.data;
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        const nx=sm(x*freq,y*freq)*2-1, ny=sm(x*freq+53.7,y*freq+91.3)*2-1;
        const ix=Math.max(0,Math.min(w-1,Math.round(x+nx*mag))), iy=Math.max(0,Math.min(h-1,Math.round(y+ny*mag)));
        const si=(iy*w+ix)*4, di=(y*w+x)*4;
        d[di]=s[si]; d[di+1]=s[si+1]; d[di+2]=s[si+2]; d[di+3]=s[si+3];
      }
      tmp.putImageData(dd,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'wavewarp2': {
      // AM: m1=spacing, m2=magnitudo (fraksi 0..1 relatif spacing), a1d=arah
      // gelombang, a2d=sudut offset pergeseran, phase (siklus berjalan)
      const phase=p.phase??0, a1=(p.a1d??0)*Math.PI/180, m1=Math.max(0.5,(p.m1??20))*w/100, m2=p.m2??4, a2=((p.a1d??0)+(p.a2d??90))*Math.PI/180;
      const amp=m2*m1; // amplitudo = fraksi × spacing (m1 dinormalisasi lebar kanvas)
      const dx=Math.cos(a1), dy=-Math.sin(a1), wx=Math.cos(a2), wy=-Math.sin(a2);
      const slices=Math.min(128,h);
      for(let i=0;i<slices;i++){
        const sh=h/slices, yy=i*sh+sh/2;
        const proj=((yy/h)*dy)*w; // proyeksi posisi slice pada arah gelombang
        const off=Math.cos((proj/m1)*Math.PI*2+phase)*amp;
        c.drawImage(src,0,yy,w,sh,wx*off,yy+wy*off,w,sh);
      }
      return out;
    }
    case 'turbulentdisplace3': {
      const inten=p.intensity??0.25, evo=p.evolution??0, sc=Math.max(0.01,p.scale??1), seed=p.seed??0;
      const slices=Math.min(72,h);
      for(let i=0;i<slices;i++){
        const sh=h/slices, yy=i*sh;
        const n=Math.sin(yy/sc*0.05+evo+seed*7)*0.6+Math.sin(yy/sc*0.13+evo*1.7+seed*3)*0.4;
        const off=n*inten*60;
        c.drawImage(src,0,yy,w,sh,off,yy,w,sh);
      }
      return out;
    }
    case 'displacemap3': {
      const amt=p.amount??40, mode=Math.round(p.mode??0);
      const slices=48;
      for(let i=0;i<slices;i++){
        const sh=h/slices, yy=i*sh;
        let off=0;
        if(mode===0) off=Math.sin(yy/h*Math.PI*4+T/700)*amt*0.4;
        else if(mode===1) off=(yy/h-0.5)*amt;
        else off=Math.cos(yy/h*Math.PI*2)*amt*0.3;
        c.drawImage(src,0,yy,w,sh,off,yy,w,sh);
      }
      return out;
    }
    case 'swirl4': {
      const ang=(p.angle??120)*Math.PI/180, rad=Math.max(10,p.radius??140);
      const t2=document.createElement('canvas'); t2.width=w; t2.height=h;
      const tc=t2.getContext('2d'); tc.drawImage(src,0,0);
      const sd=tc.getImageData(0,0,w,h), dd=c.createImageData(w,h), s=sd.data, d=dd.data;
      const cx=w/2, cy=h/2;
      for(let y=0;y<h;y+=1) for(let x=0;x<w;x+=1){
        const ox=x-cx, oy=y-cy, r=Math.sqrt(ox*ox+oy*oy);
        let sx=x, sy=y;
        if(r<rad){ const a=ang*(1-r/rad); const ca=Math.cos(a), sa=Math.sin(a); sx=cx+ox*ca-oy*sa; sy=cy+ox*sa+oy*ca }
        const ix=Math.max(0,Math.min(w-1,Math.round(sx))), iy=Math.max(0,Math.min(h-1,Math.round(sy))), si=(iy*w+ix)*4, di=(y*w+x)*4;
        d[di]=s[si]; d[di+1]=s[si+1]; d[di+2]=s[si+2]; d[di+3]=s[si+3];
      }
      c.putImageData(dd,0,0); return out;
    }
    case 'spin': { c.translate(w/2,h/2); c.rotate(T/1000*(p.rpm??p.speed??90)*Math.PI/180); c.drawImage(src,-w/2,-h/2); c.setTransform(1,0,0,1,0,0); return out }
    case 'spinblur': case 'spinblur2': {
      // Blur putar di sekitar pusat (bukan motion-blur linear — dulu salah alias).
      const ang=(p.angle??5)*Math.PI/180;
      let cx=p.cx??0.5, cy=p.cy??0.5;
      if(Array.isArray(p.center)){ cx=p.center[0]??cx; cy=p.center[1]??cy }
      const n=Math.max(2,Math.min(8,Math.round(Math.abs(ang)*180/Math.PI/2)+2));
      c.globalAlpha=1/n;
      for(let i=0;i<n;i++){
        const a=ang*(i/(n-1)-0.5);
        c.save(); c.translate(cx*w,cy*h); c.rotate(a); c.translate(-cx*w,-cy*h);
        c.drawImage(src,0,0); c.restore();
      }
      c.globalAlpha=1; return out;
    }
    case 'offset': {
      // Geser isi (aproksimasi CPU; presisi penuh di jalur GPU).
      const sc=p.scale??1;
      let ox=0, oy=0;
      if(Array.isArray(p.offset)){ ox=p.offset[0]??0; oy=p.offset[1]??0 }
      else if(typeof p.offset==='number'){ ox=p.offset }
      c.drawImage(src,-ox/1000*w*sc,oy/1000*h*sc,w,h); return out;
    }
    case 'transform': {
      // Aproksimasi CPU: skala+putar+geser+alpha (mask/fill/sample: GPU).
      const sc=p.scale??1, ang=(p.angle??0)*Math.PI/180, al=p.alpha??1;
      let ox=0, oy=0;
      if(Array.isArray(p.offset)){ ox=p.offset[0]??0; oy=p.offset[1]??0 }
      c.globalAlpha=Math.max(0,Math.min(1,al));
      c.translate(w/2,h/2); c.rotate(-ang); c.scale(Math.max(0.01,sc),Math.max(0.01,sc));
      c.translate(-w/2+ox,-h/2+oy);
      c.drawImage(src,0,0); c.globalAlpha=1; return out;
    }
    case 'stretchsegment': {
      // Aproksimasi CPU regang-segmen ber-smooth (penuh di GPU).
      const ang=(p.angle??0)*Math.PI/180, st=p.stretch??10, off=p.offset??0, sm=p.smooth??0;
      const ca=Math.cos(ang), sa=Math.sin(ang);
      const slices=Math.min(64,Math.max(8,h));
      for(let i=0;i<slices;i++){
        const sh=h/slices, yy=i*sh;
        const dist=((yy+sh/2)/h-0.5)+off/1000;
        const adj=st/500, se=Math.max(0.02,sm*adj+0.02);
        const d=adj*Math.exp(-(dist*dist)/(2*se*se))*(dist>=0?-1:1);
        c.drawImage(src,0,yy,w,sh,ca*d*w*0.25,yy+sa*d*w*0.25,w,sh);
      }
      return out;
    }
    case 'shake': { const a=p.amount??12, s=p.speed??12; c.drawImage(src,Math.sin(T/1000*s)*a,Math.cos(T/1000*s*1.3)*a); return out }
    case 'scatter': { const n=Math.max(1,Math.round(p.n??3)), d=Math.max(0,p.dist??30); c.globalAlpha=0.85; for(let i=0;i<n;i++) c.drawImage(src,(i-(n-1)/2)*d,(i-(n-1)/2)*d*0.6); c.globalAlpha=1; return out }
    case 'lumakey3': {
      const lo=(p.low??0)*255, hi=(p.high??1)*255, fe=(p.feather??0.05)*255, inv=(p.invert??0)>=0.5;
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const dd=tmp.getImageData(0,0,w,h), o=dd.data;
      for(let i=0;i<o.length;i+=4){
        const l=(o[i]+o[i+1]+o[i+2])/3;
        let a=255;
        if(l<lo) a=0; else if(l<lo+fe) a=255*(l-lo)/Math.max(1,fe);
        else if(l>hi) a=0; else if(l>hi-fe) a=255*(hi-l)/Math.max(1,fe);
        if(inv) a=255-a;
        o[i+3]=o[i+3]*a/255;
      }
      tmp.putImageData(dd,0,0); c.drawImage(_c1,0,0); return out;
    }
    case 'chroma': {
      const th=(p.threshold??0.1)*255, fe=Math.max(1,(p.feather??0.05)*255), inv=(p.invert??0)>=0.5;
      const kc=String(p.key||'#FF00FF00');
      const kr=parseInt(kc.slice(3,5),16)||0, kg=parseInt(kc.slice(5,7),16)||255, kb=parseInt(kc.slice(7,9),16)||0;
      const tmp=prep(w,h); tmp.drawImage(src,0,0);
      const dd=tmp.getImageData(0,0,w,h), o=dd.data;
      for(let i=0;i<o.length;i+=4){
        const r=o[i],g=o[i+1],b=o[i+2];
        const dist=Math.sqrt((r-kr)*(r-kr)+(g-kg)*(g-kg)+(b-kb)*(b-kb));
        let a=255;
        if(dist<th) a=0; else if(dist<th+fe) a=255*(dist-th)/fe;
        if(inv) a=255-a;
        o[i+3]=o[i+3]*a/255;
      }
      tmp.putImageData(dd,0,0); c.drawImage(_c1,0,0); return out;
    }
    default: c.drawImage(src,0,0); return out;
  }
}
