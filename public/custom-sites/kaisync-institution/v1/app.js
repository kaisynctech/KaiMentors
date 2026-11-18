// KaiSync Institution — site JS
//
// NOTE (MB-116): the brief for this file specified a `window.__KSI_SITE__`
// global, injected by the platform's custom-site renderer from
// custom_site_assignments.content_overrides, to populate the social links
// in the "Connect" strip and footer. That mechanism does not exist in
// components/custom-site-renderer.tsx — it only injects styles.css, this
// page's body HTML, app.js, and a separate <SiteContactFooter> component
// that already renders real, working social/contact links from the
// portal's own DB columns (whatsapp_number, instagram_url, facebook_url,
// youtube_url, twitter_url, tiktok_url, telegram_url, linkedin_url,
// contact_email, contact_phone) — populated via Admin -> Site Settings,
// no app.js changes required. Writing a listener for a global that is
// never set would just be dead code, so the social links in this page's
// own markup are placeholders until Nyarie fills in the platform's Site
// Settings; SiteContactFooter will render live below the page content.

(function () {
  "use strict";

  // 1. Mobile nav toggle
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        closeAllDropdowns();
      });
    });
    document.addEventListener("click", (event) => {
      if (!nav.contains(event.target) && !navToggle.contains(event.target)) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        closeAllDropdowns();
      }
    });
  }

  function closeAllDropdowns(except) {
    document.querySelectorAll("[data-dropdown].is-open").forEach((drop) => {
      if (drop === except) return;
      drop.classList.remove("is-open");
      const t = drop.querySelector("[data-dropdown-toggle]");
      if (t) t.setAttribute("aria-expanded", "false");
    });
  }

  document.querySelectorAll("[data-dropdown]").forEach((drop) => {
    const toggle = drop.querySelector("[data-dropdown-toggle]");
    if (!toggle) return;
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !drop.classList.contains("is-open");
      closeAllDropdowns(willOpen ? drop : null);
      drop.classList.toggle("is-open", willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeAllDropdowns();
  });

  // 2. Scroll header state
  const header = document.querySelector("[data-header]");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // 3. Scroll reveal
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }
})();

(function () {
  "use strict";
  var nums = document.querySelectorAll("[data-count]");
  if (!nums.length) return;

  function countUp(el, target, duration) {
    var start = null;
    function frame(now) {
      if (start == null) start = now;
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var started = false;
  function startAll() {
    if (started) return;
    started = true;
    nums.forEach(function (el) {
      var target = parseInt(el.getAttribute("data-count"), 10) || 0;
      var duration = Math.max(1000, Math.min(2400, target * 20));
      countUp(el, target, duration);
    });
  }

  var band = document.querySelector(".stats-band") || nums[0];
  function inView() {
    var rect = band.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }
  if (!("IntersectionObserver" in window)) {
    startAll();
    return;
  }
  var io = new IntersectionObserver(
    function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      startAll();
      io.disconnect();
    },
    { threshold: 0.15 },
  );
  io.observe(band);
  if (inView()) startAll();
  window.addEventListener("scroll", function onScroll() {
    if (!inView()) return;
    startAll();
    window.removeEventListener("scroll", onScroll);
  }, { passive: true });
})();

(function () {
  "use strict";
  var grid = document.getElementById("projects-grid");
  if (!grid) return;

  var KIND =
    grid.getAttribute("data-project-kind") ||
    document.body.getAttribute("data-project-kind") ||
    "main";
  var EMPTY =
    KIND === "main"
      ? "No finished projects for sale yet. When a project is ready to sell, it will appear here."
      : "No in-progress projects to view yet. Sub projects are work you can enquire about before they are finished.";
  var BADGE = KIND === "main" ? "For sale" : "In progress";
  var CATEGORY_LABELS = {
    "web-app": "Website",
    "ai-agent": "AI Agent",
    automation: "Automation",
    "mobile-app": "Applications",
    other: "Other",
  };
  var CATEGORY_ICONS = {
    "web-app": "🌐",
    "ai-agent": "🤖",
    automation: "⚡",
    "mobile-app": "📱",
    other: "🛠️",
  };
  var allProjects = [];
  var activeFilter = "all";

  function catLabel(v) {
    return CATEGORY_LABELS[v] || v;
  }
  function catIcon(v) {
    return CATEGORY_ICONS[v] || "🛠️";
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function enquireHref(title) {
    return (
      "mailto:kaisynctech@gmail.com?subject=" +
      encodeURIComponent("KaiSync Institution project: " + title)
    );
  }

  function renderProjects(projects) {
    var count = document.getElementById("projects-count");
    if (!projects.length) {
      grid.innerHTML =
        '<div class="projects-empty"><div class="empty-icon">🚧</div><p>' + EMPTY + "</p></div>";
      if (count) count.textContent = "";
      return;
    }
    if (count) {
      count.textContent = projects.length + " project" + (projects.length !== 1 ? "s" : "");
    }
    grid.innerHTML = projects
      .map(function (p) {
        var thumb = p.thumbnail_url
          ? '<img class="project-thumb" src="' +
            p.thumbnail_url +
            '" alt="' +
            esc(p.title) +
            '" loading="lazy">'
          : '<div class="project-thumb-placeholder">' + catIcon(p.category) + "</div>";
        var tools = (p.tools || [])
          .map(function (t) {
            return '<span class="project-tool">' + esc(t) + "</span>";
          })
          .join("");
        var links =
          '<a class="project-link-btn primary" href="' +
          enquireHref(p.title) +
          '">' +
          (KIND === "main" ? "Enquire to buy" : "Enquire about this build") +
          "</a>";
        if (p.live_url) {
          links +=
            '<a class="project-link-btn" href="' +
            esc(p.live_url) +
            '" target="_blank" rel="noopener">View ↗</a>';
        }
        return [
          '<div class="project-card reveal is-visible">',
          thumb,
          '<div class="project-body">',
          '<div class="project-meta">',
          '<span class="project-cat">' + catLabel(p.category) + "</span>",
          '<span class="project-featured">' + BADGE + "</span>",
          "</div>",
          '<h3 class="project-title">' + esc(p.title) + "</h3>",
          '<div class="project-student">by ' + esc(p.student_name) + "</div>",
          p.description ? '<p class="project-desc">' + esc(p.description) + "</p>" : "",
          tools ? '<div class="project-tools">' + tools + "</div>" : "",
          '<div class="project-links">' + links + "</div>",
          "</div>",
          "</div>",
        ].join("");
      })
      .join("");
  }

  function applyFilter() {
    var filtered =
      activeFilter === "all"
        ? allProjects
        : allProjects.filter(function (p) {
            return p.category === activeFilter;
          });
    renderProjects(filtered);
  }

  fetch("/api/public/student-projects?portal=kaisync-institution")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (!Array.isArray(data)) throw new Error("bad payload");
      allProjects = data.filter(function (p) {
        return KIND === "main" ? !!p.featured : !p.featured;
      });
      applyFilter();
    })
    .catch(function () {
      grid.innerHTML =
        '<div class="projects-empty"><p>Could not load projects. Please try again later.</p></div>';
    });

  var filterBar = document.getElementById("filter-bar");
  if (filterBar) {
    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      document.querySelectorAll(".filter-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      activeFilter = btn.dataset.cat;
      applyFilter();
    });
  }
})();

