(function () {
  var portal = "bandi-shares";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render(data) {
    var root = document.querySelector("section.section-padding.pt-0 .mx-auto");
    if (!root) return;
    var gold = data.gold || { items: [], sourceUrl: "https://www.fxstreet.com/news/feed" };
    var articles = Array.isArray(data.articles) ? data.articles : [];
    var goldItems = Array.isArray(gold.items) ? gold.items : [];
    var goldHtml = goldItems.length
      ? "<ul style=\"margin:0;padding-left:1.1rem;display:grid;gap:0.7rem\">" +
        goldItems.map(function (item) {
          return "<li><a href=\"" + escapeHtml(item.url) + "\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-primary\">" +
            escapeHtml(item.title) + "</a>" +
            (item.summary ? "<p class=\"mt-1 text-sm text-muted-foreground\">" + escapeHtml(item.summary) + "</p>" : "") +
            "</li>";
        }).join("") + "</ul>"
      : "<p class=\"text-sm text-muted-foreground\">FXStreet did not return a gold update just now. Their coverage is still one click away.</p>";
    var notesHtml = articles.length
      ? articles.map(function (article) {
          var when = article.published_at
            ? new Date(article.published_at).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
            : "";
          return "<article class=\"glass-card p-6 md:p-8\"><time class=\"text-xs uppercase tracking-wider text-muted-foreground\">" +
            escapeHtml(when) + "</time><h2 class=\"mt-2 text-xl font-semibold text-foreground\">" +
            escapeHtml(article.title) + "</h2><h3 class=\"mt-4 text-sm font-semibold text-primary\">Yesterday</h3><p class=\"mt-1 text-sm leading-relaxed text-muted-foreground\" style=\"white-space:pre-wrap\">" +
            escapeHtml(article.yesterday) + "</p><h3 class=\"mt-4 text-sm font-semibold text-primary\">Today</h3><p class=\"mt-1 text-sm leading-relaxed text-muted-foreground\" style=\"white-space:pre-wrap\">" +
            escapeHtml(article.today) + "</p></article>";
        }).join("")
      : "<div class=\"glass-card px-8 py-16 text-center\"><h2 class=\"mb-3 text-xl font-semibold text-foreground\">The first morning note is on its way</h2><p class=\"text-sm text-muted-foreground\">Bandile posts what happened yesterday and what he is watching today.</p></div>";

    root.innerHTML =
      "<div role=\"tablist\" aria-label=\"Articles\" style=\"display:flex;gap:1.5rem;border-bottom:1px solid rgba(15,23,42,0.12);margin-bottom:1.75rem\">" +
      "<button type=\"button\" role=\"tab\" data-tab=\"notes\" aria-selected=\"true\" style=\"background:none;border:none;border-bottom:2px solid hsl(38 92% 50%);margin-bottom:-1px;padding:0.7rem 0.15rem;font-size:0.95rem;font-weight:650;cursor:pointer\">Bandile's notes</button>" +
      "<button type=\"button\" role=\"tab\" data-tab=\"news\" aria-selected=\"false\" style=\"background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;padding:0.7rem 0.15rem;font-size:0.95rem;font-weight:650;color:inherit;opacity:0.55;cursor:pointer\">News</button>" +
      "</div>" +
      "<div data-panel=\"notes\" role=\"tabpanel\"><div class=\"grid gap-6\">" + notesHtml + "</div></div>" +
      "<div data-panel=\"news\" role=\"tabpanel\" hidden>" +
      "<div class=\"glass-card p-6 md:p-8\"><p class=\"text-xs font-semibold uppercase tracking-[0.2em] text-primary\">FXStreet</p><h2 class=\"mt-2 text-2xl font-semibold text-foreground\">What FXStreet is reporting</h2><div class=\"mt-4\">" +
      goldHtml +
      "</div><a class=\"mt-4 inline-block text-sm font-medium text-primary\" href=\"" + escapeHtml(gold.sourceUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Read gold coverage on FXStreet →</a></div></div>";

    function show(name) {
      ["notes", "news"].forEach(function (key) {
        var on = key === name;
        var button = root.querySelector("[data-tab=\"" + key + "\"]");
        var panel = root.querySelector("[data-panel=\"" + key + "\"]");
        button.setAttribute("aria-selected", on ? "true" : "false");
        panel.hidden = !on;
        button.style.borderBottomColor = on ? "hsl(38 92% 50%)" : "transparent";
        button.style.opacity = on ? "1" : "0.55";
      });
    }

    root.querySelector("[data-tab=\"notes\"]").addEventListener("click", function () { show("notes"); });
    root.querySelector("[data-tab=\"news\"]").addEventListener("click", function () { show("news"); });
  }

  function load() {
    fetch("/api/public/market-articles?portal=" + portal)
      .then(function (response) { return response.json(); })
      .then(render)
      .catch(function () {});
  }

  window.addEventListener("load", function () {
    window.setTimeout(load, 600);
  });
})();
