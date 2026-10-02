import { Abas, BotaoLink, Cartao, Etiqueta, Pagina, Secao } from "@/components/ui";
import { lerCatalogo, lerLinhas, type ProdutoCatalogo } from "@/lib/dados";
import { exigirEquipe } from "@/lib/sessao";

export const metadata = { title: "Estoque" };

export default async function Estoque({ searchParams }: PageProps<"/estoque">) {
  const u = await exigirEquipe();
  const sp = await searchParams;
  const [produtos, linhas] = await Promise.all([lerCatalogo(), lerLinhas()]);
  const filtro = typeof sp.linha === "string" ? sp.linha : "todas";
  const visiveis = produtos.filter((p) => (filtro === "baixo" ? p.estoque_minimo > 0 && p.disponivel <= p.estoque_minimo : filtro === "todas" || p.linha_id === filtro));

  const grupos = new Map<string, ProdutoCatalogo[]>();
  for (const p of visiveis) {
    const chave = `${p.linha} · ${p.tamanho_litros} L`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), p]);
  }
  const baixos = produtos.filter((p) => p.estoque_minimo > 0 && p.disponivel <= p.estoque_minimo).length;
  const total = produtos.reduce((s, p) => s + p.fisico, 0);

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
      <p className="mb-3 text-sm text-slate-600">
        {total} caixas na câmara fria{baixos > 0 && <> · <b className="text-red-700">{baixos} abaixo do mínimo</b></>}
      </p>
      <Abas
        ativo={filtro}
        itens={[
          { valor: "todas", rotulo: "Tudo", href: "/estoque" },
          { valor: "baixo", rotulo: `Baixo (${baixos})`, href: "/estoque?linha=baixo" },
          ...linhas.map((l) => ({ valor: l.id, rotulo: l.nome, href: `/estoque?linha=${l.id}` })),
        ]}
      />
      {[...grupos].map(([titulo, lista]) => (
        <Secao key={titulo} titulo={titulo}>
          <Cartao className="p-0">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase text-slate-500">
              <span>Sabor</span>
              <span className="text-right">Físico</span>
              <span className="text-right">Reserv.</span>
              <span className="text-right">Livre</span>
            </div>
            {lista.map((p) => {
              const baixo = p.estoque_minimo > 0 && p.disponivel <= p.estoque_minimo;
              return (
                <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-slate-50 px-4 py-2 text-sm last:border-0">
                  <span className="flex items-center gap-2">
                    {p.sabor}
                    {baixo && <Etiqueta cor="bg-red-100 text-red-700">mín. {p.estoque_minimo}</Etiqueta>}
                  </span>
                  <span className="text-right tabular-nums text-slate-600">{p.fisico}</span>
                  <span className="text-right tabular-nums text-slate-600">{p.reservado}</span>
                  <span className={`w-10 text-right font-bold tabular-nums ${p.disponivel <= 0 ? "text-red-700" : baixo ? "text-orange-600" : ""}`}>{p.disponivel}</span>
                </div>
              );
            })}
          </Cartao>
        </Secao>
      ))}
    </Pagina>
  );
}
