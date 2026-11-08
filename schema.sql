-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > colar > Run.
-- O banco guarda APENAS dados criptografados. Sem a senha de um de vocês, ninguém lê nada.

create table if not exists public.households (
  id uuid primary key,
  invite_wrap text,                -- convite pendente (chave do cofre embrulhada com o código do convite)
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kek_salt text,                   -- sal da chave pessoal
  wrapped_key text,                -- chave do cofre embrulhada com a senha pessoal
  primary key (household_id, user_id)
);

create table if not exists public.items (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  iv text not null,
  data text not null,
  updated_at timestamptz not null default now()
);
create index if not exists items_household_idx on public.items(household_id);

create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;
create or replace function public.member_count(h uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from members where household_id = h;
$$;

alter table public.households enable row level security;
alter table public.members    enable row level security;
alter table public.items      enable row level security;

drop policy if exists hh_select on public.households;
create policy hh_select on public.households for select to authenticated using (public.is_member(id) or created_by = auth.uid());
drop policy if exists hh_insert on public.households;
create policy hh_insert on public.households for insert to authenticated with check (created_by = auth.uid());
drop policy if exists hh_update on public.households;
create policy hh_update on public.households for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

-- cada cofre aceita no máximo 2 pessoas
drop policy if exists mb_select on public.members;
create policy mb_select on public.members for select to authenticated using (public.is_member(household_id));
drop policy if exists mb_insert on public.members;
create policy mb_insert on public.members for insert to authenticated
  with check (user_id = auth.uid() and public.member_count(household_id) < 2);
drop policy if exists mb_update on public.members;
create policy mb_update on public.members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists it_select on public.items;
create policy it_select on public.items for select to authenticated using (public.is_member(household_id));
drop policy if exists it_insert on public.items;
create policy it_insert on public.items for insert to authenticated with check (public.is_member(household_id));
drop policy if exists it_update on public.items;
create policy it_update on public.items for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
drop policy if exists it_delete on public.items;
create policy it_delete on public.items for delete to authenticated using (public.is_member(household_id));

revoke all on public.households, public.members, public.items from anon;
-- garante que usuários logados possam usar as tabelas (as regras acima continuam valendo)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert on public.households, public.members to authenticated;
-- segurança extra: só dá para alterar as colunas que o app usa
-- (ninguém consegue trocar o cofre de uma pessoa nem o dono do cofre)
revoke update on public.households, public.members from authenticated;
grant update (invite_wrap) on public.households to authenticated;
grant update (kek_salt, wrapped_key) on public.members to authenticated;
grant execute on function public.is_member(uuid), public.member_count(uuid) to authenticated;

-- Tempo real: o app recebe na hora as mudanças do outro (os dados continuam criptografados)
alter table public.items replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;
