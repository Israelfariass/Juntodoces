-- Cardápio inicial (depois da migração 0002). Preços e textos são exemplos: ajuste antes de abrir.
-- Pode rodar de novo com segurança (upsert). Depois de aberto, edite pelo gestor (admin.html).

-- Loja ---------------------------------------------------------------------------
-- loja_modo: "auto" segue os horários; "aberta" e "fechada" forçam o status.
-- horarios: dia da semana (0 = domingo ... 6 = sábado) -> [abre, fecha] ou null (fechado).
insert into public.settings (key, value) values
  ('loja_nome',           '"Juntô Doces"'),
  ('loja_whatsapp',       '"5551998828977"'),
  ('loja_modo',           '"aberta"'),
  ('horarios',            '{"0":["14:00","23:00"],"1":["14:00","23:00"],"2":["14:00","23:00"],"3":["14:00","23:00"],"4":["14:00","23:00"],"5":["14:00","23:30"],"6":["14:00","23:30"]}'),
  ('taxa_entrega_cents',  '500'),
  ('pedido_minimo_cents', '1500'),
  ('tempo_min',           '30'),
  ('tempo_max',           '45')
on conflict (key) do update set value = excluded.value;

-- Categorias ---------------------------------------------------------------------
-- Só açaí por enquanto. Outras categorias e produtos o dono cria pelo gestor (aba Cardápio).
insert into public.categories (id, name, sort) values
  ('acai', 'Açaí', 1)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- Grupos de complementos ---------------------------------------------------------
-- Cardápio oficial: 3 acompanhamentos livres; adicionais R$ 3,00 cada.
insert into public.option_groups (id, title, min_select, max_select, free_select) values
  ('g-acomp', 'Acompanhamentos (3 livres, adicionais R$ 3,00 cada)', 0, 12, 3)
on conflict (id) do update set title = excluded.title, min_select = excluded.min_select,
  max_select = excluded.max_select, free_select = excluded.free_select;

insert into public.options (id, group_id, name, price_cents, sort) values
  ('o-nutella',   'g-acomp', 'Nutella',           300, 1),
  ('o-avela',     'g-acomp', 'Creme de avelã',    300, 2),
  ('o-kinder',    'g-acomp', 'Creme de kinder',   300, 3),
  ('o-leitinho',  'g-acomp', 'Creme de leitinho', 300, 4),
  ('o-leiteempo', 'g-acomp', 'Leite em pó',       300, 5),
  ('o-pacoca',    'g-acomp', 'Paçoca',            300, 6),
  ('o-docedeleite','g-acomp','Doce de leite',     300, 7),
  ('o-leitecond', 'g-acomp', 'Leite condensado',  300, 8),
  ('o-confete',   'g-acomp', 'Confete',           300, 9),
  ('o-banana',    'g-acomp', 'Banana',            300, 10),
  ('o-coco',      'g-acomp', 'Coco ralado',       300, 11),
  ('o-morango',   'g-acomp', 'Morango',           300, 12)
on conflict (id) do update set group_id = excluded.group_id, name = excluded.name,
  price_cents = excluded.price_cents, sort = excluded.sort;

-- Produtos -----------------------------------------------------------------------
insert into public.products (id, category_id, name, description, price_cents, sort) values
  ('acai-300', 'acai', 'Açaí 300 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 1800, 1),
  ('acai-400', 'acai', 'Açaí 400 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 2000, 2),
  ('acai-500', 'acai', 'Açaí 500 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 2400, 3),
  ('acai-700', 'acai', 'Açaí 700 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 3000, 4),
  ('combo-abertura', 'acai', 'Combo Promo de Abertura', 'Dois copos de 440 ml. Diga os acompanhamentos de cada copo nas observações.', 3400, 5)
on conflict (id) do update set category_id = excluded.category_id, name = excluded.name,
  description = excluded.description, price_cents = excluded.price_cents, sort = excluded.sort;

insert into public.product_groups (product_id, group_id, sort) values
  ('acai-300', 'g-acomp', 1), ('acai-400', 'g-acomp', 1), ('acai-500', 'g-acomp', 1), ('acai-700', 'g-acomp', 1)
on conflict do nothing;
