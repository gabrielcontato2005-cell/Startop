"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoAcao } from "@/components/formulario";
import { consultar, consultarUm, mensagemDoBanco } from "@/lib/db";
import { ehUuid } from "@/lib/dados";
import { lerReais } from "@/lib/regras/dinheiro";
import { exigirDono } from "@/lib/sessao";

const txt = (d: FormData, c: string) => String(d.get(c) ?? "").trim();

function inteiro(d: FormData, c: string) {
  const v = txt(d, c);
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

export async function salvarProduto(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const u = await exigirDono();
  const id = txt(dados, "id");
  if (!ehUuid(id)) return { erro: "Produto inválido." };
  const preco = lerReais(txt(dados, "preco"));
  const consumidor = lerReais(txt(dados, "preco_consumidor"));
  const custo = lerReais(txt(dados, "custo_medio"));
  const adicional = lerReais(txt(dados, "custo_adicional")) ?? 0;
  const sabor = txt(dados, "sabor");
  if (preco == null || preco < 0) return { erro: "Preço inválido." };
  if (custo == null || custo < 0) return { erro: "Custo inválido." };
  if ((consumidor == null && txt(dados, "preco_consumidor") !== "") || (consumidor != null && consumidor < 0)) return { erro: "Preço para consumidor inválido." };
  if (adicional < 0) return { erro: "Confira os valores." };
  if (!sabor) return { erro: "Informe o nome do sabor." };

  try {
    await consultar(
      `with p as (
         update produtos set preco_centavos = $2, custo_medio_centavos = $3, custo_adicional_centavos = $4,
                ativo = $5, atualizado_por = $6, preco_consumidor_centavos = $8
          where id = $1 returning sabor_id)
       update sabores set nome = $7 from p where sabores.id = p.sabor_id`,
      [id, preco, custo, adicional, dados.get("ativo") !== "nao", u.id, sabor, consumidor],
    );
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/produtos");
  redirect("/produtos");
}

/** Muda o preço, o preço para consumidor e (se informado) o custo de todos os produtos de uma linha e tamanho. */
export async function precoDaLinha(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const u = await exigirDono();
  const linha = txt(dados, "linha_id");
  const tamanho = Number(txt(dados, "tamanho"));
  const preco = lerReais(txt(dados, "preco"));
  const consumidor = lerReais(txt(dados, "preco_consumidor"));
  const custo = lerReais(txt(dados, "custo_medio"));
  if (!ehUuid(linha) || ![5, 10].includes(tamanho)) return { erro: "Linha inválida." };
  if (preco == null || preco < 0) return { erro: "Preço inválido." };
  if (custo != null && custo < 0) return { erro: "Custo inválido." };
  if ((consumidor == null && txt(dados, "preco_consumidor") !== "") || (consumidor != null && consumidor < 0)) return { erro: "Preço para consumidor inválido." };
  try {
    const r = await consultar(
      `update produtos p set preco_centavos = $3, custo_medio_centavos = coalesce($4, p.custo_medio_centavos), atualizado_por = $5,
              preco_consumidor_centavos = $6
         from sabores s where s.id = p.sabor_id and s.linha_id = $1 and p.tamanho_litros = $2 returning p.id`,
      [linha, tamanho, preco, custo, u.id, consumidor],
    );
    revalidatePath("/produtos");
    return { ok: `${r.length} produto${r.length === 1 ? "" : "s"} atualizado${r.length === 1 ? "" : "s"}.` };
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
}

export async function novoSabor(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const u = await exigirDono();
  const linha = txt(dados, "linha_id");
  const nome = txt(dados, "nome");
  if (!ehUuid(linha) || !nome) return { erro: "Escolha a linha e escreva o nome do sabor." };
  const tamanhos = dados.getAll("tamanho").map(Number).filter((t) => t === 5 || t === 10);
  if (tamanhos.length === 0) return { erro: "Marque pelo menos um tamanho." };

  try {
    // preço e custo copiados de outro sabor da mesma linha e tamanho; ajuste depois se for diferente
    const r = await consultarUm<{ criados: number }>(
      `with s as (insert into sabores (linha_id, nome) values ($1, $2) returning id),
            p as (
              insert into produtos (sabor_id, tamanho_litros, preco_centavos, custo_medio_centavos, custo_adicional_centavos, estoque_minimo, atualizado_por)
              select s.id, t.tamanho,
                     coalesce(ref.preco_centavos, 0), coalesce(ref.custo_medio_centavos, 0), coalesce(ref.custo_adicional_centavos, 0),
                     coalesce(ref.estoque_minimo, 0), $4
                from s cross join unnest($3::int[]) as t(tamanho)
                left join lateral (
                  select p.* from produtos p join sabores so on so.id = p.sabor_id
                   where so.linha_id = $1 and p.tamanho_litros = t.tamanho order by p.criado_em limit 1) ref on true
              returning 1)
       select count(*)::int as criados from p`,
      [linha, nome, tamanhos, u.id],
    );
    revalidatePath("/produtos");
    return { ok: `Sabor ${nome} criado (${r?.criados} produto${r?.criados === 1 ? "" : "s"}) com o preço da linha. Ajuste se precisar.` };
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
}

export async function salvarRegra(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const u = await exigirDono();
  const id = txt(dados, "id");
  const nome = txt(dados, "nome");
  const linhas = dados.getAll("linha_ids").map(String).filter(ehUuid);
  const tamanhoTxt = txt(dados, "tamanho_litros");
  const tamanho = tamanhoTxt === "" ? null : Number(tamanhoTxt);
  const qtd = inteiro(dados, "qtd_minima");
  const tipo = txt(dados, "tipo");
  const aplica = txt(dados, "aplica_em");
  const valor = tipo === "percentual" ? Number(txt(dados, "valor").replace(",", ".")) : lerReais(txt(dados, "valor"));

  if (!nome) return { erro: "Dê um nome para a regra." };
  if (linhas.length === 0) return { erro: "Marque pelo menos uma linha." };
  if (qtd == null || Number.isNaN(qtd) || qtd < 1) return { erro: "Quantidade mínima inválida." };
  if (!["valor_por_caixa", "percentual"].includes(tipo) || !["todas", "so_excedente"].includes(aplica)) return { erro: "Tipo inválido." };
  if (valor == null || !Number.isFinite(valor) || valor < 0 || (tipo === "percentual" && valor > 100)) return { erro: "Valor inválido." };

  const valores = [nome, linhas, tamanho, qtd, tipo, valor, aplica, dados.get("ativa") === "sim", u.id];
  try {
    if (ehUuid(id)) {
      await consultar(
        `update regras_desconto set nome = $1, linha_ids = $2, tamanho_litros = $3, qtd_minima = $4, tipo = $5, valor = $6,
                aplica_em = $7, ativa = $8, atualizado_por = $9 where id = $10`,
        [...valores, id],
      );
    } else {
      await consultar(
        `insert into regras_desconto (nome, linha_ids, tamanho_litros, qtd_minima, tipo, valor, aplica_em, ativa, atualizado_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        valores,
      );
    }
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/produtos/descontos");
  return { ok: "Regra salva." };
}
