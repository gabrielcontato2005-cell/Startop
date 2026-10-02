-- StarTop Pedidos: estrutura inicial do banco (MVP).
--
-- Regras de acesso: todas as tabelas têm RLS ligado e nenhuma política, e os papéis
-- anon/authenticated não têm permissão nenhuma. Só o servidor do app (chave service_role)
-- lê e grava, depois de conferir o perfil do usuário logado. Assim o custo e o lucro
-- nunca chegam ao celular de quem não é dono.
--
-- Estoque e pedidos só mudam pelas funções deste arquivo, que travam as linhas de estoque
-- (select ... for update) e registram cada movimento no livro-razão movimentacoes_estoque.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create or replace function public.hoje_sp() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public._definir_usuario(p_usuario uuid) returns void
language sql as $$ select set_config('app.usuario_id', coalesce(p_usuario::text, ''), true) $$;

-- ---------------------------------------------------------------------------
-- Usuários e configurações
-- ---------------------------------------------------------------------------

create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text,
  perfil text not null default 'atendente' check (perfil in ('dono', 'atendente', 'entregador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- O primeiro usuário criado no Supabase vira dono. Os demais entram sem acesso: quem libera é a
-- tela de Usuários (que define perfil e ativo pelo servidor). Assim um cadastro feito direto na API
-- pública do Supabase não ganha acesso nem escolhe o próprio perfil pelos metadados.
create or replace function public.criar_usuario_do_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- trava para dois cadastros simultâneos não virarem dono os dois
  lock table public.usuarios in share row exclusive mode;
  insert into public.usuarios (id, nome, email, perfil, ativo)
  select new.id,
         coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(coalesce(new.email, 'usuário'), '@', 1)),
         new.email,
         case when primeiro then 'dono' else 'atendente' end,
         primeiro
    from (select not exists (select 1 from public.usuarios) as primeiro) x
  on conflict (id) do nothing;
  return new;
end $$;

create trigger auth_usuario_criado
  after insert on auth.users
  for each row execute function public.criar_usuario_do_auth();

create or replace function public._perfil(p_usuario uuid) returns text
language sql stable as $$ select perfil from public.usuarios where id = p_usuario and ativo $$;

create table public.configuracoes (
  id int primary key default 1 check (id = 1),
  fabrica_nome text not null default 'StarTop CostaV',
  fabrica_endereco text not null default 'Praça da Amendoeira, Itaguaí - RJ',
  fabrica_cep text,
  fabrica_lat numeric(9, 6),
  fabrica_lng numeric(9, 6),
  fabrica_whatsapp text,
  km_por_caixa numeric(6, 2) not null default 5 check (km_por_caixa > 0),
  pedido_minimo_piso int not null default 1 check (pedido_minimo_piso >= 0),
  raio_max_km numeric(7, 2) check (raio_max_km is null or raio_max_km > 0),
  taxa_entrega_modo text not null default 'por_km' check (taxa_entrega_modo in ('por_km', 'por_faixa')),
  taxa_entrega_por_km_centavos bigint not null default 0 check (taxa_entrega_por_km_centavos >= 0),
  -- [{"ate_km": 10, "valor_centavos": 1000}, ...] em ordem crescente de ate_km
  taxa_entrega_faixas jsonb not null default '[]'::jsonb,
  cartao_acrescimo_pct numeric(5, 2) not null default 10 check (cartao_acrescimo_pct >= 0),
  horario_abertura time not null default '08:00',
  horario_fechamento time not null default '17:00',
  sumido_fator numeric(4, 2) not null default 1.5 check (sumido_fator > 0),
  sumido_dias_padrao int not null default 15 check (sumido_dias_padrao > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios (id),
  check (horario_abertura < horario_fechamento)
);

insert into public.configuracoes (id) values (1);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.linhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  categoria text not null check (categoria in ('acai', 'sorvete')),
  ordem int not null default 0,
  ativo boolean not null default true
);

create table public.sabores (
  id uuid primary key default gen_random_uuid(),
  linha_id uuid not null references public.linhas (id),
  nome text not null,
  ativo boolean not null default true,
  unique (linha_id, nome)
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  sabor_id uuid not null references public.sabores (id),
  tamanho_litros int not null check (tamanho_litros in (5, 10)),
  preco_centavos bigint not null check (preco_centavos >= 0),
  -- custo da fábrica, média ponderada das entradas de lote
  custo_medio_centavos bigint not null default 0 check (custo_medio_centavos >= 0),
  -- embalagem e outros custos por caixa
  custo_adicional_centavos bigint not null default 0 check (custo_adicional_centavos >= 0),
  estoque_minimo int not null default 0 check (estoque_minimo >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios (id),
  unique (sabor_id, tamanho_litros)
);

create trigger produtos_atualizado_em before update on public.produtos
  for each row execute function public.tocar_atualizado_em();

create table public.precos_historico (
  id bigint generated always as identity primary key,
  produto_id uuid not null references public.produtos (id) on delete cascade,
  preco_centavos bigint not null,
  custo_medio_centavos bigint not null,
  custo_adicional_centavos bigint not null,
  vigente_desde timestamptz not null default now(),
  alterado_por uuid references public.usuarios (id)
);

create or replace function public.registrar_preco_historico() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.preco_centavos is distinct from old.preco_centavos
     or new.custo_adicional_centavos is distinct from old.custo_adicional_centavos
     or new.custo_medio_centavos is distinct from old.custo_medio_centavos then
    insert into public.precos_historico (produto_id, preco_centavos, custo_medio_centavos, custo_adicional_centavos, alterado_por)
    values (new.id, new.preco_centavos, new.custo_medio_centavos, new.custo_adicional_centavos,
            coalesce(nullif(current_setting('app.usuario_id', true), '')::uuid, new.atualizado_por));
  end if;
  return new;
end $$;

create trigger produtos_preco_historico after insert or update on public.produtos
  for each row execute function public.registrar_preco_historico();

create table public.regras_desconto (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  linha_ids uuid[] not null,
  tamanho_litros int check (tamanho_litros in (5, 10)),
  qtd_minima int not null check (qtd_minima > 0),
  tipo text not null default 'valor_por_caixa' check (tipo in ('valor_por_caixa', 'percentual')),
  -- valor_por_caixa: centavos por caixa; percentual: % (ex.: 5 = 5%)
  valor numeric(12, 2) not null check (valor >= 0),
  aplica_em text not null default 'todas' check (aplica_em in ('todas', 'so_excedente')),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios (id)
);

create trigger regras_desconto_atualizado_em before update on public.regras_desconto
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome_loja text not null,
  responsavel text,
  -- só dígitos, com DDI: 5521999998888
  whatsapp text unique,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  distancia_km numeric(7, 2) check (distancia_km is null or distancia_km >= 0),
  distancia_origem text not null default 'manual' check (distancia_origem in ('manual', 'calculada')),
  distancia_calculada_em timestamptz,
  pedido_minimo_manual int check (pedido_minimo_manual is null or pedido_minimo_manual >= 0),
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id),
  atualizado_por uuid references public.usuarios (id)
);

