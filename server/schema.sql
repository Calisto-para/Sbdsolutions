create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  business_name text default '',
  email text not null unique,
  phone text default '',
  country text default '',
  password_hash text not null,
  email_verified_at timestamptz,
  verification_token_hash text,
  verification_expires_at timestamptz,
  reset_token_hash text,
  reset_expires_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists businesses (
  user_id uuid primary key references users(id) on delete cascade,
  name text default '',
  industry text default '',
  website text default '',
  description text default '',
  support_email text default '',
  phone text default '',
  address text default '',
  updated_at timestamptz not null default now()
);

create table if not exists assistants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  business_description text default '',
  services text default '',
  products text default '',
  tone text default 'friendly',
  language text default 'English',
  greeting text default '',
  instructions text default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  assistant_id uuid not null references assistants(id) on delete cascade,
  kind text not null check (kind in ('note', 'faq', 'pricing', 'document')),
  title text not null default '',
  content text not null,
  source_name text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  assistant_id uuid not null references assistants(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

/* Operators get a role; every account created before this column existed is a client. */
alter table users add column if not exists role text not null default 'client';

/* Suspension is reversible: the operator only records when it happened. */
alter table users add column if not exists suspended_at timestamptz;
alter table users add column if not exists suspended_reason text not null default '';

/* Website chatbot settings. Every assistant gets a public key for the embed
   snippet; older rows are backfilled before the column becomes required. */
alter table assistants add column if not exists public_key text;
alter table assistants add column if not exists widget_color text not null default '#0b5cff';
alter table assistants add column if not exists widget_position text not null default 'right';
alter table assistants add column if not exists welcome_message text not null default '';
update assistants set public_key = replace(gen_random_uuid()::text, '-', '') where public_key is null;
alter table assistants alter column public_key set default replace(gen_random_uuid()::text, '-', '');
alter table assistants alter column public_key set not null;
create unique index if not exists assistants_public_key_idx on assistants (public_key);

/* Where a conversation came from, whether it is finished, and who last spoke. */
alter table conversations add column if not exists channel text not null default 'dashboard';
alter table conversations add column if not exists status text not null default 'open';
alter table conversations add column if not exists takeover boolean not null default false;
alter table conversations add column if not exists visitor_name text not null default '';
alter table conversations add column if not exists visitor_email text not null default '';
alter table conversations add column if not exists visitor_phone text not null default '';
alter table conversations add column if not exists visitor_service text not null default '';
alter table messages add column if not exists author text not null default '';

/* Enquiries collected by the assistants. One lead per conversation, enriched
   each time the visitor shares another detail. */
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  assistant_id uuid not null references assistants(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  service text not null default '',
  source text not null default 'website',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
/* Chat notification tracking: one email per new website conversation. */
alter table conversations add column if not exists notified_at timestamptz;
alter table conversations add column if not exists notification_status text not null default '';
alter table conversations add column if not exists notification_error text not null default '';

/* Lead notification tracking: one owner alert and one visitor confirmation per lead. */
alter table leads add column if not exists notified_at timestamptz;
alter table leads add column if not exists acknowledged_at timestamptz;
alter table leads add column if not exists notification_status text not null default '';
alter table leads add column if not exists notification_error text not null default '';
create unique index if not exists leads_conversation_idx on leads (conversation_id);
create index if not exists leads_user_idx on leads (user_id, created_at desc);

/* Subscription plans, seeded once. Limits are enforced on the platform side. */
create table if not exists plans (
  id text primary key,
  name text not null,
  price numeric(10, 2) not null default 0,
  currency text not null default 'USD',
  assistant_limit integer not null default 1,
  message_limit integer not null default 200,
  token_limit integer not null default 0,
  credit_limit integer,

  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);
/* Prices and names are kept in step with this list on every boot, so changing
   them here is enough — existing subscribers move to the new price/limits. */
alter table plans add column if not exists token_limit integer not null default 0;
alter table plans add column if not exists custom boolean not null default false;
alter table plans add column if not exists billing_note text not null default '';
alter table plans add column if not exists token_price_hidden boolean not null default false;
alter table plans add column if not exists underlying_cost numeric(10, 2);
alter table plans add column if not exists credit_limit integer;
insert into plans (id, name, price, currency, assistant_limit, message_limit, token_limit, credit_limit, features, sort_order, custom, billing_note, token_price_hidden, underlying_cost) values
  ('starter', 'Starter', 15, 'USD', 1, 50, 3000, 3000, '["1 AI agent", "50 unique customers a month", "Website chatbot", "Lead collection", "3,000 SBD AI credits a month"]'::jsonb, 1, false, 'Billed monthly', true, 3),
  ('professional', 'Professional', 35, 'USD', 3, 150, 10000, 10000, '["3 AI agents", "150 unique customers a month", "Website chatbot", "Lead collection", "10,000 SBD AI credits a month", "Priority support"]'::jsonb, 2, false, 'Billed monthly', true, 10),
  ('business', 'Business', 65, 'USD', 10, 300, 25000, 25000, '["10 AI agents", "300 unique customers a month", "Website chatbot", "Lead collection", "25,000 SBD AI credits a month", "Priority support"]'::jsonb, 3, false, 'Billed monthly', true, 25),
  ('enterprise', 'Enterprise', 0, 'USD', 0, 100000, 0, null, '["AI agents by administrator allowance", "Custom message volume", "Website chatbot", "Lead collection", "SBD AI credits by agreement"]'::jsonb, 4, true, 'Monthly or agreed billing', false, null)
on conflict (id) do update
  set name = excluded.name,
      price = excluded.price,
      currency = excluded.currency,
      assistant_limit = excluded.assistant_limit,
      message_limit = excluded.message_limit,
      token_limit = excluded.token_limit,
      credit_limit = excluded.credit_limit,
      features = excluded.features,
      sort_order = excluded.sort_order,
      custom = excluded.custom,
      billing_note = excluded.billing_note,
      token_price_hidden = excluded.token_price_hidden,
      underlying_cost = excluded.underlying_cost;

create table if not exists subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  plan_id text not null references plans(id) default 'starter',
  status text not null default 'active',
  cancel_at_period_end boolean not null default false,
  started_at timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  tokens_used integer not null default 0,
  credits_used numeric not null default 0,
  spending_used numeric not null default 0,
  updated_at timestamptz not null default now()
);
alter table subscriptions add column if not exists tokens_used integer not null default 0;
alter table subscriptions add column if not exists credits_used numeric not null default 0;
alter table subscriptions add column if not exists spending_used numeric not null default 0;
/* Enterprise agent allowance is assigned per account by an operator. Null means
   none has been agreed yet, so no additional agents can be created. */
alter table subscriptions add column if not exists agent_allowance integer;

/* Retire the old plan ids without stranding anyone who was subscribed to them.
   Runs after subscriptions exists, so a fresh database starts cleanly. */
update subscriptions set plan_id = 'professional', updated_at = now() where plan_id = 'growth';
update subscriptions set plan_id = 'business', updated_at = now() where plan_id = 'scale';
delete from plans where id in ('growth', 'scale');

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_id text not null,
  amount numeric(10, 2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending',
  method text not null default 'offline',
  description text not null default '',
  reference text,
  note text not null default '',
  verified_at timestamptz,
  verified_by uuid references users(id) on delete set null,
  rejected_reason text not null default '',
  created_at timestamptz not null default now()
);
alter table payments add column if not exists charged_amount numeric(10, 2);
alter table payments add column if not exists token_limit integer;
alter table payments add column if not exists underlying_cost numeric(10, 2);
create unique index if not exists payments_reference_idx on payments (reference) where reference is not null;
create index if not exists payments_user_idx on payments (user_id, created_at desc);
create index if not exists payments_status_idx on payments (status, created_at desc);

create index if not exists users_email_lower_idx on users (lower(email));
create index if not exists assistants_user_idx on assistants (user_id, created_at desc);
create index if not exists knowledge_assistant_idx on knowledge_items (assistant_id, created_at desc);
create index if not exists conversations_assistant_idx on conversations (assistant_id, updated_at desc);
create index if not exists conversations_user_idx on conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at);
create index if not exists conversations_status_idx on conversations (user_id, status, updated_at desc);
create index if not exists messages_author_idx on messages (conversation_id, created_at);

