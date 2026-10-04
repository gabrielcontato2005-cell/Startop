import { Abas, BotaoLink, Cartao, Etiqueta, Numero, Pagina, Secao } from "@/components/ui";
import { lerCatalogo, lerLinhas, type ProdutoCatalogo } from "@/lib/dados";
import { consultar } from "@/lib/db";
import { exigirEquipe } from "@/lib/sessao";

export const metadata = { title: "Estoque" };

export default async function Estoque({ searchParams }: PageProps<"/estoque">) {
  const u = await exigirEquipe();
  const sp = await searchParams;
  const [produtos, linhas, porPedido] = await Promise.all([
    lerCatalogo(),
    lerLinhas(),
    // caixas presas a pedidos, por etapa: o físico só baixa na entrega, então o que saiu para entrega ainda conta no físico
    consultar<{ produto_id: string; a_separar: number; separado: number; em_rota: number }>(
      `select i.produto_id,
              coalesce(sum(i.quantidade) filter (where p.status = 'confirmado'), 0)::int as a_separar,
              coalesce(sum(i.quantidade) filter (where p.status in ('separado', 'aguardando_retirada')), 0)::int as separado,
              coalesce(sum(i.quantidade) filter (where p.status = 'saiu_para_entrega'), 0)::int as em_rota
         from itens_pedido i join pedidos p on p.id = i.pedido_id
        where p.status in ('confirmado', 'separado', 'aguardando_retirada', 'saiu_para_entrega')
        group by i.produto_id`,
    ),
  ]);
  const etapa = new Map(porPedido.map((e) => [e.produto_id, e]));
  const de = (id: string) => etapa.get(id) ?? { a_separar: 0, separado: 0, em_rota: 0 };
  const filtro = typeof sp.linha === "string" ? sp.linha : "todas";
  const visiveis = produtos.filter((p) => (filtro === "baixo" ? p.estoque_minimo > 0 && p.disponivel <= p.estoque_minimo : filtro === "todas" || p.linha_id === filtro));

  const grupos = new Map<string, ProdutoCatalogo[]>();
  for (const p of visiveis) {
    const chave = `${p.linha} · ${p.tamanho_litros} L`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), p]);
  }
  const baixos = produtos.filter((p) => p.estoque_minimo > 0 && p.disponivel <= p.estoque_minimo).length;
  const soma = (f: (p: ProdutoCatalogo) => number) => produtos.reduce((s, p) => s + f(p), 0);
  const emRota = soma((p) => de(p.id).em_rota);
  const naCamara = soma((p) => p.fisico) - emRota;

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
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Numero rotulo="Livre para vender" valor={soma((p) => Math.max(0, p.disponivel))} destaque />
        <Numero rotulo="Na câmara fria" valor={naCamara} />
        <Numero rotulo="Separado" valor={soma((p) => de(p.id).separado)} detalhe={`${soma((p) => de(p.id).a_separar)} a separar`} />
        <Numero rotulo="Saiu p/ entrega" valor={emRota} detalhe="ainda não entregue" />
      </div>
      {baixos > 0 && <p className="mb-3 text-sm font-semibold text-red-700">{baixos} abaixo do mínimo</p>}
      <Abas
        ativo={filtro}
        itens={[
          { valor: "todas", rotulo: "Tudo", href: "/estoque" },
          { valor: "baixo", rotulo: `Baixo (${baixos})`, href: "/estoque?linha=baixo" },
          ...linhas.map((l) => ({ valor: l.id, rotulo: l.nome, href: `/estoque?linha=${l.id}` })),
        ]}
      />
      <p className="mb-3 text-xs text-slate-500">
        Câm. = na câmara fria · A sep. = pedido confirmado, falta separar · Sep. = separado ou esperando retirada · Rota = saiu para
        entrega e ainda não foi entregue · Livre = o que dá para vender.
      </p>
      {[...grupos].map(([titulo, lista]) => (
        <Secao key={titulo} titulo={titulo}>
          <Cartao className="p-0">
            <div className="grid grid-cols-[1fr_repeat(5,2.25rem)] gap-x-2 border-b border-slate-100 px-3 py-2 text-[11px] font-medium uppercase leading-tight text-slate-500">
              <span>Sabor</span>
              <span className="text-right">Câm.</span>
              <span className="text-right">A sep.</span>
              <span className="text-right">Sep.</span>
              <span className="text-right">Rota</span>
              <span className="text-right">Livre</span>
            </div>
            {lista.map((p) => {
              const baixo = p.estoque_minimo > 0 && p.disponivel <= p.estoque_minimo;
              const e = de(p.id);
              const zero = (n: number) => (n === 0 ? "text-slate-300" : "text-slate-600");
              return (
                <div key={p.id} className="grid grid-cols-[1fr_repeat(5,2.25rem)] items-center gap-x-2 border-b border-slate-50 px-3 py-2 text-sm last:border-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                    {p.sabor}
                    {baixo && <Etiqueta cor="bg-red-100 text-red-700">mín. {p.estoque_minimo}</Etiqueta>}
                  </span>
                  <span className="text-right tabular-nums text-slate-600">{p.fisico - e.em_rota}</span>
                  <span className={`text-right tabular-nums ${zero(e.a_separar)}`}>{e.a_separar}</span>
                  <span className={`text-right tabular-nums ${zero(e.separado)}`}>{e.separado}</span>
                  <span className={`text-right tabular-nums ${zero(e.em_rota)}`}>{e.em_rota}</span>
                  <span className={`text-right font-bold tabular-nums ${p.disponivel <= 0 ? "text-red-700" : baixo ? "text-orange-600" : ""}`}>{p.disponivel}</span>
                </div>
              );
            })}
          </Cartao>
        </Secao>
      ))}
    </Pagina>
  );
}