create index clientes_nome_idx on public.clientes (lower(nome_loja));

create trigger clientes_atualizado_em before update on public.clientes
  for each row execute function public.tocar_atualizado_em();

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('csv', 'vcf', 'texto')),
  total int not null default 0,
  importados int not null default 0,
  duplicados int not null default 0,
  erros jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id)
);

-- ---------------------------------------------------------------------------
-- Estoque
-- ---------------------------------------------------------------------------

create table public.estoque (
  produto_id uuid primary key references public.produtos (id) on delete cascade,
  -- físico pode ficar negativo se o dono forçar venda sem estoque: sinal de que falta contagem
  fisico int not null default 0,
  reservado int not null default 0 check (reservado >= 0),
  atualizado_em timestamptz not null default now()
);

create or replace function public.criar_estoque_do_produto() returns trigger
language plpgsql as $$
begin
  insert into public.estoque (produto_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger produtos_cria_estoque after insert on public.produtos
  for each row execute function public.criar_estoque_do_produto();

create table public.lotes_entrada (
  id uuid primary key default gen_random_uuid(),
  data date not null default public.hoje_sp(),
  numero_nota text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id)
);

create table public.itens_lote (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_entrada (id) on delete cascade,
  produto_id uuid not null references public.produtos (id),
  quantidade int not null check (quantidade > 0),
  custo_unitario_centavos bigint not null check (custo_unitario_centavos >= 0)
);

-- ---------------------------------------------------------------------------
-- Pedidos e pagamentos
-- ---------------------------------------------------------------------------

