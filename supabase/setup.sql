-- Apply once to the Supabase project. No access codes are stored in source.
create table public.hwaseong_judging_events (
 event_id text primary key,
 revision bigint not null default 0 check(revision >= 0),
 state jsonb not null check(jsonb_typeof(state) = 'object'),
 updated_at timestamptz not null default now(),
 check ((state->>'revision')::bigint = revision)
);
create table public.hwaseong_judging_codes (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 event_id text not null references public.hwaseong_judging_events(event_id),
 role text not null check(role in ('admin','j1','j2','j3','j4','j5')),
 active boolean not null default true,
 unique(event_id,role)
);
alter table public.hwaseong_judging_events enable row level security;
alter table public.hwaseong_judging_codes enable row level security;
revoke all on public.hwaseong_judging_events, public.hwaseong_judging_codes from public, anon, authenticated;
grant select,insert,update,delete on public.hwaseong_judging_events, public.hwaseong_judging_codes to service_role;
