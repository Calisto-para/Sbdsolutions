export const HOME_TITLE = "SBD Solutions | Websites, Software, AI & Automation";

export const HOME_DESCRIPTION =
  "SBD Solutions is a technology company delivering websites, e-commerce, custom software, business systems, AI chatbots and workflow automation for growing businesses.";

export const META = {
  "/": {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  "/services": {
    title: "Services | SBD Solutions",
    description:
      "Artificial intelligence, business automation and custom software development from SBD Solutions — practical technology built around how your business actually runs.",
  },
  "/products": {
    title: "Products | SBD Website AI Chatbot & WhatsApp Automation",
    description:
      "SBD Solutions products: the website AI chatbot with monthly plans from $15, and WhatsApp AI automation in development. Published pricing, honest availability and human takeover.",
  },
  "/pricing": {
    title: "Pricing | SBD Solutions",
    description:
      "SBD Solutions pricing: website AI chatbot plans from $15 per month, WhatsApp automation early-access plans, and project starting prices for websites, software and automation.",
  },
  "/projects": {
    title: "Projects | SBD Solutions",
    description:
      "Technology projects, digital solutions and software development work from SBD Solutions — AI, business automation, web and software development.",
  },
  "/about": {
    title: "About Us | SBD Solutions",
    description:
      "SBD Solutions is a technology company helping businesses operate smarter through artificial intelligence, automation and custom software development.",
  },
  "/who-we-help": {
    title: "Who We Help | SBD Solutions",
    description:
      "SBD Solutions works with businesses, startups, organisations and online businesses looking to improve operations through automation and intelligent software.",
  },
  "/contact": {
    title: "Contact | SBD Solutions",
    description:
      "Contact SBD Solutions by WhatsApp, phone or email. Tell us about your business challenge, technology idea or project and we will reply personally.",
  },
  "/start-a-project": {
    title: "Start a Project | SBD Solutions",
    description:
      "Tell SBD Solutions about your business, project or technology requirements. Submit a project enquiry and we will respond with the next steps.",
  },
  "/register": {
    title: "Create an Account | SBD Solutions",
    description:
      "Create your SBD Solutions account to build, train and test AI assistants for your business.",
  },
  "/login": {
    title: "Sign In | SBD Solutions",
    description: "Sign in to your SBD Solutions account to manage AI assistants, training material and conversations.",
  },
  "/forgot-password": {
    title: "Reset Your Password | SBD Solutions",
    description: "Request a password reset link for your SBD Solutions account.",
  },
  "/reset-password": {
    title: "Choose a New Password | SBD Solutions",
    description: "Choose a new password for your SBD Solutions account.",
  },
  "/verify-email": {
    title: "Verify Your Email | SBD Solutions",
    description: "Confirm your email address to activate your SBD Solutions account.",
  },
  "/dashboard": {
    title: "My Dashboard | SBD Solutions",
    description: "Your private SBD Solutions dashboard: AI assistants, training material and conversations.",
  },
};

export function metaFor(pathname) {
  return META[pathname] || { title: HOME_TITLE, description: HOME_DESCRIPTION };
}
