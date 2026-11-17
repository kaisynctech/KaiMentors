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
  var hero = document.querySelector('.hero');
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