/* Widget visitors are identified by a random browser id, so one business can
   never read another business's chats. */
alter table conversations add column if not exists visitor_id text not null default '';
create index if not exists conversations_visitor_idx on conversations (user_id, visitor_id, created_at desc);
alter table subscriptions add column if not exists period_start_at timestamptz not null default now();

/* Project quotations are separate from subscription payments and are never
   charged automatically when an enquiry is submitted. */
create table if not exists project_enquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  full_name text not null,
  business_name text default '',
  email text not null,
  phone text not null,
  country text default '',
  service text not null,
  currency text not null check (currency in ('NGN', 'USD')),
  estimated_budget text default '',
  description text not null,
  additional_requirements text default '',
  status text not null default 'New',
  quotation_amount numeric(12, 2),
  quotation_currency text check (quotation_currency in ('NGN', 'USD')),
  included_services text default '',
  cost_lines jsonb not null default '[]'::jsonb,
  payment_arrangement text default '',
  payment_status text not null default 'Unpaid',
  payment_reference text default '',
  history jsonb not null default '[]'::jsonb,
  notification_status text not null default 'pending',
  notification_error text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table project_enquiries add column if not exists quotation_currency text;
alter table project_enquiries add column if not exists notification_status text not null default 'pending';
alter table project_enquiries add column if not exists notification_error text default '';
alter table project_enquiries add column if not exists starting_price_amount numeric(12, 2);
alter table project_enquiries add column if not exists starting_price_currency text;
create index if not exists project_enquiries_user_idx on project_enquiries (user_id, created_at desc);
create index if not exists project_enquiries_status_idx on project_enquiries (status, created_at desc);

