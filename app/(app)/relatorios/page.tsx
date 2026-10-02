import Link from "next/link";
import { Abas, Cartao, Numero, Pagina, Secao, Vazio, classeCampo } from "@/components/ui";
import { formatarReais } from "@/lib/regras/dinheiro";
import { formatarData } from "@/lib/regras/horario";
import { lerPeriodo, rankingClientes, rankingSabores, resumoPeriodo, vendasPorDia } from "@/lib/relatorios";
import { exigirDono } from "@/lib/sessao";

export const metadata = { title: "Relatórios" };

const pct = (parte: number, todo: number) => (todo > 0 ? `${((100 * parte) / todo).toFixed(1).replace(".", ",")}%` : "—");

export default async function Relatorios({ searchParams }: PageProps<"/relatorios">) {
  await exigirDono();
  const sp = await searchParams;
  const p = lerPeriodo(sp);
  const ordem = sp.ordem === "lucro" ? "lucro" : "faturamento";
  const [r, dias, clientes, sabores] = await Promise.all([resumoPeriodo(p), vendasPorDia(p), rankingClientes(p, 200), rankingSabores(p)]);
  const clientesOrdenados = [...clientes].sort((a, b) => b[ordem] - a[ordem]).slice(0, 20);
  const maxDia = Math.max(1, ...dias.map((d) => d.faturamento_centavos));
  const qs = `de=${p.de}&ate=${p.ate}`;

  return (
    <Pagina titulo="Relatórios" voltar="/mais">
      <Abas
        ativo={p.chave}
        itens={[
          { valor: "hoje", rotulo: "Hoje", href: "/relatorios?p=hoje" },
          { valor: "7d", rotulo: "7 dias", href: "/relatorios?p=7d" },
          { valor: "mes", rotulo: "Este mês", href: "/relatorios?p=mes" },
          { valor: "mes_passado", rotulo: "Mês passado", href: "/relatorios?p=mes_passado" },
          { valor: "30d", rotulo: "30 dias", href: "/relatorios?p=30d" },
        ]}
      />
      <form className="mb-4 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <input type="hidden" name="p" value="custom" />
        <input type="date" name="de" defaultValue={p.de} className={classeCampo} aria-label="De" />
        <input type="date" name="ate" defaultValue={p.ate} className={classeCampo} aria-label="Até" />
        <button className="min-h-11 rounded-xl bg-roxo px-3 font-semibold text-white">Ver</button>
      </form>
      <p className="mb-3 text-sm text-slate-600">{formatarData(p.de)} a {formatarData(p.ate)}</p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Numero rotulo="Faturamento" valor={formatarReais(r!.faturamento)} detalhe={`${r!.pedidos} pedidos · ${r!.clientes} lojas`} />
        <Numero rotulo="Lucro bruto" valor={formatarReais(r!.lucro)} detalhe={`margem ${pct(r!.lucro, r!.faturamento)}`} destaque />
        <Numero rotulo="Custo" valor={formatarReais(r!.custo)} />
        <Numero rotulo="Caixas" valor={r!.caixas} detalhe={r!.pedidos ? `ticket médio ${formatarReais(Math.round(r!.faturamento / r!.pedidos))}` : undefined} />
      </div>

      <Secao titulo="Por dia" acao={<a href={`/relatorios/csv?tipo=dias&${qs}`} className="text-sm font-medium text-roxo">CSV ↓</a>}>
        {dias.length === 0 ? (
          <Vazio>Sem vendas no período.</Vazio>
        ) : (
          <Cartao className="space-y-1.5 text-sm">
            {dias.map((d) => (
              <div key={d.data} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
                <span className="text-slate-500">{formatarData(d.data).slice(0, 5)}</span>
                <span className="h-3 rounded-full bg-roxo/15">
                  <span className="block h-3 rounded-full bg-roxo" style={{ width: `${(100 * d.faturamento_centavos) / maxDia}%` }} />
                </span>
                <span className="text-right tabular-nums">
                  {formatarReais(d.faturamento_centavos)} <span className="text-green-700">+{formatarReais(d.lucro_centavos)}</span>
                </span>
              </div>
            ))}
          </Cartao>
        )}
      </Secao>

      <Secao titulo="Ranking de clientes" acao={<a href={`/relatorios/csv?tipo=clientes&${qs}`} className="text-sm font-medium text-roxo">CSV ↓</a>}>
        <Abas
          ativo={ordem}
          itens={[
            { valor: "faturamento", rotulo: "Por faturamento", href: `/relatorios?p=${p.chave}&${qs}&ordem=faturamento` },
            { valor: "lucro", rotulo: "Por lucro", href: `/relatorios?p=${p.chave}&${qs}&ordem=lucro` },
          ]}
        />
        {clientesOrdenados.length === 0 ? (
          <Vazio>Sem vendas no período.</Vazio>
        ) : (
          <Cartao className="divide-y divide-slate-100 p-0 text-sm">
            {clientesOrdenados.map((c, i) => (
              <Link key={c.cliente_id} href={`/clientes/${c.cliente_id}`} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-slate-400">{i + 1}.</span>
                  {c.nome_loja}
                  <span className="text-slate-400"> · {c.caixas} cx</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={ordem === "faturamento" ? "font-semibold" : ""}>{formatarReais(c.faturamento)}</span>
                  <span className={`ml-2 text-green-700 ${ordem === "lucro" ? "font-semibold" : ""}`}>{formatarReais(c.lucro)}</span>
                </span>
              </Link>
            ))}
          </Cartao>
        )}
      </Secao>

      <Secao titulo="Ranking de sabores" acao={<a href={`/relatorios/csv?tipo=sabores&${qs}`} className="text-sm font-medium text-roxo">CSV ↓</a>}>
        {sabores.length === 0 ? (
          <Vazio>Sem vendas no período.</Vazio>
        ) : (
          <Cartao className="divide-y divide-slate-100 p-0 text-sm">
            {sabores.map((s) => (
              <div key={`${s.linha}${s.produto}`} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 truncate">
                  {s.produto} <span className="text-xs text-slate-400">{s.linha}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <b>{s.caixas} cx</b> <span className="text-slate-500">{formatarReais(s.faturamento)}</span>{" "}
                  <span className="text-green-700">+{formatarReais(s.lucro)}</span>
                </span>
              </div>
            ))}
          </Cartao>
        )}
      </Secao>
      <p className="text-center text-xs text-slate-500">
        Conta pedidos confirmados em diante, pela data de entrega/retirada. Lucro = total cobrado − custo das caixas na hora da venda.
      </p>
    </Pagina>
  );
}
