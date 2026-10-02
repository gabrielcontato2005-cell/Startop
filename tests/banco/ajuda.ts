import pg from "pg";

export const URL = process.env.TEST_DATABASE_URL;

export async function conectar() {
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  return c;
}

/** Zera pedidos, lotes, movimentos, saldos e clientes; mantém o catálogo das migrations. */
export async function zerar(c: pg.Client) {
  await c.query(`
    truncate public.pagamentos, public.itens_pedido, public.pedidos, public.movimentacoes_estoque,
             public.itens_lote, public.lotes_entrada, public.clientes, public.auditoria cascade;
    update public.estoque set fisico = 0, reservado = 0;
    update public.produtos p
       set custo_medio_centavos = h.custo_medio_centavos, custo_adicional_centavos = h.custo_adicional_centavos
      from (select distinct on (produto_id) * from public.precos_historico order by produto_id, id) h
     where h.produto_id = p.id;
  `);
}

export async function criarUsuario(c: pg.Client, email: string, perfil?: string): Promise<string> {
  const existente = await c.query(`select id from public.usuarios where email = $1`, [email]);
  if (existente.rows[0]) return existente.rows[0].id;
  const r = await c.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
    email,
    perfil ? { perfil } : {},
  ]);
  return r.rows[0].id;
}

export async function produto(c: pg.Client, sabor: string, litros: number): Promise<string> {
  const r = await c.query(`select id from public.v_produtos where sabor = $1 and tamanho_litros = $2`, [sabor, litros]);
  return r.rows[0].id;
}

export async function saldo(c: pg.Client, produtoId: string) {
  const r = await c.query(`select fisico, reservado, disponivel from public.v_estoque where produto_id = $1`, [produtoId]);
  return r.rows[0] as { fisico: number; reservado: number; disponivel: number };
}

export async function criarCliente(c: pg.Client, nome = "Loja Teste"): Promise<string> {
  const r = await c.query(`insert into public.clientes (nome_loja, distancia_km) values ($1, 10) returning id`, [nome]);
  return r.rows[0].id;
}

export async function lote(c: pg.Client, usuario: string, itens: { produto_id: string; quantidade: number; custo_unitario_centavos?: number }[]) {
  const r = await c.query(`select public.registrar_lote(null, 'NF 1', null, $1, $2) as id`, [JSON.stringify(itens), usuario]);
  return r.rows[0].id as string;
}

/** Grava pedido com valores simples (preço cheio, sem taxa): o cálculo de verdade é testado em tests/regras. */
export async function salvarPedido(
  c: pg.Client,
  usuario: string,
  cliente: string,
  itens: { produto_id: string; quantidade: number }[],
  opcoes: { id?: string; confirmar?: boolean; forcar?: boolean; tipo?: string; data?: string } = {},
) {
  const precos = await c.query(`select id, preco_centavos from public.produtos where id = any($1)`, [itens.map((i) => i.produto_id)]);
  const preco = new Map(precos.rows.map((r) => [r.id, Number(r.preco_centavos)]));
  const itensJson = itens.map((i) => ({
    produto_id: i.produto_id,
    quantidade: i.quantidade,
    preco_unitario_centavos: preco.get(i.produto_id),
    desconto_centavos: 0,
    total_centavos: preco.get(i.produto_id)! * i.quantidade,
  }));
  const total = itensJson.reduce((s, i) => s + i.total_centavos, 0);
  const pedido = {
    cliente_id: cliente,
    tipo: opcoes.tipo ?? "entrega",
    data_agendada: opcoes.data ?? null,
    forma_pagamento: "pix",
    subtotal_centavos: total,
    desconto_centavos: 0,
    taxa_entrega_sugerida_centavos: 0,
    taxa_entrega_centavos: 0,
    acrescimo_cartao_centavos: 0,
    total_centavos: total,
    total_caixas: itens.reduce((s, i) => s + i.quantidade, 0),
  };
  const r = await c.query(`select public.salvar_pedido($1, $2, $3, $4, $5, $6) as id`, [
    opcoes.id ?? null,
    JSON.stringify(pedido),
    JSON.stringify(itensJson),
    opcoes.confirmar ?? true,
    opcoes.forcar ?? false,
    usuario,
  ]);
  return r.rows[0].id as string;
}

export async function status(c: pg.Client, pedido: string, novo: string, usuario: string, motivo?: string) {
  await c.query(`select public.mudar_status_pedido($1, $2, $3, $4)`, [pedido, novo, usuario, motivo ?? null]);
}

/** A soma do livro-razão tem de bater com o saldo de todos os produtos. */
export async function livroBateComSaldo(c: pg.Client) {
  const r = await c.query(`
    select count(*)::int as divergentes from public.estoque e
      left join (select produto_id, sum(delta_fisico) f, sum(delta_reservado) r from public.movimentacoes_estoque group by 1) m
        on m.produto_id = e.produto_id
     where e.fisico <> coalesce(m.f, 0) or e.reservado <> coalesce(m.r, 0)`);
  return r.rows[0].divergentes === 0;
}