/* Business information the assistant answers from, beyond the basic profile. */
alter table businesses add column if not exists whatsapp text not null default '';
alter table businesses add column if not exists opening_hours text not null default '';
alter table businesses add column if not exists social_links text not null default '';
alter table businesses add column if not exists additional_instructions text not null default '';
alter table businesses add column if not exists payment_methods text not null default '';
alter table businesses add column if not exists delivery_info text not null default '';
alter table businesses add column if not exists published_at timestamptz;

/* Products and services, each with its own price, description and options.
   Prices are entered by the customer; the platform never invents one. */
create table if not exists business_offerings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null default 'product' check (type in ('product', 'service')),
  name text not null,
  description text not null default '',
  price text not null default '',
  options text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_offerings_user_idx on business_offerings (user_id, created_at);

/* The knowledge base is shared by every assistant a customer owns, so an FAQ or
   an uploaded document only has to be added once. Assistant-specific training
   keeps its assistant_id; business-wide records use NULL. */
alter table knowledge_items alter column assistant_id drop not null;
alter table knowledge_items add column if not exists mime text not null default '';
alter table knowledge_items add column if not exists size_bytes integer not null default 0;
create index if not exists knowledge_user_idx on knowledge_items (user_id, created_at desc);

/* Older project_enquiries tables may predate the owner column. */
alter table project_enquiries add column if not exists user_id uuid references users(id) on delete set null;

/* USD is the official pricing currency. Local-currency checkout stores both:
   the USD price is never overwritten by the converted amount. */
alter table payments add column if not exists base_amount_usd numeric(10, 2);
alter table payments add column if not exists base_currency text not null default 'USD';
alter table payments add column if not exists country text not null default '';
alter table payments add column if not exists payment_currency text not null default 'USD';
alter table payments add column if not exists local_amount numeric(14, 2);
alter table payments add column if not exists fx_rate numeric(18, 8);
alter table payments add column if not exists fx_captured_at timestamptz;
alter table payments add column if not exists fx_source text not null default '';
alter table payments add column if not exists provider text not null default '';
alter table payments add column if not exists provider_reference text not null default '';
create unique index if not exists payments_provider_reference_idx on payments (provider, provider_reference)
  where provider_reference <> '';

