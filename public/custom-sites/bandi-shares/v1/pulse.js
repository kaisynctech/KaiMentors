/* Market pulse: self-drawing sparklines, ticking prices, event countdown, article filter. Preview data only. */
(()=>{
const R=(a,b)=>a+Math.random()*(b-a);
function series(n,drift){let v=50,o=[];for(let i=0;i<n;i++){v+=R(-4,4)+drift;v=Math.max(8,Math.min(92,v));o.push(v)}return o}
function path(a,w,h){const mn=Math.min(...a),mx=Math.max(...a),s=(mx-mn)||1;return a.map((v,i)=>(i?'L':'M')+(i*w/(a.length-1)).toFixed(1)+' '+(h-2-(v-mn)/s*(h-4)).toFixed(1)).join(' ')}
document.querySelectorAll('.tk-row').forEach((r,k)=>{
  const up=r.dataset.up==='1',a=series(28,up?1.1:-1.1),svg=r.querySelector('svg');
  const W=Math.max(40,svg.clientWidth||100),H=svg.clientHeight||28;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.removeAttribute('preserveAspectRatio');
  const d=path(a,W,H);svg.innerHTML=`<path class="sl" d="${d}" pathLength="1"/><circle class="dot" r="2.2" cx="${W}" cy="${d.split(' ').pop()}"/>`;
  const v=r.querySelector('.v'),c=r.querySelector('.c'),base=parseFloat(v.dataset.v),dp=+v.dataset.dp,ch0=parseFloat(c.dataset.c);
  let cur=base;
  const show=(x,f)=>{v.textContent=x.toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp});if(f){v.classList.remove('fu','fd');void v.offsetWidth;v.classList.add(f)}};
  r._start=()=>{const t0=performance.now(),D=1100;(function f(t){const p=Math.min(1,(t-t0)/D),e=1-Math.pow(1-p,3);show(base*(.985+.015*e));if(p<1)requestAnimationFrame(f)})(t0);
    setInterval(()=>{const st=base*R(-.0006,.0006);const nx=cur+st;show(nx,nx>=cur?'fu':'fd');const pct=ch0+(nx-base)/base*100;c.textContent=(pct>=0?'+':'')+pct.toFixed(2)+'%';c.className='c '+(pct>=0?'up':'dn');cur=nx},2200+k*450)}
});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('on');e.target.querySelectorAll('.tk-row').forEach(r=>r._start&&!r._s&&(r._s=1,r._start()));io.unobserve(e.target)}}),{threshold:.25});
document.querySelectorAll('.pulse,.cal-anim').forEach(x=>io.observe(x));
/* countdown */
const T=Date.now()+((2*24+4)*3600+12*60+33)*1000;
document.querySelectorAll('[data-cd]').forEach(el=>{const pad=n=>String(n).padStart(2,'0');const f=()=>{let s=Math.max(0,(T-Date.now())/1000|0);const d=s/86400|0;s%=86400;el.innerHTML=`<b>${d}</b>d <b>${pad(s/3600|0)}</b>h <b>${pad(s%3600/60|0)}</b>m <b class="sec">${pad(s%60)}</b>s`};f();setInterval(f,1000)});
/* articles source toggle */
const seg=document.querySelector('.seg');
if(seg){const pill=seg.querySelector('.seg-pill'),btns=[...seg.querySelectorAll('button')],groups=[...document.querySelectorAll('.agroup')];
const place=b=>{pill.style.width=b.offsetWidth+'px';pill.style.transform=`translateX(${b.offsetLeft-4}px)`};
place(btns[0]);addEventListener('resize',()=>place(seg.querySelector('.on')));
btns.forEach(b=>b.addEventListener('click',()=>{btns.forEach(x=>x.classList.toggle('on',x===b));place(b);const f=b.dataset.f;
groups.forEach(g=>{const show=f==='all'||g.dataset.g===f;if(show){g.hidden=false;g.classList.remove('gin');void g.offsetWidth;g.classList.add('gin')}else g.hidden=true})}))}
/* reading progress on hover cards */
})();
