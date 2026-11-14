-- Juntô Doces: cardápio estilo "cardápio digital" (categorias, produtos com complementos)
-- e permissões para a equipe editar o cardápio e a loja pelo gestor (admin.html).
-- Rode depois do 0001. Se você já tinha rodado o seed antigo, rode o seed.sql novo em seguida.

-- Categorias ------------------------------------------------------------------
create table public.categories (
  id     text primary key,
  name   text not null,
  sort   integer not null default 0,
  active boolean not null default true
);

-- Grupos de complementos (ex.: "Acompanhamentos", "Calda") ----------------------
-- min_select  = quantas opções o cliente precisa escolher (0 = opcional)
-- max_select  = máximo de opções
-- free_select = quantas opções saem sem custo; as demais cobram o preço da opção
create table public.option_groups (
  id          text primary key,
  title       text not null,
  min_select  integer not null default 0 check (min_select >= 0),
  max_select  integer not null default 1 check (max_select >= 1),
  free_select integer not null default 0 check (free_select >= 0),
  check (min_select <= max_select)
);

create table public.options (
  id          text primary key,
  group_id    text not null references public.option_groups (id) on delete cascade,
  name        text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  active      boolean not null default true,
  sort        integer not null default 0
);
create index options_group_idx on public.options (group_id);

-- Quais grupos aparecem em cada produto
create table public.product_groups (
  product_id text not null references public.products (id) on delete cascade,
  group_id   text not null references public.option_groups (id) on delete cascade,
  sort       integer not null default 0,
  primary key (product_id, group_id)
);

-- Produtos: passa a usar categories, ganha foto e "pausado" (esgotado) ---------
delete from public.products where category in ('acai-tamanho', 'acai-acomp');
alter table public.products add column category_id text references public.categories (id);
alter table public.products add column image_url text;
alter table public.products add column paused boolean not null default false;
alter table public.products drop column category;
alter table public.products drop column grp;

-- Quem é da equipe? (usado nas regras abaixo) -----------------------------------
create function public.is_staff() returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()))
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

-- RLS ---------------------------------------------------------------------------
alter table public.categories     enable row level security;
alter table public.option_groups  enable row level security;
alter table public.options        enable row level security;
alter table public.product_groups enable row level security;

-- leitura pública do cardápio
create policy "categorias publicas" on public.categories
  for select to anon, authenticated using (active);
create policy "grupos publicos" on public.option_groups
  for select to anon, authenticated using (true);
create policy "opcoes publicas" on public.options
  for select to anon, authenticated using (active);
create policy "produto-grupos publicos" on public.product_groups
  for select to anon, authenticated using (true);

-- equipe lê e edita tudo do cardápio e das configurações
create policy "equipe categorias" on public.categories
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "equipe grupos" on public.option_groups
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "equipe opcoes" on public.options
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "equipe produto-grupos" on public.product_groups
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "equipe produtos" on public.products
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "equipe config" on public.settings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- configurações que o site público pode ler
drop policy "config publica" on public.settings;
create policy "config publica" on public.settings
  for select to anon, authenticated
  using (key in ('loja_nome', 'loja_whatsapp', 'loja_modo', 'horarios',
                 'taxa_entrega_cents', 'pedido_minimo_cents', 'tempo_min', 'tempo_max'));

-- chaves antigas que não são mais usadas
delete from public.settings where key in ('acai_gratis', 'acai_extra_cents');
