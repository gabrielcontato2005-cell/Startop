-- ATENÇÃO: apaga clientes, pedidos, pagamentos, lotes, movimentações e o histórico de auditoria,
-- e zera o estoque. Mantém usuários, produtos, preços, descontos e configurações.
-- Use para tirar os dados de exemplo antes de começar a usar de verdade.

begin;
truncate public.pagamentos, public.itens_pedido, public.pedidos, public.movimentacoes_estoque,
         public.itens_lote, public.lotes_entrada, public.clientes, public.importacoes, public.auditoria cascade;
update public.estoque set fisico = 0, reservado = 0, atualizado_em = now();
alter sequence public.pedidos_numero_seq restart with 1001;
commit;
