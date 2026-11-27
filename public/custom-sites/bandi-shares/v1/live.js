/* Bandile's notes and curated news from the academy API. */
(function(){
var P='/portal/bandi-shares';
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function day(d){try{return d?new Date(d).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):''}catch(e){return ''}}
function cut(t,n){t=String(t||'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n).replace(/\s+\S*$/,'')+'…':t}
var home=document.querySelector('[data-live="home"]'),notesEl=document.querySelector('[data-live="notes"]'),curEl=document.querySelector('[data-live="curated"]');
if(!home&&!notesEl&&!curEl)return;
function renderHome(notes,news){
  var rows=[];notes.slice(0,2).forEach(function(a){rows.push({cat:'Morning note',src:'Bandile',title:a.title,meta:day(a.published_at),href:P+'/articles',tgt:'_top'})});
  news.slice(0,4-rows.length).forEach(function(n){rows.push({cat:'Gold',src:'FXStreet',title:n.title,meta:'',href:n.url,tgt:'_blank'})});
  notes.slice(2,2+(4-rows.length)).forEach(function(a){rows.push({cat:'Morning note',src:'Bandile',title:a.title,meta:day(a.published_at),href:P+'/articles',tgt:'_top'})});
  if(!rows.length){home.innerHTML='<div class="arow empty"><span class="n">—</span><div><h4>Bandile\'s morning notes appear here.</h4><small>What happened yesterday and what he is watching today.</small></div><span></span></div>';return}
  home.innerHTML=rows.map(function(r,i){var b=r.src==='Bandile';return '<a class="arow" href="'+esc(r.href)+'" target="'+r.tgt+'"'+(r.tgt==='_blank'?' rel="noopener noreferrer"':'')+'><span class="n">'+('0'+(i+1))+'</span><div><small><b>'+esc(r.cat)+'</b> · <span class="src '+(b?'bandile':'curated')+'">'+esc(r.src)+'</span>'+(r.meta?' · '+esc(r.meta):'')+'</small><h4>'+esc(r.title)+'</h4></div><span class="ar">'+(b?'→':'↗')+'</span></a>'}).join('');
}
function noteBody(a){return '<div class="nb"><h5>Yesterday</h5><p>'+esc(a.yesterday)+'</p><h5>Today</h5><p>'+esc(a.today)+'</p></div>'}
function renderNotes(notes){
  if(!notes.length){notesEl.innerHTML='<div class="emptycard"><h3>The first morning note is on its way</h3><p>Bandile posts what happened yesterday and what he is watching today.</p></div>';return}
  var f=notes[0],rest=notes.slice(1);
  var h='<article class="featart note" data-r><div class="fa-img"><img src="assets/lecture.jpg" alt=""></div><div><small><b>Morning note</b> · Latest · '+esc(day(f.published_at))+'</small><h2>'+esc(f.title)+'</h2><p class="ex">'+esc(cut(f.today||f.yesterday,190))+'</p>'+noteBody(f)+'<button class="go rd" type="button">Read note <i>→</i></button></div></article>';
  if(rest.length)h+='<div class="agrid2">'+rest.map(function(a,i){return '<article class="acard note" data-r style="--d:'+(i*.06)+'s"><small><b>Morning note</b> · '+esc(day(a.published_at))+'</small><h3>'+esc(a.title)+'</h3><p class="ex">'+esc(cut(a.today||a.yesterday,150))+'</p>'+noteBody(a)+'<button class="go rd" type="button">Read <i>→</i></button><span class="bar"></span></article>'}).join('')+'</div>';
  notesEl.innerHTML=h;
  notesEl.querySelectorAll('.note').forEach(function(n){n.querySelector('.rd').addEventListener('click',function(){var o=n.classList.toggle('open');this.innerHTML=o?'Show less <i>↑</i>':(n.classList.contains('featart')?'Read note <i>→</i>':'Read <i>→</i>')})});
  reveal(notesEl);
}
function renderCurated(news,src){
  if(!news.length){curEl.innerHTML='<div class="crow empty"><div class="cr-main"><h3>No headlines right now.</h3><p><a href="'+esc(src||'https://www.fxstreet.com/news')+'" target="_blank" rel="noopener noreferrer">Read the latest on FXStreet ↗</a></p></div></div>';return}
  curEl.innerHTML=news.map(function(n,i){return '<a class="crow" href="'+esc(n.url)+'" target="_blank" rel="noopener noreferrer" data-r style="--d:'+(i*.06)+'s"><div class="cr-src"><span class="cr-logo">FX</span><span>FXStreet</span></div><div class="cr-main"><small><b>Gold</b> · News</small><h3>'+esc(n.title)+'</h3>'+(n.summary?'<p>'+esc(cut(n.summary,200))+'</p>':'')+'</div><span class="cr-ext">↗</span></a>'}).join('');
  reveal(curEl);
}
function reveal(el){requestAnimationFrame(function(){el.querySelectorAll('[data-r]').forEach(function(x){x.classList.add('in')})})}
fetch('/api/public/market-articles?portal=bandi-shares').then(function(r){return r.json()}).then(function(d){
  var notes=Array.isArray(d.articles)?d.articles:[],gold=d.gold||{},news=Array.isArray(gold.items)?gold.items:[];
  if(home)renderHome(notes,news);if(notesEl)renderNotes(notes);if(curEl)renderCurated(news,gold.sourceUrl);
}).catch(function(){if(home)renderHome([],[]);if(notesEl)renderNotes([]);if(curEl)renderCurated([],'')});
})();
