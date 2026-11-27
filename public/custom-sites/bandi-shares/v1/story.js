/* Hero story, looping: Bandi Shares logo -> global capital flows (globe) -> economics (yield curve) -> trading (candles).
   One set of gold particles morphs between scenes. Decorative: no real prices. Click a step to jump. */
{
const host=document.getElementById('globe');
if(host){
const root=document.documentElement,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let C={};const pal=()=>{const d=root.dataset.theme==='dark';C={d,gold:d?'232,178,62':'196,138,26',lgold:d?'240,206,140':'196,138,26',ink:d?'226,232,240':'15,23,42',dot:d?'148,163,184':'51,65,85',up:d?'34,197,94':'22,163,74',dn:d?'239,68,68':'220,38,38',grid:d?'rgba(148,163,184,.10)':'rgba(15,23,42,.07)'}};pal();
const cv=document.createElement('canvas');host.appendChild(cv);const x=cv.getContext('2d');let W=0,H=0;
// steps UI
const SC=[{k:'logo',d:3.6,t:'Bandi Shares',s:'Economic insights'},{k:'globe',d:7,t:'Global macro',s:'Capital moves between financial centres'}];
const nav=document.createElement('div');nav.className='steps';nav.innerHTML=SC.map((s,i)=>`<button type="button" data-i="${i}"><i><b></b></i><span>${s.t}</span></button>`).join('');host.appendChild(nav);
const btn=[...nav.querySelectorAll('button')];
// land points
const L=window.LAND||[],G=[];for(let i=0;i<L.length;i+=2){const la=L[i]/10*Math.PI/180,lo=L[i+1]/10*Math.PI/180;G.push([Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)])}
const N=G.length,seed=G.map(()=>[Math.random(),Math.random(),Math.random(),Math.random()]);
// logo: crisp images (light and dark) + sampled points
const imgD=new Image(),imgL=new Image();imgD.src=host.dataset.logo;imgL.src=host.dataset.logoLight||host.dataset.logo;let LP=[],LB=null;
function sampleLogo(){if(!imgD.complete||!W)return;const lw=Math.min(W*.84,560),lh=lw*imgD.height/imgD.width;LB={w:lw,h:lh};const oc=document.createElement('canvas');oc.width=Math.ceil(lw);oc.height=Math.ceil(lh);const o=oc.getContext('2d');o.drawImage(imgD,0,0,lw,lh);const d=o.getImageData(0,0,oc.width,oc.height).data;
 const pts=[],step=Math.max(2,Math.round(lw/240));for(let yy=0;yy<oc.height;yy+=step)for(let xx=0;xx<oc.width;xx+=step)if(d[(yy*oc.width+xx)*4+3]>140)pts.push([xx-lw/2,yy-lh/2]);
 for(let i=pts.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[pts[i],pts[j]]=[pts[j],pts[i]]}LP=pts}
imgD.onload=sampleLogo;
const size=()=>{const r=cv.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;x.setTransform(dpr,0,0,dpr,0,0);sampleLogo()};new ResizeObserver(size).observe(cv);
// globe data
const vec=([la,lo])=>{la*=Math.PI/180;lo*=Math.PI/180;return[Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)]};
const city={JNB:[-26.2,28],LDN:[51.5,-.1],NYC:[40.7,-74],TYO:[35.7,139.7],FRA:[50.1,8.7],HKG:[22.3,114.2],SYD:[-33.9,151.2],LOS:[6.5,3.4],DXB:[25.2,55.3],SAO:[-23.5,-46.6],SGP:[1.3,103.8]};
const names={JNB:'Johannesburg',LDN:'London',NYC:'New York',TYO:'Tokyo',HKG:'Hong Kong',DXB:'Dubai'};
const CV=Object.fromEntries(Object.entries(city).map(([k,v])=>[k,vec(v)]));
const arcs=[['JNB','LDN'],['JNB','NYC'],['LDN','NYC'],['LDN','FRA'],['NYC','TYO'],['HKG','LDN'],['JNB','HKG'],['DXB','LDN'],['SGP','SYD'],['SAO','NYC'],['LOS','LDN'],['TYO','HKG'],['JNB','DXB'],['FRA','DXB']].map((a,i)=>({a:CV[a[0]],b:CV[a[1]],off:i*.37,sp:.16+(i%4)*.03}));
// yield curve
const MAT=['3M','6M','1Y','2Y','5Y','10Y','30Y'],MX=[0,.07,.16,.3,.52,.74,1];
const REG=[['Normal',[.30,.34,.40,.50,.62,.70,.78]],['Inverted',[.80,.78,.72,.60,.52,.50,.54]],['Re-steepening',[.18,.21,.27,.40,.58,.73,.86]]];
const lerpA=(a,b,u)=>a.map((v,k)=>v+(b[k]-v)*u);
const yAt=(ys,u)=>{let k=0;while(k<MX.length-2&&u>MX[k+1])k++;const f=(u-MX[k])/(MX[k+1]-MX[k]),s=f*f*(3-2*f);return ys[k]+(ys[k+1]-ys[k])*s};
// candles
const NC=28;let CD=[];const genC=()=>{CD=[];let p=50;for(let i=0;i<NC;i++){const o=p;p=Math.max(15,Math.min(85,p+(Math.random()-.42)*7));CD.push({o,c:p,h:Math.max(o,p)+Math.random()*3,l:Math.min(o,p)-Math.random()*3})}};genC();
let scr=0,lastPush=0,LO=0,HI=100,liveP=0;
const pushC=()=>{const d=CD[NC-1];const c=d.c+liveP;CD.shift();d.c=c;d.h=Math.max(d.h,c);d.l=Math.min(d.l,c);const o=c;CD.push({o,c:o,h:o+.6,l:o-.6});liveP=(Math.random()-.45)*3;scr=1};
let mx=0,my=0;host.addEventListener('pointermove',e=>{const r=cv.getBoundingClientRect();mx=(e.clientX-r.left)/r.width-.5;my=(e.clientY-r.top)/r.height-.5});
// timeline
const TR=1.9;let cur=0,nxt=-1,sStart=0,trStart=0,clock=0,last=performance.now();
const go=i=>{if(i===cur&&nxt<0)return;nxt=i;trStart=clock};
btn.forEach(b=>b.addEventListener('click',()=>go(+b.dataset.i)));
const eio=u=>u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
// per-scene state
const gview=()=>{const cx=W*.5,cy=H*.44,R=Math.min(W,H)*.35,rot=-0.75+clock*.14+mx*.4,tilt=.32+my*.15;const ct=Math.cos(tilt),st=Math.sin(tilt),cr=Math.cos(rot),sr=Math.sin(rot);
 return{cx,cy,R,p:v=>{const X=v[0]*cr+v[2]*sr,Z=-v[0]*sr+v[2]*cr;const Y=v[1]*ct-Z*st,Z2=v[1]*st+Z*ct;return[cx+R*X,cy-R*Y,Z2]}}};