create sequence public.pedidos_numero_seq start 1001;

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.pedidos_numero_seq'),
  cliente_id uuid not null references public.clientes (id),
  tipo text not null check (tipo in ('entrega', 'retirada')),
  data_agendada date not null default public.hoje_sp(),
  hora_agendada time,
  status text not null default 'novo' check (status in (
    'novo', 'confirmado', 'separado', 'saiu_para_entrega', 'aguardando_retirada', 'entregue', 'cancelado')),
  subtotal_centavos bigint not null default 0 check (subtotal_centavos >= 0),
  desconto_centavos bigint not null default 0 check (desconto_centavos >= 0),
  taxa_entrega_sugerida_centavos bigint not null default 0 check (taxa_entrega_sugerida_centavos >= 0),
  taxa_entrega_centavos bigint not null default 0 check (taxa_entrega_centavos >= 0),
  acrescimo_cartao_centavos bigint not null default 0 check (acrescimo_cartao_centavos >= 0),
  total_centavos bigint not null default 0 check (total_centavos >= 0),
  -- soma do custo congelado dos itens (preenchido ao confirmar)
  custo_total_centavos bigint not null default 0,
  lucro_centavos bigint generated always as (total_centavos - custo_total_centavos) stored,
  total_caixas int not null default 0,
  distancia_km_usada numeric(7, 2),
  pedido_minimo_usado int,
  liberado_abaixo_minimo_por uuid references public.usuarios (id),
  forma_pagamento text not null check (forma_pagamento in ('pix', 'dinheiro', 'cartao_credito')),
  status_pagamento text not null default 'a_receber' check (status_pagamento in ('pago', 'a_receber', 'parcial')),
  pago_centavos bigint not null default 0,
  vencimento date,
  entregador_id uuid references public.usuarios (id),
  observacoes text,
  confirmado_em timestamptz,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id),
  atualizado_por uuid references public.usuarios (id)
);

create index pedidos_cliente_idx on public.pedidos (cliente_id, data_agendada desc);
create index pedidos_data_idx on public.pedidos (data_agendada, status);

create trigger pedidos_atualizado_em before update on public.pedidos
  for each row execute function public.tocar_atualizado_em();

create table public.itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  produto_id uuid not null references public.produtos (id),
  quantidade int not null check (quantidade > 0),
  preco_unitario_centavos bigint not null check (preco_unitario_centavos >= 0),
  -- desconto total da linha (não por caixa: um desconto só no excedente pode não dividir certo)
  desconto_centavos bigint not null default 0 check (desconto_centavos >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  -- congelado na confirmação: mudar o custo depois não muda o lucro passado
  custo_unitario_centavos bigint,
  custo_total_centavos bigint generated always as (custo_unitario_centavos * quantidade) stored,
  unique (pedido_id, produto_id)
);

create index itens_pedido_produto_idx on public.itens_pedido (produto_id);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  valor_centavos bigint not null check (valor_centavos > 0),
  forma text not null check (forma in ('pix', 'dinheiro', 'cartao_credito')),
  recebido_em timestamptz not null default now(),
  recebido_por uuid references public.usuarios (id),
  observacao text
);

create or replace function public.atualizar_status_pagamento() returns trigger
language plpgsql as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
  v_pago bigint;
begin
  select coalesce(sum(valor_centavos), 0) into v_pago from public.pagamentos where pedido_id = v_pedido;
  update public.pedidos p
     set pago_centavos = v_pago,
         status_pagamento = case
           when v_pago = 0 then 'a_receber'
           when v_pago >= p.total_centavos then 'pago'
           else 'parcial' end
   where p.id = v_pedido;
  return null;
end $$;

create trigger pagamentos_status after insert or update or delete on public.pagamentos
  for each row execute function public.atualizar_status_pagamento();

-- Se o total do pedido muda depois de um pagamento, o status de pagamento acompanha.
create or replace function public.recalcular_status_pagamento_do_pedido() returns trigger
language plpgsql as $$
begin
  if new.total_centavos is distinct from old.total_centavos then
    new.status_pagamento := case
      when new.pago_centavos = 0 then 'a_receber'
      when new.pago_centavos >= new.total_centavos then 'pago'
      else 'parcial' end;
  end if;
  return new;
end $$;

create trigger pedidos_status_pagamento before update on public.pedidos
  for each row execute function public.recalcular_status_pagamento_do_pedido();

-- ---------------------------------------------------------------------------
-- Livro-razão do estoque e auditoria
-- ---------------------------------------------------------------------------

