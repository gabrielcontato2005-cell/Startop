import "server-only";
import { consultar, consultarUm } from "./db";
import { hojeSP, somarDias } from "./regras/horario";

export type Periodo = { de: string; ate: string; nome: string; chave: string };

export function lerPeriodo(sp: Record<string, string | string[] | undefined>): Periodo {
  const hoje = hojeSP();
  const chave = typeof sp.p === "string" ? sp.p : "mes";
  const inicioMes = `${hoje.slice(0, 8)}01`;
  const valida = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  switch (chave) {
    case "hoje":
      return { de: hoje, ate: hoje, nome: "Hoje", chave };
    case "7d":
      return { de: somarDias(hoje, -6), ate: hoje, nome: "Últimos 7 dias", chave };
    case "30d":
      return { de: somarDias(hoje, -29), ate: hoje, nome: "Últimos 30 dias", chave };
    case "mes_passado": {
      const fim = somarDias(inicioMes, -1);
      return { de: `${fim.slice(0, 8)}01`, ate: fim, nome: "Mês passado", chave };
    }
    case "custom":
      if (valida(sp.de) && valida(sp.ate)) return { de: sp.de as string, ate: sp.ate as string, nome: "Período", chave };
      return { de: inicioMes, ate: hoje, nome: "Este mês", chave: "mes" };
    default:
      return { de: inicioMes, ate: hoje, nome: "Este mês", chave: "mes" };
  }
}

export async function resumoPeriodo(p: Periodo) {
  return consultarUm<{ pedidos: number; caixas: number; faturamento: number; custo: number; lucro: number; lucro_a_receber: number; clientes: number }>(
    `select count(*) as pedidos, coalesce(sum(total_caixas), 0) as caixas, coalesce(sum(total_centavos), 0) as faturamento,
            coalesce(sum(custo_total_centavos), 0) as custo, coalesce(sum(lucro_recebido_centavos), 0) as lucro,
            coalesce(sum(lucro_a_receber_centavos), 0) as lucro_a_receber,
            count(distinct cliente_id) as clientes
       from v_vendas where data_agendada between $1 and $2`,
    [p.de, p.ate],
  );
}

export async function vendasPorDia(p: Periodo) {
  return consultar<{ data: string; pedidos: number; caixas: number; faturamento_centavos: number; custo_centavos: number; lucro_centavos: number }>(
    `select * from v_resumo_diario where data between $1 and $2 order by data`,
    [p.de, p.ate],
  );
}

export async function rankingClientes(p: Periodo, limite = 500) {
  return consultar<{ cliente_id: string; nome_loja: string; pedidos: number; caixas: number; faturamento: number; lucro: number }>(
    `select v.cliente_id, c.nome_loja, count(*) as pedidos, sum(v.total_caixas) as caixas,
            sum(v.total_centavos) as faturamento, sum(v.lucro_recebido_centavos) as lucro
       from v_vendas v join clientes c on c.id = v.cliente_id
      where v.data_agendada between $1 and $2
      group by v.cliente_id, c.nome_loja order by faturamento desc limit $3`,
    [p.de, p.ate, limite],
  );
}

/**
 * Lucro por sabor: faturamento do item menos o custo congelado (taxa de entrega e acréscimo do cartão ficam fora),
 * só dos pedidos pagos.
 */
export async function rankingSabores(p: Periodo) {
  return consultar<{ produto: string; linha: string; caixas: number; faturamento: number; lucro: number }>(
    `select vp.sabor || ' ' || vp.tamanho_litros || ' L' as produto, vp.linha, sum(i.quantidade) as caixas,
            sum(i.total_centavos) as faturamento, coalesce(sum(i.total_centavos - coalesce(i.custo_total_centavos, 0)) filter (where v.status_pagamento = 'pago'), 0) as lucro
       from itens_pedido i join v_vendas v on v.id = i.pedido_id join v_produtos vp on vp.id = i.produto_id
      where v.data_agendada between $1 and $2
      group by vp.sabor, vp.tamanho_litros, vp.linha order by caixas desc`,
    [p.de, p.ate],
  );
}
