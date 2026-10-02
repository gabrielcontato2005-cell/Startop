import Link from "next/link";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Etiqueta, Pagina, Secao, Selecao } from "@/components/ui";
import { lerCatalogoComCusto, lerLinhas, type ProdutoComCusto } from "@/lib/dados";
import { formatarReais } from "@/lib/regras/dinheiro";
import { exigirDono } from "@/lib/sessao";
import { novoSabor, precoDaLinha } from "./acoes";

export const metadata = { title: "Produtos e preços" };

const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export default async function Produtos() {
  await exigirDono();
  const [produtos, linhas] = await Promise.all([lerCatalogoComCusto(), lerLinhas()]);

  const grupos = new Map<string, ProdutoComCusto[]>();
  for (const p of produtos) {
    const chave = `${p.linha_id}|${p.tamanho_litros}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), p]);
  }

  return (
    <Pagina titulo="Produtos e preços" voltar="/mais" acao={<BotaoLink href="/produtos/descontos" estilo="secundario">Descontos</BotaoLink>}>
      {[...grupos].map(([chave, lista]) => {
        const [linhaId, tamanho] = chave.split("|");
        const ref = lista[0];
        return (
          <Secao key={chave} titulo={`${ref.linha} · ${tamanho} L`}>
            <Cartao className="divide-y divide-slate-100 p-0">
              {lista.map((p) => (
                <Link key={p.id} href={`/produtos/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 active:bg-slate-50">
                  <span className={p.ativo ? "" : "text-slate-400 line-through"}>{p.sabor}</span>
                  <span className="text-right text-sm tabular-nums">
                    <span className="font-semibold">{formatarReais(p.preco_centavos)}</span>
                    <span className="ml-2 text-slate-500">custo {formatarReais(p.custo_unitario_centavos)}</span>
                    <span className={`ml-2 font-medium ${p.margem_centavos > 0 ? "text-green-700" : "text-red-700"}`}>
                      +{formatarReais(p.margem_centavos)} ({String(p.margem_pct ?? 0).replace(".", ",")}%)
                    </span>
                  </span>
                </Link>
              ))}
              <details className="px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-roxo">Mudar preço de todos os {ref.linha.toLowerCase()} {tamanho} L</summary>
                <Formulario acao={precoDaLinha} className="mt-3 space-y-3">
                  <input type="hidden" name="linha_id" value={linhaId} />
                  <input type="hidden" name="tamanho" value={tamanho} />
                  <div className="grid grid-cols-2 gap-3">
                    <Campo rotulo="Novo preço (R$)" name="preco" inputMode="decimal" defaultValue={reais(ref.preco_centavos)} required />
                    <Campo rotulo="Novo custo (R$)" name="custo_medio" inputMode="decimal" placeholder="manter" dica="Vazio mantém o custo de cada um" />
                  </div>
                  <BotaoEnviar className="w-full">Aplicar em {lista.length} sabores</BotaoEnviar>
                </Formulario>
              </details>
            </Cartao>
          </Secao>
        );
      })}

      <Secao titulo="Novo sabor">
        <Cartao>
          <Formulario acao={novoSabor}>
            <Selecao rotulo="Linha" name="linha_id" required>
              {linhas.map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </Selecao>
            <Campo rotulo="Nome do sabor" name="nome" required />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="tamanho" value="5" className="h-5 w-5" /> 5 L</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="tamanho" value="10" defaultChecked className="h-5 w-5" /> 10 L</label>
            </div>
            <BotaoEnviar className="w-full">Criar sabor</BotaoEnviar>
          </Formulario>
        </Cartao>
      </Secao>
      <p className="text-center text-xs text-slate-500">
        <Etiqueta cor="bg-slate-100 text-slate-600">Custo</Etiqueta> = custo da fábrica (média dos lotes) + embalagem e outros.
      </p>
    </Pagina>
  );
}