create table public.movimentacoes_estoque (
  id bigint generated always as identity primary key,
  produto_id uuid not null references public.produtos (id),
  tipo text not null check (tipo in (
    'entrada_lote', 'reserva', 'liberacao_reserva', 'saida_pedido', 'devolucao', 'ajuste', 'perda')),
  delta_fisico int not null default 0,
  delta_reservado int not null default 0,
  pedido_id uuid references public.pedidos (id),
  lote_id uuid references public.lotes_entrada (id),
  motivo text,
  usuario_id uuid references public.usuarios (id),
  criado_em timestamptz not null default now()
);

create index movimentacoes_produto_idx on public.movimentacoes_estoque (produto_id, criado_em desc);
create index movimentacoes_pedido_idx on public.movimentacoes_estoque (pedido_id);

create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text not null,
  acao text not null,
  antes jsonb,
  depois jsonb,
  usuario_id uuid,
  em timestamptz not null default now()
);

create index auditoria_registro_idx on public.auditoria (tabela, registro_id, em desc);

create or replace function public.auditar() returns trigger
language plpgsql as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_usuario uuid := coalesce(
    nullif(current_setting('app.usuario_id', true), '')::uuid,
    (coalesce(v_depois, v_antes) ->> 'atualizado_por')::uuid,
    auth.uid());
begin
  if tg_op = 'UPDATE' and (v_antes - 'atualizado_em') = (v_depois - 'atualizado_em') then
    return null;
  end if;
  insert into public.auditoria (tabela, registro_id, acao, antes, depois, usuario_id)
  values (tg_table_name, coalesce(v_depois, v_antes) ->> 'id', lower(tg_op), v_antes, v_depois, v_usuario);
  return null;
end $$;

create trigger auditar_pedidos after insert or update or delete on public.pedidos
  for each row execute function public.auditar();
create trigger auditar_itens_pedido after insert or update or delete on public.itens_pedido
  for each row execute function public.auditar();
create trigger auditar_pagamentos after insert or update or delete on public.pagamentos
  for each row execute function public.auditar();
create trigger auditar_produtos after insert or update or delete on public.produtos
  for each row execute function public.auditar();
create trigger auditar_regras_desconto after insert or update or delete on public.regras_desconto
  for each row execute function public.auditar();
create trigger auditar_clientes after update or delete on public.clientes
  for each row execute function public.auditar();
create trigger auditar_configuracoes after update on public.configuracoes
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------------
-- Funções de estoque
-- ---------------------------------------------------------------------------

-- Descrição curta do produto para mensagens de erro ("Banana 10 L").
create or replace function public._nome_produto(p_produto uuid) returns text
language sql stable as $$
  select s.nome || ' ' || p.tamanho_litros || ' L'
    from public.produtos p join public.sabores s on s.id = p.sabor_id
   where p.id = p_produto
$$;

-- Entrada de lote: soma ao físico e recalcula o custo médio ponderado.
-- p_itens: [{"produto_id": "...", "quantidade": 10, "custo_unitario_centavos": 8300}]
-- custo_unitario_centavos ausente = mantém o custo atual do produto.
create or replace function public.registrar_lote(
  p_data date, p_numero_nota text, p_observacao text, p_itens jsonb, p_usuario uuid
) returns uuid
language plpgsql as $$
declare
  v_lote uuid;
  v_item record;
  v_fisico int;
  v_custo_atual bigint;
  v_custo_lote bigint;
