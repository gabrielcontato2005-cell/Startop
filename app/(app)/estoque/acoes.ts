"use server";

import { revalidatePath } from "next/cache";
import type { EstadoAcao } from "@/components/formulario";
import { consultar, consultarUm, mensagemDoBanco } from "@/lib/db";
import { ehUuid } from "@/lib/dados";
import { lerReais } from "@/lib/regras/dinheiro";
import { exigirDono } from "@/lib/sessao";

export type ItemGrade = { produto_id: string; quantidade: number; custo?: string };

function validarItens(itens: ItemGrade[], permitirZero: boolean) {
  if (!Array.isArray(itens)) return null;
  const limpos = [];
  for (const i of itens) {
    if (!ehUuid(i.produto_id) || !Number.isInteger(i.quantidade) || i.quantidade < 0) return null;
    if (i.quantidade === 0 && !permitirZero) continue;
    limpos.push(i);
  }
  return limpos;
}

export async function registrarLote(dados: { data: string; nota: string; obs: string; itens: ItemGrade[] }): Promise<EstadoAcao> {
  const u = await exigirDono();
  const itens = validarItens(dados.itens, false);
  if (!itens) return { erro: "Confira as quantidades." };
  if (itens.length === 0) return { erro: "Digite a quantidade de pelo menos um sabor." };
  const comCusto = [];
  for (const i of itens) {
    const custo = i.custo?.trim() ? lerReais(i.custo) : null;
    if (i.custo?.trim() && (custo == null || custo < 0)) return { erro: "Algum custo está inválido." };
    comCusto.push({ produto_id: i.produto_id, quantidade: i.quantidade, ...(custo != null ? { custo_unitario_centavos: custo } : {}) });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) return { erro: "Data inválida." };
  try {
    await consultar(`select registrar_lote($1, $2, $3, $4, $5)`, [dados.data, dados.nota, dados.obs, JSON.stringify(comCusto), u.id]);
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/estoque");
  const caixas = itens.reduce((s, i) => s + i.quantidade, 0);
  return { ok: `Entrada registrada: ${caixas} caixas em ${itens.length} produto${itens.length === 1 ? "" : "s"}.` };
}

export async function registrarContagem(itens: ItemGrade[]): Promise<EstadoAcao> {
  const u = await exigirDono();
  const limpos = validarItens(itens, true);
  if (!limpos) return { erro: "Confira as quantidades." };
  if (limpos.length === 0) return { erro: "Digite a contagem de pelo menos um sabor." };
  try {
    const r = await consultarUm<{ n: number }>(`select contar_estoque($1, $2) as n`, [
      JSON.stringify(limpos.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade }))),
      u.id,
    ]);
    revalidatePath("/estoque");
    return { ok: r!.n === 0 ? "Contagem bateu com o sistema. Nada mudou." : `Contagem salva: ${r!.n} produto${r!.n === 1 ? "" : "s"} ajustado${r!.n === 1 ? "" : "s"}.` };
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
}

export async function ajustarEstoque(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const u = await exigirDono();
  const produto = String(dados.get("produto_id") ?? "");
  const tipo = String(dados.get("tipo") ?? "");
  const qtd = Number(dados.get("quantidade"));
  const sentido = String(dados.get("sentido") ?? "tirar");
  const motivo = String(dados.get("motivo") ?? "").trim();
  if (!ehUuid(produto)) return { erro: "Escolha o produto." };
  if (!Number.isInteger(qtd) || qtd <= 0) return { erro: "Quantidade inválida." };
  if (!motivo) return { erro: "Escreva o motivo." };
  const delta = tipo === "perda" || sentido === "tirar" ? -qtd : qtd;
  try {
    await consultar(`select ajustar_estoque($1, $2, $3, $4, $5)`, [produto, delta, tipo === "perda" ? "perda" : "ajuste", motivo, u.id]);
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/estoque");
  return { ok: "Ajuste registrado." };
}
