"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Botao, Cartao, classeCampo } from "@/components/ui";
import { lerCsv, lerTexto, lerVcf, separarDuplicados, type ResultadoLeitura } from "@/lib/regras/importacao";
import { formatarWhatsapp } from "@/lib/regras/telefone";
import { importarClientes, type ResultadoImportacao } from "../acoes";

type Origem = "csv" | "vcf" | "texto";

export default function Importador({ whatsappsExistentes }: { whatsappsExistentes: string[] }) {
  const [origem, setOrigem] = useState<Origem>("csv");
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null);
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [enviando, iniciar] = useTransition();

  const separados = leitura ? separarDuplicados(leitura.clientes, new Set(whatsappsExistentes)) : null;

  async function lerArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    const conteudo = await arquivo.text();
    setResultado(null);
    setLeitura(origem === "vcf" ? lerVcf(conteudo) : lerCsv(conteudo));
  }

  function importar() {
    if (!separados) return;
    iniciar(async () => setResultado(await importarClientes(separados.novos, origem)));
  }

  const aba = (o: Origem, rotulo: string) => (
    <button
      type="button"
      onClick={() => {
        setOrigem(o);
        setLeitura(null);
        setResultado(null);
      }}
      className={`flex-1 rounded-lg py-2 text-sm font-medium ${origem === o ? "bg-white text-roxo shadow-sm" : "text-slate-600"}`}
    >
      {rotulo}
    </button>
  );

  if (resultado && "importados" in resultado) {
    return (
      <div className="space-y-4">
        <Aviso tipo="ok">
          {resultado.importados} cliente{resultado.importados === 1 ? "" : "s"} importado{resultado.importados === 1 ? "" : "s"}.
          {resultado.duplicados > 0 && ` ${resultado.duplicados} já existiam e ficaram de fora.`}
        </Aviso>
        <Link href="/clientes" className="block text-center font-medium text-roxo underline">
          Ver clientes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1">
        {aba("csv", "Planilha")}
        {aba("vcf", "Contatos")}
        {aba("texto", "Colar lista")}
      </div>

      <Cartao className="space-y-3 text-sm text-slate-600">
        {origem === "csv" && (
          <>
            <p>
              Salve a planilha como <b>CSV</b> (Excel: Arquivo → Salvar como → CSV). A primeira linha precisa ter os nomes das colunas.
              Reconheço: <b>nome</b> (ou loja), responsável, telefone (ou WhatsApp), CEP, bairro, cidade, distância (km), observações.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => lerArquivo(e.target.files?.[0])} className="block w-full text-sm" />
          </>
        )}
        {origem === "vcf" && (
          <>
            <p>
              No celular, exporte os contatos como arquivo <b>.vcf</b> (Contatos → Configurações → Exportar) e escolha o arquivo aqui.
              Entram o nome e o primeiro telefone de cada contato.
            </p>
            <input type="file" accept=".vcf,text/vcard,text/x-vcard" onChange={(e) => lerArquivo(e.target.files?.[0])} className="block w-full text-sm" />
          </>
        )}
        {origem === "texto" && (
          <>
            <p>Uma loja por linha, com o telefone em qualquer lugar da linha. Ex.: <i>Açaí do Zé - 21 99999-8888</i></p>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} className={`${classeCampo} py-2`} />
            <Botao type="button" estilo="secundario" onClick={() => (setResultado(null), setLeitura(lerTexto(texto)))} disabled={!texto.trim()}>
              Ler lista
            </Botao>
          </>
        )}
      </Cartao>

      {resultado && "erro" in resultado && <Aviso tipo="erro">{resultado.erro}</Aviso>}

      {leitura && separados && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Cartao className="p-3"><div className="text-2xl font-bold text-green-700">{separados.novos.length}</div>novos</Cartao>
            <Cartao className="p-3"><div className="text-2xl font-bold text-slate-500">{separados.duplicados.length}</div>já existem</Cartao>
            <Cartao className="p-3"><div className="text-2xl font-bold text-amber-600">{leitura.erros.length}</div>avisos</Cartao>
          </div>
          {leitura.erros.length > 0 && (
            <Aviso tipo="alerta">
              <ul className="list-disc space-y-0.5 pl-4">
                {leitura.erros.slice(0, 10).map((e, i) => (
                  <li key={i}>Linha {e.linha}: {e.motivo}</li>
                ))}
                {leitura.erros.length > 10 && <li>e mais {leitura.erros.length - 10}…</li>}
              </ul>
            </Aviso>
          )}
          {separados.novos.length > 0 && (
            <Cartao className="max-h-80 divide-y divide-slate-100 overflow-y-auto p-0 text-sm">
              {separados.novos.slice(0, 200).map((c, i) => (
                <div key={i} className="flex justify-between gap-2 px-4 py-2">
                  <span className="truncate">{c.nome_loja}</span>
                  <span className="shrink-0 text-slate-500">{formatarWhatsapp(c.whatsapp) || "sem telefone"}</span>
                </div>
              ))}
            </Cartao>
          )}
          <Botao grande className="w-full" onClick={importar} disabled={enviando || separados.novos.length === 0}>
            {enviando ? "Importando…" : `Importar ${separados.novos.length} cliente${separados.novos.length === 1 ? "" : "s"}`}
          </Botao>
        </>
      )}
    </div>
  );
}