(function () {
  var form = document.querySelector("[data-refer-join]");
  if (!form) return;
  var message = document.querySelector("[data-refer-message]");
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var data = new FormData(form);
    var password = String(data.get("password") || "");
    var confirm = String(data.get("passwordConfirm") || "");
    if (password !== confirm) {
      if (message) message.textContent = "The passwords do not match.";
      return;
    }
    var button = form.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    if (message) message.textContent = "Creating your code…";
    fetch("/api/referrals/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        portalSlug: form.getAttribute("data-portal"),
        fullName: String(data.get("fullName") || ""),
        email: String(data.get("email") || ""),
        password: password,
      }),
    })
      .then(function (response) {
        return response.json().then(function (payload) {
          return { ok: response.ok, payload: payload };
        });
      })
      .then(function (result) {
        if (!result.ok) throw new Error(result.payload.error || "Could not create a code.");
        form.hidden = true;
        if (message) {
          var shareUrl = result.payload.shareUrl;
          try {
            var parsed = new URL(shareUrl, window.location.origin);
            shareUrl = window.location.origin + parsed.pathname + parsed.search;
          } catch (ignore) {}
          message.replaceChildren();
          var strong = document.createElement("strong");
          strong.textContent = "Your code is " + result.payload.code + ".";
          var link = document.createElement("a");
          link.href = shareUrl;
          link.textContent = shareUrl;
          message.append(strong, " Share this link: ", link, ". Sign in later to see what you are owed.");
        }
      })
      .catch(function (error) {
        if (message) message.textContent = error.message || "Could not create a code.";
        if (button) button.disabled = false;
      });
  });
})();

(function () {
  var root = document.getElementById("ksi-articles");
  if (!root) return;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render(data) {
    var articles = Array.isArray(data.articles) ? data.articles : [];
    root.innerHTML = articles.length
      ? articles.map(function (article) {
          var when = article.published_at
            ? new Date(article.published_at).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
            : "";
          return '<article style="border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:1.25rem 1.4rem;margin-bottom:1rem;background:var(--surface,#0A0A0F)">' +
            (when ? '<p style="margin:0;font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted,#9B98B8)">' + escapeHtml(when) + "</p>" : "") +
            '<h2 style="margin:0.4rem 0 0;font-size:1.25rem">' + escapeHtml(article.title) + "</h2>" +
            '<h3 style="margin:1rem 0 0.25rem;font-size:0.85rem;color:var(--cyan,#00C4D8)">Yesterday</h3>' +
            '<p style="margin:0;white-space:pre-wrap;color:var(--text-muted,#9B98B8)">' + escapeHtml(article.yesterday) + "</p>" +
            '<h3 style="margin:1rem 0 0.25rem;font-size:0.85rem;color:var(--cyan,#00C4D8)">Today</h3>' +
            '<p style="margin:0;white-space:pre-wrap;color:var(--text-muted,#9B98B8)">' + escapeHtml(article.today) + "</p></article>";
        }).join("")
      : '<p style="color:var(--text-muted,#9B98B8)">No articles yet.</p>';
  }

  fetch("/api/public/market-articles?portal=kaisync-institution")
    .then(function (response) { return response.json(); })
    .then(render)
    .catch(function () {
      root.textContent = "Articles could not be loaded.";
    });
})();

