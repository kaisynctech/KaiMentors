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
      });
    });
    document.addEventListener("click", (event) => {
      if (!nav.contains(event.target) && !navToggle.contains(event.target)) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

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
