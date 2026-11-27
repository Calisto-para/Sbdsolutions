export const HOME_TITLE = "SBD AI Solutions | Intelligent Technology. Smarter Business.";

export const HOME_DESCRIPTION =
  "SBD AI Solutions is a technology company helping businesses transform their operations through artificial intelligence, intelligent automation and custom software solutions.";

export const META = {
  "/": {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  "/services": {
    title: "Services | SBD AI Solutions",
    description:
      "Artificial intelligence, business automation and custom software development from SBD AI Solutions — practical technology built around how your business actually runs.",
  },
  "/pricing": {
    title: "Project Pricing | SBD AI Solutions",
    description:
      "Transparent starting prices in US Dollars for websites, e-commerce, custom web applications, business systems, AI chatbots and automation from SBD AI Solutions, with local-currency payment at checkout.",
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
  "/register": {
    title: "Create an Account | SBD AI Solutions",
    description:
      "Create your SBD AI Solutions account to build, train and test AI assistants for your business.",
  },
  "/login": {
    title: "Sign In | SBD AI Solutions",
    description: "Sign in to your SBD AI Solutions account to manage AI assistants, training material and conversations.",
  },
  "/forgot-password": {
    title: "Reset Your Password | SBD AI Solutions",
    description: "Request a password reset link for your SBD AI Solutions account.",
  },
  "/reset-password": {
    title: "Choose a New Password | SBD AI Solutions",
    description: "Choose a new password for your SBD AI Solutions account.",
  },
  "/verify-email": {
    title: "Verify Your Email | SBD AI Solutions",
    description: "Confirm your email address to activate your SBD AI Solutions account.",
  },
  "/dashboard": {
    title: "My Dashboard | SBD AI Solutions",
    description: "Your private SBD AI Solutions dashboard: AI assistants, training material and conversations.",
  },
};

export function metaFor(pathname) {
  return META[pathname] || { title: HOME_TITLE, description: HOME_DESCRIPTION };
}