begin
  perform public._definir_usuario(p_usuario);
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item no lote';
  end if;

  insert into public.lotes_entrada (data, numero_nota, observacao, criado_por)
  values (coalesce(p_data, public.hoje_sp()), nullif(p_numero_nota, ''), nullif(p_observacao, ''), p_usuario)
  returning id into v_lote;

  for v_item in
    select (x ->> 'produto_id')::uuid as produto_id,
           sum((x ->> 'quantidade')::int) as quantidade,
           max((x ->> 'custo_unitario_centavos')::bigint) as custo
      from jsonb_array_elements(p_itens) x
     group by 1
     order by 1
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'Quantidade inválida para %', public._nome_produto(v_item.produto_id);
    end if;

    select e.fisico, p.custo_medio_centavos into v_fisico, v_custo_atual
      from public.estoque e join public.produtos p on p.id = e.produto_id
     where e.produto_id = v_item.produto_id
       for update of e, p;
    if not found then
      raise exception 'Produto não encontrado';
    end if;

    v_custo_lote := coalesce(v_item.custo, v_custo_atual);

    insert into public.itens_lote (lote_id, produto_id, quantidade, custo_unitario_centavos)
    values (v_lote, v_item.produto_id, v_item.quantidade, v_custo_lote);

    update public.produtos
       set custo_medio_centavos = case
             when v_fisico <= 0 then v_custo_lote
             else round((v_fisico::numeric * v_custo_atual + v_item.quantidade::numeric * v_custo_lote)
                        / (v_fisico + v_item.quantidade))::bigint
           end,
           atualizado_por = p_usuario
     where id = v_item.produto_id;

    update public.estoque set fisico = fisico + v_item.quantidade, atualizado_em = now()
     where produto_id = v_item.produto_id;

    insert into public.movimentacoes_estoque (produto_id, tipo, delta_fisico, lote_id, motivo, usuario_id)
    values (v_item.produto_id, 'entrada_lote', v_item.quantidade, v_lote, nullif(p_numero_nota, ''), p_usuario);
  end loop;

  return v_lote;
end $$;

-- Ajuste manual (+/-) ou perda/avaria (sempre tira do físico).
create or replace function public.ajustar_estoque(
  p_produto uuid, p_delta int, p_tipo text, p_motivo text, p_usuario uuid
) returns void
language plpgsql as $$
begin
  perform public._definir_usuario(p_usuario);
  if p_tipo not in ('ajuste', 'perda') then
    raise exception 'Tipo de ajuste inválido';
  end if;
  if p_delta = 0 or (p_tipo = 'perda' and p_delta > 0) then
    raise exception 'Quantidade inválida';
  end if;
  perform 1 from public.estoque where produto_id = p_produto for update;
  if not found then
    raise exception 'Produto não encontrado';
  end if;
  update public.estoque set fisico = fisico + p_delta, atualizado_em = now() where produto_id = p_produto;
  insert into public.movimentacoes_estoque (produto_id, tipo, delta_fisico, motivo, usuario_id)
  values (p_produto, p_tipo, p_delta, nullif(p_motivo, ''), p_usuario);
end $$;

-- Contagem física: recebe quanto existe de cada produto e ajusta a diferença.
-- p_itens: [{"produto_id": "...", "quantidade": 37}]. Devolve quantos produtos mudaram.
create or replace function public.contar_estoque(p_itens jsonb, p_usuario uuid) returns int
language plpgsql as $$
declare
  v_item record;
  v_fisico int;
  v_mudou int := 0;
begin
  perform public._definir_usuario(p_usuario);
  for v_item in
    select (x ->> 'produto_id')::uuid as produto_id, (x ->> 'quantidade')::int as quantidade
      from jsonb_array_elements(p_itens) x
     order by 1
  loop
    if v_item.quantidade is null or v_item.quantidade < 0 then
      raise exception 'Quantidade inválida para %', public._nome_produto(v_item.produto_id);
    end if;
    select fisico into v_fisico from public.estoque where produto_id = v_item.produto_id for update;
    if not found then
      raise exception 'Produto não encontrado';
    end if;
    if v_item.quantidade <> v_fisico then
      update public.estoque set fisico = v_item.quantidade, atualizado_em = now()
       where produto_id = v_item.produto_id;
      insert into public.movimentacoes_estoque (produto_id, tipo, delta_fisico, motivo, usuario_id)
      values (v_item.produto_id, 'ajuste', v_item.quantidade - v_fisico, 'Contagem', p_usuario);
      v_mudou := v_mudou + 1;
    end if;
  end loop;
  return v_mudou;
end $$;

-- Reserva (delta > 0) ou libera (delta < 0) caixas de um produto para um pedido.
-- Sem p_forcar, não deixa reservar além do disponível.
create or replace function public._reservar(
  p_pedido uuid, p_produto uuid, p_delta int, p_forcar boolean, p_usuario uuid
) returns void
language plpgsql as $$
declare
  v_disponivel int;
