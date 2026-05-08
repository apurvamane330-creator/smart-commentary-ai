
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- handle_new_user trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- Reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  insights jsonb not null default '{}'::jsonb,
  audio_url text,
  language text not null default 'en',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "own reports select" on public.reports for select using (auth.uid() = user_id);
create policy "own reports insert" on public.reports for insert with check (auth.uid() = user_id);
create policy "own reports update" on public.reports for update using (auth.uid() = user_id);
create policy "own reports delete" on public.reports for delete using (auth.uid() = user_id);
create index reports_user_created_idx on public.reports (user_id, created_at desc);

-- Settings
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark',
  voice text not null default 'en-US-Neural2-D',
  speed numeric not null default 1.0,
  language text not null default 'en',
  auto_download boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
create policy "own settings select" on public.settings for select using (auth.uid() = user_id);
create policy "own settings insert" on public.settings for insert with check (auth.uid() = user_id);
create policy "own settings update" on public.settings for update using (auth.uid() = user_id);

-- Trigger after the settings table exists
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Storage bucket (private)
insert into storage.buckets (id, name, public) values ('dashboards', 'dashboards', false)
on conflict (id) do nothing;

create policy "own files read" on storage.objects for select
  using (bucket_id = 'dashboards' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "own files insert" on storage.objects for insert
  with check (bucket_id = 'dashboards' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "own files update" on storage.objects for update
  using (bucket_id = 'dashboards' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "own files delete" on storage.objects for delete
  using (bucket_id = 'dashboards' and auth.uid()::text = (storage.foldername(name))[1]);
