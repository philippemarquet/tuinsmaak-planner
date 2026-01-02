-- Persistente plattegrond-elementen (kas/pad/boom/etc.) per tuin
create table if not exists public.garden_plot_objects (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  type text not null,
  x integer not null default 0,
  y integer not null default 0,
  w integer not null default 100,
  h integer not null default 100,
  label text,
  z_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_garden_plot_objects_garden_id
  on public.garden_plot_objects(garden_id);

create index if not exists idx_garden_plot_objects_garden_z
  on public.garden_plot_objects(garden_id, z_index);

alter table public.garden_plot_objects enable row level security;

drop policy if exists "Garden members manage plot objects" on public.garden_plot_objects;
create policy "Garden members manage plot objects"
on public.garden_plot_objects
for all
using (
  exists (
    select 1
    from public.garden_users gu
    where gu.garden_id = garden_plot_objects.garden_id
      and gu.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.garden_users gu
    where gu.garden_id = garden_plot_objects.garden_id
      and gu.user_id = auth.uid()
  )
);

drop trigger if exists update_garden_plot_objects_updated_at on public.garden_plot_objects;
create trigger update_garden_plot_objects_updated_at
before update on public.garden_plot_objects
for each row
execute function public.update_updated_at_column();
