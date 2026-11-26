import { useEffect } from "react";

/* Reveal-on-scroll for elements with .reveal, re-run for each route. */
export default function useReveal(key) {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll(".reveal:not(.is-visible)"));
    if (!items.length) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach((item) => observer.observe(item));

    /* Safety net: content must never stay hidden if the observer misses an
       element (very tall sections, restored scroll position, print). */
    const fallback = window.setTimeout(() => {
      items.forEach((item) => item.classList.add("is-visible"));
    }, 2500);

    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, [key]);
}
