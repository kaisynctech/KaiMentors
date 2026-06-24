const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const header = document.querySelector("[data-header]");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

if (header) {
  window.addEventListener("scroll", () => {
    header.classList.toggle("is-scrolled", window.scrollY > 16);
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    if (!button) return;
    const original = button.textContent;
    button.textContent = "Received";
    button.disabled = true;
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 1800);
  });
});

const onboardingForm = document.querySelector("[data-onboarding-form]");

if (onboardingForm) {
  const steps = Array.from(onboardingForm.querySelectorAll(".form-step"));
  const stepDots = Array.from(document.querySelectorAll("[data-step-list] li"));
  const prevButton = onboardingForm.querySelector("[data-prev]");
  const nextButton = onboardingForm.querySelector("[data-next]");
  const submitButton = onboardingForm.querySelector(".form-submit");
  let activeStep = 0;

  const renderStep = () => {
    steps.forEach((step, index) => step.classList.toggle("is-active", index === activeStep));
    stepDots.forEach((dot, index) => dot.classList.toggle("is-active", index === activeStep));
    prevButton.disabled = activeStep === 0;
    nextButton.style.display = activeStep === steps.length - 1 ? "none" : "inline-flex";
    submitButton.style.display = activeStep === steps.length - 1 ? "inline-flex" : "none";
  };

  prevButton.addEventListener("click", () => {
    activeStep = Math.max(0, activeStep - 1);
    renderStep();
  });

  nextButton.addEventListener("click", () => {
    activeStep = Math.min(steps.length - 1, activeStep + 1);
    renderStep();
  });

  renderStep();
}
