/* XM verification form: same checks and endpoint as the previous site. */
(function(){
var f=document.getElementById('vform');if(!f)return;
var msg=f.querySelector('.vmsg'),btn=f.querySelector('button[type=submit]');
var rules={xmAccountId:[/^[A-Za-z0-9-]{4,40}$/,'Enter a valid XM Account ID (letters, numbers and dashes).'],fullName:[/^.{2,120}$/,'Full name is required.'],email:[/^[^\s@]+@[^\s@]+\.[^\s@]+$/,'Enter a valid email.'],whatsapp:[/^[+\d\s()-]{7,20}$/,'Enter a valid WhatsApp number.']};
function err(el,t){var lab=el.closest('label');lab.classList.toggle('bad',!!t);var e=lab.querySelector('.er');if(!e){e=document.createElement('span');e.className='er';lab.appendChild(e)}e.textContent=t||''}
function check(){var ok=true;Object.keys(rules).forEach(function(k){var el=f.elements[k],v=el.value.trim(),r=rules[k];var bad=!r[0].test(v)||(k==='email'&&v.length>255);err(el,bad?r[1]:'');if(bad)ok=false});return ok}
f.addEventListener('submit',function(e){e.preventDefault();msg.className='vmsg';msg.textContent='';if(!check())return;
  var full=f.elements.fullName.value.trim(),sp=full.indexOf(' ');
  var body={name:sp<0?full:full.slice(0,sp),surname:sp<0?'':full.slice(sp+1),email:f.elements.email.value.trim(),phone:f.elements.whatsapp.value.trim(),xm_account_id:f.elements.xmAccountId.value.trim(),portal_slug:'bandi-shares'};
  var origin='';try{origin=(window.top||window).location.origin}catch(x){origin=location.origin}
  btn.disabled=true;btn.textContent='Verifying…';
  fetch(origin+'/api/verify-xm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return {}}).then(function(d){return {ok:r.ok,d:d}})}).then(function(res){
    if(!res.ok)throw new Error(res.d&&typeof res.d.message==='string'?res.d.message:'Verification failed. Please try again.');
    f.reset();
    if(res.d&&res.d.type==='PENDING_SIGNUP'){var code=res.d.affiliateCode||'BANDISHARES05',link=res.d.affiliateLink;
      msg.className='vmsg ok';msg.innerHTML='Your details are saved. Open a new XM account using code <b>'+String(code).replace(/[<>&"]/g,'')+'</b>.'+(link?' <a href="'+String(link).replace(/"/g,'&quot;')+'" target="_blank" rel="noopener noreferrer">Open XM account →</a>':'');}
    else{msg.className='vmsg ok';msg.textContent='Thanks. We’ll confirm your XM partnership and reach out on WhatsApp.'}
  }).catch(function(x){msg.className='vmsg no';msg.textContent=x.message||'Something went wrong. Please try again.'}).then(function(){btn.disabled=false;btn.textContent='Verify my XM account'});
});
})();