const box=()=>({l:W*.1,r:W*.9,t:H*.16,b:H*.74});
const curveYs=lt=>{const ph=(lt/1.35)%REG.length,i=Math.floor(ph),u=eio(Math.min(1,(ph-i)/.5));return{ys:lerpA(REG[i][1],REG[(i+1)%REG.length][1],u),lab:u>.5?REG[(i+1)%REG.length][0]:REG[i][0]}};
// target for particle i in scene k -> [x,y,alpha,rgb]
function target(k,i,env){const s=seed[i];
 if(k==='logo'){const n=LP.length;if(!n)return[W/2,H/2,0,C.lgold];const p=LP[i%n];return[W/2+p[0],H*.46+p[1],i<n?1:.0,C.lgold]}
 if(k==='globe'){const q=env.g.p(G[i]);return[q[0],q[1],q[2]<0?0:(.18+.7*q[2])*(C.d?.75:.65),C.dot]}
 if(k==='curve'){const B=env.b,ys=env.ys;const r=s[0];if(r<.55){const u=s[1];return[B.l+(B.r-B.l)*u,B.b-(B.b-B.t)*yAt(ys,u)+(s[2]-.5)*3,.95,C.gold]}
  if(r<.85){const u=s[1],top=B.b-(B.b-B.t)*yAt(ys,u),v=s[2];return[B.l+(B.r-B.l)*u,top+(B.b-top)*v,.32*(1-v),C.gold]}
  const gy=Math.floor(s[2]*6)/5;return[B.l+(B.r-B.l)*s[1],B.t+(B.b-B.t)*gy,.18,C.dot]}
 if(k==='candles'){const B=env.b,cw=(B.r-B.l)/NC,Y=v=>B.b-(B.b-B.t)*(v-env.lo)/(env.hi-env.lo);const ci=Math.floor(s[1]*NC),d=CD[ci],live=ci===NC-1;const c=live?env.lc:d.c,up=c>=d.o,col=up?C.up:C.dn,cx=B.l+ci*cw+cw/2+env.scr*cw;const r=s[0];
  if(r<.68){const y1=Y(Math.max(d.o,c)),y2=Y(Math.min(d.o,c));return[cx+(s[2]-.5)*cw*.62,y1+(y2-y1)*s[3],.95,col]}
  if(r<.82){const hi=live?Math.max(d.h,c):d.h,lo=live?Math.min(d.l,c):d.l;return[cx,Y(hi)+(Y(lo)-Y(hi))*s[3],.8,col]}
  const u=s[3]*(NC-1),k0=Math.floor(u),f=u-k0;const e=env.ema;const yy=e[k0]+(e[Math.min(NC-1,k0+1)]-e[k0])*f;return[B.l+u*cw+cw/2+env.scr*cw,Y(yy)+(s[2]-.5)*2,.95,C.gold]}
 return[W/2,H/2,0,C.gold]}
