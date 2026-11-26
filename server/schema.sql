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
  ('starter', 'Starter', 15, 'USD', 1, 35, 3000, 3000, '["1 AI assistant", "35 visitor messages a month", "Website chatbot", "Lead collection", "3,000 SBD AI credits a month"]'::jsonb, 1, false, 'Billed monthly', true, 3),
  ('professional', 'Professional', 35, 'USD', 3, 100, 10000, 10000, '["3 AI assistants", "100 visitor messages a month", "Website chatbot", "Lead collection", "10,000 SBD AI credits a month", "Priority support"]'::jsonb, 2, false, 'Billed monthly', true, 10),
  ('business', 'Business', 65, 'USD', 10, 200, 25000, 25000, '["10 AI assistants", "200 visitor messages a month", "Website chatbot", "Lead collection", "25,000 SBD AI credits a month", "Priority support"]'::jsonb, 3, false, 'Billed monthly', true, 25),
  ('enterprise', 'Enterprise', 0, 'USD', 50, 100000, 0, null, '["Unlimited assistants by agreement", "Custom message volume", "Website chatbot", "Lead collection", "SBD AI credits by agreement"]'::jsonb, 4, true, 'Monthly or agreed billing', false, null)
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