// ════════════════════════════════════════════════════════════════════
// Moved from inline <script> tags (2026-11-17).
// The platform's custom-site renderer strips every inline <script> and
// only loads this file, so these features never ran on the live site.
// Every block is guarded, so it is safe on pages without the markup.
// ════════════════════════════════════════════════════════════════════

/* ── Dark / light mode (all pages) ── */
(function(){
  var KEY = 'ksi-theme';
  function read(){ try { return localStorage.getItem(KEY) || 'dark'; } catch (e) { return 'dark'; } }
  function save(t){ try { localStorage.setItem(KEY, t); } catch (e) {} }
  var btn = document.getElementById('theme-toggle');
  function apply(t){
    document.documentElement.setAttribute('data-theme', t);
    if (btn) {
      btn.textContent = t === 'dark' ? '🌙' : '☀️';
      btn.setAttribute('aria-pressed', String(t === 'light'));
    }
  }
  apply(read());
  if (btn) btn.addEventListener('click', function(){
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    apply(next); save(next);
  });
})();

/* ── Hero word morph ── */
(function(){
  var words=['Products','Websites','Automations','Apps']; // 'Your Future' removed: line 3 already says it
  var i=0;
  var el=document.getElementById('ksi-morph-word');
  if(!el)return;
  setInterval(function(){
    i=(i+1)%words.length;
    el.style.opacity='0';
    el.style.transform='translateY(6px)';
    setTimeout(function(){
      el.textContent=words[i];
      el.style.opacity='1';
      el.style.transform='translateY(0)';
    },280);
  },2500);
})();

/* ── Sticky CTA bar ── */
(function(){
  var bar = document.getElementById('sticky-cta');
  if (!bar) return;
  var hero = document.querySelector('.gx-hero, .hero');
  function onScroll(){
    var heroBottom = hero ? hero.getBoundingClientRect().bottom : 400;
    if (heroBottom < 0) {
      bar.classList.add('sticky-cta--visible');
      bar.removeAttribute('aria-hidden');
    } else {
      bar.classList.remove('sticky-cta--visible');
      bar.setAttribute('aria-hidden', 'true');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();

/* ── Course preview modal ── */
(function(){
  var COURSES = {
    'Basic AI': { tag: 'Start here', desc: 'How models work, prompting, and the languages of building with AI — a little Python, a little JavaScript, and how to talk to the tools. Optional, not a gate.', outcomes: ['Prompt with intent', 'Know when to use which model', 'Write small scripts with AI help', 'Move into any other course'], meta: 'Open catalog · Optional first course · Self-paced' },
    'Build a website, beginning to end': { tag: 'Web', desc: 'Plan, design, and ship a live multi-page site — pages, forms, hosting, and a domain — using AI-assisted builders and code tools.', outcomes: ['Ship a live multi-page site', 'Wire a form that actually sends', 'Host it and point a domain', 'Hand it to a client or keep it'], meta: 'Open catalog · Join any time · Self-paced' },
    'Automation': { tag: 'Automation', desc: 'Connect a website or form to the tools a business already uses, with Zapier, n8n, or Power Automate.', outcomes: ['Pick Zapier, n8n, or Power Automate', 'Connect a form to email and a sheet', 'Trigger a workflow from a website', 'Document the flow for a client'], meta: 'Open catalog · Join any time · Self-paced' },
    'Marketing with AI': { tag: 'Marketing', desc: 'Posters, short videos, and AI video you can actually post — the content pack around a real product.', outcomes: ['A poster set for one offer', 'Short-form video you can post', 'AI video for a product page', 'A simple content calendar'], meta: 'Open catalog · Join any time · Self-paced' },
    'Applications': { tag: 'Apps', desc: 'A web app or a downloadable app. Frontend, backend, and a real login — not a mockup.', outcomes: ['Choose web app or downloadable app', 'Build a frontend people can use', 'Add a backend and login', 'Put a working build in your portfolio'], meta: 'Open catalog · Join any time · Self-paced' },
  };
  var overlay = document.getElementById('course-modal');
  var closeBtn = document.getElementById('modal-close');
  if (!overlay) return;
  function openModal(title) {
    var d = COURSES[title]; if (!d) return;
    document.getElementById('modal-tag').textContent = d.tag;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-desc').textContent = d.desc;
    var ul = document.getElementById('modal-outcomes');
    ul.innerHTML = d.outcomes.map(function(o){ return '<li>✓ ' + o + '</li>'; }).join('');
    document.getElementById('modal-meta').textContent = d.meta;
    overlay.hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeModal() { overlay.hidden = true; document.body.style.overflow = ''; }
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });
  document.querySelectorAll('.card h3').forEach(function(h){
    if (!COURSES[h.textContent.trim()]) return;
    h.parentElement.style.cursor = 'pointer';
    h.parentElement.setAttribute('role', 'button');
    h.parentElement.setAttribute('tabindex', '0');
    h.parentElement.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(h.textContent.trim()); } });
    h.parentElement.addEventListener('click', function(){ openModal(h.textContent.trim()); });
  });
})();

