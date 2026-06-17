const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const header = document.querySelector("[data-header]");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
}

if (header) {
  window.addEventListener("scroll", () => header.classList.toggle("is-scrolled", window.scrollY > 12));
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("is-visible");
  });
}, { threshold: 0.14 });

document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

const onboardingForm = document.querySelector("[data-onboarding-form]");
if (onboardingForm) {
  const steps = Array.from(onboardingForm.querySelectorAll(".form-step"));
  const dots = Array.from(document.querySelectorAll("[data-step-list] li"));
  const prev = onboardingForm.querySelector("[data-prev]");
  const next = onboardingForm.querySelector("[data-next]");
  const submit = onboardingForm.querySelector(".form-submit");
  let active = 0;
  const render = () => {
    steps.forEach((step, index) => step.classList.toggle("is-active", index === active));
    dots.forEach((dot, index) => dot.classList.toggle("is-active", index === active));
    prev.disabled = active === 0;
    next.style.display = active === steps.length - 1 ? "none" : "inline-flex";
    submit.style.display = active === steps.length - 1 ? "inline-flex" : "none";
  };
  prev.addEventListener("click", () => { active = Math.max(0, active - 1); render(); });
  next.addEventListener("click", () => { active = Math.min(steps.length - 1, active + 1); render(); });
  render();
}

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    if (!button) return;
    const original = button.textContent;
    button.textContent = "Received";
    button.disabled = true;
    setTimeout(() => { button.textContent = original; button.disabled = false; }, 1600);
  });
});