begin
  if p_delta = 0 then
    return;
  end if;
  select fisico - reservado into v_disponivel from public.estoque where produto_id = p_produto for update;
  if p_delta > 0 and not coalesce(p_forcar, false) and v_disponivel < p_delta then
    raise exception 'ESTOQUE_INSUFICIENTE: % (disponível %, pedido %)',
      public._nome_produto(p_produto), greatest(v_disponivel, 0), p_delta
      using errcode = 'P0001';
  end if;
  update public.estoque set reservado = reservado + p_delta, atualizado_em = now() where produto_id = p_produto;
  insert into public.movimentacoes_estoque (produto_id, tipo, delta_reservado, pedido_id, usuario_id, motivo)
  values (p_produto, case when p_delta > 0 then 'reserva' else 'liberacao_reserva' end, p_delta, p_pedido, p_usuario,
          case when p_delta > 0 and coalesce(p_forcar, false) and v_disponivel < p_delta then 'Forçado pelo dono' end);
end $$;

-- Congela o custo atual nos itens que ainda não têm custo e soma o custo no pedido.
create or replace function public._congelar_custo(p_pedido uuid) returns void
language plpgsql as $$
begin
  update public.itens_pedido i
     set custo_unitario_centavos = p.custo_medio_centavos + p.custo_adicional_centavos
    from public.produtos p
   where p.id = i.produto_id and i.pedido_id = p_pedido and i.custo_unitario_centavos is null;
  update public.pedidos
     set custo_total_centavos = (select coalesce(sum(custo_total_centavos), 0) from public.itens_pedido where pedido_id = p_pedido)
   where id = p_pedido;
end $$;

-- Cria ou edita um pedido. Os valores (preço, desconto, taxa, total) chegam já calculados
-- pelo servidor do app (lib/regras/pedido.ts); aqui ficam a gravação e o estoque.
-- Pedido confirmado editado: reserva só a diferença de cada produto.
create or replace function public.salvar_pedido(
  p_id uuid, p_pedido jsonb, p_itens jsonb, p_confirmar boolean, p_forcar boolean, p_usuario uuid
) returns uuid
language plpgsql as $$
declare
  v_id uuid := p_id;
  v_status text;
  v_reservando boolean;
  v_antigos jsonb := '{}'::jsonb;
  v_custos jsonb := '{}'::jsonb;
  v_prod record;
begin
  perform public._definir_usuario(p_usuario);
  if coalesce(p_forcar, false) and public._perfil(p_usuario) is distinct from 'dono' then
    raise exception 'Só o dono pode forçar venda sem estoque';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido precisa de pelo menos um item';
  end if;

  if v_id is null then
    insert into public.pedidos (cliente_id, tipo, forma_pagamento, criado_por, atualizado_por)
    values ((p_pedido ->> 'cliente_id')::uuid, p_pedido ->> 'tipo', p_pedido ->> 'forma_pagamento', p_usuario, p_usuario)
    returning id, status into v_id, v_status;
  else
    select status into v_status from public.pedidos where id = v_id for update;
    if not found then
      raise exception 'Pedido não encontrado';
    end if;
    if v_status not in ('novo', 'confirmado', 'separado') then
      raise exception 'Pedido % não pode mais ser editado', v_status;
    end if;
    select coalesce(jsonb_object_agg(produto_id, quantidade), '{}'::jsonb),
           coalesce(jsonb_object_agg(produto_id, custo_unitario_centavos) filter (where custo_unitario_centavos is not null), '{}'::jsonb)
      into v_antigos, v_custos
      from public.itens_pedido where pedido_id = v_id;
    delete from public.itens_pedido where pedido_id = v_id;
  end if;

  v_reservando := v_status in ('confirmado', 'separado');

  insert into public.itens_pedido (pedido_id, produto_id, quantidade, preco_unitario_centavos, desconto_centavos, total_centavos, custo_unitario_centavos)
  select v_id,
         (x ->> 'produto_id')::uuid,
         (x ->> 'quantidade')::int,
         (x ->> 'preco_unitario_centavos')::bigint,
         coalesce((x ->> 'desconto_centavos')::bigint, 0),
         (x ->> 'total_centavos')::bigint,
         (v_custos ->> (x ->> 'produto_id'))::bigint
    from jsonb_array_elements(p_itens) x;

  update public.pedidos set
    cliente_id = (p_pedido ->> 'cliente_id')::uuid,
    tipo = p_pedido ->> 'tipo',
    data_agendada = coalesce((p_pedido ->> 'data_agendada')::date, public.hoje_sp()),
    hora_agendada = (p_pedido ->> 'hora_agendada')::time,
    subtotal_centavos = (p_pedido ->> 'subtotal_centavos')::bigint,
    desconto_centavos = (p_pedido ->> 'desconto_centavos')::bigint,
    taxa_entrega_sugerida_centavos = (p_pedido ->> 'taxa_entrega_sugerida_centavos')::bigint,
    taxa_entrega_centavos = (p_pedido ->> 'taxa_entrega_centavos')::bigint,
    acrescimo_cartao_centavos = (p_pedido ->> 'acrescimo_cartao_centavos')::bigint,
    total_centavos = (p_pedido ->> 'total_centavos')::bigint,
    total_caixas = (p_pedido ->> 'total_caixas')::int,
    distancia_km_usada = (p_pedido ->> 'distancia_km_usada')::numeric,
    pedido_minimo_usado = (p_pedido ->> 'pedido_minimo_usado')::int,
    liberado_abaixo_minimo_por = (p_pedido ->> 'liberado_abaixo_minimo_por')::uuid,
    forma_pagamento = p_pedido ->> 'forma_pagamento',
    vencimento = (p_pedido ->> 'vencimento')::date,
    observacoes = nullif(p_pedido ->> 'observacoes', ''),
    atualizado_por = p_usuario
  where id = v_id;

  if v_reservando or coalesce(p_confirmar, false) then
    -- diferença por produto entre o que estava reservado e o novo pedido, em ordem fixa (evita deadlock)
    for v_prod in
      select produto_id, sum(delta)::int as delta from (
        select produto_id, quantidade as delta from public.itens_pedido where pedido_id = v_id
        union all
        select key::uuid, -(value::text)::int from jsonb_each(v_antigos) where v_reservando
      ) d group by produto_id order by produto_id
    loop
      perform public._reservar(v_id, v_prod.produto_id, v_prod.delta, p_forcar, p_usuario);
    end loop;

    if not v_reservando then
      update public.pedidos set status = 'confirmado', confirmado_em = now() where id = v_id;
    end if;
    perform public._congelar_custo(v_id);
  end if;

  return v_id;
