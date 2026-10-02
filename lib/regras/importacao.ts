import { normalizarWhatsapp } from "./telefone";

export type ClienteImportado = {
  nome_loja: string;
  responsavel: string | null;
  whatsapp: string | null;
  cep: string | null;
  bairro: string | null;
  cidade: string | null;
  distancia_km: number | null;
  observacoes: string | null;
};

export type ResultadoLeitura = { clientes: ClienteImportado[]; erros: { linha: number; motivo: string }[] };

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Separa uma linha de CSV respeitando aspas. Aceita vírgula ou ponto e vírgula (Excel em português). */
function separarCsv(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (c === sep && !aspas) {
      campos.push(atual.trim());
      atual = "";
    } else atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

const COLUNAS: Record<keyof ClienteImportado, string[]> = {
  nome_loja: ["nome_loja", "loja", "nome da loja", "nome", "cliente", "estabelecimento"],
  responsavel: ["responsavel", "contato", "dono"],
  whatsapp: ["whatsapp", "telefone", "celular", "fone", "zap", "numero"],
  cep: ["cep"],
  bairro: ["bairro"],
  cidade: ["cidade", "municipio"],
  distancia_km: ["distancia_km", "distancia", "km"],
  observacoes: ["observacoes", "observacao", "obs"],
};

function limparCep(cep: string | null | undefined) {
  const d = (cep ?? "").replace(/\D/g, "");
  return d.length === 8 ? d : null;
}

function lerKm(texto: string | undefined) {
  if (!texto) return null;
  const n = Number(texto.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && texto.trim() !== "" ? n : null;
}

/** Planilha CSV com cabeçalho. A coluna do nome da loja é obrigatória; as outras são reconhecidas pelo nome. */
export function lerCsv(texto: string): ResultadoLeitura {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) return { clientes: [], erros: [{ linha: 1, motivo: "Planilha vazia ou sem cabeçalho" }] };
  const sep = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cabecalho = separarCsv(linhas[0], sep).map(semAcento);
  const indice = Object.fromEntries(
    Object.entries(COLUNAS).map(([campo, nomes]) => [campo, cabecalho.findIndex((c) => nomes.includes(c))]),
  ) as Record<keyof ClienteImportado, number>;
  if (indice.nome_loja < 0) {
    return { clientes: [], erros: [{ linha: 1, motivo: "Não achei a coluna com o nome da loja (ex.: \"nome\" ou \"loja\")" }] };
  }

  const clientes: ClienteImportado[] = [];
  const erros: ResultadoLeitura["erros"] = [];
  linhas.slice(1).forEach((linha, i) => {
    const c = separarCsv(linha, sep);
    const pegar = (campo: keyof ClienteImportado) => (indice[campo] >= 0 ? c[indice[campo]]?.trim() || undefined : undefined);
    const nome = pegar("nome_loja");
    if (!nome) {
      erros.push({ linha: i + 2, motivo: "Sem nome da loja" });
      return;
    }
    const telefone = pegar("whatsapp");
    const whatsapp = normalizarWhatsapp(telefone);
    if (telefone && !whatsapp) erros.push({ linha: i + 2, motivo: `Telefone não reconhecido: ${telefone} (importado sem telefone)` });
    clientes.push({
      nome_loja: nome,
      responsavel: pegar("responsavel") ?? null,
      whatsapp,
      cep: limparCep(pegar("cep")),
      bairro: pegar("bairro") ?? null,
      cidade: pegar("cidade") ?? null,
      distancia_km: lerKm(pegar("distancia_km")),
      observacoes: pegar("observacoes") ?? null,
    });
  });
  return { clientes, erros };
}

function vazio(nome: string, whatsapp: string | null): ClienteImportado {
  return { nome_loja: nome, responsavel: null, whatsapp, cep: null, bairro: null, cidade: null, distancia_km: null, observacoes: null };
}

/** Arquivo de contatos exportado do celular (.vcf). Usa o nome do contato e o primeiro telefone. */
export function lerVcf(texto: string): ResultadoLeitura {
  const clientes: ClienteImportado[] = [];
  const erros: ResultadoLeitura["erros"] = [];
  // linhas dobradas do vCard começam com espaço
  const desdobrado = texto.replace(/\r?\n[ \t]/g, "");
  const cartoes = desdobrado.split(/BEGIN:VCARD/i).slice(1);
  cartoes.forEach((cartao, i) => {
    const campo = (nome: string) => cartao.match(new RegExp(`^${nome}(?:;[^:\\n]*)?:(.*)$`, "im"))?.[1]?.trim();
    const nome = campo("FN") ?? campo("N")?.split(";").filter(Boolean).reverse().join(" ");
    const tel = campo("TEL");
    if (!nome) {
      erros.push({ linha: i + 1, motivo: "Contato sem nome" });
      return;
    }
    const whatsapp = normalizarWhatsapp(tel);
    if (!whatsapp) {
      erros.push({ linha: i + 1, motivo: `${nome}: sem telefone válido` });
      return;
    }
    clientes.push(vazio(nome.replace(/\\,/g, ","), whatsapp));
  });
  return { clientes, erros };
}

/**
 * Lista colada (do WhatsApp, bloco de notas...): uma loja por linha, com o telefone em qualquer lugar da linha.
 * "Açaí do Zé - 21 99999-8888" → nome "Açaí do Zé", WhatsApp 5521999998888.
 */
export function lerTexto(texto: string): ResultadoLeitura {
  const clientes: ClienteImportado[] = [];
  const erros: ResultadoLeitura["erros"] = [];
  texto.split(/\r?\n/).forEach((linha, i) => {
    const l = linha.trim();
    if (!l) return;
    const tel = l.match(/([+(]?\d[\d\s().-]{7,}\d)/)?.[1];
    const whatsapp = normalizarWhatsapp(tel);
    const nome = (tel ? l.replace(tel, "") : l).replace(/^[\s\-–:,;|]+|[\s\-–:,;|]+$/g, "").trim();
    if (!nome && !whatsapp) return;
    if (!nome) {
      erros.push({ linha: i + 1, motivo: `Linha sem nome: ${l}` });
      return;
    }
    if (tel && !whatsapp) erros.push({ linha: i + 1, motivo: `Telefone não reconhecido: ${tel} (importado sem telefone)` });
    clientes.push(vazio(nome, whatsapp));
  });
  return { clientes, erros };
}

/** Junta repetidos pelo WhatsApp (o primeiro vence) e separa os que já existem no cadastro. */
export function separarDuplicados(clientes: ClienteImportado[], whatsappsExistentes: Set<string>) {
  const vistos = new Set<string>();
  const novos: ClienteImportado[] = [];
  const duplicados: ClienteImportado[] = [];
  for (const c of clientes) {
    if (c.whatsapp && (whatsappsExistentes.has(c.whatsapp) || vistos.has(c.whatsapp))) {
      duplicados.push(c);
      continue;
    }
    if (c.whatsapp) vistos.add(c.whatsapp);
    novos.push(c);
  }
  return { novos, duplicados };
}
