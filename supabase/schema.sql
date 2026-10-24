-- Playboard cloud sync: one row per synced record, private to its owner.
create table if not exists playboard_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  store text not null check (store in ('sessions', 'progress', 'syncMaps', 'settings')),
  key text not null,
  value jsonb not null,
  updated_at bigint not null,
  primary key (user_id, store, key)
);

alter table playboard_records enable row level security;

create policy "own rows: read" on playboard_records for select using (auth.uid() = user_id);
create policy "own rows: insert" on playboard_records for insert with check (auth.uid() = user_id);
create policy "own rows: update" on playboard_records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on playboard_records for delete using (auth.uid() = user_id);