function env(){const e={g:gview(),b:box()};const cy=curveYs(clock-(SC[cur].k==='curve'?sStart:0));e.ys=cy.ys;e.lab=cy.lab;liveP+=(Math.random()-.47)*2.2;liveP*=.985;e.lc=CD[NC-1].c+liveP+Math.sin(clock*7)*.8;{const d=CD[NC-1];if(SC[cur].k==='candles'){d.h=Math.max(d.h,e.lc);d.l=Math.min(d.l,e.lc)}}const tlo=Math.min(...CD.map(d=>d.l),e.lc)-3,thi=Math.max(...CD.map(d=>d.h),e.lc)+3;LO+=(tlo-LO)*.06;HI+=(thi-HI)*.06;if(!LO)LO=tlo;e.lo=LO;e.hi=HI;e.scr=scr;let m=CD[0].c;e.ema=CD.map((d,i)=>(m=m+((i===NC-1?e.lc:d.c)-m)*.22));return e}
// scene extras drawn behind/over particles with weight w
function extrasBack(k,w,E){if(w<=0)return;
 if(k==='globe'){const {cx,cy,R}=E.g;let g=x.createRadialGradient(cx,cy,R*.9,cx,cy,R*1.28);g.addColorStop(0,`rgba(${C.gold},${(C.d?.09:.07)*w})`);g.addColorStop(1,`rgba(${C.gold},0)`);x.fillStyle=g;x.beginPath();x.arc(cx,cy,R*1.28,0,6.29);x.fill();
  g=x.createRadialGradient(cx-R*.35,cy-R*.4,R*.1,cx,cy,R);g.addColorStop(0,C.d?`rgba(30,41,59,${.55*w})`:`rgba(241,245,249,${.9*w})`);g.addColorStop(1,C.d?`rgba(8,12,24,${.9*w})`:`rgba(226,232,240,${.7*w})`);x.fillStyle=g;x.beginPath();x.arc(cx,cy,R*(.7+.3*w),0,6.29);x.fill();x.strokeStyle=`rgba(${C.gold},${.35*w})`;x.lineWidth=1;x.stroke()}
 if(k==='curve'||k==='candles'){const B=E.b;x.strokeStyle=C.grid;x.globalAlpha=w;x.lineWidth=1;for(let j=0;j<=5;j++){const yy=Math.round(B.t+(B.b-B.t)*j/5)+.5;x.beginPath();x.moveTo(B.l,yy);x.lineTo(B.r,yy);x.stroke()}x.globalAlpha=1}
 if(k==='logo'){const g=x.createRadialGradient(W/2,H*.46,0,W/2,H*.46,W*.42);g.addColorStop(0,`rgba(${C.gold},${.08*w})`);g.addColorStop(1,`rgba(${C.gold},0)`);x.fillStyle=g;x.fillRect(0,0,W,H)}}
