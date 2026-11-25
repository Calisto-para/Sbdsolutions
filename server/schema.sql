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

create index if not exists users_email_lower_idx on users (lower(email));
create index if not exists assistants_user_idx on assistants (user_id, created_at desc);
create index if not exists knowledge_assistant_idx on knowledge_items (assistant_id, created_at desc);
create index if not exists conversations_assistant_idx on conversations (assistant_id, updated_at desc);
create index if not exists conversations_user_idx on conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at);