end $$;

-- Avança o status do pedido. Confirmar reserva; entregar dá baixa no físico;
-- cancelar devolve a reserva (ou, se já entregue, devolve ao físico: só o dono).
create or replace function public.mudar_status_pedido(
  p_id uuid, p_status text, p_usuario uuid, p_motivo text default null, p_forcar boolean default false
) returns void
language plpgsql as $$
declare
  v_ped public.pedidos%rowtype;
  v_ordem jsonb := '{"novo":0,"confirmado":1,"separado":2,"saiu_para_entrega":3,"aguardando_retirada":3,"entregue":4}';
  v_item record;
begin
  perform public._definir_usuario(p_usuario);
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then
    raise exception 'Pedido não encontrado';
  end if;
  if v_ped.status = 'cancelado' then
    raise exception 'Pedido já está cancelado';
  end if;
  if v_ped.status = p_status then
    return;
  end if;

  if p_status = 'cancelado' then
    if v_ped.status = 'entregue' then
      if public._perfil(p_usuario) is distinct from 'dono' then
        raise exception 'Só o dono pode cancelar um pedido já entregue';
      end if;
      for v_item in select produto_id, quantidade from public.itens_pedido where pedido_id = p_id order by produto_id loop
        perform 1 from public.estoque where produto_id = v_item.produto_id for update;
        update public.estoque set fisico = fisico + v_item.quantidade, atualizado_em = now() where produto_id = v_item.produto_id;
        insert into public.movimentacoes_estoque (produto_id, tipo, delta_fisico, pedido_id, motivo, usuario_id)
        values (v_item.produto_id, 'devolucao', v_item.quantidade, p_id, nullif(p_motivo, ''), p_usuario);
      end loop;
    elsif v_ped.status <> 'novo' then
      for v_item in select produto_id, quantidade from public.itens_pedido where pedido_id = p_id order by produto_id loop
        perform public._reservar(p_id, v_item.produto_id, -v_item.quantidade, true, p_usuario);
      end loop;
    end if;
    update public.pedidos set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = nullif(p_motivo, ''),
           atualizado_por = p_usuario
     where id = p_id;
    return;
  end if;

  if not (v_ordem ? p_status) then
    raise exception 'Status inválido: %', p_status;
  end if;
  if (v_ordem ->> p_status)::int <= (v_ordem ->> v_ped.status)::int then
    raise exception 'O pedido já passou dessa etapa';
  end if;
  if (p_status = 'saiu_para_entrega' and v_ped.tipo <> 'entrega')
     or (p_status = 'aguardando_retirada' and v_ped.tipo <> 'retirada') then
    raise exception 'Etapa não combina com o tipo do pedido';
  end if;
  if coalesce(p_forcar, false) and public._perfil(p_usuario) is distinct from 'dono' then
    raise exception 'Só o dono pode forçar venda sem estoque';
  end if;

  if v_ped.status = 'novo' then
    for v_item in select produto_id, quantidade from public.itens_pedido where pedido_id = p_id order by produto_id loop
      perform public._reservar(p_id, v_item.produto_id, v_item.quantidade, p_forcar, p_usuario);
    end loop;
    update public.pedidos set confirmado_em = now() where id = p_id;
    perform public._congelar_custo(p_id);
  end if;

  if p_status = 'entregue' then
    for v_item in select produto_id, quantidade from public.itens_pedido where pedido_id = p_id order by produto_id loop
      perform 1 from public.estoque where produto_id = v_item.produto_id for update;
      update public.estoque
         set fisico = fisico - v_item.quantidade, reservado = reservado - v_item.quantidade, atualizado_em = now()
       where produto_id = v_item.produto_id;
      insert into public.movimentacoes_estoque (produto_id, tipo, delta_fisico, delta_reservado, pedido_id, usuario_id)
      values (v_item.produto_id, 'saida_pedido', -v_item.quantidade, -v_item.quantidade, p_id, p_usuario);
    end loop;
    update public.pedidos set concluido_em = now() where id = p_id;
  end if;

  update public.pedidos set status = p_status, atualizado_por = p_usuario where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Visões para telas e relatórios
