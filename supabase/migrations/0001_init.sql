-- ═══════════════════════════════════════════════════════════════════════
-- QCI OpenRouter — initial schema
-- Run this in the Supabase SQL Editor (or `supabase db push`).
-- Creates: profiles / jobs / billing_transactions tables, row level
-- security policies, the auto-profile trigger, and private storage buckets.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────

-- Enforce profile isolation and track billing registration
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    updated_at timestamp with time zone default now(),
    full_name text,
    company text,
    stripe_customer_id text,
    billing_setup_complete boolean default false
);

-- Tracks processing jobs across different quantum backends
create table if not exists public.jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete cascade not null,
    file_path text not null,             -- bucket path to uploaded script
    file_name text,
    provider_target text not null,       -- e.g. 'ibm', 'rigetti', 'ionq', 'vultr_simulator'
    status text check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    estimated_queue_minutes int,
    quoted_amount numeric(10, 2),
    qci_transpiler_fee numeric(10, 2),
    result_storage_path text,
    processing_started_at timestamp with time zone,
    created_at timestamp with time zone default now()
);

-- Audits financial pre-auths and refund state distributions
create table if not exists public.billing_transactions (
    id uuid primary key default gen_random_uuid(),
    job_id uuid references public.jobs(id) on delete cascade not null,
    charge_id text,                      -- Stripe PaymentIntent id reference
    amount numeric(10, 2) not null,
    transaction_status text check (transaction_status in ('captured', 'refunded', 'locked')),
    updated_at timestamp with time zone default now()
);

create index if not exists jobs_user_id_idx on public.jobs (user_id, created_at desc);
create index if not exists billing_transactions_job_id_idx on public.billing_transactions (job_id);

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.billing_transactions enable row level security;

create policy "Users can view own profile"
    on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
    on public.profiles for update using (auth.uid() = id);

create policy "Users can view own jobs"
    on public.jobs for select using (auth.uid() = user_id);

create policy "Users can view own transactions"
    on public.billing_transactions for select
    using (exists (
        select 1 from public.jobs
        where jobs.id = billing_transactions.job_id
          and jobs.user_id = auth.uid()
    ));

-- Job/transaction writes happen server-side via the service role key,
-- which bypasses RLS — no insert/update policies needed for users.

-- ── Auto-create a profile row on signup ──────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- ── Storage buckets (private) ────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('job-results', 'job-results', false)
on conflict (id) do nothing;

-- Users may upload/read code files only inside their own uid/ folder
create policy "Users upload own job files"
    on storage.objects for insert
    with check (
        bucket_id = 'job-files'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "Users read own job files"
    on storage.objects for select
    using (
        bucket_id = 'job-files'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- Results are written by the service role only; users read their own
create policy "Users read own job results"
    on storage.objects for select
    using (
        bucket_id = 'job-results'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
