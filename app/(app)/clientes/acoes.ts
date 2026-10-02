"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoAcao } from "@/components/formulario";
import { consultar, consultarUm, mensagemDoBanco } from "@/lib/db";
import { separarDuplicados, type ClienteImportado } from "@/lib/regras/importacao";
import { normalizarWhatsapp } from "@/lib/regras/telefone";
import { exigirDono, exigirEquipe } from "@/lib/sessao";

function texto(dados: FormData, campo: string) {
  const v = String(dados.get(campo) ?? "").trim();
  return v === "" ? null : v;
}

function numero(dados: FormData, campo: string) {
  const v = texto(dados, campo);
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export async function salvarCliente(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const u = await exigirEquipe();
  const id = texto(dados, "id");
  const nome = texto(dados, "nome_loja");
  if (!nome) return { erro: "Informe o nome da loja." };

  const telefone = texto(dados, "whatsapp");
  const whatsapp = normalizarWhatsapp(telefone);
  if (telefone && !whatsapp) return { erro: "WhatsApp inválido. Use DDD + número, ex.: (21) 99999-8888." };

  const distancia = numero(dados, "distancia_km");
  if (Number.isNaN(distancia) || (distancia != null && distancia < 0)) return { erro: "Distância inválida." };
  const minimoManual = numero(dados, "pedido_minimo_manual");
  if (Number.isNaN(minimoManual) || (minimoManual != null && minimoManual < 0)) return { erro: "Pedido mínimo inválido." };

  const cep = texto(dados, "cep")?.replace(/\D/g, "") || null;
  const valores = [
    nome,
    texto(dados, "responsavel"),
    whatsapp,
    cep,
    texto(dados, "logradouro"),
    texto(dados, "numero"),
    texto(dados, "complemento"),
    texto(dados, "bairro"),
    texto(dados, "cidade"),
    texto(dados, "uf"),
    distancia,
    minimoManual == null ? null : Math.round(minimoManual),
    texto(dados, "observacoes"),
    dados.get("ativo") !== "nao",
    u.id,
  ];

  let clienteId = id;
  try {
    if (id) {
      await consultar(
        `update clientes set nome_loja = $1, responsavel = $2, whatsapp = $3, cep = $4, logradouro = $5, numero = $6,
                complemento = $7, bairro = $8, cidade = $9, uf = $10, distancia_km = $11, pedido_minimo_manual = $12,
                observacoes = $13, ativo = $14, atualizado_por = $15, distancia_origem = 'manual'
          where id = $16`,
        [...valores, id],
      );
    } else {
      const r = await consultarUm<{ id: string }>(
        `insert into clientes (nome_loja, responsavel, whatsapp, cep, logradouro, numero, complemento, bairro, cidade, uf,
                               distancia_km, pedido_minimo_manual, observacoes, ativo, criado_por, atualizado_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15) returning id`,
        valores,
      );
      clienteId = r!.id;
    }
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/clientes");
  const destino = texto(dados, "voltar_para");
  redirect(destino === "pedido" ? `/pedidos/novo?cliente=${clienteId}` : `/clientes/${clienteId}`);
}

export type ResultadoImportacao = { importados: number; duplicados: number; erros: string[] } | { erro: string };

export async function importarClientes(clientes: ClienteImportado[], origem: "csv" | "vcf" | "texto"): Promise<ResultadoImportacao> {
  const u = await exigirDono();
  if (!Array.isArray(clientes) || clientes.length === 0) return { erro: "Nada para importar." };
  if (clientes.length > 5000) return { erro: "Importe no máximo 5.000 clientes por vez." };

  // o servidor não confia na prévia do navegador: normaliza de novo
  const limpos = clientes
    .map((c) => ({
      ...c,
      nome_loja: String(c.nome_loja ?? "").trim().slice(0, 200),
      whatsapp: normalizarWhatsapp(c.whatsapp),
      distancia_km: typeof c.distancia_km === "number" && c.distancia_km >= 0 ? c.distancia_km : null,
    }))
    .filter((c) => c.nome_loja);

  const existentes = await consultar<{ whatsapp: string }>(`select whatsapp from clientes where whatsapp is not null`);
  const { novos, duplicados } = separarDuplicados(limpos, new Set(existentes.map((e) => e.whatsapp)));

  try {
    if (novos.length > 0) {
      await consultar(
        `insert into clientes (nome_loja, responsavel, whatsapp, cep, bairro, cidade, distancia_km, observacoes, criado_por, atualizado_por)
         select x.nome_loja, x.responsavel, x.whatsapp, x.cep, x.bairro, x.cidade, x.distancia_km, x.observacoes, $2, $2
           from jsonb_to_recordset($1::jsonb) as x(nome_loja text, responsavel text, whatsapp text, cep text, bairro text,
                                                   cidade text, distancia_km numeric, observacoes text)
         on conflict (whatsapp) do nothing`,
        [JSON.stringify(novos), u.id],
      );
    }
    await consultar(
      `insert into importacoes (origem, total, importados, duplicados, criado_por) values ($1, $2, $3, $4, $5)`,
      [origem, clientes.length, novos.length, duplicados.length, u.id],
    );
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/clientes");
  return { importados: novos.length, duplicados: duplicados.length, erros: [] };
}
