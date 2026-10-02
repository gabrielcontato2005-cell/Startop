-- Loja própria (a Startop da família): pedidos a preço de custo, fora do faturamento e do lucro.
-- Só o dono marca o cliente; o pedido guarda a marca na hora em que é gravado.

alter table public.clientes add column loja_propria boolean not null default false;
alter table public.pedidos add column a_preco_de_custo boolean not null default false;

-- a marca do pedido acompanha o cliente quando o pedido é criado ou regravado (salvar_pedido sempre
-- regrava o subtotal); mudar só o status não mexe, então pedidos antigos não mudam de lado
create or replace function public.marcar_pedido_a_preco_de_custo() returns trigger
language plpgsql set search_path = public as $$
begin
  select c.loja_propria into new.a_preco_de_custo from public.clientes c where c.id = new.cliente_id;
  new.a_preco_de_custo := coalesce(new.a_preco_de_custo, false);
  return new;
end $$;

create trigger pedidos_a_preco_de_custo
  before insert or update of cliente_id, subtotal_centavos on public.pedidos
  for each row execute function public.marcar_pedido_a_preco_de_custo();

-- vendas = o que entra no faturamento e no lucro; a coluna nova vai no fim, como pede o "or replace"
create or replace view public.v_vendas as
select * from public.pedidos where status not in ('novo', 'cancelado') and not a_preco_de_custo;

revoke all on function public.marcar_pedido_a_preco_de_custo() from public, anon, authenticated;
grant execute on function public.marcar_pedido_a_preco_de_custo() to service_role;