function extrasFront(k,w,E,lt){if(w<=0)return;x.globalAlpha=w;
 if(k==='logo'&&LB){const im=C.d?imgD:imgL;if(im.complete){const a=Math.min(1,Math.max(0,(lt-.2)/.6));x.globalAlpha=w*a;const lx=W/2-LB.w/2,ly=H*.46-LB.h/2;x.drawImage(im,lx,ly,LB.w,LB.h);
   // light sweep across the logo
   const sw=((lt*.45)%1.6)-.3;if(sw>-.2&&sw<1.2){x.save();x.beginPath();x.rect(lx,ly,LB.w,LB.h);x.clip();x.globalCompositeOperation='source-atop';const sx=lx+LB.w*sw,g=x.createLinearGradient(sx-60,0,sx+60,0);g.addColorStop(0,'rgba(255,215,120,0)');g.addColorStop(.5,`rgba(240,206,140,${.55*w})`);g.addColorStop(1,'rgba(255,215,120,0)');x.fillStyle=g;x.fillRect(lx,ly,LB.w,LB.h);x.restore()}}}
 if(k==='globe'){const P=E.g.p;for(const A of arcs){const va=A.a,vb=A.b,dot=va[0]*vb[0]+va[1]*vb[1]+va[2]*vb[2],om=Math.acos(Math.min(1,dot)),so=Math.sin(om)||1;
   const pt=u=>{const k1=Math.sin((1-u)*om)/so,k2=Math.sin(u*om)/so,h=1+Math.min(.16,.07*om)*Math.sin(Math.PI*u);return P([(va[0]*k1+vb[0]*k2)*h,(va[1]*k1+vb[1]*k2)*h,(va[2]*k1+vb[2]*k2)*h])};
   let prev=pt(0);for(let i=1;i<=48;i++){const q=pt(i/48);if(q[2]>-.05&&prev[2]>-.05){x.strokeStyle=`rgba(${C.gold},${.14+.22*Math.max(0,q[2])})`;x.lineWidth=1;x.beginPath();x.moveTo(prev[0],prev[1]);x.lineTo(q[0],q[1]);x.stroke()}prev=q}
   const u=((clock*A.sp+A.off)%1.4);if(u<=1){for(let j=0;j<10;j++){const uu=u-j*.012;if(uu<0)break;const q=pt(uu);if(q[2]<-.05)continue;x.fillStyle=`rgba(${C.gold},${(1-j/10)*.95})`;x.beginPath();x.arc(q[0],q[1],2.2-j*.15,0,6.29);x.fill()}}}
  for(const kk in CV){const q=P(CV[kk]);if(q[2]<.05)continue;const pu=(clock*.8+kk.length*.3)%1;x.strokeStyle=`rgba(${C.gold},${.6*(1-pu)})`;x.lineWidth=1.2;x.beginPath();x.arc(q[0],q[1],3+pu*12,0,6.29);x.stroke();x.fillStyle=`rgb(${C.gold})`;x.beginPath();x.arc(q[0],q[1],kk==='JNB'?4:2.8,0,6.29);x.fill();
   if(names[kk]&&q[2]>.25){x.font=`${kk==='JNB'?600:500} 12px Inter,sans-serif`;x.fillStyle=`rgba(${C.ink},${Math.min(1,(q[2]-.25)*3)*.9})`;x.textAlign='left';x.textBaseline='middle';x.fillText(names[kk],q[0]+9,q[1]-1)}}}
 if(k==='curve'){const B=E.b,ys=E.ys;x.beginPath();for(let j=0;j<=60;j++){const u=j/60,px=B.l+(B.r-B.l)*u,py=B.b-(B.b-B.t)*yAt(ys,u);j?x.lineTo(px,py):x.moveTo(px,py)}x.strokeStyle=`rgb(${C.gold})`;x.lineWidth=2.4;x.shadowColor=`rgba(${C.gold},.6)`;x.shadowBlur=4;x.stroke();x.shadowBlur=0;
  MAT.forEach((m,j)=>{const px=B.l+(B.r-B.l)*MX[j],py=B.b-(B.b-B.t)*yAt(ys,MX[j]);x.fillStyle=C.d?'#0b1220':'#fff';x.strokeStyle=`rgb(${C.gold})`;x.lineWidth=2;x.beginPath();x.arc(px,py,4,0,6.29);x.fill();x.stroke();x.fillStyle=`rgba(${C.ink},.55)`;x.font='500 11.5px Inter,sans-serif';x.textAlign='center';x.textBaseline='alphabetic';x.fillText(m,px,B.b+20)});
  x.textAlign='left';x.font='600 13px Inter,sans-serif';x.fillStyle=`rgba(${C.ink},.9)`;x.fillText('US Treasury yield curve',B.l,B.t-18);const tw=x.measureText('US Treasury yield curve').width;x.font='600 12px Inter,sans-serif';const lw=x.measureText(E.lab).width+18;
  x.fillStyle=`rgba(${C.gold},.14)`;x.strokeStyle=`rgba(${C.gold},.35)`;x.beginPath();x.roundRect?x.roundRect(B.l+tw+12,B.t-33,lw,22,11):x.rect(B.l+tw+12,B.t-33,lw,22);x.fill();x.stroke();x.fillStyle=`rgb(${C.gold})`;x.fillText(E.lab,B.l+tw+21,B.t-18)}
 if(k==='candles'){const B=E.b,cw=(B.r-B.l)/NC,Y=v=>B.b-(B.b-B.t)*(v-E.lo)/(E.hi-E.lo);x.beginPath();E.ema.forEach((v,j)=>{const px=B.l+j*cw+cw/2+E.scr*cw,py=Y(v);j?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle=`rgba(${C.gold},.9)`;x.lineWidth=2;x.shadowColor=`rgba(${C.gold},.6)`;x.shadowBlur=3;x.stroke();x.shadowBlur=0;
  const hx=B.l+(NC-1)*cw+cw/2+E.scr*cw,hy=Y(E.lc);x.setLineDash([3,4]);x.strokeStyle=`rgba(${C.gold},.55)`;x.lineWidth=1;x.beginPath();x.moveTo(hx,hy);x.lineTo(B.r+8,hy);x.stroke();x.setLineDash([]);const pu=(clock*1.2)%1;x.fillStyle=`rgba(${C.gold},${.35*(1-pu)})`;x.beginPath();x.arc(hx,hy,4+pu*14,0,6.29);x.fill();
  x.fillStyle=`rgb(${C.gold})`;const tx=Math.min(W-50,B.r+8);x.beginPath();x.roundRect?x.roundRect(tx,hy-11,44,22,6):x.rect(tx,hy-11,44,22);x.fill();x.fillStyle=C.d?'#0b1220':'#fff';x.font='700 10.5px Inter,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('LIVE',tx+22,hy+.5);x.textBaseline='alphabetic';
  x.textAlign='left';x.font='600 13px Inter,sans-serif';x.fillStyle=`rgba(${C.ink},.9)`;x.fillText('Macro bias → technical entry',B.l,B.t-18)}
 x.globalAlpha=1}

// ---- transitions: each scene change has its own choreography ----
const clamp=v=>Math.max(0,Math.min(1,v)),eIn=u=>u*u*u,eOut=u=>1-Math.pow(1-u,3),eBack=u=>{const c=1.70158;return 1+(c+1)*Math.pow(u-1,3)+c*Math.pow(u-1,2)};
const lerp=(a,b,u)=>a+(b-a)*u;
function mapPos(i,E){const B=E.b,v=G[i],lat=Math.asin(v[1]),lon=Math.atan2(v[0],v[2]);const w=B.r-B.l,h=w/2;return[B.l+(lon/Math.PI+1)/2*w,(B.t+B.b)/2-lat/(Math.PI/2)*h/2]}
function move(A,B,i,ta,tb,u,E){const s=seed[i],a0=A==='logo'?(i<LP.length?.95:0):ta[2];
 // logo -> globe: collapse into a point of light, then a big-bang expansion onto the sphere
 if(B==='globe'){const cx=E.g.cx,cy=E.g.cy;if(u<.42){const k=eIn(clamp((u-s[3]*.08)/.34));return[lerp(ta[0],cx+(s[0]-.5)*6,k),lerp(ta[1],cy+(s[1]-.5)*6,k),Math.max(a0,k*.9)*(i<LP.length?1:k),C.d?'240,206,140':C.gold]}
  const k=eOut(clamp((u-.42-s[2]*.12)/.46));const fx=cx+(tb[0]-cx)*(k*1.12-.12*k*k),fy=cy+(tb[1]-cy)*(k*1.12-.12*k*k);return[fx,fy,lerp(.9,tb[2],k),k>.6?tb[3]:C.gold]}
 // globe -> curve: the globe unrolls into a flat world map, then the map sweeps left to right into the curve
 if(B==='curve'){const m=mapPos(i,E);if(u<.48){const k=eio(clamp(u/.42));return[lerp(ta[0],m[0],k),lerp(ta[1],m[1],k),lerp(ta[2],.7,k),C.dot]}
  const xn=(m[0]-E.b.l)/(E.b.r-E.b.l),k=eio(clamp(((u-.48)/.52)*1.7-xn*.7));return[lerp(m[0],tb[0],k),lerp(m[1],tb[1],k),lerp(.7,tb[2],k),k>.5?tb[3]:C.dot]}
 // curve -> candles: particles rain down to the axis, then candles grow up from it, left to right
 if(B==='candles'){const base=E.b.b;if(u<.42){const k=eIn(clamp((u-s[1]*.12)/.3));return[ta[0],lerp(ta[1],base,k),Math.max(ta[2],.5),ta[3]]}
  const xn=(tb[0]-E.b.l)/(E.b.r-E.b.l),k=clamp(((u-.42)/.58)*1.8-xn*.8);const kk=k<=0?0:eBack(k);return[lerp(ta[0],tb[0],eOut(clamp(k*2))),lerp(base,tb[1],kk),lerp(.5,tb[2],clamp(k*1.5)),tb[3]]}
 // globe -> logo: the globe explodes outward in a flash, then the fragments pull back together into the logo
 if(B==='logo'&&A==='globe'){const cx=E.g.cx,cy=E.g.cy,R=E.g.R,dx=ta[0]-cx,dy=ta[1]-cy,d=Math.hypot(dx,dy)||1,ex=cx+dx/d*(d+R*(.9+s[0]*1.4)),ey=cy+dy/d*(d+R*(.9+s[0]*1.4))+(s[1]-.5)*R*.4;
  if(u<.38){const k=eOut(clamp(u/.32));return[lerp(ta[0],ex,k),lerp(ta[1],ey,k),Math.max(ta[2],.55)*(1-k*.3),C.gold]}
  const k=eio(clamp((u-.38-s[3]*.12)/.5));return[lerp(ex,tb[0],k),lerp(ey,tb[1],k),lerp(.45,tb[2],k),tb[3]]}
 // candles -> logo: a gold vortex that spins the chart into the logo
 if(B==='logo'){const cx=W/2,cy=H*.46,ra=Math.hypot(ta[0]-cx,ta[1]-cy),aa=Math.atan2(ta[1]-cy,ta[0]-cx),rb=Math.hypot(tb[0]-cx,tb[1]-cy),ab=Math.atan2(tb[1]-cy,tb[0]-cx);
  const k=eio(clamp((u-s[3]*.1)/.9)),sw=Math.sin(Math.PI*k);const r=lerp(ra,rb,k)*(1-.55*sw)+sw*20*s[0],a=lerp(aa,ab,k)+k*Math.PI*2.4*(s[2]>.5?1:-1)*.5+sw*2;
  return[cx+Math.cos(a)*r,cy+Math.sin(a)*r*.8,Math.max(lerp(ta[2],tb[2],k),sw*.6),k>.7?tb[3]:C.gold]}
 return[tb[0],tb[1],tb[2],tb[3]]}
// previous drawn positions (for smooth departures)
function frame(now){const dt=Math.max(0,Math.min(50,now-last))/1000;last=now;clock+=dt;x.clearRect(0,0,W,H);if(!W){requestAnimationFrame(frame);return}
 const lt=clock-sStart;if(nxt<0&&lt>SC[cur].d&&!reduce)go((cur+1)%SC.length);
 let u=0;if(nxt>=0){u=Math.min(1,(clock-trStart)/TR);if(u>=1){cur=nxt;nxt=-1;sStart=clock-TR*.0;if(SC[cur].k==='candles')genC();u=0}}
 scr*=.86;if(SC[cur].k==='candles'&&nxt<0&&clock-lastPush>.75){lastPush=clock;pushC()}
 const E=env(),ue=eio(u),A=SC[cur].k,B=nxt>=0?SC[nxt].k:null,wa=B?1-Math.min(1,ue*1.6):1,wb=B?Math.max(0,(ue-.45)/.55):0;
 extrasBack(A,wa,E);if(B)extrasBack(B,wb,E);
 const lgA=A==='logo'?Math.min(1,Math.max(0,(clock-sStart-.2)/.6))*wa:0;// particles hide behind crisp logo
 for(let i=0;i<N;i++){const ta=target(A,i,E);let px=ta[0],py=ta[1],al=ta[2],col=ta[3];
  if(A==='logo')al*=Math.max(.0,1-lgA*.92)+(B?0:0);
  if(B){const tb=target(B,i,E),r=move(A,B,i,ta,tb,u,E);px=r[0];py=r[1];al=r[2];col=r[3]}
  if(al<=.01)continue;const sz=1.6;x.fillStyle=`rgba(${col},${al})`;x.fillRect(px-sz/2,py-sz/2,sz,sz)}
 if(B==='logo'&&A==='globe'&&u<.4){const f=Math.sin(u/.4*Math.PI),cx=E.g.cx,cy=E.g.cy,g=x.createRadialGradient(cx,cy,0,cx,cy,E.g.R*(.6+u*3));g.addColorStop(0,`rgba(225,205,160,${.4*f})`);g.addColorStop(.35,`rgba(${C.gold},${.16*f})`);g.addColorStop(1,`rgba(${C.gold},0)`);x.fillStyle=g;x.beginPath();x.arc(cx,cy,E.g.R*(.6+u*3),0,6.29);x.fill()}
 if(B==='globe'&&u>.3&&u<.7){const f=Math.sin((u-.3)/.4*Math.PI),cx=E.g.cx,cy=E.g.cy,g=x.createRadialGradient(cx,cy,0,cx,cy,E.g.R*(.4+f*.9));g.addColorStop(0,`rgba(225,205,160,${.42*f})`);g.addColorStop(.3,`rgba(${C.gold},${.16*f})`);g.addColorStop(1,`rgba(${C.gold},0)`);x.fillStyle=g;x.beginPath();x.arc(cx,cy,E.g.R*(.4+f*.9),0,6.29);x.fill()}
 extrasFront(A,wa,E,clock-sStart);if(B)extrasFront(B,wb,E,0);
 // steps UI
 const act=B?(ue>.5?nxt:cur):cur,prog=B?0:Math.min(1,(clock-sStart)/SC[cur].d);btn.forEach((b,i)=>{b.setAttribute('aria-current',i===act?'step':'false');b.querySelector('b').style.transform=`scaleX(${i===act?(B?0:prog):i<act?1:0})`});
 requestAnimationFrame(frame)}
addEventListener('themechange',pal);new MutationObserver(pal).observe(root,{attributes:true,attributeFilter:['data-theme']});
requestAnimationFrame(frame)}
}
