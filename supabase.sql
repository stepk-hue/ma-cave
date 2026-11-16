-- =====================================================================
-- Ma Cave — tables de synchronisation (à exécuter une seule fois)
-- Supabase › SQL Editor › New query › coller ce fichier › Run
-- Chaque ligne appartient à un utilisateur et n'est lisible que par lui
-- (Row Level Security).
-- =====================================================================

-- État complet de la cave (une ligne par utilisateur)
create table if not exists public.cave_etat (
  user_id  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  etat     jsonb not null,
  rev      bigint not null default 1,
  maj      timestamptz not null default now(),
  appareil text
);

-- Photos (image compressée, encodée en texte)
create table if not exists public.cave_photos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id      text not null,
  data    text not null,
  primary key (user_id, id)
);

-- Une version par jour, conservée 30 jours (filet de sécurité)
create table if not exists public.cave_versions (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour    date not null default current_date,
  etat    jsonb not null,
  rev     bigint,
  primary key (user_id, jour)
);

alter table public.cave_etat     enable row level security;
alter table public.cave_photos   enable row level security;
alter table public.cave_versions enable row level security;

drop policy if exists "cave_etat proprietaire" on public.cave_etat;
create policy "cave_etat proprietaire" on public.cave_etat
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "cave_photos proprietaire" on public.cave_photos;
create policy "cave_photos proprietaire" on public.cave_photos
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "cave_versions lecture" on public.cave_versions;
create policy "cave_versions lecture" on public.cave_versions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Droits d'accès par l'API : uniquement pour un utilisateur connecté
grant select, insert, update, delete on public.cave_etat   to authenticated;
grant select, insert, update, delete on public.cave_photos to authenticated;
grant select                         on public.cave_versions to authenticated;
revoke all on public.cave_etat, public.cave_photos, public.cave_versions from anon;

-- Archive quotidienne automatique à chaque enregistrement de l'état
create or replace function public.cave_archiver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- on ne remplace pas la version du jour par un état vide
  if jsonb_array_length(coalesce(new.etat -> 'vins', '[]'::jsonb)) > 0
     or not exists (select 1 from public.cave_versions v where v.user_id = new.user_id and v.jour = current_date) then
    insert into public.cave_versions (user_id, jour, etat, rev)
    values (new.user_id, current_date, new.etat, new.rev)
    on conflict (user_id, jour) do update set etat = excluded.etat, rev = excluded.rev;
  end if;
  delete from public.cave_versions v where v.user_id = new.user_id and v.jour < current_date - 30;
  return new;
end;
$$;

drop trigger if exists cave_archiver on public.cave_etat;
create trigger cave_archiver
  after insert or update on public.cave_etat
  for each row execute function public.cave_archiver();
