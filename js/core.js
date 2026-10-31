/* Reza Desk — core utilities (classic script, NOT a module: everything here is a global, shared with index.html's script).
 * Jalali calendar and dates, Persian/Latin digits, escaping, number and money formatting. Pure: nothing here runs at load
 * time except constant definitions, and nothing reads or writes app data (money helpers read only their arguments).
 * Loaded by index.html before the main script; the service worker pre-caches it with the same version as index.html.
 * Its outputs are pinned by tests/fixtures/core-ref.json (recorded from v4.30) and tests/46-core-ref.test.js. */
const CORE_VER='4.32';
/* ---------- Jalali calendar (jalaali-js algorithm) ---------- */
const J=(()=>{
  const div=(a,b)=>~~(a/b), mod=(a,b)=>a-~~(a/b)*b;
  const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
  function jalCal(jy){let bl=breaks.length,gy=jy+621,leapJ=-14,jp=breaks[0],jm,jump,leap,leapG,march,n,i;
    for(i=1;i<bl;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ=leapJ+div(jump,33)*8+div(mod(jump,33),4);jp=jm}
    n=jy-jp;leapJ=leapJ+div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ+=1;
    leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150;march=20+leapJ-leapG;
    if(jump-n<6)n=n-jump+div(jump+4,33)*33;leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;return{leap,gy,march}}
  function g2d(gy,gm,gd){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;return d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752}
  function d2g(jdn){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;const i=div(mod(j,1461),4)*5+308;const gd=div(mod(i,153),5)+1,gm=mod(div(i,153),12)+1,gy=div(j,1461)-100100+div(8-gm,6);return{gy,gm,gd}}
  function toJ(gy,gm,gd){const jdn=g2d(gy,gm,gd);let jy=d2g(jdn).gy-621;const r=jalCal(jy);const f=g2d(r.gy,3,r.march);let k=jdn-f,jm,jd;
    if(k>=0){if(k<=185){jm=1+div(k,31);jd=mod(k,31)+1;return{jy,jm,jd}}else k-=186}else{jy-=1;k+=179;if(r.leap===1)k+=1}
    jm=7+div(k,30);jd=mod(k,30)+1;return{jy,jm,jd}}
  function toG(jy,jm,jd){const r=jalCal(jy);const jdn=g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1;return d2g(jdn)}
  return{toJ,toG};
})();
const MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const WD=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
const wdOf=iso=>{const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d).getDay()};
const SCHED={all:{n:'هر روز',s:'',d:[0,1,2,3,4,5,6]},even:{n:'روزهای زوج (شنبه، دوشنبه، چهارشنبه)',s:'زوج',d:[6,1,3]},odd:{n:'روزهای فرد (یکشنبه، سه‌شنبه، پنجشنبه)',s:'فرد',d:[0,2,4]},custom:{n:'روزهای دلخواه',s:'',d:[]}};
const REP={'':'بدون تکرار',daily:'هر روز',even:'روزهای زوج (شنبه، دوشنبه، چهارشنبه)',odd:'روزهای فرد (یکشنبه، سه‌شنبه، پنجشنبه)',weekly:'هر هفته',monthly:'هر ماه'};
const REPS={daily:'هر روز',even:'زوج',odd:'فرد',weekly:'هفتگی',monthly:'ماهانه'};
function nextOcc(base,rep){const t=today();let d=base>t?base:t;
  if(rep==='weekly'){d=base;do d=addDays(d,7);while(d<=t);return d}
  if(rep==='monthly'){d=base;do{const [y,m,dd]=d.split('-').map(Number);const j=J.toJ(y,m,dd);let jm=j.jm+1,jy=j.jy;if(jm>12){jm=1;jy++}const g=J.toG(jy,jm,Math.min(j.jd,jm<=6?31:jm<12?30:29));d=`${g.gy}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`}while(d<=t);return d}
  const days=rep==='even'?[6,1,3]:rep==='odd'?[0,2,4]:[0,1,2,3,4,5,6];for(let i=0;i<14;i++){d=addDays(d,1);if(days.includes(wdOf(d)))return d}return addDays(t,1)}
