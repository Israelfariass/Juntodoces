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
-- Acompanhamentos: grátis (açaí: até 3; barca: até 5). Adicionais pagos: cobrados à parte.
insert into public.option_groups (id, title, min_select, max_select, free_select) values
  ('g-acomp',       'Acompanhamentos (escolha até 3, grátis)',        0, 3, 3),
  ('g-acomp-barca', 'Acompanhamentos da barca (escolha até 5, grátis)', 0, 5, 5),
  ('g-adicional',   'Adicionais pagos',                                0, 4, 0)
on conflict (id) do update set title = excluded.title, min_select = excluded.min_select,
  max_select = excluded.max_select, free_select = excluded.free_select;

insert into public.options (id, group_id, name, price_cents, sort) values
  ('o-amendoim', 'g-acomp', 'Amendoim', 0, 1),
  ('o-granola', 'g-acomp', 'Granola', 0, 2),
  ('o-confete', 'g-acomp', 'Confete', 0, 3),
  ('o-coco', 'g-acomp', 'Coco ralado', 0, 4),
  ('o-leiteempo', 'g-acomp', 'Leite em pó', 0, 5),
  ('o-docedeleite', 'g-acomp', 'Doce de leite', 0, 6),
  ('o-pacoca', 'g-acomp', 'Paçoca', 0, 7),
  ('o-cookies', 'g-acomp', 'Cookies', 0, 8),
  ('o-leitecond', 'g-acomp', 'Leite condensado', 0, 9),
  ('o-kinder', 'g-acomp', 'Creme de kinder', 0, 10),
  ('o-avela', 'g-acomp', 'Creme de avelã', 0, 11),
  ('o-cremmorango', 'g-acomp', 'Creme de morango', 0, 12),
  ('ob-amendoim', 'g-acomp-barca', 'Amendoim', 0, 1),
  ('ob-granola', 'g-acomp-barca', 'Granola', 0, 2),
  ('ob-confete', 'g-acomp-barca', 'Confete', 0, 3),
  ('ob-coco', 'g-acomp-barca', 'Coco ralado', 0, 4),
  ('ob-leiteempo', 'g-acomp-barca', 'Leite em pó', 0, 5),
  ('ob-docedeleite', 'g-acomp-barca', 'Doce de leite', 0, 6),
  ('ob-pacoca', 'g-acomp-barca', 'Paçoca', 0, 7),
  ('ob-cookies', 'g-acomp-barca', 'Cookies', 0, 8),
  ('ob-leitecond', 'g-acomp-barca', 'Leite condensado', 0, 9),
  ('ob-kinder', 'g-acomp-barca', 'Creme de kinder', 0, 10),
  ('ob-avela', 'g-acomp-barca', 'Creme de avelã', 0, 11),
  ('ob-cremmorango', 'g-acomp-barca', 'Creme de morango', 0, 12),
  ('o-ad-stikadinho', 'g-adicional', 'Stikadinho', 300, 1),
  ('o-ad-nutella', 'g-adicional', 'Nutella', 500, 2),
  ('o-ad-ovomaltine', 'g-adicional', 'Ovomaltine', 300, 3),
  ('o-ad-leitinho', 'g-adicional', 'Creme de leitinho', 300, 4)
on conflict (id) do update set group_id = excluded.group_id, name = excluded.name,
  price_cents = excluded.price_cents, sort = excluded.sort;

-- remove opções de versões anteriores do cardápio (Nutella e Creme de leitinho agora são adicionais pagos)
delete from public.options where group_id = 'g-acomp' and id not in ('o-amendoim', 'o-granola', 'o-confete', 'o-coco', 'o-leiteempo', 'o-docedeleite', 'o-pacoca', 'o-cookies', 'o-leitecond', 'o-kinder', 'o-avela', 'o-cremmorango');

-- Produtos -----------------------------------------------------------------------
insert into public.products (id, category_id, name, description, price_cents, sort) values
  ('acai-300', 'acai', 'Açaí 300 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 1800, 1),
  ('acai-400', 'acai', 'Açaí 400 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 2000, 2),
  ('acai-500', 'acai', 'Açaí 500 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 2400, 3),
  ('acai-700', 'acai', 'Açaí 700 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 3000, 4),
  ('barca-p', 'acai', 'Barca P', 'Barca de açaí com 5 acompanhamentos grátis.', 4200, 5),
  ('combo-abertura', 'acai', 'Combo Promo de Abertura', 'Dois copos de 440 ml. Diga os acompanhamentos de cada copo nas observações.', 3400, 6)
on conflict (id) do update set category_id = excluded.category_id, name = excluded.name,
  description = excluded.description, price_cents = excluded.price_cents, sort = excluded.sort;

insert into public.product_groups (product_id, group_id, sort) values
  ('acai-300', 'g-acomp', 1), ('acai-300', 'g-adicional', 2),
  ('acai-400', 'g-acomp', 1), ('acai-400', 'g-adicional', 2),
  ('acai-500', 'g-acomp', 1), ('acai-500', 'g-adicional', 2),
  ('acai-700', 'g-acomp', 1), ('acai-700', 'g-adicional', 2),
  ('barca-p', 'g-acomp-barca', 1), ('barca-p', 'g-adicional', 2)
on conflict do nothing;
