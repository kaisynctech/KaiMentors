(()=>{
const tabs=[...document.querySelectorAll('.ptab')],dots=[...document.querySelectorAll('.pb-dot')],panels=[...document.querySelectorAll('.ppanel')],fill=document.querySelector('.pb-fill');
function sel(k,focus){
  tabs.forEach(t=>{const on=t.dataset.k===k;t.classList.toggle('on',on);t.setAttribute('aria-selected',on)});
  let idx=0;dots.forEach((d,i)=>{const on=d.dataset.k===k;d.classList.toggle('on',on);if(on)idx=i;d.classList.toggle('past',false)});
  dots.forEach((d,i)=>d.classList.toggle('past',i<idx));
  if(fill)fill.style.transform=`scaleX(${idx/(dots.length-1)})`;
  panels.forEach(p=>{if(p.dataset.k===k){p.hidden=false;p.classList.remove('on');void p.offsetWidth;p.classList.add('on')}else{p.hidden=true;p.classList.remove('on')}});
  if(focus){const t=tabs.find(t=>t.dataset.k===k);t&&t.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'})}
}
tabs.forEach(t=>t.addEventListener('click',()=>sel(t.dataset.k,1)));
dots.forEach(d=>d.addEventListener('click',()=>sel(d.dataset.k,1)));
document.querySelector('.ptabs')?.addEventListener('keydown',e=>{const i=tabs.findIndex(t=>t.classList.contains('on'));if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();const n=tabs[(i+1)%tabs.length];sel(n.dataset.k);n.focus()}if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();const n=tabs[(i-1+tabs.length)%tabs.length];sel(n.dataset.k);n.focus()}});
})();
