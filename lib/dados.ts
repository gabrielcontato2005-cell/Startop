import "server-only";
import { consultar, consultarUm } from "./db";
import type { ConfigPedido, RegraDesconto } from "./regras/pedido";

export type Config = ConfigPedido & {
  fabrica_nome: string;
  fabrica_endereco: string;
  fabrica_cep: string | null;
  fabrica_whatsapp: string | null;
  sumido_fator: number;
  sumido_dias_padrao: number;
};

export async function lerConfig(): Promise<Config> {
  const c = await consultarUm<Config>(`
    select fabrica_nome, fabrica_endereco, fabrica_cep, fabrica_whatsapp, km_por_caixa, pedido_minimo_piso, raio_max_km,
           taxa_entrega_modo, taxa_entrega_por_km_centavos, taxa_entrega_faixas, cartao_acrescimo_pct,
           to_char(horario_abertura, 'HH24:MI') as horario_abertura, to_char(horario_fechamento, 'HH24:MI') as horario_fechamento,
           sumido_fator, sumido_dias_padrao
      from configuracoes where id = 1`);
  return c!;
}

export type ProdutoCatalogo = {
  id: string;
  sabor: string;
  linha: string;
  linha_id: string;
  categoria: "acai" | "sorvete";
  linha_ordem: number;
  tamanho_litros: number;
  preco_centavos: number;
  disponivel: number;
  fisico: number;
  reservado: number;
  estoque_minimo: number;
  ativo: boolean;
};

/** Catálogo com saldo de estoque, sem custo (serve para qualquer perfil). */
export async function lerCatalogo(somenteAtivos = true): Promise<ProdutoCatalogo[]> {
  return consultar<ProdutoCatalogo>(`
    select vp.id, vp.sabor, vp.linha, vp.linha_id, vp.categoria, vp.linha_ordem, vp.tamanho_litros, vp.preco_centavos,
           e.fisico - e.reservado as disponivel, e.fisico, e.reservado, vp.estoque_minimo, vp.ativo
      from v_produtos vp join estoque e on e.produto_id = vp.id
     where $1::boolean is false or vp.ativo
     order by vp.linha_ordem, vp.tamanho_litros desc, vp.sabor`, [somenteAtivos]);
}

export type ProdutoComCusto = ProdutoCatalogo & {
  custo_medio_centavos: number;
  custo_adicional_centavos: number;
  custo_unitario_centavos: number;
  margem_centavos: number;
  margem_pct: number | null;
  sabor_id: string;
};

/** Catálogo com custo e margem: só para o dono. */
export async function lerCatalogoComCusto(): Promise<ProdutoComCusto[]> {
  return consultar<ProdutoComCusto>(`
    select vp.*, e.fisico - e.reservado as disponivel, e.fisico, e.reservado
      from v_produtos vp join estoque e on e.produto_id = vp.id
     order by vp.linha_ordem, vp.tamanho_litros desc, vp.sabor`);
}

export async function lerRegras(): Promise<(RegraDesconto & { id: string; nome: string })[]> {
  return consultar(`select id, nome, linha_ids, tamanho_litros, qtd_minima, tipo, valor, aplica_em, ativa
                      from regras_desconto order by criado_em`);
}

export async function lerLinhas() {
  return consultar<{ id: string; nome: string; categoria: "acai" | "sorvete"; ordem: number; ativo: boolean }>(
    `select id, nome, categoria, ordem, ativo from linhas order by ordem`,
  );
}

export type ClienteResumo = {
  id: string;
  nome_loja: string;
  responsavel: string | null;
  whatsapp: string | null;
  bairro: string | null;
  cidade: string | null;
  distancia_km: number | null;
  pedido_minimo_manual: number | null;
  loja_propria: boolean;
};

/** Clientes da tela de pedido. A loja própria (pedido a preço de custo) só aparece para o dono. */
export async function lerClientesParaPedido(dono: boolean): Promise<ClienteResumo[]> {
  return consultar<ClienteResumo>(`
    select id, nome_loja, responsavel, whatsapp, bairro, cidade, distancia_km, pedido_minimo_manual, loja_propria
      from clientes where ativo and ($1 or not loja_propria) order by lower(nome_loja)`, [dono]);
}

/** Custo atual de cada produto, para o pedido da loja própria. Só para o dono. */
export async function lerCustos(): Promise<Record<string, number>> {
  const r = await consultar<{ id: string; custo: number }>(`select id, custo_unitario_centavos as custo from v_produtos`);
  return Object.fromEntries(r.map((c) => [c.id, c.custo]));
}

export const STATUS: Record<string, { nome: string; cor: string }> = {
  novo: { nome: "Novo", cor: "bg-slate-100 text-slate-700" },
  confirmado: { nome: "Confirmado", cor: "bg-blue-100 text-blue-800" },
  separado: { nome: "Separado", cor: "bg-indigo-100 text-indigo-800" },
  saiu_para_entrega: { nome: "Saiu p/ entrega", cor: "bg-amber-100 text-amber-800" },
  aguardando_retirada: { nome: "Aguardando retirada", cor: "bg-amber-100 text-amber-800" },
  entregue: { nome: "Entregue", cor: "bg-green-100 text-green-800" },
  cancelado: { nome: "Cancelado", cor: "bg-red-100 text-red-700" },
};

export const PAGAMENTO: Record<string, { nome: string; cor: string }> = {
  pago: { nome: "Pago", cor: "bg-green-100 text-green-800" },
  a_receber: { nome: "A receber", cor: "bg-orange-100 text-orange-800" },
  parcial: { nome: "Pago em parte", cor: "bg-orange-100 text-orange-800" },
};

/** Próxima etapa do pedido, para o botão "avançar". */
export function proximoStatus(status: string, tipo: string): string | null {
  switch (status) {
    case "novo":
      return "confirmado";
    case "confirmado":
      return "separado";
    case "separado":
      return tipo === "entrega" ? "saiu_para_entrega" : "aguardando_retirada";
    case "saiu_para_entrega":
    case "aguardando_retirada":
      return "entregue";
    default:
      return null;
  }
}

export const ROTULO_AVANCAR: Record<string, string> = {
  confirmado: "Confirmar",
  separado: "Marcar separado",
  saiu_para_entrega: "Saiu para entrega",
  aguardando_retirada: "Pronto p/ retirada",
  entregue: "Entregue",
};

export const ehUuid = (s: string | undefined | null): s is string => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
