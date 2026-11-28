/* Single source of truth for project starting prices and scope.
   Both the public pricing page and the enquiry API read this file, so a price
   can never drift between what a visitor sees and what is saved.

   USD is the official pricing currency. Local-currency amounts are produced at
   checkout from a live exchange rate and are never stored here. */

export const SERVICES = [
  {
    slug: "business-website",
    name: "Business Website",
    usd: 200,
    summary: "A credible company website that explains what you do and turns visitors into enquiries.",
    includes: [
      "Website design and development",
      "Responsive desktop, tablet and mobile layouts",
      "Up to five standard website pages",
      "Contact and enquiry form",
      "Basic on-page SEO setup",
      "Basic website security configuration",
      "Deployment assistance",
      "Database setup where required by the agreed project scope",
    ],
    excludes: [],
  },
  {
    slug: "corporate-website",
    name: "Corporate Website",
    usd: 300,
    summary: "A fuller corporate site with the structure and credibility a growing organisation needs.",
    includes: [
      "Website design and development",
      "Responsive desktop, tablet and mobile layouts",
      "Corporate pages agreed in the project scope",
      "Contact and enquiry forms",
      "Basic on-page SEO setup",
      "Basic website security configuration",
      "Deployment assistance",
      "Database setup where required by the agreed project scope",
    ],
    excludes: [],
  },
  {
    slug: "ecommerce-website",
    name: "E-commerce Website",
    usd: 400,
    summary: "An online store with a product catalogue, cart, checkout and order management.",
    includes: [
      "Storefront design and development",
      "Responsive desktop, tablet and mobile layouts",
      "Product catalogue and category setup",
      "Cart and checkout flow",
      "Payment provider integration setup",
      "Order and customer management screens",
      "Basic on-page SEO and security configuration",
      "Deployment assistance and database setup",
    ],
    excludes: ["Payment provider transaction fees", "Product photography and copywriting"],
  },
  {
    slug: "custom-web-application",
    name: "Custom Web Application",
    usd: 500,
    summary: "A web application built around your exact workflow, with accounts, roles and a database.",
    includes: [
      "Requirements discovery and solution design",
      "Custom interface and responsive layouts",
      "User accounts and access control agreed in scope",
      "Database schema and backend APIs",
      "Core workflows agreed in the project scope",
      "Testing and deployment assistance",
      "Documentation and handover",
    ],
    excludes: [],
  },
  {
    slug: "business-management-system",
    name: "Business Management System",
    usd: 500,
    summary: "An internal system for customers, sales, inventory, staff and day-to-day reporting.",
    includes: [
      "Requirements discovery and module planning",
      "Custom management dashboard",
      "Modules agreed in scope (for example customers, sales, inventory or reporting)",
      "Role-based staff access",
      "Database design and backend development",
      "Testing, deployment assistance and handover documentation",
    ],
    excludes: [],
  },
  {
    slug: "booking-reservation-platform",
    name: "Booking and Reservation Platform",
    usd: 350,
    summary: "Let customers check availability, book, pay where required and receive confirmation.",
    includes: [
      "Booking flow design and development",
      "Availability calendar and slot management",
      "Customer details and booking records",
      "Email confirmation setup",
      "Admin view for managing bookings",
      "Responsive layouts, testing and deployment assistance",
      "Database setup for bookings and customers",
    ],
    excludes: ["Paid SMS or WhatsApp notification fees", "Payment provider transaction fees"],
  },
  {
    slug: "ai-chatbot-integration",
    name: "AI Chatbot Integration",
    usd: 150,
    summary: "An AI assistant trained on your business information and embedded on your website.",
    includes: [
      "Assistant configuration and tone setup",
      "Training on the business information you provide",
      "Website chat widget and installation",
      "Conversation storage and lead capture",
      "Testing with real business questions",
      "Deployment assistance",
    ],
    excludes: ["AI model and API usage charges", "Messaging platform or channel fees"],
  },
  {
    slug: "whatsapp-ai-automation",
    name: "WhatsApp AI Automation",
    usd: 200,
    summary: "AI replies and lead capture on WhatsApp, with a clean handover to your team.",
    includes: [
      "Conversation flow design",
      "AI reply setup from your business information",
      "WhatsApp Business API connection assistance",
      "Lead capture and handover to a human",
      "Testing and deployment assistance",
    ],
    excludes: [
      "Meta Business verification and a dedicated phone number",
      "Usage above the subscribed plan allowance (quoted and approved first)",
    ],
  },
  {
    slug: "business-workflow-automation",
    name: "Business Workflow Automation",
    usd: 150,
    summary: "Connect your tools and remove repetitive manual steps from daily operations.",
    includes: [
      "Workflow mapping and automation design",
      "Automation setup for the processes agreed in scope",
      "Integration with the tools you already use",
      "Error notifications and testing",
      "Documentation and a plain-language runbook",
    ],
    excludes: ["Subscription fees for third-party automation tools", "Paid API usage charges"],
  },
  {
    slug: "custom-ai-application",
    name: "Custom AI Application",
    usd: 500,
    summary: "A purpose-built AI product trained on your data and designed around your process.",
    includes: [
      "Discovery, data review and solution design",
      "Custom AI application and interface",
      "Model integration and prompt/workflow engineering",
      "Data preparation from the material you provide",
      "Testing, deployment assistance and documentation",
      "Database setup where required by the agreed scope",
    ],
    excludes: ["AI model and API usage charges", "Specialist hosting or GPU costs"],
  },
];

/* Every project shares the same third-party exclusions. */
export const COMMON_EXCLUDES = [
  "Domain name registration and annual renewal",
  "Paid hosting or server subscription",
  "Paid database hosting or usage fees, where applicable",
  "Premium themes, plugins, templates or third-party software licences",
  "Paid email services and external API services",
  "Ongoing website maintenance and support after the included support period",
];

export const PAYMENT_SPLIT = { deposit: 60, final: 40 };

export const PRICE_DISCLAIMER =
  "These are starting development prices, not guaranteed final quotations. The final amount is confirmed in a written quotation after your requirements are reviewed.";

export function findService(slug) {
  return SERVICES.find((service) => service.slug === slug) || null;
}

export function startingPrice(service) {
  if (!service) return null;
  return service.usd;
}

export function serviceExcludes(service) {
  return [...(service?.excludes || []), ...COMMON_EXCLUDES];
}
