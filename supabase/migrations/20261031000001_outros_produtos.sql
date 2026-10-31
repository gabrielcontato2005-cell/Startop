-- Outros produtos além das caixas de açaí e sorvete (leite em pó, colheres...): categoria "outros", sem tamanho em
-- litros. A embalagem vai no próprio nome ("Colher longa (100 un)"). Não contam como caixa no pedido mínimo.

alter table public.linhas drop constraint linhas_categoria_check;
alter table public.linhas add constraint linhas_categoria_check check (categoria in ('acai', 'sorvete', 'outros'));

alter table public.produtos alter column tamanho_litros drop not null;

-- nome para mostrar: "Banana 10 L", ou só o nome quando não tem tamanho
create or replace view public.v_produtos as
select p.id, p.sabor_id, s.nome as sabor, l.id as linha_id, l.nome as linha, l.categoria, l.ordem as linha_ordem,
       p.tamanho_litros, p.preco_centavos, p.custo_medio_centavos, p.custo_adicional_centavos,
       p.custo_medio_centavos + p.custo_adicional_centavos as custo_unitario_centavos,
       p.preco_centavos - (p.custo_medio_centavos + p.custo_adicional_centavos) as margem_centavos,
       case when p.preco_centavos > 0
            then round(100.0 * (p.preco_centavos - p.custo_medio_centavos - p.custo_adicional_centavos) / p.preco_centavos, 1)
       end as margem_pct,
       p.estoque_minimo, p.ativo and s.ativo and l.ativo as ativo,
       p.preco_consumidor_centavos,
       s.nome || coalesce(' ' || p.tamanho_litros || ' L', '') as nome
  from public.produtos p
  join public.sabores s on s.id = p.sabor_id
  join public.linhas l on l.id = s.linha_id;

create or replace function public._nome_produto(p_produto uuid) returns text
language sql stable as $$
  select s.nome || coalesce(' ' || p.tamanho_litros || ' L', '')
    from public.produtos p join public.sabores s on s.id = p.sabor_id
   where p.id = p_produto
$$;

-- Pedido do gabriel em 2026-10-31. Leite em pó: preço por unidade e fardo de 10 (custo entra no "Chegou mercadoria").
-- Colheres: pacote de 100 = a parte da caixa (custo) + R$ 5.
--   super longa: caixa 500 un R$ 83,95 -> 100 un R$ 16,79 + 5 = R$ 21,79
--   longa:       caixa 500 un R$ 64,95 -> 100 un R$ 12,99 + 5 = R$ 17,99
--   sobremesa:   caixa 1000 un R$ 74,95 -> 100 un R$ 7,50 + 5 = R$ 12,50
insert into public.linhas (nome, categoria, ordem) values
  ('Leite em pó', 'outros', 6),
  ('Colheres', 'outros', 7)
on conflict (nome) do nothing;

insert into public.sabores (linha_id, nome)
select l.id, v.nome
  from (values
    ('Leite em pó', 'Leite em pó Leitino'),
    ('Leite em pó', 'Leite em pó Leitino fardo 10 un'),
    ('Colheres', 'Colher sobremesa (100 un)'),
    ('Colheres', 'Colher longa (100 un)'),
    ('Colheres', 'Colher super longa (100 un)')
  ) as v(linha, nome)
  join public.linhas l on l.nome = v.linha
on conflict (linha_id, nome) do nothing;

insert into public.produtos (sabor_id, tamanho_litros, preco_centavos, custo_medio_centavos)
select s.id, null, v.preco, v.custo
  from (values
    ('Leite em pó Leitino', 2250, 0),
    ('Leite em pó Leitino fardo 10 un', 22500, 0),
    ('Colher sobremesa (100 un)', 1250, 750),
    ('Colher longa (100 un)', 1799, 1299),
    ('Colher super longa (100 un)', 2179, 1679)
  ) as v(nome, preco, custo)
  join public.sabores s on s.nome = v.nome
  join public.linhas l on l.id = s.linha_id and l.categoria = 'outros'
 where not exists (select 1 from public.produtos p where p.sabor_id = s.id);