/* ── AI quiz ── */
(function(){
  var openBtn = document.getElementById('open-quiz');
  var overlay = document.getElementById('quiz-modal');
  var closeBtn = document.getElementById('quiz-close');
  if (!openBtn || !overlay) return;
  var QUESTIONS = [
    { q: 'What describes you best?', opts: ['I\'m completely new to tech', 'I know the basics, want to go deeper', 'I\'m technical and want to build seriously'] },
    { q: 'How much time can you commit per week?', opts: ['1–3 hours (evenings only)', '4–8 hours (part-time)', '10+ hours (I\'m serious)'] },
    { q: 'What do you want to build first?', opts: ['A website or Basic AI', 'Marketing or automation', 'A full application'] },
    { q: 'What\'s your main goal?', opts: ['Learn skills for employment', 'Launch a side income', 'Build a full product or startup'] },
  ];
  function joinHref() {
    var a = document.querySelector('a[href*="join-academy"]');
    return a ? a.getAttribute('href') : 'join-academy';
  }
  var answers = [];
  var current = 0;
  function render() {
    var container = document.getElementById('quiz-steps');
    if (current >= QUESTIONS.length) {
      var score = answers.reduce(function(s,a){ return s+a; }, 0);
      var plan = score <= 3 ? 'Library' : score <= 6 ? 'Scholar' : 'Studio';
      var price = plan === 'Library' ? 'R99' : plan === 'Scholar' ? 'R249' : 'R499';
      container.innerHTML = '<div class="quiz-result"><div class="quiz-result-plan">We recommend: <strong>' + plan + '</strong></div><div class="quiz-result-price">' + price + '/month</div><p class="quiz-result-note">Based on your answers, ' + plan + ' is the best fit to get started. You can always upgrade as you grow.</p><a class="btn primary" href="' + joinHref() + '" style="margin-top:16px;">Start ' + plan + ' →</a><button class="btn ghost" id="quiz-restart" style="margin-top:8px;margin-left:8px;">Retake quiz</button></div>';
      document.getElementById('quiz-restart').addEventListener('click', function(){ answers=[]; current=0; render(); });
      return;
    }
    var q = QUESTIONS[current];
    container.innerHTML = '<div class="quiz-progress"><div class="quiz-progress-bar" style="width:' + ((current/QUESTIONS.length)*100) + '%"></div></div><p class="quiz-question">' + q.q + '</p><div class="quiz-opts">' + q.opts.map(function(o,i){ return '<button class="quiz-opt" data-i="'+i+'">'+o+'</button>'; }).join('') + '</div>';
    container.querySelectorAll('.quiz-opt').forEach(function(btn){
      btn.addEventListener('click', function(){ answers.push(parseInt(btn.dataset.i)); current++; render(); });
    });
  }
  function openQuiz(){ overlay.hidden=false; document.body.style.overflow='hidden'; answers=[]; current=0; render(); }
  function closeQuiz(){ overlay.hidden=true; document.body.style.overflow=''; }
  openBtn.addEventListener('click', openQuiz);
  closeBtn.addEventListener('click', closeQuiz);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeQuiz(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeQuiz(); });
})();

/* ── FAQ accordion ── */
(function(){
  document.querySelectorAll('.faq-q').forEach(function(btn){
    btn.addEventListener('click', function(){
      var item = btn.parentElement;
      var open = item.classList.contains('faq-item--open');
      document.querySelectorAll('.faq-item--open').forEach(function(i){ i.classList.remove('faq-item--open'); i.querySelector('.faq-q').setAttribute('aria-expanded','false'); });
      if (!open) { item.classList.add('faq-item--open'); btn.setAttribute('aria-expanded','true'); }
    });
  });
})();

