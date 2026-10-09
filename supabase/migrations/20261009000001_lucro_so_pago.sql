-- Lucro só conta quando o pedido está pago. Pedido a receber (ou pago em parte) continua no faturamento,
-- mas o lucro dele fica "a receber" até a baixa do pagamento.

create or replace view public.v_vendas as
select *,
       case when status_pagamento = 'pago' then lucro_centavos else 0 end as lucro_recebido_centavos,
       case when status_pagamento = 'pago' then 0 else lucro_centavos end as lucro_a_receber_centavos
  from public.pedidos
 where status not in ('novo', 'cancelado') and not a_preco_de_custo;

create or replace view public.v_cliente_metricas as
with por_cliente as (
  select cliente_id,
         count(*) as pedidos,
         min(data_agendada) as primeiro_pedido,
         max(data_agendada) as ultimo_pedido,
         count(distinct data_agendada) as dias_com_pedido,
         sum(total_centavos) as faturado_centavos,
         sum(lucro_recebido_centavos) as lucro_centavos,
         sum(total_caixas) as caixas,
         sum(lucro_a_receber_centavos) as lucro_a_receber_centavos
    from public.v_vendas
   group by cliente_id
)
select c.id as cliente_id,
       coalesce(pc.pedidos, 0) as pedidos,
       pc.primeiro_pedido,
       pc.ultimo_pedido,
       case when pc.dias_com_pedido >= 2
            then round((pc.ultimo_pedido - pc.primeiro_pedido)::numeric / (pc.dias_com_pedido - 1), 1)
       end as frequencia_dias,
       case when pc.pedidos > 0 then round(pc.faturado_centavos::numeric / pc.pedidos)::bigint end as ticket_medio_centavos,
       coalesce(pc.faturado_centavos, 0) as faturado_centavos,
       coalesce(pc.lucro_centavos, 0) as lucro_centavos,
       coalesce(pc.caixas, 0) as caixas,
       public.hoje_sp() - pc.ultimo_pedido as dias_sem_comprar,
       case
         when pc.ultimo_pedido is null then false
         when pc.dias_com_pedido >= 3
           then (public.hoje_sp() - pc.ultimo_pedido) >
                ((pc.ultimo_pedido - pc.primeiro_pedido)::numeric / (pc.dias_com_pedido - 1)) * cfg.sumido_fator
         else (public.hoje_sp() - pc.ultimo_pedido) > cfg.sumido_dias_padrao
       end as sumido,
       coalesce(pc.lucro_a_receber_centavos, 0) as lucro_a_receber_centavos
  from public.clientes c
  cross join public.configuracoes cfg
  left join por_cliente pc on pc.cliente_id = c.id;

create or replace view public.v_resumo_diario as
select data_agendada as data,
       count(*) as pedidos,
       sum(total_caixas) as caixas,
       sum(total_centavos) as faturamento_centavos,
       sum(custo_total_centavos) as custo_centavos,
       sum(lucro_recebido_centavos) as lucro_centavos,
       sum(lucro_a_receber_centavos) as lucro_a_receber_centavos
  from public.v_vendas
 group by data_agendada;
