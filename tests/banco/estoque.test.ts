import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  URL, conectar, criarCliente, criarUsuario, livroBateComSaldo, lote, produto, saldo, salvarPedido, status, zerar,
} from "./ajuda";

// Precisa de um Postgres com as migrations aplicadas: veja scripts/db-teste.sh
describe.skipIf(!URL)("estoque e pedidos no banco", () => {
  let c: pg.Client;
  let dono: string;
  let atendente: string;
  let banana: string;
  let nutella: string;
  let cliente: string;

  beforeAll(async () => {
    c = await conectar();
    dono = await criarUsuario(c, "dono@startop.test");
    atendente = await criarUsuario(c, "atendente@startop.test", "atendente");
    banana = await produto(c, "Banana", 10);
    nutella = await produto(c, "Nutella", 10);
  });
  afterAll(async () => c?.end());
  beforeEach(async () => {
    await zerar(c);
    cliente = await criarCliente(c);
  });

  it("primeiro usuário vira dono; cadastro de fora entra sem acesso, mesmo pedindo perfil nos metadados", async () => {
    await c.query(`insert into auth.users (email, raw_user_meta_data) values ('intruso@startop.test', '{"perfil": "dono"}')`);
    const r = await c.query(`select email, perfil, ativo from public.usuarios where email like '%@startop.test' order by email`);
    expect(r.rows).toEqual([
      { email: "atendente@startop.test", perfil: "atendente", ativo: true },
      { email: "dono@startop.test", perfil: "dono", ativo: true },
      { email: "intruso@startop.test", perfil: "atendente", ativo: false },
    ]);
    const p = await c.query(`select public._perfil(id) as perfil from public.usuarios where email = 'intruso@startop.test'`);
    expect(p.rows[0].perfil).toBeNull();
    await c.query(`delete from auth.users where email = 'intruso@startop.test'`);
  });

  it("lote soma ao físico e recalcula o custo médio", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 100, custo_unitario_centavos: 8000 }]);
    expect(await saldo(c, banana)).toEqual({ fisico: 100, reservado: 0, disponivel: 100 });
    let custo = await c.query(`select custo_medio_centavos from public.produtos where id = $1`, [banana]);
    expect(Number(custo.rows[0].custo_medio_centavos)).toBe(8000);

    await lote(c, dono, [{ produto_id: banana, quantidade: 100, custo_unitario_centavos: 8600 }]);
    custo = await c.query(`select custo_medio_centavos from public.produtos where id = $1`, [banana]);
    expect(Number(custo.rows[0].custo_medio_centavos)).toBe(8300);
    expect((await saldo(c, banana)).fisico).toBe(200);
  });

  it("lote sem custo mantém o custo atual", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 10 }]);
    const custo = await c.query(`select custo_medio_centavos from public.produtos where id = $1`, [banana]);
    expect(Number(custo.rows[0].custo_medio_centavos)).toBe(8300);
  });

  it("ciclo completo: confirmar reserva, editar reserva a diferença, entregar dá baixa", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 100 }]);

    const pedido = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 10 }]);
    expect(await saldo(c, banana)).toEqual({ fisico: 100, reservado: 10, disponivel: 90 });

    await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 12 }], { id: pedido });
    expect(await saldo(c, banana)).toEqual({ fisico: 100, reservado: 12, disponivel: 88 });

    await status(c, pedido, "separado", atendente);
    await status(c, pedido, "saiu_para_entrega", atendente);
    await status(c, pedido, "entregue", atendente);
    expect(await saldo(c, banana)).toEqual({ fisico: 88, reservado: 0, disponivel: 88 });
    expect(await livroBateComSaldo(c)).toBe(true);
  });

  it("pedido salvo sem confirmar não mexe no estoque; confirmar depois reserva", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 20 }]);
    const pedido = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 5 }], { confirmar: false });
    expect((await saldo(c, banana)).reservado).toBe(0);
    await status(c, pedido, "confirmado", atendente);
    expect((await saldo(c, banana)).reservado).toBe(5);
  });

  it("cancelar antes de entregar devolve a reserva", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 50 }]);
    const pedido = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 12 }]);
    await status(c, pedido, "cancelado", atendente, "Cliente desistiu");
    expect(await saldo(c, banana)).toEqual({ fisico: 50, reservado: 0, disponivel: 50 });
    expect(await livroBateComSaldo(c)).toBe(true);
  });

  it("devolução depois de entregue: só o dono, e volta ao físico", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 50 }]);
    const pedido = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 12 }], { tipo: "retirada" });
    await status(c, pedido, "entregue", atendente);
    expect((await saldo(c, banana)).fisico).toBe(38);

    await expect(status(c, pedido, "cancelado", atendente)).rejects.toThrow(/Só o dono/);
    await status(c, pedido, "cancelado", dono, "Voltou derretido");
    expect(await saldo(c, banana)).toEqual({ fisico: 50, reservado: 0, disponivel: 50 });
    expect(await livroBateComSaldo(c)).toBe(true);
  });

  it("não vende além do disponível; só o dono pode forçar", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 5 }]);
    await expect(salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 6 }])).rejects.toThrow(/ESTOQUE_INSUFICIENTE: Banana 10 L/);
    await expect(salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 6 }], { forcar: true })).rejects.toThrow(/Só o dono/);
    expect((await saldo(c, banana)).reservado).toBe(0);

    await salvarPedido(c, dono, cliente, [{ produto_id: banana, quantidade: 6 }], { forcar: true });
    expect(await saldo(c, banana)).toEqual({ fisico: 5, reservado: 6, disponivel: -1 });
    const mov = await c.query(`select motivo from public.movimentacoes_estoque where tipo = 'reserva'`);
    expect(mov.rows[0].motivo).toBe("Forçado pelo dono");
  });

  it("falha de estoque desfaz o pedido inteiro", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 10 }, { produto_id: nutella, quantidade: 1 }]);
    await expect(
      salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 5 }, { produto_id: nutella, quantidade: 2 }]),
    ).rejects.toThrow(/Nutella/);
    expect((await saldo(c, banana)).reservado).toBe(0);
    expect((await c.query(`select count(*)::int n from public.pedidos`)).rows[0].n).toBe(0);
  });

  it("dois pedidos simultâneos disputando a última caixa: só um passa", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 1 }]);
    const a = await conectar();
    const b = await conectar();
    try {
      await a.query("begin");
      await salvarPedido(a, atendente, cliente, [{ produto_id: banana, quantidade: 1 }]);
      // b fica esperando a trava da linha de estoque que a ainda segura
      await b.query("begin");
      const corrida = salvarPedido(b, atendente, cliente, [{ produto_id: banana, quantidade: 1 }]).then(
        () => "passou",
        (e: Error) => e.message,
      );
      await new Promise((r) => setTimeout(r, 300));
      await a.query("commit");
      expect(await corrida).toMatch(/ESTOQUE_INSUFICIENTE/);
      await b.query("rollback");
    } finally {
      await a.end();
      await b.end();
    }
    expect(await saldo(c, banana)).toEqual({ fisico: 1, reservado: 1, disponivel: 0 });
  });

  it("perda tira do físico; contagem ajusta a diferença", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 20 }, { produto_id: nutella, quantidade: 8 }]);
    await c.query(`select public.ajustar_estoque($1, -3, 'perda', 'Caixa amassada', $2)`, [banana, dono]);
    expect((await saldo(c, banana)).fisico).toBe(17);

    const mudou = await c.query(`select public.contar_estoque($1, $2) as n`, [
      JSON.stringify([{ produto_id: banana, quantidade: 15 }, { produto_id: nutella, quantidade: 8 }]),
      dono,
    ]);
    expect(mudou.rows[0].n).toBe(1);
    expect((await saldo(c, banana)).fisico).toBe(15);
    const mov = await c.query(`select delta_fisico, motivo from public.movimentacoes_estoque where tipo = 'ajuste'`);
    expect(mov.rows).toEqual([{ delta_fisico: -2, motivo: "Contagem" }]);
    expect(await livroBateComSaldo(c)).toBe(true);
  });

  it("custo congelado na venda: mudar o custo depois não muda o lucro", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 10 }]);
    const pedido = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 2 }]);
    let p = await c.query(`select custo_total_centavos, lucro_centavos from public.pedidos where id = $1`, [pedido]);
    expect(p.rows[0]).toEqual({ custo_total_centavos: "16600", lucro_centavos: "3000" });

    await c.query(`update public.produtos set custo_adicional_centavos = 500 where id = $1`, [banana]);
    await lote(c, dono, [{ produto_id: banana, quantidade: 10, custo_unitario_centavos: 9000 }]);
    p = await c.query(`select custo_total_centavos, lucro_centavos from public.pedidos where id = $1`, [pedido]);
    expect(p.rows[0]).toEqual({ custo_total_centavos: "16600", lucro_centavos: "3000" });

    // item novo num pedido já confirmado entra com o custo de agora; o antigo continua congelado
    await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 3 }], { id: pedido });
    p = await c.query(`select custo_total_centavos from public.pedidos where id = $1`, [pedido]);
    expect(p.rows[0].custo_total_centavos).toBe(String(3 * 8300));
  });

  it("lucro e faturamento por cliente batem com a soma dos itens", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 50 }, { produto_id: nutella, quantidade: 50 }]);
    const outro = await criarCliente(c, "Outra Loja");
    await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 3 }], { data: "2026-09-01" });
    await salvarPedido(c, atendente, cliente, [{ produto_id: nutella, quantidade: 2 }], { data: "2026-09-08" });
    const cancelado = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 9 }], { data: "2026-09-10" });
    await status(c, cancelado, "cancelado", atendente);
    await salvarPedido(c, atendente, outro, [{ produto_id: banana, quantidade: 1 }], { data: "2026-09-02" });

    const m = await c.query(
      `select pedidos, faturado_centavos, lucro_centavos, frequencia_dias, ticket_medio_centavos from public.v_cliente_metricas where cliente_id = $1`,
      [cliente],
    );
    expect(m.rows[0]).toEqual({
      pedidos: "2",
      faturado_centavos: String(3 * 9800 + 2 * 10300),
      lucro_centavos: String(5 * 1500),
      frequencia_dias: "7.0",
      ticket_medio_centavos: String((3 * 9800 + 2 * 10300) / 2),
    });

    const soma = await c.query(`
      select sum(i.total_centavos) as faturado, sum(i.total_centavos - i.custo_total_centavos) as lucro
        from public.itens_pedido i join public.v_vendas v on v.id = i.pedido_id where v.cliente_id = $1`, [cliente]);
    expect(soma.rows[0]).toEqual({ faturado: m.rows[0].faturado_centavos, lucro: m.rows[0].lucro_centavos });

    const dia = await c.query(`select faturamento_centavos, lucro_centavos from public.v_resumo_diario where data = '2026-09-01'`);
    expect(dia.rows[0]).toEqual({ faturamento_centavos: "29400", lucro_centavos: "4500" });
  });

  it("pagamentos atualizam o status de pagamento", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 10 }]);
    const pedido = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 2 }]);
    const st = async () => (await c.query(`select status_pagamento, pago_centavos from public.pedidos where id = $1`, [pedido])).rows[0];
    expect(await st()).toEqual({ status_pagamento: "a_receber", pago_centavos: "0" });
    await c.query(`insert into public.pagamentos (pedido_id, valor_centavos, forma) values ($1, 10000, 'pix')`, [pedido]);
    expect(await st()).toEqual({ status_pagamento: "parcial", pago_centavos: "10000" });
    await c.query(`insert into public.pagamentos (pedido_id, valor_centavos, forma) values ($1, 9600, 'dinheiro')`, [pedido]);
    expect(await st()).toEqual({ status_pagamento: "pago", pago_centavos: "19600" });
  });

  it("não volta etapa, não edita entregue e etapa precisa combinar com o tipo", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 10 }]);
    const pedido = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 2 }], { tipo: "retirada" });
    await expect(status(c, pedido, "saiu_para_entrega", atendente)).rejects.toThrow(/não combina/);
    await status(c, pedido, "aguardando_retirada", atendente);
    await expect(status(c, pedido, "separado", atendente)).rejects.toThrow(/já passou/);
    await status(c, pedido, "entregue", atendente);
    await expect(salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 1 }], { id: pedido })).rejects.toThrow(/não pode mais ser editado/);
  });

  it("auditoria registra quem mudou o pedido", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 10 }]);
    const pedido = await salvarPedido(c, atendente, cliente, [{ produto_id: banana, quantidade: 2 }]);
    await status(c, pedido, "separado", dono);
    const r = await c.query(
      `select acao, usuario_id, depois ->> 'status' as status from public.auditoria where tabela = 'pedidos' and registro_id = $1 order by id`,
      [pedido],
    );
    expect(r.rows.at(-1)).toEqual({ acao: "update", usuario_id: dono, status: "separado" });
    expect(r.rows.every((x) => x.usuario_id)).toBe(true);
  });

  it("loja própria: pedido mexe no estoque mas fica fora do faturamento e do lucro; pedidos antigos não mudam", async () => {
    await lote(c, dono, [{ produto_id: banana, quantidade: 20 }]);
    const antigo = await salvarPedido(c, dono, cliente, [{ produto_id: banana, quantidade: 2 }], { data: "2026-09-01" });
    await c.query(`update public.clientes set loja_propria = true where id = $1`, [cliente]);
    const proprio = await salvarPedido(c, dono, cliente, [{ produto_id: banana, quantidade: 3 }], { data: "2026-09-01" });
    await status(c, antigo, "entregue", dono);
    await status(c, proprio, "entregue", dono);

    const marcas = await c.query(`select id, a_preco_de_custo from public.pedidos order by numero`);
    expect(marcas.rows.map((r) => r.a_preco_de_custo)).toEqual([false, true]);
    expect((await saldo(c, banana)).fisico).toBe(15);

    const vendas = await c.query(`select array_agg(id) as ids from public.v_vendas`);
    expect(vendas.rows[0].ids).toEqual([antigo]);
    const dia = await c.query(`select caixas from public.v_resumo_diario where data = '2026-09-01'`);
    expect(Number(dia.rows[0].caixas)).toBe(2);

    // desmarcar o cliente não puxa o pedido já feito de volta para as vendas
    await c.query(`update public.clientes set loja_propria = false where id = $1`, [cliente]);
    expect((await c.query(`select count(*)::int as n from public.v_vendas`)).rows[0].n).toBe(1);
  });
});
