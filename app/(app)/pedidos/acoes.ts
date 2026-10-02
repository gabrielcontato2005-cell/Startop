"use server";

import { revalidatePath } from "next/cache";
import type { EstadoAcao } from "@/components/formulario";
import { consultar, consultarUm, ehEstoqueInsuficiente, mensagemDoBanco } from "@/lib/db";
import { ehUuid, lerCatalogo, lerConfig, lerRegras } from "@/lib/dados";
import { lerReais } from "@/lib/regras/dinheiro";
import { calcularPedido, precoDeCusto, type FormaPagamento, type RegraDesconto, type TipoPedido } from "@/lib/regras/pedido";
import { exigirEquipe, exigirUsuario } from "@/lib/sessao";

export type EnvioPedido = {
  id?: string;
  cliente_id: string;
  tipo: TipoPedido;
  data_agendada: string;
  hora_agendada: string | null;
  forma_pagamento: FormaPagamento;
  taxa_entrega_centavos: number | null;
  observacoes: string;
  itens: { produto_id: string; quantidade: number }[];
  confirmar: boolean;
  /** dono: libera entrega abaixo do mínimo ou fora do raio */
  liberar_minimo: boolean;
  /** dono: vende mesmo sem estoque */
  forcar_estoque: boolean;
};

export type RespostaPedido = { ok: true; id: string } | { ok: false; erro: string; semEstoque?: boolean };

/**
 * Grava o pedido. O servidor recalcula tudo a partir do banco (preço, desconto, taxa, mínimo):
 * a tela só manda itens, cliente e escolhas.
 */
export async function salvarPedido(envio: EnvioPedido): Promise<RespostaPedido> {
  const u = await exigirEquipe();
  const dono = u.perfil === "dono";

  if (!ehUuid(envio.cliente_id)) return { ok: false, erro: "Escolha o cliente." };
  if (envio.id && !ehUuid(envio.id)) return { ok: false, erro: "Pedido inválido." };
  if (!["entrega", "retirada"].includes(envio.tipo)) return { ok: false, erro: "Escolha entrega ou retirada." };
  if (!["pix", "dinheiro", "cartao_credito"].includes(envio.forma_pagamento)) return { ok: false, erro: "Escolha a forma de pagamento." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(envio.data_agendada)) return { ok: false, erro: "Data inválida." };
  if (envio.hora_agendada && !/^\d{2}:\d{2}$/.test(envio.hora_agendada)) return { ok: false, erro: "Horário inválido." };
  if (!Array.isArray(envio.itens) || envio.itens.some((i) => !ehUuid(i.produto_id) || !Number.isInteger(i.quantidade) || i.quantidade < 0 || i.quantidade > 10000)) {
    return { ok: false, erro: "Confira as quantidades." };
  }
  if (envio.taxa_entrega_centavos != null && (!Number.isInteger(envio.taxa_entrega_centavos) || envio.taxa_entrega_centavos < 0)) {
    return { ok: false, erro: "Taxa de entrega inválida." };
  }

  const [cliente, catalogo, regras, cfg] = await Promise.all([
    consultarUm<{ distancia_km: number | null; pedido_minimo_manual: number | null; ativo: boolean; loja_propria: boolean }>(
      `select distancia_km, pedido_minimo_manual, ativo, loja_propria from clientes where id = $1`,
      [envio.cliente_id],
    ),
    lerCatalogo(false),
    lerRegras(),
    lerConfig(),
  ]);
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

  if (cliente.loja_propria && !dono) return { ok: false, erro: "Pedido da loja própria só o dono faz." };

  let produtos = new Map(catalogo.map((p) => [p.id, p]));
  if (envio.itens.some((i) => i.quantidade > 0 && !produtos.get(i.produto_id)?.ativo)) {
    return { ok: false, erro: "Algum produto saiu de linha. Recarregue a página." };
  }
  let regrasUsadas: RegraDesconto[] = regras;
  let minimoManual = cliente.pedido_minimo_manual;
  if (cliente.loja_propria) {
    const custos = await consultar<{ id: string; custo: number }>(`select id, custo_unitario_centavos as custo from v_produtos`);
    const aCusto = precoDeCusto(produtos, new Map(custos.map((c) => [c.id, Number(c.custo)])));
    produtos = aCusto.produtos;
    regrasUsadas = aCusto.regras;
    minimoManual = aCusto.pedido_minimo_manual;
  }

  const calc = calcularPedido(
    {
      itens: envio.itens,
      tipo: envio.tipo,
      forma_pagamento: envio.forma_pagamento,
      distancia_km: cliente.distancia_km,
      pedido_minimo_manual: minimoManual,
      taxa_entrega_centavos: envio.taxa_entrega_centavos,
      hora_agendada: envio.hora_agendada,
    },
    produtos,
    regrasUsadas,
    cfg,
  );

  if (calc.itens.length === 0) return { ok: false, erro: "Adicione pelo menos uma caixa." };
  if (calc.fora_do_horario) {
    return { ok: false, erro: `Horário fora do funcionamento (${cfg.horario_abertura} às ${cfg.horario_fechamento}).` };
  }
  const liberar = dono && envio.liberar_minimo;
  if (calc.fora_do_raio && !liberar) return { ok: false, erro: `Cliente fora do raio de entrega (${cfg.raio_max_km} km).` };
  if (calc.abaixo_do_minimo && !liberar) {
    return { ok: false, erro: `Entrega pede no mínimo ${calc.pedido_minimo} caixas (o pedido tem ${calc.total_caixas}).` };
  }

  const pedido = {
    cliente_id: envio.cliente_id,
    tipo: envio.tipo,
    data_agendada: envio.data_agendada,
    hora_agendada: envio.hora_agendada || null,
    forma_pagamento: envio.forma_pagamento,
    observacoes: envio.observacoes?.slice(0, 1000) ?? "",
    subtotal_centavos: calc.subtotal_centavos,
    desconto_centavos: calc.desconto_centavos,
    taxa_entrega_sugerida_centavos: calc.taxa_entrega_sugerida_centavos,
    taxa_entrega_centavos: calc.taxa_entrega_centavos,
    acrescimo_cartao_centavos: calc.acrescimo_cartao_centavos,
    total_centavos: calc.total_centavos,
    total_caixas: calc.total_caixas,
    distancia_km_usada: envio.tipo === "entrega" ? cliente.distancia_km : null,
    pedido_minimo_usado: calc.pedido_minimo,
    liberado_abaixo_minimo_por: liberar && (calc.abaixo_do_minimo || calc.fora_do_raio) ? u.id : null,
  };

  try {
    const r = await consultarUm<{ id: string }>(`select salvar_pedido($1, $2, $3, $4, $5, $6) as id`, [
      envio.id ?? null,
      JSON.stringify(pedido),
      JSON.stringify(calc.itens),
      envio.confirmar,
      dono && envio.forcar_estoque,
      u.id,
    ]);
    revalidatePath("/pedidos");
    revalidatePath("/");
    return { ok: true, id: r!.id };
  } catch (e) {
    return { ok: false, erro: mensagemDoBanco(e), semEstoque: ehEstoqueInsuficiente(e) };
  }
}

