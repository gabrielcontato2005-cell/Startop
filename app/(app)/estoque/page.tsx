import { Abas, BotaoLink, Cartao, Numero, Pagina, Secao } from "@/components/ui";
import { lerCatalogo, lerLinhas, type ProdutoCatalogo } from "@/lib/dados";
import { grupoDoProduto } from "@/lib/regras/produto";
import { exigirEquipe } from "@/lib/sessao";

export const metadata = { title: "Estoque" };

export default async function Estoque({ searchParams }: PageProps<"/estoque">) {
  const u = await exigirEquipe();
  const sp = await searchParams;
  const [produtos, linhas] = await Promise.all([lerCatalogo(), lerLinhas()]);
  const filtro = typeof sp.linha === "string" ? sp.linha : "todas";
  const visiveis = produtos.filter((p) => filtro === "todas" || p.linha_id === filtro);

  const grupos = new Map<string, ProdutoCatalogo[]>();
  for (const p of visiveis) {
    const chave = grupoDoProduto(p);
    grupos.set(chave, [...(grupos.get(chave) ?? []), p]);
  }
  // estoque é um número só: o disponível para venda. A venda confirmada já tira daqui; chegada de mercadoria soma.
  // O total de cima é de caixas de açaí e sorvete; leite em pó, colheres etc. ficam só na lista.
  const totalCaixas = produtos.filter((p) => p.categoria !== "outros").reduce((s, p) => s + Math.max(0, p.disponivel), 0);

  return (
    <Pagina titulo="Estoque" voltar="/mais">
      {u.perfil === "dono" && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <BotaoLink href="/estoque/lote" estilo="destaque">Chegou mercadoria</BotaoLink>
          <BotaoLink href="/estoque/contagem" estilo="secundario">Contagem</BotaoLink>
          <BotaoLink href="/estoque/ajuste" estilo="secundario">Ajuste / perda</BotaoLink>
          <BotaoLink href="/estoque/movimentacoes" estilo="secundario">Movimentações</BotaoLink>
        </div>
      )}
      <div className="mb-3">
        <Numero rotulo="Disponível para venda" valor={totalCaixas} detalhe="caixas de açaí e sorvete" destaque />
      </div>
      <Abas
        ativo={filtro}
        itens={[
          { valor: "todas", rotulo: "Tudo", href: "/estoque" },
          ...linhas.map((l) => ({ valor: l.id, rotulo: l.nome, href: `/estoque?linha=${l.id}` })),
        ]}
      />
      <p className="mb-3 text-xs text-slate-500">Em vermelho: 2 ou menos.</p>
      {[...grupos].map(([titulo, lista]) => (
        <Secao key={titulo} titulo={titulo}>
          <Cartao className="divide-y divide-slate-50 p-0">
            {lista.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0">{p.sabor}</span>
                <span className={`text-lg font-bold tabular-nums ${p.disponivel <= 2 ? "text-red-700" : ""}`}>{p.disponivel}</span>
              </div>
            ))}
          </Cartao>
        </Secao>
      ))}
    </Pagina>
  );
}