-- ---------------------------------------------------------------------------

create view public.v_produtos as
select p.id, p.sabor_id, s.nome as sabor, l.id as linha_id, l.nome as linha, l.categoria, l.ordem as linha_ordem,
       p.tamanho_litros, p.preco_centavos, p.custo_medio_centavos, p.custo_adicional_centavos,
       p.custo_medio_centavos + p.custo_adicional_centavos as custo_unitario_centavos,
       p.preco_centavos - (p.custo_medio_centavos + p.custo_adicional_centavos) as margem_centavos,
       case when p.preco_centavos > 0
            then round(100.0 * (p.preco_centavos - p.custo_medio_centavos - p.custo_adicional_centavos) / p.preco_centavos, 1)
       end as margem_pct,
       p.estoque_minimo, p.ativo and s.ativo and l.ativo as ativo
  from public.produtos p
  join public.sabores s on s.id = p.sabor_id
  join public.linhas l on l.id = s.linha_id;

create view public.v_estoque as
select vp.id as produto_id, vp.sabor, vp.linha, vp.linha_id, vp.categoria, vp.linha_ordem, vp.tamanho_litros,
       vp.estoque_minimo, vp.ativo, e.fisico, e.reservado, e.fisico - e.reservado as disponivel,
       (e.fisico - e.reservado) <= vp.estoque_minimo and vp.estoque_minimo > 0 as abaixo_minimo
  from public.v_produtos vp join public.estoque e on e.produto_id = vp.id;

-- Pedidos que contam como venda: confirmados em diante, sem cancelados.
create view public.v_vendas as
select * from public.pedidos where status not in ('novo', 'cancelado');

create view public.v_cliente_metricas as
with por_cliente as (
  select cliente_id,
         count(*) as pedidos,
         min(data_agendada) as primeiro_pedido,
         max(data_agendada) as ultimo_pedido,
         count(distinct data_agendada) as dias_com_pedido,
         sum(total_centavos) as faturado_centavos,
         sum(lucro_centavos) as lucro_centavos,
         sum(total_caixas) as caixas
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
       end as sumido
  from public.clientes c
  cross join public.configuracoes cfg
  left join por_cliente pc on pc.cliente_id = c.id;

create view public.v_resumo_diario as
select data_agendada as data,
       count(*) as pedidos,
       sum(total_caixas) as caixas,
       sum(total_centavos) as faturamento_centavos,
       sum(custo_total_centavos) as custo_centavos,
       sum(lucro_centavos) as lucro_centavos
  from public.v_vendas
 group by data_agendada;

-- ---------------------------------------------------------------------------
-- Acesso: só o servidor (service_role)
-- ---------------------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
