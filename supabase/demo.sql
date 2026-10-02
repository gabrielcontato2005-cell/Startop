-- Dados de EXEMPLO para testar o sistema: 40 lojas fictícias e cerca de 3 meses de pedidos.
-- Rode no SQL Editor do Supabase DEPOIS das migrations e depois de criar o seu login (o dono).
-- Para apagar tudo e começar de verdade, rode supabase/zerar-dados.sql.
--
-- Os pedidos passam pelas mesmas funções do app (salvar_pedido, mudar_status_pedido), então estoque,
-- custo congelado e auditoria ficam coerentes. Preço: tabela cheia, R$ 2 de desconto por caixa de
-- açaí 10 L a partir de 10 caixas, sem taxa de entrega (o valor por km ainda não foi definido).

do $$
declare
  v_dono uuid;
  v_hoje date := public.hoje_sp();
  v_cli record;
  v_dia date;
  v_pedido uuid;
  v_itens jsonb;
  v_sub bigint;
  v_desc bigint;
  v_acai10 int;
  v_caixas int;
  v_min int;
  v_tipo text;
  v_forma text;
  v_total bigint;
  v_prod record;
  v_n int;
begin
  select id into v_dono from public.usuarios where perfil = 'dono' and ativo order by criado_em limit 1;
  if v_dono is null then
    raise exception 'Crie primeiro o seu login no Supabase (Authentication > Users); o primeiro usuário vira dono.';
  end if;
  if exists (select 1 from public.clientes where observacoes = 'Cliente de exemplo') then
    raise exception 'Os dados de exemplo já foram carregados.';
  end if;

  perform setseed(0.42);

  -- 40 lojas fictícias em Itaguaí e arredores
  insert into public.clientes (nome_loja, responsavel, whatsapp, bairro, cidade, uf, distancia_km, observacoes, criado_por, atualizado_por)
  select l.nome, l.resp, '552199' || lpad((1000000 + n * 7919 % 999999)::text, 7, '0'), l.bairro, l.cidade, 'RJ', l.km,
         'Cliente de exemplo', v_dono, v_dono
    from (select v.*, row_number() over () as n from (values
      ('Açaí da Praça', 'Marcos', 'Centro', 'Itaguaí', 1.5),
      ('Point do Açaí Brisamar', 'Juliana', 'Brisamar', 'Itaguaí', 3.2),
      ('Sorveteria Gelato Mar', 'Rafael', 'Vila Margarida', 'Itaguaí', 4.8),
      ('Açaí Monte Serrat', 'Patrícia', 'Monte Serrat', 'Itaguaí', 2.7),
      ('Lanchonete do Biel', 'Gabriel', 'Engenho', 'Itaguaí', 6.1),
      ('Açaí Chaperó', 'Fernanda', 'Chaperó', 'Itaguaí', 9.4),
      ('Coroa Açaí', 'Diego', 'Coroa Grande', 'Itaguaí', 11.2),
      ('Mercadinho Ibituporanga', 'Seu João', 'Ibituporanga', 'Itaguaí', 14.6),
      ('Açaiteria Piranema', 'Carla', 'Piranema', 'Itaguaí', 7.9),
      ('Doce Gelado Califórnia', 'Bruno', 'Califórnia', 'Itaguaí', 5.5),
      ('Açaí Raiz Seropédica', 'Thiago', 'Centro', 'Seropédica', 18.3),
      ('Universitário Açaí', 'Larissa', 'Fazenda Caxias', 'Seropédica', 21.7),
      ('Sorvetes Boa Esperança', 'Rose', 'Boa Esperança', 'Seropédica', 16.9),
      ('Mangaratiba Açaí Beach', 'Vitor', 'Centro', 'Mangaratiba', 27.4),
      ('Açaí Muriqui', 'Aline', 'Muriqui', 'Mangaratiba', 22.8),
      ('Delícias de Itacuruçá', 'Sandra', 'Itacuruçá', 'Mangaratiba', 19.6),
      ('Açaí Paracambi Top', 'Leandro', 'Centro', 'Paracambi', 33.1),
      ('Gelateria Santa Cruz', 'Renata', 'Santa Cruz', 'Rio de Janeiro', 24.5),
      ('Açaí do Cesarão', 'Wellington', 'Cesarão', 'Rio de Janeiro', 26.2),
      ('Campo Grande Açaí Mix', 'Priscila', 'Campo Grande', 'Rio de Janeiro', 38.4),
      ('Açaí Sepetiba', 'Anderson', 'Sepetiba', 'Rio de Janeiro', 21.3),
      ('Point Gelado Paciência', 'Jéssica', 'Paciência', 'Rio de Janeiro', 31.8),
      ('Açaí Guaratiba Sabor', 'Rodrigo', 'Guaratiba', 'Rio de Janeiro', 35.9),
      ('Lanches & Açaí Mazomba', 'Kátia', 'Mazomba', 'Itaguaí', 8.6),
      ('Açaí Leandro Express', 'Leandro', 'Jardim América', 'Itaguaí', 4.1),
      ('Cremoso Açaí', 'Michele', 'Parque Primavera', 'Itaguaí', 3.6),
      ('Sorveteria Pé na Areia', 'Paulo', 'Ilha da Madeira', 'Itaguaí', 12.8),
      ('Açaí Brisa', 'Daniela', 'Brisamar', 'Itaguaí', 3.0),
      ('Mercado Bom Preço', 'Sr. Antônio', 'Centro', 'Itaguaí', 1.9),
      ('Açaí Família', 'Cláudia', 'Vila Geny', 'Itaguaí', 2.4),
      ('Açaí Japeri Gelado', 'Marcelo', 'Engenheiro Pedreira', 'Japeri', 41.2),
      ('Delivery Açaí Rápido', 'Igor', 'Centro', 'Itaguaí', 2.1),
      ('Açaí da Orla', 'Bianca', 'Coroa Grande', 'Itaguaí', 10.7),
      ('Sorveteria Tropical', 'Edson', 'Centro', 'Seropédica', 17.5),
      ('Açaí Premium Seropédica', 'Natália', 'Jardim Maracanã', 'Seropédica', 19.9),
      ('Açaí Mania', 'Felipe', 'Engenho', 'Itaguaí', 6.8),
      ('Gelados Vila Nova', 'Simone', 'Vila Nova', 'Itaguaí', 5.2),
      ('Açaí Ponto Certo', 'Ricardo', 'Chaperó', 'Itaguaí', 10.1),
      ('Lanchonete Estação', 'Tânia', 'Centro', 'Paracambi', 32.4),
      ('Açaí Recreio Itaguaí', 'Lucas', 'Recreio', 'Itaguaí', 5.9)
    ) as v(nome, resp, bairro, cidade, km)) as l;

  -- estoque inicial de 90 dias atrás
  perform public.registrar_lote(v_hoje - 91, 'EXEMPLO-0', 'Saldo inicial (exemplo)',
    (select jsonb_agg(jsonb_build_object('produto_id', vp.id,
            'quantidade', case when vp.categoria = 'acai' and vp.tamanho_litros = 10 then 60 when vp.categoria = 'acai' then 15 else 10 end))
       from public.v_produtos vp where vp.ativo), v_dono);

  -- cada loja tem ritmo e sabores preferidos; as 6 últimas pararam de comprar (viram "sumidos")
  create temp table _ritmo on commit drop as
  select c.id, c.distancia_km,
         (4 + floor(random() * 10))::int as freq,
         floor(random() * 7)::int as inicio,
         row_number() over (order by c.nome_loja) > 34 as parou,
         (select array_agg(id) from (select vp.id from public.v_produtos vp where vp.ativo
                                      order by (vp.categoria = 'acai' and vp.tamanho_litros = 10) desc, random() limit 12) x) as favoritos
    from public.clientes c where c.observacoes = 'Cliente de exemplo';

  for v_dia in select generate_series(v_hoje - 90, v_hoje + 1, interval '1 day')::date loop
    -- reposição duas vezes por semana (segunda e quinta), pelo que saiu nos últimos dias
    if extract(isodow from v_dia) in (1, 4) and v_dia <= v_hoje then
      v_itens := (
        select jsonb_agg(jsonb_build_object('produto_id', x.id, 'quantidade', x.q))
          from (
            select vp.id, greatest(0, ceil(coalesce(s.vendido, 0) * 1.3) + vp.estoque_minimo * 2 - (e.fisico - e.reservado))::int as q
              from public.v_produtos vp join public.estoque e on e.produto_id = vp.id
              left join (select i.produto_id, sum(i.quantidade) as vendido from public.itens_pedido i
                           join public.pedidos p on p.id = i.pedido_id
                          where p.data_agendada between v_dia - 7 and v_dia - 1 and p.status <> 'cancelado'
                          group by 1) s on s.produto_id = vp.id
             where vp.ativo) x
         where x.q > 0);
      if v_itens is not null then
        perform public.registrar_lote(v_dia, 'NF ' || to_char(v_dia, 'DDMM'), null, v_itens, v_dono);
      end if;
    end if;

    for v_cli in
      select * from _ritmo r
       where (v_dia - (v_hoje - 90) - r.inicio) % r.freq = 0
         and v_dia >= v_hoje - 90 + r.inicio
         and not (r.parou and v_dia > v_hoje - 35)
    loop
      v_min := greatest(1, ceil(coalesce(v_cli.distancia_km, 0) / 5.0)::int);
      v_caixas := v_min + floor(random() * 7)::int;
      v_tipo := case when v_cli.distancia_km < 5 and random() < 0.4 then 'retirada' else 'entrega' end;
      v_forma := case when random() < 0.65 then 'pix' when random() < 0.7 then 'dinheiro' else 'cartao_credito' end;

      -- distribui as caixas entre 2 a 4 sabores preferidos
      v_n := 2 + floor(random() * 3)::int;
      with escolha as (
        select f.id, row_number() over () as k
          from (select unnest(v_cli.favoritos[1:12]) as id order by random() limit v_n) f
      ), qtd as (
        select e.id, (v_caixas / v_n + case when e.k <= v_caixas % v_n then 1 else 0 end) as q from escolha e
      )
      select jsonb_agg(jsonb_build_object('produto_id', q.id, 'quantidade', q.q, 'preco_unitario_centavos', p.preco_centavos)),
             sum(q.q * p.preco_centavos),
             sum(case when vp.categoria = 'acai' and vp.tamanho_litros = 10 then q.q else 0 end)
        into v_itens, v_sub, v_acai10
        from qtd q join public.produtos p on p.id = q.id join public.v_produtos vp on vp.id = q.id
       where q.q > 0;

      v_desc := case when v_acai10 >= 10 then v_acai10 * 200 else 0 end;
      select jsonb_agg(x || jsonb_build_object(
               'desconto_centavos', d.desc_item,
               'total_centavos', (x ->> 'quantidade')::int * (x ->> 'preco_unitario_centavos')::bigint - d.desc_item))
        into v_itens
        from jsonb_array_elements(v_itens) x
        cross join lateral (
          select case when v_acai10 >= 10 and vp.categoria = 'acai' and vp.tamanho_litros = 10
                      then (x ->> 'quantidade')::int * 200 else 0 end as desc_item
            from public.v_produtos vp where vp.id = (x ->> 'produto_id')::uuid) d;

      v_total := v_sub - v_desc;
      if v_forma = 'cartao_credito' then
        v_total := v_total + round(v_total * 0.10);
      end if;

      v_pedido := public.salvar_pedido(null, jsonb_build_object(
          'cliente_id', v_cli.id, 'tipo', v_tipo, 'data_agendada', v_dia,
          'hora_agendada', (time '08:00' + (floor(random() * 36) * interval '15 minutes'))::text,
          'forma_pagamento', v_forma,
          'subtotal_centavos', v_sub, 'desconto_centavos', v_desc,
          'taxa_entrega_sugerida_centavos', 0, 'taxa_entrega_centavos', 0,
          'acrescimo_cartao_centavos', v_total - (v_sub - v_desc), 'total_centavos', v_total,
          'total_caixas', v_caixas, 'distancia_km_usada', case when v_tipo = 'entrega' then v_cli.distancia_km end,
          'pedido_minimo_usado', case when v_tipo = 'entrega' then v_min end),
        v_itens, true, true, v_dono);

      if v_dia < v_hoje then
        perform public.mudar_status_pedido(v_pedido, 'entregue', v_dono);
        if random() < 0.9 or v_dia < v_hoje - 20 then
          insert into public.pagamentos (pedido_id, valor_centavos, forma, recebido_em, recebido_por)
          values (v_pedido, v_total, v_forma, (v_dia + time '18:00') at time zone 'America/Sao_Paulo', v_dono);
        end if;
      elsif v_dia = v_hoje and random() < 0.5 then
        perform public.mudar_status_pedido(v_pedido, 'separado', v_dono);
      end if;
    end loop;
  end loop;

  -- perdas que deixam três sabores abaixo do mínimo, para o alerta aparecer
  for v_prod in
    select produto_id, disponivel from public.v_estoque
     where (sabor, tamanho_litros) in (('Graviola', 10), ('Ninho', 5), ('Pistache', 10)) and disponivel > 1
  loop
    perform public.ajustar_estoque(v_prod.produto_id, 1 - v_prod.disponivel, 'perda', 'Caixas avariadas (exemplo)', v_dono);
  end loop;

  -- um pedido cancelado, para aparecer no histórico
  select id into v_pedido from public.pedidos where status = 'confirmado' order by numero desc limit 1;
  if v_pedido is not null then
    perform public.mudar_status_pedido(v_pedido, 'cancelado', v_dono, 'Cliente desistiu (exemplo)');
  end if;

  raise notice 'Exemplo carregado: % pedidos.', (select count(*) from public.pedidos);
end $$;