const fa=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const en=s=>String(s).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const pad=n=>String(n).padStart(2,'0');
const isoOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=()=>isoOf(new Date());
const addDays=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number);const x=new Date(y,m-1,d+n);return isoOf(x)};
const diffDays=(a,b)=>{const p=s=>{const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d)};return Math.round((p(a)-p(b))/864e5)};
function jOf(iso){const [y,m,d]=iso.split('-').map(Number);return J.toJ(y,m,d)}
function jShort(iso){if(!iso)return'';const j=jOf(iso);return fa(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`)}
function jNice(iso){if(!iso)return'';const t=today();const dd=diffDays(iso,t);
  if(dd===0)return'امروز';if(dd===1)return'فردا';if(dd===-1)return'دیروز';
  const j=jOf(iso);const s=`${fa(j.jd)} ${MONTHS[j.jm-1]}`;return j.jy===jOf(t).jy?s:s+' '+fa(j.jy)}
function jLong(iso){const [y,m,d]=iso.split('-').map(Number);const w=new Date(y,m-1,d).getDay();const j=J.toJ(y,m,d);return `${WD[w]} ${fa(j.jd)} ${MONTHS[j.jm-1]} ${fa(j.jy)}`}
function parseJ(s){s=en(String(s||'').trim());if(!s)return'';const t0=today(),tj=jOf(t0);
  if(/^امروز$/.test(s))return t0;if(/^دیروز$/.test(s))return addDays(t0,-1);if(/^پریروز$/.test(s))return addDays(t0,-2);if(/^فردا$/.test(s))return addDays(t0,1);
  let a,b,c;const mi=MONTHS.findIndex(m=>s.includes(m));
  if(mi>=0){const nums=(s.match(/\d+/g)||[]).map(Number);c=nums[0];b=mi+1;a=nums[1]||tj.jy;if(!c)return null}
  else{const parts=s.split(/[^0-9]+/).filter(Boolean);
    if(parts.length===1){const d=parts[0];if(d.length===8){a=+d.slice(0,4);b=+d.slice(4,6);c=+d.slice(6)}else if(d.length===6){a=1400+ +d.slice(0,2);b=+d.slice(2,4);c=+d.slice(4)}else if(d.length===4){a=tj.jy;b=+d.slice(0,2);c=+d.slice(2)}else if(d.length===3){a=tj.jy;b=+d.slice(0,1);c=+d.slice(1)}else if(d.length<=2){a=tj.jy;b=tj.jm;c=+d}else return null}
    else if(parts.length===2){a=tj.jy;b=+parts[0];c=+parts[1]}else if(parts.length===3){[a,b,c]=parts.map(Number);if(a<100)a+=1400}else return null}
  const max=b<=6?31:b<12?30:(jOf(jIso(a,12,30)).jd===30?30:29);if(b<1||b>12||c<1||c>max)return null;const g=J.toG(a,b,c);return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`}
const MIL=c=>(c||'تومان')==='تومان';
const toBase=(x,c)=>x==null?x:(MIL(c)?Math.round(x*1e7)/10:x);
const fromBase=(x,c)=>x==null||x===''?'':(MIL(c)?Math.round(Number(x)*10)/1e7:Number(x));
const nfmt=(v,d=2)=>fa(new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(v).replace(/,/g,'٬').replace('.','٫').replace(/^-/,'−')).replace(/^−([۰٫]+)$/,'$1');
const ul=(sel,c)=>`<span class="ul" data-for="${sel}" style="font-weight:400;color:var(--muted)">${MIL(c)?' (میلیون تومان)':''}</span>`;
const tmR=v=>{const a=Math.abs(Number(v)||0);const t=Math.round(a*10)/10;const ip=Math.trunc(t),fr=Math.round((t-ip)*10);return fa(ip.toLocaleString('en-US').replace(/,/g,'٬'))+(fr?'٫'+fa(fr):'')+' تومان معادل '+rialTxt(a)};const rlS=v=>Math.abs(Number(v)||0)>=1?`<div class="rl" style="font-size:10.5px;opacity:.7;font-weight:400;line-height:1.5">${tmR(v)}</div>`:'';const MD=7;const rialTxt=v=>fa(Math.round(Math.abs(Number(v)||0)*10).toLocaleString('en-US').replace(/,/g,'٬'))+' ریال';
const moneyFull=(v,c)=>{const a=Math.abs(Number(v)||0);if(MIL(c)&&a>=1e6)return Math.round(a)%1000?nfmt(Math.round(a),0)+' تومان':nfmt(a/1e6,MD)+' میلیون تومان';if(MIL(c)&&a>=1000)return nfmt(a/1000,4)+' هزار تومان';if(MIL(c)&&a&&a<1)return tmR(a);return nfmt(a)+' '+(c||'تومان')};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Jalali date (year, month, day) → ISO; a day past the end of the month is clamped
const jIso=(jy,jm,jd)=>{const g=J.toG(jy,jm,Math.min(jd,jm<=6?31:jm<12?30:29));return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`};
