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

