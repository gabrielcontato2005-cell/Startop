import { formatarReais } from "./dinheiro";
import { formatarData } from "./horario";

export type ResumoPedido = {
  numero: number;
  nome_loja: string;
  tipo: "entrega" | "retirada";
  data_agendada: string;
  hora_agendada: string | null;
  forma_pagamento: string;
  itens: { descricao: string; quantidade: number; total_centavos: number }[];
  desconto_centavos: number;
  taxa_entrega_centavos: number;
  acrescimo_cartao_centavos: number;
  total_centavos: number;
};

const FORMAS: Record<string, string> = { pix: "Pix", dinheiro: "Dinheiro", cartao_credito: "Cartão de crédito" };

export function nomeFormaPagamento(forma: string) {
  return FORMAS[forma] ?? forma;
}

/** Texto do resumo que vai pelo WhatsApp (link wa.me). */
export function textoResumoPedido(p: ResumoPedido, nomeFabrica = "StarTop"): string {
  const linhas = [
    `*${nomeFabrica}* · Pedido nº ${p.numero}`,
    p.nome_loja,
    "",
    ...p.itens.map((i) => `${i.quantidade}× ${i.descricao}: ${formatarReais(i.total_centavos)}`),
    "",
  ];
  if (p.desconto_centavos > 0) linhas.push(`Desconto: −${formatarReais(p.desconto_centavos)}`);
  if (p.taxa_entrega_centavos > 0) linhas.push(`Entrega: ${formatarReais(p.taxa_entrega_centavos)}`);
  if (p.acrescimo_cartao_centavos > 0) linhas.push(`Acréscimo do cartão: ${formatarReais(p.acrescimo_cartao_centavos)}`);
  linhas.push(`*Total: ${formatarReais(p.total_centavos)}* (${nomeFormaPagamento(p.forma_pagamento)})`);
  const quando = `${formatarData(p.data_agendada)}${p.hora_agendada ? ` às ${p.hora_agendada.slice(0, 5)}` : ""}`;
  linhas.push(p.tipo === "entrega" ? `Entrega: ${quando}` : `Retirada na fábrica: ${quando}`);
  return linhas.join("\n");
}
