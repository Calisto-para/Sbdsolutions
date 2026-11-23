/* SBD Solutions — shared interactions */
(function () {
  "use strict";

  /* Mobile navigation */
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".menu-toggle");

  if (header && toggle) {
    var setNav = function (open) {
      header.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      toggle.textContent = open ? "\u00d7" : "\u2630";
    };

    toggle.addEventListener("click", function () {
      setNav(!header.classList.contains("nav-open"));
    });

    header.querySelectorAll(".nav a").forEach(function (link) {
      link.addEventListener("click", function () {
        setNav(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && header.classList.contains("nav-open")) {
        setNav(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 940) setNav(false);
    });
  }

  /* Scroll reveal */
  var items = document.querySelectorAll(".reveal");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!items.length) {
    /* nothing to do */
  } else if (!reduceMotion && "IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    items.forEach(function (item) {
      observer.observe(item);
    });
  } else {
    items.forEach(function (item) {
      item.classList.add("is-visible");
    });
  }

  /* Footer year */
  document.querySelectorAll("[data-year]").forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });

  /* Enquiry form — prepares an email, nothing is submitted automatically */
  var form = document.querySelector("[data-enquiry-form]");

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var lines = [
        "Name: " + (data.get("name") || ""),
        "Email: " + (data.get("email") || ""),
        "Business / organisation: " + (data.get("company") || ""),
        "Service needed: " + (data.get("service") || ""),
        "",
        "Project details:",
        String(data.get("message") || ""),
      ];
      var subject = "Project enquiry — " + (data.get("name") || "SBD Solutions");
      window.location.href =
        "mailto:sbdiam.solutions@gmail.com?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(lines.join("\n"));
    });
  }
})();
