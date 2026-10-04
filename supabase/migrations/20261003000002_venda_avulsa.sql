-- Venda avulsa: venda no balcão para consumidor final, sem cadastro.
-- Todas as vendas avulsas ficam num cliente especial, escondido da lista de clientes; o nome e o
-- WhatsApp de quem comprou (opcionais) ficam no próprio pedido. Entram no faturamento e no lucro.

alter table public.clientes add column consumidor_final boolean not null default false;
create unique index clientes_um_consumidor_final on public.clientes (consumidor_final) where consumidor_final;
insert into public.clientes (nome_loja, consumidor_final, observacoes)
values ('Venda avulsa (consumidor)', true, 'Cliente das vendas avulsas, sem cadastro. Não apagar.');

-- preço para o consumidor final; vazio = o mesmo preço de venda da caixa
alter table public.produtos add column preco_consumidor_centavos bigint
  check (preco_consumidor_centavos is null or preco_consumidor_centavos >= 0);

alter table public.pedidos add column comprador_nome text, add column comprador_telefone text;

create or replace view public.v_produtos as
select p.id, p.sabor_id, s.nome as sabor, l.id as linha_id, l.nome as linha, l.categoria, l.ordem as linha_ordem,
       p.tamanho_litros, p.preco_centavos, p.custo_medio_centavos, p.custo_adicional_centavos,
       p.custo_medio_centavos + p.custo_adicional_centavos as custo_unitario_centavos,
       p.preco_centavos - (p.custo_medio_centavos + p.custo_adicional_centavos) as margem_centavos,
       case when p.preco_centavos > 0
            then round(100.0 * (p.preco_centavos - p.custo_medio_centavos - p.custo_adicional_centavos) / p.preco_centavos, 1)
       end as margem_pct,
       p.estoque_minimo, p.ativo and s.ativo and l.ativo as ativo,
       p.preco_consumidor_centavos
  from public.produtos p
  join public.sabores s on s.id = p.sabor_id
  join public.linhas l on l.id = s.linha_id;

-- refeita só para levar as colunas novas do pedido
create or replace view public.v_vendas as
select * from public.pedidos where status not in ('novo', 'cancelado') and not a_preco_de_custo;
