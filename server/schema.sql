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
  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);
insert into plans (id, name, price, currency, assistant_limit, message_limit, features, sort_order) values
  ('starter', 'Starter', 0, 'USD', 1, 200, '["1 AI assistant", "200 visitor messages a month", "Website chatbot", "Lead collection"]'::jsonb, 1),
  ('growth', 'Growth', 29, 'USD', 3, 2000, '["3 AI assistants", "2,000 visitor messages a month", "Lead collection", "Priority support"]'::jsonb, 2),
  ('scale', 'Scale', 99, 'USD', 10, 10000, '["10 AI assistants", "10,000 visitor messages a month", "Lead collection", "Priority support"]'::jsonb, 3)
on conflict (id) do nothing;

create table if not exists subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  plan_id text not null references plans(id) default 'starter',
  status text not null default 'active',
  cancel_at_period_end boolean not null default false,
  started_at timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_id text not null,
  amount numeric(10, 2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending',
  method text not null default 'offline',
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists payments_user_idx on payments (user_id, created_at desc);

create index if not exists users_email_lower_idx on users (lower(email));
create index if not exists assistants_user_idx on assistants (user_id, created_at desc);
create index if not exists knowledge_assistant_idx on knowledge_items (assistant_id, created_at desc);
create index if not exists conversations_assistant_idx on conversations (assistant_id, updated_at desc);
create index if not exists conversations_user_idx on conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at);
create index if not exists conversations_status_idx on conversations (user_id, status, updated_at desc);
create index if not exists messages_author_idx on messages (conversation_id, created_at);