/* ════════════════════════════════════════════════════════════════════
   Galaxy hero (2026-11-18). Spiral galaxy with Claude / ChatGPT / Lovable /
   Cursor orbiting as planets. Plays on its own: collapses into the core,
   flashes, forms KAISYNC, then swirls back into a galaxy. The first
   KAISYNC appears within ~4 seconds so visitors see it before scrolling.
   Everything is drawn inside .gx-stage, so nothing overlaps the copy.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";
  var hero=document.getElementById('gx-hero');
  var cv=document.getElementById('gx-galaxy'),sky=document.getElementById('gx-sky');
  if(!hero||!cv||!sky||!cv.getContext)return;
  var REDUCED=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TAU=Math.PI*2,DPR=Math.min(window.devicePixelRatio||1,2);
  function gauss(){return (Math.random()+Math.random()+Math.random()-1.5)/1.5}
  function easeIn(x){return x*x*x}
  function easeOutExpo(x){return x>=1?1:1-Math.pow(2,-10*x)}
  function easeInOut(x){return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2}
  function clamp(x,a,b){return x<a?a:x>b?b:x}

  var mx=0,my=0,tmx=0,tmy=0;
  hero.addEventListener('pointermove',function(e){var r=hero.getBoundingClientRect();tmx=(e.clientX-r.left)/r.width-.5;tmy=(e.clientY-r.top)/r.height-.5});
  hero.addEventListener('pointerleave',function(){tmx=0;tmy=0});

  var visible=true,running=false;
  if('IntersectionObserver' in window){new IntersectionObserver(function(en){visible=en[0].isIntersecting;if(visible&&!running){running=true;last=performance.now();requestAnimationFrame(loop)}}).observe(hero)}

  /* ── background sky ── */
  var sctx=sky.getContext('2d'),SW,SH,dust=[],shoots=[],nextShoot=1.2;
  function sizeSky(){var r=sky.getBoundingClientRect();SW=r.width;SH=r.height;sky.width=SW*DPR;sky.height=SH*DPR;sctx.setTransform(DPR,0,0,DPR,0,0);
    dust=[];var n=Math.round(SW*SH/5200);for(var i=0;i<n;i++)dust.push({x:Math.random(),y:Math.random(),s:Math.random()*1.3+.3,d:Math.random()*.8+.2,tw:Math.random()*TAU})}
  function drawSky(t,dt){
    sctx.clearRect(0,0,SW,SH);
    for(var i=0;i<dust.length;i++){var q=dust[i],a=(REDUCED?.6:.45+.4*Math.sin(t*1.3+q.tw))*q.d*.75;
      var x=(q.x*SW-mx*30*q.d+SW)%SW,y=(q.y*SH-my*22*q.d+SH)%SH;
      sctx.fillStyle='rgba(225,225,255,'+a+')';sctx.fillRect(x,y,q.s,q.s)}
    if(REDUCED)return;
    nextShoot-=dt;
    if(nextShoot<=0){nextShoot=2.2+Math.random()*3.5;var ang=.35+Math.random()*.35;
      shoots.push({x:SW*(.35+Math.random()*.65),y:-20,vx:-Math.cos(ang)*SW*.9,vy:Math.sin(ang)*SW*.9,life:0,max:.9+Math.random()*.4})}
    for(var j=shoots.length-1;j>=0;j--){var s=shoots[j];s.life+=dt;if(s.life>s.max){shoots.splice(j,1);continue}
      var k=s.life/s.max,a2=Math.sin(k*Math.PI),x2=s.x+s.vx*s.life,y2=s.y+s.vy*s.life,tl=.12;
      var g=sctx.createLinearGradient(x2,y2,x2-s.vx*tl,y2-s.vy*tl);g.addColorStop(0,'rgba(255,255,255,'+a2+')');g.addColorStop(.3,'rgba(160,220,255,'+(a2*.5)+')');g.addColorStop(1,'rgba(160,220,255,0)');
      sctx.strokeStyle=g;sctx.lineWidth=1.4;sctx.beginPath();sctx.moveTo(x2,y2);sctx.lineTo(x2-s.vx*tl,y2-s.vy*tl);sctx.stroke()}
  }

  /* ── galaxy ── */
  var ctx=cv.getContext('2d'),W,H,R,cx,cy,mobile;
  var COLORS=['255,240,255','182,155,255','236,228,255','0,196,216','139,92,246','120,235,255'],LEVELS=7,buckets=[];
  for(var b=0;b<COLORS.length*LEVELS;b++)buckets.push([]);
  var stars=[],comets=[],nebula=null,wordPts=[];
  /* planet logos come from <img data-planet> tags in the page, so the platform rewrites their asset paths */
  var TINT={Claude:'217,119,87',ChatGPT:'16,163,127',Lovable:'255,94,135',Cursor:'0,196,216'};
  var SCALE={Claude:1.9,ChatGPT:1.7,Lovable:1.2,Cursor:1.05};
  var PLANETS=[].slice.call(hero.querySelectorAll('img[data-planet]')).map(function(img){
    var n=img.getAttribute('data-planet');return{name:n,img:img,tint:TINT[n]||'0,196,216',scale:SCALE[n]||1.2}});

  function sizeGalaxy(){
    var r=cv.getBoundingClientRect();W=r.width;H=r.height;if(!W||!H)return;
    cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);
    mobile=W<520;cx=W/2;cy=H/2;R=Math.min(W,H)*.34;
    buildStars();buildNebula();buildWord();
  }
  function buildStars(){
    var N=mobile?1700:3000,ARMS=3;stars=[];
    for(var i=0;i<N;i++){
      var core=Math.random()<.2,r=core?Math.pow(Math.random(),2)*.26:Math.pow(Math.random(),.8)*.98+.07,arm=i%ARMS;
      var a=arm*TAU/ARMS+r*4.6+gauss()*(core?1.5:.2/(r+.3));
      var c=r<.2?0:r<.5?(Math.random()<.6?1:2):(Math.random()<.55?3:(Math.random()<.6?4:5));
      stars.push({r:r,a:a,y:gauss()*(core?.08:.03*(1.25-r)),s:(Math.random()*1.3+.6)*(core?1.15:1),c:c,tw:Math.random()*TAU,jit:(Math.random()-.5)*2,gx:0,gy:0,gf:1,gz:0});
    }
    comets=[];for(var k=0;k<(mobile?4:7);k++)comets.push({arm:k%3,p:Math.random(),speed:.05+Math.random()*.05,trail:[]});
  }
  function buildNebula(){
    var s=Math.ceil(R*3.2);nebula=document.createElement('canvas');nebula.width=s;nebula.height=s;var n=nebula.getContext('2d');
    [[.5,.5,.5,'139,92,246',.28],[.38,.42,.32,'91,45,191',.35],[.64,.58,.3,'0,196,216',.16],[.58,.32,.22,'190,120,255',.18],[.36,.66,.24,'0,160,200',.14]].forEach(function(b){
      var g=n.createRadialGradient(b[0]*s,b[1]*s,0,b[0]*s,b[1]*s,b[2]*s);g.addColorStop(0,'rgba('+b[3]+','+b[4]+')');g.addColorStop(1,'rgba('+b[3]+',0)');n.fillStyle=g;n.fillRect(0,0,s,s)});
  }
  function buildWord(){
    if(!W)return;
    var c=document.createElement('canvas'),w=1100,h=260;c.width=w;c.height=h;var x=c.getContext('2d');
    x.fillStyle='#fff';x.font='900 200px Inter, "Segoe UI", Arial, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('KAISYNC',w/2,h/2+6);
    var d=x.getImageData(0,0,w,h).data,pts=[];
    for(var yy=0;yy<h;yy+=2)for(var xx=0;xx<w;xx+=2)if(d[(yy*w+xx)*4+3]>140)pts.push([xx,yy]);
    if(!pts.length)pts.push([w/2,h/2]);
    var scale=(W*.86)/w;wordPts=[];
    for(var i=0;i<stars.length;i++){var p=pts[(i*7919)%pts.length];wordPts.push([cx+(p[0]-w/2)*scale,cy+(p[1]-h/2)*scale])}
  }

  /* timeline: a short galaxy intro, then the KAISYNC sequence, then a longer galaxy phase on every repeat */
  var INTRO=2.2,COL=1.5,FLASH=.35,EXP=1.5,HOLD=3.4,RET=2.4,GAL=8,LOOP=COL+FLASH+EXP+HOLD+RET+GAL;
  function phase(t){
    if(REDUCED||t<INTRO)return{m:'gal',k:0};
    var T=(t-INTRO)%LOOP;
    if(T<COL)return{m:'col',k:T/COL};T-=COL;
    if(T<FLASH)return{m:'flash',k:T/FLASH};T-=FLASH;
    if(T<EXP)return{m:'exp',k:T/EXP};T-=EXP;
    if(T<HOLD)return{m:'hold',k:T/HOLD};T-=HOLD;
    if(T<RET)return{m:'ret',k:T/RET};
    return{m:'gal',k:0};
  }
  var caption=document.getElementById('gx-caption');

  function drawGalaxy(t,dt){
    var P=phase(t);
    if(caption)caption.classList.toggle('on',P.m==='hold'||(P.m==='exp'&&P.k>.6));
    ctx.clearRect(0,0,W,H);
    var tilt=1.08+my*.4,spinOff=mx*.7,ct=Math.cos(tilt),st=Math.sin(tilt),spin=REDUCED?0:t*.07;
    var galAmt=P.m==='gal'?1:P.m==='col'?1-easeIn(P.k):P.m==='ret'?easeInOut(P.k):0;
    var pulse=.5+.5*Math.sin(t*1.6);

    if(galAmt>0&&nebula){ctx.save();ctx.globalAlpha=galAmt*(.85+.15*pulse);ctx.translate(cx,cy);ctx.scale(1,Math.max(.35,ct+.2));ctx.rotate(spin*.5+spinOff);ctx.drawImage(nebula,-nebula.width/2,-nebula.height/2);ctx.restore()}

    for(var i=0;i<stars.length;i++){var s=stars[i],ang=s.a+spin*(.55/(s.r+.3))+spinOff,gx=Math.cos(ang)*s.r,gz=Math.sin(ang)*s.r;
      var y1=s.y*ct-gz*st,z1=s.y*st+gz*ct,f=2.8/(2.8+z1);s.gx=cx+gx*R*f;s.gy=cy+y1*R*f;s.gf=f;s.gz=z1}

    var planetPos=planetsLayout(t,ct,st,spinOff);
    if(galAmt>0)planetPos.forEach(function(p){if(p.z>0)drawPlanet(p,galAmt)});
    ctx.globalCompositeOperation='lighter';
    if(galAmt>0)planetPos.forEach(function(p,ix){if(p.z<=0)beam(p,ix,t,galAmt)});

    var e,k=P.k;
    for(var j=0;j<stars.length;j++){var s2=stars[j],x,y,size=s2.s*s2.gf*(mobile?1:1.12),br=REDUCED?.8:.62+.38*Math.sin(t*2.2+s2.tw);
      br*=clamp(1-s2.gz*.45,.3,1);
      if(P.m==='gal'){x=s2.gx;y=s2.gy}
      else if(P.m==='col'){e=easeIn(k);var vx=s2.gx-cx,vy=s2.gy-cy,rot=e*5*(1.2-s2.r*.6),cr=Math.cos(rot),sr=Math.sin(rot),sh=Math.pow(1-e,1.3);
        x=cx+(vx*cr-vy*sr)*sh;y=cy+(vx*sr+vy*cr)*sh;br=Math.min(1,br+e*.6)}
      else if(P.m==='flash'){x=cx+s2.jit*2;y=cy+s2.jit*1.5;br=1}
      else if(P.m==='exp'){e=easeOutExpo(k);var w=wordPts[j],dx=w[0]-cx,dy=w[1]-cy,len=Math.max(1,Math.hypot(dx,dy)),arc=Math.sin(k*Math.PI)*s2.jit*38;
        x=cx+dx*e-dy/len*arc;y=cy+dy*e+dx/len*arc;size*=1+.6*e;br=Math.max(br,.8)}
      else if(P.m==='hold'){var w2=wordPts[j];x=w2[0]+Math.sin(t*1.7+s2.tw)*.7;y=w2[1]+Math.cos(t*1.3+s2.tw)*.7;size*=1.6;
        var sweep=Math.exp(-Math.pow((x-(W*-.1+W*1.2*k))/(W*.06),2));br=clamp(.72+sweep*.5+br*.15,0,1)}
      else{e=easeInOut(k);var w3=wordPts[j];x=w3[0]+(s2.gx-w3[0])*e;y=w3[1]+(s2.gy-w3[1])*e;size*=1.6-.6*e}
      var lvl=Math.min(LEVELS-1,Math.floor(br*LEVELS));buckets[s2.c*LEVELS+lvl].push(x-size/2,y-size/2,size);
    }
    for(var bi=0;bi<buckets.length;bi++){var B=buckets[bi];if(!B.length)continue;
      ctx.fillStyle='rgba('+COLORS[Math.floor(bi/LEVELS)]+','+(.95*((bi%LEVELS)+1)/LEVELS)+')';ctx.beginPath();
      for(var bj=0;bj<B.length;bj+=3)ctx.rect(B[bj],B[bj+1],B[bj+2],B[bj+2]);ctx.fill();B.length=0}

    if(galAmt>0&&!REDUCED)comets.forEach(function(c){
      c.p+=c.speed*dt;if(c.p>1){c.p=0;c.trail=[]}
      var r=.95-c.p*.85,a=c.arm*TAU/3+r*4.6+spin*(.55/(r+.3))+spinOff,gx=Math.cos(a)*r,gz=Math.sin(a)*r,y1=-gz*st,z1=gz*ct,f=2.8/(2.8+z1);
      c.trail.push([cx+gx*R*f,cy+y1*R*f]);if(c.trail.length>14)c.trail.shift();
      for(var q=1;q<c.trail.length;q++){var al=q/c.trail.length*galAmt*Math.sin(c.p*Math.PI);
        ctx.strokeStyle='rgba(170,240,255,'+al+')';ctx.lineWidth=q/c.trail.length*2.2;ctx.beginPath();ctx.moveTo(c.trail[q-1][0],c.trail[q-1][1]);ctx.lineTo(c.trail[q][0],c.trail[q][1]);ctx.stroke()}
    });

    var coreA=P.m==='gal'?1:P.m==='col'?1+P.k*1.6:P.m==='flash'?2.4:P.m==='exp'?Math.max(0,1.2-P.k*1.6):P.m==='hold'?0:easeInOut(P.k);
    if(coreA>0){var cr2=R*(.3+.05*pulse)*(P.m==='col'?1-P.k*.5:1);
      var cg=ctx.createRadialGradient(cx,cy,0,cx,cy,cr2);cg.addColorStop(0,'rgba(255,248,255,'+Math.min(1,.7*coreA)+')');cg.addColorStop(.25,'rgba(210,180,255,'+Math.min(1,.35*coreA)+')');cg.addColorStop(1,'rgba(91,45,191,0)');
      ctx.fillStyle=cg;ctx.fillRect(cx-cr2,cy-cr2,cr2*2,cr2*2);
      var fl=R*(.9+.2*pulse)*Math.min(1.6,coreA);ctx.globalAlpha=Math.min(1,.35*coreA);
      var lg=ctx.createLinearGradient(cx-fl,cy,cx+fl,cy);lg.addColorStop(0,'rgba(0,196,216,0)');lg.addColorStop(.5,'rgba(230,240,255,.9)');lg.addColorStop(1,'rgba(0,196,216,0)');
      ctx.fillStyle=lg;ctx.fillRect(cx-fl,cy-.75,fl*2,1.5);
      var vg=ctx.createLinearGradient(cx,cy-fl*.45,cx,cy+fl*.45);vg.addColorStop(0,'rgba(139,92,246,0)');vg.addColorStop(.5,'rgba(230,240,255,.8)');vg.addColorStop(1,'rgba(139,92,246,0)');
      ctx.fillStyle=vg;ctx.fillRect(cx-.6,cy-fl*.45,1.2,fl*.9);ctx.globalAlpha=1}

    if(P.m==='flash'||(P.m==='exp'&&P.k<.5)){var kk=P.m==='flash'?P.k*.3:.3+P.k*1.4,rr=R*(.1+kk*2.2),al2=Math.max(0,1-kk);
      ctx.strokeStyle='rgba(180,230,255,'+al2*.8+')';ctx.lineWidth=2+6*(1-kk);ctx.beginPath();ctx.ellipse(cx,cy,rr,rr*.42,0,0,TAU);ctx.stroke();
      var fg=ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.4);fg.addColorStop(0,'rgba(255,255,255,'+al2*.55+')');fg.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=fg;ctx.fillRect(0,0,W,H)}

    ctx.globalCompositeOperation='source-over';
    if(galAmt>0)planetPos.forEach(function(p){if(p.z<=0)drawPlanet(p,galAmt)});
  }
  function planetsLayout(t,ct,st,spinOff){
    var out=[],rr=1.12;
    for(var i=0;i<PLANETS.length;i++){var a=(REDUCED?0:t*.16)+i*TAU/PLANETS.length+spinOff+.4,gx=Math.cos(a)*rr,gz=Math.sin(a)*rr,y1=-gz*st,z1=gz*ct,f=2.8/(2.8+z1);
      out.push({p:PLANETS[i],x:cx+gx*R*f,y:cy+y1*R*f-R*.04,z:z1,f:f})}
    return out;
  }
  function drawPlanet(o,amt){
    var p=o.p,front=o.z<=0,rad=(mobile?19:26)*o.f*(front?1:.88),al=amt*(front?1:.72);
    ctx.save();ctx.globalAlpha=al;
    var hg=ctx.createRadialGradient(o.x,o.y,rad*.6,o.x,o.y,rad*2.6);hg.addColorStop(0,'rgba('+p.tint+',.45)');hg.addColorStop(1,'rgba('+p.tint+',0)');
    ctx.fillStyle=hg;ctx.beginPath();ctx.arc(o.x,o.y,rad*2.6,0,TAU);ctx.fill();
    var bg=ctx.createLinearGradient(o.x-rad,o.y-rad,o.x+rad,o.y+rad);bg.addColorStop(0,'rgba(40,36,70,.95)');bg.addColorStop(1,'rgba(10,10,24,.95)');
    ctx.fillStyle=bg;ctx.beginPath();ctx.arc(o.x,o.y,rad,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba('+p.tint+',.85)';ctx.lineWidth=1.4;ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(o.x,o.y,rad-3,Math.PI*1.1,Math.PI*1.7);ctx.stroke();
    var im=p.img;
    if(im.complete&&im.naturalWidth){var cap=rad*1.15*p.scale,iw=cap,ih=iw*(im.naturalHeight/im.naturalWidth);
      if(ih>cap){ih=cap;iw=ih*(im.naturalWidth/im.naturalHeight)}if(iw>rad*1.9){iw=rad*1.9;ih=iw*(im.naturalHeight/im.naturalWidth)}
      try{ctx.drawImage(im,o.x-iw/2,o.y-ih/2,iw,ih)}catch(err){}}
    if(front&&!mobile){ctx.globalAlpha=al*clamp(-o.z*2.2,0,1);ctx.font='600 12px Inter, "Segoe UI", sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
      ctx.fillStyle='rgba(240,238,250,.92)';ctx.fillText(p.name,o.x,o.y+rad+8)}
    ctx.restore();
  }
  function beam(o,ix,t,amt){
    var strength=clamp(-o.z*1.6,0,1)*amt;if(strength<=.02)return;
    var g=ctx.createLinearGradient(o.x,o.y,cx,cy);g.addColorStop(0,'rgba('+o.p.tint+','+(.35*strength)+')');g.addColorStop(1,'rgba(220,210,255,0)');
    ctx.strokeStyle=g;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(cx,cy);ctx.stroke();
    if(REDUCED)return;
    for(var n=0;n<3;n++){var k=((t*.55+ix*.27+n/3)%1),px=o.x+(cx-o.x)*k,py=o.y+(cy-o.y)*k,a=Math.sin(k*Math.PI)*strength;
      ctx.fillStyle='rgba(255,255,255,'+a+')';ctx.beginPath();ctx.arc(px,py,1.6,0,TAU);ctx.fill();
      ctx.fillStyle='rgba('+o.p.tint+','+(a*.35)+')';ctx.beginPath();ctx.arc(px,py,4.5,0,TAU);ctx.fill()}
  }

  var last=performance.now(),t0=last;
  function loop(now){
    if(!visible){running=false;return}
    running=true;
    var dt=Math.min(.05,(now-last)/1000);last=now;var t=(now-t0)/1000;
    mx+=(tmx-mx)*.05;my+=(tmy-my)*.05;
    drawSky(t,dt);if(W)drawGalaxy(t,dt);
    requestAnimationFrame(loop);
  }
  function resizeAll(){sizeSky();sizeGalaxy()}
  var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(resizeAll,120)});
  resizeAll();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(buildWord);
  running=true;requestAnimationFrame(loop);
})();
