import { percentualDe } from "./dinheiro";
import { foraDoRaio, pedidoMinimo, taxaEntregaSugerida, type ConfigEntrega } from "./entrega";
import { dentroDoHorario } from "./horario";

export type ProdutoPreco = {
  id: string;
  linha_id: string;
  tamanho_litros: number;
  preco_centavos: number;
};

export type RegraDesconto = {
  linha_ids: string[];
  tamanho_litros: number | null;
  qtd_minima: number;
  tipo: "valor_por_caixa" | "percentual";
  valor: number;
  aplica_em: "todas" | "so_excedente";
  ativa: boolean;
};

export type ConfigPedido = ConfigEntrega & {
  cartao_acrescimo_pct: number;
  horario_abertura: string;
  horario_fechamento: string;
};

export type FormaPagamento = "pix" | "dinheiro" | "cartao_credito";
export type TipoPedido = "entrega" | "retirada";

export type EntradaPedido = {
  itens: { produto_id: string; quantidade: number }[];
  tipo: TipoPedido;
  forma_pagamento: FormaPagamento;
  distancia_km: number | null;
  /** pedido mínimo fixado no cadastro do cliente, sobrepõe o cálculo por distância */
  pedido_minimo_manual?: number | null;
  /** taxa digitada pelo atendente; ausente = usa a sugerida */
  taxa_entrega_centavos?: number | null;
  hora_agendada?: string | null;
};

export type ItemCalculado = {
  produto_id: string;
  quantidade: number;
  preco_unitario_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
};

export type PedidoCalculado = {
  itens: ItemCalculado[];
  total_caixas: number;
  subtotal_centavos: number;
  desconto_centavos: number;
  taxa_entrega_sugerida_centavos: number;
  taxa_entrega_centavos: number;
  acrescimo_cartao_centavos: number;
  total_centavos: number;
  pedido_minimo: number | null;
  abaixo_do_minimo: boolean;
  fora_do_raio: boolean;
  fora_do_horario: boolean;
};

/** Junta itens repetidos e descarta quantidades zeradas. */
export function normalizarItens(itens: { produto_id: string; quantidade: number }[]) {
  const soma = new Map<string, number>();
  for (const i of itens) {
    const q = Math.trunc(i.quantidade);
    if (q > 0) soma.set(i.produto_id, (soma.get(i.produto_id) ?? 0) + q);
  }
  return [...soma].map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
}

function regraVale(regra: RegraDesconto, p: ProdutoPreco) {
  return regra.linha_ids.includes(p.linha_id) && (regra.tamanho_litros == null || regra.tamanho_litros === p.tamanho_litros);
}

/**
 * Desconto de cada item. Para cada regra ligada, soma as caixas que ela cobre (sabores somados);
 * se chegar à quantidade mínima, aplica em todas essas caixas, ou só nas que passam do mínimo.
 * Regra da StarTop: a partir de 10 caixas de açaí 10 L, R$ 2 em cada uma.
 */
export function calcularDescontos(
  itens: { produto_id: string; quantidade: number }[],
  produtos: Map<string, ProdutoPreco>,
  regras: RegraDesconto[],
): Map<string, number> {
  const desconto = new Map<string, number>();
  for (const regra of regras.filter((r) => r.ativa)) {
    const cobertos = itens.filter((i) => regraVale(regra, produtos.get(i.produto_id)!));
    const caixas = cobertos.reduce((s, i) => s + i.quantidade, 0);
    if (caixas < regra.qtd_minima) continue;

    // so_excedente: as caixas acima do mínimo, tiradas dos itens na ordem em que aparecem
    let semDesconto = regra.aplica_em === "so_excedente" ? regra.qtd_minima : 0;
    for (const item of cobertos) {
      const p = produtos.get(item.produto_id)!;
      const pular = Math.min(semDesconto, item.quantidade);
      semDesconto -= pular;
      const caixasComDesconto = item.quantidade - pular;
      if (caixasComDesconto <= 0) continue;
      const porCaixa = regra.tipo === "valor_por_caixa" ? Math.round(regra.valor) : percentualDe(p.preco_centavos, regra.valor);
      const atual = desconto.get(item.produto_id) ?? 0;
      // o desconto nunca passa do preço do item
      const teto = p.preco_centavos * item.quantidade;
      desconto.set(item.produto_id, Math.min(teto, atual + porCaixa * caixasComDesconto));
    }
  }
  return desconto;
}

/** Calcula o pedido inteiro. É a mesma conta na tela e no servidor; o servidor sempre recalcula antes de gravar. */
export function calcularPedido(
  entrada: EntradaPedido,
  produtos: Map<string, ProdutoPreco>,
  regras: RegraDesconto[],
  cfg: ConfigPedido,
): PedidoCalculado {
  const itensBase = normalizarItens(entrada.itens).filter((i) => produtos.has(i.produto_id));
  const descontos = calcularDescontos(itensBase, produtos, regras);

  const itens: ItemCalculado[] = itensBase.map((i) => {
    const preco = produtos.get(i.produto_id)!.preco_centavos;
    const desconto = descontos.get(i.produto_id) ?? 0;
    return {
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_unitario_centavos: preco,
      desconto_centavos: desconto,
      total_centavos: preco * i.quantidade - desconto,
    };
  });

  const total_caixas = itens.reduce((s, i) => s + i.quantidade, 0);
  const subtotal_centavos = itens.reduce((s, i) => s + i.preco_unitario_centavos * i.quantidade, 0);
  const desconto_centavos = itens.reduce((s, i) => s + i.desconto_centavos, 0);

  const entrega = entrada.tipo === "entrega";
  const taxa_entrega_sugerida_centavos = entrega ? taxaEntregaSugerida(entrada.distancia_km, cfg) : 0;
  const taxa_entrega_centavos = entrega
    ? Math.max(0, Math.round(entrada.taxa_entrega_centavos ?? taxa_entrega_sugerida_centavos))
    : 0;

  const base = subtotal_centavos - desconto_centavos + taxa_entrega_centavos;
  const acrescimo_cartao_centavos = entrada.forma_pagamento === "cartao_credito" ? percentualDe(base, cfg.cartao_acrescimo_pct) : 0;

  const pedido_minimo = entrega ? (entrada.pedido_minimo_manual ?? pedidoMinimo(entrada.distancia_km, cfg)) : null;

  return {
    itens,
    total_caixas,
    subtotal_centavos,
    desconto_centavos,
    taxa_entrega_sugerida_centavos,
    taxa_entrega_centavos,
    acrescimo_cartao_centavos,
    total_centavos: base + acrescimo_cartao_centavos,
    pedido_minimo,
    abaixo_do_minimo: pedido_minimo != null && total_caixas < pedido_minimo,
    fora_do_raio: entrega && foraDoRaio(entrada.distancia_km, cfg),
    fora_do_horario: !dentroDoHorario(entrada.hora_agendada, cfg.horario_abertura, cfg.horario_fechamento),
  };
}

/** Lucro de um pedido: total cobrado menos o custo congelado de cada caixa. */
export function lucroPedido(totalCentavos: number, itens: { quantidade: number; custo_unitario_centavos: number }[]): number {
  return totalCentavos - itens.reduce((s, i) => s + i.quantidade * i.custo_unitario_centavos, 0);
}

/** Custo médio ponderado depois de uma entrada de lote (o banco faz a mesma conta em registrar_lote). */
export function custoMedio(fisico: number, custoAtual: number, quantidade: number, custoLote: number): number {
  if (fisico <= 0) return custoLote;
  return Math.round((fisico * custoAtual + quantidade * custoLote) / (fisico + quantidade));
}