/* Project enquiries are quoted in USD. Local-currency information is recorded
   for reference and never replaces the USD starting price. */
alter table project_enquiries add column if not exists base_amount_usd numeric(12, 2);
alter table project_enquiries add column if not exists payment_currency text not null default 'USD';
alter table project_enquiries add column if not exists country text not null default '';
alter table project_enquiries add column if not exists local_amount numeric(14, 2);
alter table project_enquiries add column if not exists fx_rate numeric(18, 8);
alter table project_enquiries add column if not exists fx_captured_at timestamptz;

/* A visitor is a person, not a conversation. The widget keeps one stable
   identifier per browser so a returning visitor resumes the same conversation
   and is counted once, however many chats they open. */
alter table conversations add column if not exists visitor_key text not null default '';
create index if not exists conversations_visitor_idx on conversations (assistant_id, visitor_key, status);

/* Message-level idempotency. client_id comes from the widget and makes a
   retried send return the original message instead of storing it twice, while
   reply_to ties the single AI answer to the visitor message that caused it.
   Both indexes tolerate NULL so every message stored before this change is
   untouched. */
alter table messages add column if not exists client_id text;
alter table messages add column if not exists reply_to uuid references messages(id) on delete set null;
alter table messages add column if not exists status text not null default 'done';
create unique index if not exists messages_client_idx on messages (conversation_id, client_id);
create unique index if not exists messages_reply_idx on messages (conversation_id, reply_to);

/* One row per completed, billable AI request: the usage ledger behind SBD AI
   credit deductions and the operator's spend report. The unique idempotency
   key is what stops a retried request from being charged twice. Costs are
   stored at full precision (no rounding at write time), and cached, cache-write
   and output tokens are recorded separately so the maths can be audited. */
create table if not exists ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  idempotency_key text not null,
  model text not null default '',
  source text not null default '',
  prompt_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cost_usd numeric(18, 10) not null default 0,
  credits numeric(18, 6) not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists ai_usage_events_key_idx on ai_usage_events (user_id, idempotency_key);
create index if not exists ai_usage_events_month_idx on ai_usage_events (created_at desc, user_id);

/* ---------- Live human takeover ---------- */
/* A conversation lifecycle the backend owns: ai_active, human_requested,
   human_active, resolved. The older 'open' value is migrated below and is
   still accepted as a synonym for ai_active so nothing breaks mid-deploy. */
alter table conversations alter column status set default 'ai_active';
update conversations set status = 'ai_active' where status = 'open';
alter table conversations add column if not exists human_requested_at timestamptz;
alter table conversations add column if not exists human_assigned_at timestamptz;
alter table conversations add column if not exists human_assigned_to uuid references users(id) on delete set null;
alter table conversations add column if not exists resolved_at timestamptz;
alter table conversations add column if not exists last_message_at timestamptz not null default now();
alter table conversations add column if not exists last_visitor_message_at timestamptz;
/* The last time the owner opened the thread, used for unread counts. */
alter table conversations add column if not exists owner_last_read_at timestamptz not null default 'epoch';
alter table conversations add column if not exists visitor_online_at timestamptz;
create index if not exists conversations_lifecycle_idx on conversations (user_id, status, last_message_at desc);
create index if not exists conversations_assigned_idx on conversations (human_assigned_to, status);
/* Takeover state must agree with the status for rows written by older code. */
update conversations set takeover = (status = 'human_active')
 where takeover is distinct from (status = 'human_active');

/* One row per in-app notification. dedupe_key is what stops the same warning
   or the same support request from being announced twice. */
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null default 'system',
  level text not null default 'info',
  title text not null,
  body text not null default '',
  link text not null default '',
  conversation_id uuid references conversations(id) on delete set null,
  dedupe_key text not null,
  read_at timestamptz,
  email_status text not null default '',
  push_status text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists notifications_dedupe_idx on notifications (user_id, dedupe_key);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id, read_at) where read_at is null;

/* Push subscriptions. One business owner can register several devices; a token
   is unique per account so re-registering the same browser is harmless. */
