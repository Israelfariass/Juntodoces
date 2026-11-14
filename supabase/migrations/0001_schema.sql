-- Juntô Doces: esquema inicial do banco (Supabase / Postgres)
-- Regra de ouro: o site nunca grava direto nas tabelas de pedidos.
-- Tudo passa pelas Edge Functions (service role). As tabelas de pedidos ficam
-- com RLS ligado e SEM política, então o acesso público é negado.

create type public.order_status as enum ('recebido', 'preparo', 'rota', 'entregue', 'cancelado');
create type public.fulfillment  as enum ('entrega', 'retirada');
create type public.pay_method   as enum ('pix', 'cartao', 'dinheiro');
create type public.pay_status   as enum ('pendente', 'pago', 'falhou', 'reembolsado');

-- Configurações da loja ------------------------------------------------------
create table public.settings (
  key   text primary key,
  value jsonb not null
);

-- Cardápio: tamanhos e acompanhamentos do açaí + demais categorias ------------
create table public.products (
  id          text primary key,
  category    text not null check (category in
                ('acai-tamanho', 'acai-acomp', 'sobremesas', 'milkshake', 'sorvetes', 'crepes')),
  grp         text,                              -- grupo do acompanhamento (Frutas, Crocantes...)
  name        text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  active      boolean not null default true,
  sort        integer not null default 0
);

-- Pedidos ---------------------------------------------------------------------
create sequence public.order_number_seq start 101;

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  number          integer not null unique default nextval('public.order_number_seq'),
  code            text not null unique default '',
  customer_name   text not null check (char_length(customer_name) between 1 and 80),
  phone           text not null check (phone ~ '^[0-9]{10,11}$'),   -- só dígitos, com DDD
  fulfillment     public.fulfillment not null,
  address         text,
  payment_method  public.pay_method not null,
  payment_status  public.pay_status not null default 'pendente',
  cash_change_for text,
  notes           text check (char_length(notes) <= 300),
  subtotal_cents  integer not null check (subtotal_cents >= 0),
  fee_cents       integer not null default 0 check (fee_cents >= 0),
  total_cents     integer not null check (total_cents >= 0),
  status          public.order_status not null default 'recebido',
  mp_order_id     text unique,                    -- id do pedido no Mercado Pago
  pix_copy_paste  text,
  pix_qr_base64   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index orders_phone_created_idx on public.orders (phone, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);

create table public.order_items (
  id               bigint generated always as identity primary key,
  order_id         uuid not null references public.orders (id) on delete cascade,
  name             text not null,
  detail           text not null default '',
  qty              integer not null check (qty between 1 and 50),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- Histórico de etapas (para saber quando cada status aconteceu)
create table public.order_events (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  status     public.order_status not null,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- Quem pode usar o painel da loja (usuários do Supabase Auth) ---------------
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name    text not null default ''
);

-- Triggers ---------------------------------------------------------------------
create function public.set_order_code() returns trigger
language plpgsql as $$
begin
  new.code := 'JD-' || new.number::text;
  return new;
end $$;

create trigger orders_set_code before insert on public.orders
  for each row execute function public.set_order_code();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Segurança (RLS) --------------------------------------------------------------
alter table public.settings     enable row level security;
alter table public.products     enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.order_events enable row level security;
alter table public.staff        enable row level security;

-- Cardápio e algumas configurações são públicos para leitura.
create policy "cardapio publico" on public.products
  for select to anon, authenticated using (active);

create policy "config publica" on public.settings
  for select to anon, authenticated
  using (key in ('taxa_entrega_cents', 'acai_gratis', 'acai_extra_cents', 'loja_whatsapp'));

-- orders, order_items, order_events e staff: nenhuma política = ninguém lê ou
-- escreve pelo site. Só as Edge Functions (service role) acessam.
