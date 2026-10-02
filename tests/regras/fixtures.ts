import type { ConfigPedido, ProdutoPreco, RegraDesconto } from "@/lib/regras/pedido";

export const TRAD = "linha-trad";
export const MESC = "linha-mesc";
export const SORV = "linha-sorv";

export const produtos = new Map<string, ProdutoPreco>(
  [
    { id: "banana10", linha_id: TRAD, tamanho_litros: 10, preco_centavos: 9800 },
    { id: "morango10", linha_id: TRAD, tamanho_litros: 10, preco_centavos: 9800 },
    { id: "banana5", linha_id: TRAD, tamanho_litros: 5, preco_centavos: 5500 },
    { id: "nutella10", linha_id: MESC, tamanho_litros: 10, preco_centavos: 10300 },
    { id: "flocos10", linha_id: SORV, tamanho_litros: 10, preco_centavos: 7000 },
  ].map((p) => [p.id, p]),
);

export const regraStarTop: RegraDesconto = {
  linha_ids: [TRAD, MESC],
  tamanho_litros: 10,
  qtd_minima: 10,
  tipo: "valor_por_caixa",
  valor: 200,
  aplica_em: "todas",
  ativa: true,
};

export const config: ConfigPedido = {
  km_por_caixa: 5,
  pedido_minimo_piso: 1,
  raio_max_km: 60,
  taxa_entrega_modo: "por_km",
  taxa_entrega_por_km_centavos: 100,
  taxa_entrega_faixas: [],
  cartao_acrescimo_pct: 10,
  horario_abertura: "08:00",
  horario_fechamento: "17:00",
};