create table if not exists push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null,
  platform text not null default 'web',
  label text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_error text not null default ''
);
create unique index if not exists push_devices_token_idx on push_devices (user_id, token);
create index if not exists push_devices_user_idx on push_devices (user_id, last_seen_at desc);

/* ---------- Subscription upgrades and extra credits ---------- */
/* purchased credits are tracked separately from the plan allowance and never
   reset by a renewal. */
alter table subscriptions add column if not exists bonus_credits numeric(18, 2) not null default 0;
alter table payments add column if not exists kind text not null default 'plan';
alter table payments add column if not exists credit_amount integer;
alter table payments add column if not exists proration jsonb not null default '{}'::jsonb;
alter table payments add column if not exists target_plan_id text;

/* Admin-configured credit packages. Purchasing stays disabled until at least
   one active row exists; no price is ever invented by the platform. */
create table if not exists credit_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  credits integer not null check (credits > 0),
  price numeric(10, 2) not null check (price > 0),
  currency text not null default 'USD',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credit_packages_active_idx on credit_packages (active, sort_order);

create table if not exists credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  payment_id uuid references payments(id) on delete set null,
  package_id uuid references credit_packages(id) on delete set null,
  credits integer not null,
  price numeric(10, 2) not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);
/* One payment can add credits exactly once. */
create unique index if not exists credit_purchases_payment_idx on credit_purchases (payment_id);
create index if not exists credit_purchases_user_idx on credit_purchases (user_id, created_at desc);

/* ---- Operator reporting, notification centre and audit trail ------------- */
create table if not exists admin_notification_reads (
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists audit_log (
  id bigserial primary key,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  target text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on audit_log (created_at desc);

/* ---- Customer support tickets ------------------------------------------- */
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  subject text not null,
  category text not null default 'general',
  priority text not null default 'normal',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_customer_reply_at timestamptz,
  last_staff_reply_at timestamptz
);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author_role text not null default 'customer',
  author_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx on support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_status_idx on support_tickets (status, updated_at desc);
create index if not exists support_messages_ticket_idx on support_messages (ticket_id, created_at);

/* ---- Refunds ------------------------------------------------------------ */
create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references payments(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(10, 2) not null,
  currency text not null default 'USD',
  reason text not null default '',
  refunded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists refunds_created_idx on refunds (created_at desc);

/* ---- Custom requests and offers ----------------------------------------- */
create table if not exists custom_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null default 'service',
  product text not null default '',
  title text not null,
  contact_name text default '',
  business_name text default '',
  email text default '',
  phone text default '',
  expected_usage text default '',
  requirements text not null,
  websites integer,
  whatsapp_numbers integer,
  budget text default '',
  billing_preference text default '',
  status text not null default 'pending',
  admin_notes text default '',
  assigned_to text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_requests_user_idx on custom_requests (user_id, updated_at desc);
create index if not exists custom_requests_status_idx on custom_requests (status, updated_at desc);

create table if not exists custom_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references custom_requests(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null,
  currency text not null default 'USD',
  billing_period text not null default 'one-off',
  credits integer,
  customer_limit integer,
  website_limit integer,
  included_features text default '',
  conditions text default '',
  expires_at timestamptz,
  status text not null default 'draft',
  revision_note text default '',
  payment_id uuid references payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists custom_offers_request_idx on custom_offers (request_id, created_at desc);

/* ---- Custom subscription entitlements ---------------------------------- */
/* A custom plan row is created from an accepted offer and attached to the
   customer's existing subscription. Enterprise is the only plan whose credits
   are unlimited; every other custom plan must state its allowance. */
alter table plans add column if not exists unlimited_credits boolean not null default false;
alter table plans add column if not exists custom_request_id uuid;
update plans set unlimited_credits = true where id = 'enterprise';
alter table custom_offers add column if not exists zero_cost boolean not null default false;
alter table custom_offers add column if not exists assistant_limit integer;
alter table subscriptions add column if not exists custom_activated_at timestamptz;
alter table subscriptions add column if not exists custom_previous_plan_id text;
