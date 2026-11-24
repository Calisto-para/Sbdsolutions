export const HOME_TITLE = "SBD AI Solutions | Intelligent Technology. Smarter Business.";

export const HOME_DESCRIPTION =
  "SBD AI Solutions is a technology company helping businesses transform their operations through artificial intelligence, intelligent automation and custom software solutions.";

export const META = {
  "/": {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  "/services.html": {
    title: "Services | SBD AI Solutions",
    description:
      "Artificial intelligence, business automation and custom software development from SBD AI Solutions — practical technology built around how your business actually runs.",
  },
  "/projects.html": {
    title: "Projects | SBD AI Solutions",
    description:
      "Technology projects, digital solutions and software development work from SBD AI Solutions — AI, business automation, web and software development.",
  },
  "/about.html": {
    title: "About Us | SBD AI Solutions",
    description:
      "SBD AI Solutions is a technology company helping businesses operate smarter through artificial intelligence, automation and custom software development.",
  },
  "/who-we-help.html": {
    title: "Who We Help | SBD AI Solutions",
    description:
      "SBD AI Solutions works with businesses, startups, organisations and online businesses looking to improve operations through automation and intelligent software.",
  },
  "/contact.html": {
    title: "Contact | SBD AI Solutions",
    description:
      "Contact SBD AI Solutions by WhatsApp, phone or email. Tell us about your business challenge, technology idea or project and we will reply personally.",
  },
  "/start-a-project.html": {
    title: "Start a Project | SBD AI Solutions",
    description:
      "Tell SBD AI Solutions about your business, project or technology requirements. Submit a project enquiry and we will respond with the next steps.",
  },
  "/register.html": {
    title: "Create an Account | SBD AI Solutions",
    description:
      "Create your SBD AI Solutions account to build, train and test AI assistants for your business.",
  },
  "/login.html": {
    title: "Sign In | SBD AI Solutions",
    description: "Sign in to your SBD AI Solutions account to manage AI assistants, training material and conversations.",
  },
  "/forgot-password.html": {
    title: "Reset Your Password | SBD AI Solutions",
    description: "Request a password reset link for your SBD AI Solutions account.",
  },
  "/reset-password.html": {
    title: "Choose a New Password | SBD AI Solutions",
    description: "Choose a new password for your SBD AI Solutions account.",
  },
  "/verify-email.html": {
    title: "Verify Your Email | SBD AI Solutions",
    description: "Confirm your email address to activate your SBD AI Solutions account.",
  },
  "/dashboard.html": {
    title: "My Dashboard | SBD AI Solutions",
    description: "Your private SBD AI Solutions dashboard: AI assistants, training material and conversations.",
  },
};

export function metaFor(pathname) {
  return META[pathname] || { title: HOME_TITLE, description: HOME_DESCRIPTION };
}