/** Último pedido e sabores habituais do cliente, para o "repetir pedido" da tela de novo pedido. */
export async function habitosDoCliente(clienteId: string) {
  await exigirEquipe();
  if (!ehUuid(clienteId)) return { ultimo: [], habituais: [], ultimaData: null };
  const [ultimo, habituais] = await Promise.all([
    consultar<{ produto_id: string; quantidade: number; data_agendada: string }>(
      `select i.produto_id, i.quantidade, p.data_agendada from itens_pedido i
         join (select id, data_agendada from pedidos where cliente_id = $1 and status <> 'cancelado'
               order by data_agendada desc, numero desc limit 1) p on p.id = i.pedido_id`,
      [clienteId],
    ),
    consultar<{ produto_id: string }>(
      `select i.produto_id from itens_pedido i join pedidos v on v.id = i.pedido_id
        where v.cliente_id = $1 and v.status not in ('novo', 'cancelado') group by 1 order by sum(i.quantidade) desc limit 6`,
      [clienteId],
    ),
  ]);
  return {
    ultimo: ultimo.map(({ produto_id, quantidade }) => ({ produto_id, quantidade })),
    ultimaData: ultimo[0]?.data_agendada ?? null,
    habituais: habituais.map((h) => h.produto_id),
  };
}

export async function mudarStatus(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const u = await exigirUsuario();
  const id = String(dados.get("id") ?? "");
  const status = String(dados.get("status") ?? "");
  const motivo = String(dados.get("motivo") ?? "").trim();
  const forcar = u.perfil === "dono" && dados.get("forcar") === "sim";
  if (!ehUuid(id)) return { erro: "Pedido inválido." };
  // entregador só marca entregue
  if (u.perfil === "entregador" && !["saiu_para_entrega", "entregue"].includes(status)) return { erro: "Sem permissão." };
  if (status === "cancelado" && !motivo) return { erro: "Escreva o motivo do cancelamento." };
  try {
    await consultar(`select mudar_status_pedido($1, $2, $3, $4, $5)`, [id, status, u.id, motivo || null, forcar]);
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/separacao");
  revalidatePath("/");
  return null;
}

export async function registrarPagamento(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const u = await exigirUsuario();
  const id = String(dados.get("id") ?? "");
  const valor = lerReais(String(dados.get("valor") ?? ""));
  const forma = String(dados.get("forma") ?? "");
  if (!ehUuid(id)) return { erro: "Pedido inválido." };
  if (valor == null || valor <= 0) return { erro: "Valor inválido." };
  if (!["pix", "dinheiro", "cartao_credito"].includes(forma)) return { erro: "Escolha a forma." };
  try {
    const p = await consultarUm<{ status: string }>(`select status from pedidos where id = $1`, [id]);
    if (!p || p.status === "cancelado") return { erro: "Pedido cancelado não recebe pagamento." };
    await consultar(
      `insert into pagamentos (pedido_id, valor_centavos, forma, recebido_por, observacao) values ($1, $2, $3, $4, $5)`,
      [id, valor, forma, u.id, String(dados.get("observacao") ?? "").trim() || null],
    );
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/pedidos");
  revalidatePath("/");
  return { ok: "Pagamento registrado." };
}
