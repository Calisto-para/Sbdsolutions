import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const HOME = "SBD AI Solutions | Intelligent Technology. Smarter Business.";

const META = {
  "/": {
    title: HOME,
    description:
      "SBD AI Solutions is a technology company helping businesses transform their operations through artificial intelligence, intelligent automation and custom software solutions.",
  },
  "/services": {
    title: "Services | SBD AI Solutions",
    description:
      "Artificial intelligence, business automation and custom software development from SBD AI Solutions — practical technology built around how your business actually runs.",
  },
  "/projects": {
    title: "Projects | SBD AI Solutions",
    description:
      "Technology projects, digital solutions and software development work from SBD AI Solutions — AI, business automation, web and software development.",
  },
  "/about": {
    title: "About Us | SBD AI Solutions",
    description:
      "SBD AI Solutions is a technology company helping businesses operate smarter through artificial intelligence, automation and custom software development.",
  },
  "/who-we-help": {
    title: "Who We Help | SBD AI Solutions",
    description:
      "SBD AI Solutions works with businesses, startups, organisations and online businesses looking to improve operations through automation and intelligent software.",
  },
  "/contact": {
    title: "Contact | SBD AI Solutions",
    description:
      "Contact SBD AI Solutions by WhatsApp, phone or email. Tell us about your business challenge, technology idea or project and we will reply personally.",
  },
  "/start-a-project": {
    title: "Start a Project | SBD AI Solutions",
    description:
      "Tell SBD AI Solutions about your business, project or technology requirements. Submit a project enquiry and we will respond with the next steps.",
  },
};

/* Keeps the document title and description in step with the active route. */
export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = META[pathname] || { title: HOME, description: META["/"].description };
    document.title = meta.title;
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", meta.description);
  }, [pathname]);

  return null;
}
