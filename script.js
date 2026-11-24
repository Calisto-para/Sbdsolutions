/* SBD AI Solutions — shared interactions */
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

  /* Project enquiry form — submits to the form service, which emails the
     business inbox. The endpoint is a public form address, not a secret. */
  var form = document.querySelector("[data-project-form]");
  var status = document.querySelector("[data-form-status]");

  if (form) {
    var endpoint = "https://formsubmit.co/ajax/sbdiam.solutions@gmail.com";
    var button = form.querySelector("button[type=submit]");
    var buttonLabel = button ? button.textContent : "";

    var showStatus = function (message, kind) {
      if (!status) return;
      status.textContent = message;
      status.classList.remove("form-status--ok", "form-status--error");
      status.classList.add("is-visible", kind === "ok" ? "form-status--ok" : "form-status--error");
    };

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (typeof form.reportValidity === "function" && !form.reportValidity()) {
        return;
      }

      var data = new FormData(form);
      var payload = {};

      data.forEach(function (value, key) {
        payload[key] = value;
      });

      payload._subject = "New project enquiry — SBD AI Solutions";
      payload._template = "table";
      payload._captcha = "false";

      if (button) {
        button.disabled = true;
        button.textContent = "Sending…";
      }
      showStatus("Sending your enquiry…", "ok");

      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { ok: response.ok, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok || (result.body && result.body.success === "false")) {
            throw new Error("Request rejected");
          }
          form.reset();
          showStatus(
            "Thank you — your enquiry has been sent. We will review the details and reply to you by email or WhatsApp, usually within one business day.",
            "ok"
          );
        })
        .catch(function () {
          showStatus(
            "Sorry, the enquiry could not be sent from this page. Please email sbdiam.solutions@gmail.com or message us on WhatsApp (+234 906 392 4288) and we will pick it up from there.",
            "error"
          );
        })
        .then(function () {
          if (button) {
            button.disabled = false;
            button.textContent = buttonLabel;
          }
        });
    });
  }
})();
