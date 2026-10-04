import Link from "next/link";
import { Cartao, Pagina, Secao, Vazio } from "@/components/ui";
import { NOME_CLIENTE_SQL } from "@/lib/dados";
import { consultar } from "@/lib/db";
import { formatarData, hojeSP, somarDias } from "@/lib/regras/horario";
import { exigirUsuario } from "@/lib/sessao";
import { BotaoAvancar } from "../pedidos/botoes-status";

export const metadata = { title: "Separação do dia" };

export default async function Separacao({ searchParams }: PageProps<"/separacao">) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hojeSP();

  const [soma, pedidos] = await Promise.all([
    consultar<{ linha: string; produto: string; caixas: number; disponivel_fisico: number }>(
      `select vp.linha, vp.sabor || ' ' || vp.tamanho_litros || ' L' as produto, sum(i.quantidade) as caixas, e.fisico as disponivel_fisico
         from itens_pedido i join pedidos p on p.id = i.pedido_id join v_produtos vp on vp.id = i.produto_id
         join estoque e on e.produto_id = i.produto_id
        where p.data_agendada = $1 and p.status = 'confirmado'
        group by vp.linha, vp.linha_ordem, vp.sabor, vp.tamanho_litros, e.fisico
        order by vp.linha_ordem, vp.tamanho_litros desc, vp.sabor`,
      [data],
    ),
    consultar<{ id: string; numero: number; nome_loja: string; tipo: string; hora: string | null; itens: string }>(
      `select p.id, p.numero, ${NOME_CLIENTE_SQL} as nome_loja, p.tipo, to_char(p.hora_agendada, 'HH24:MI') as hora,
              string_agg(i.quantidade || '× ' || vp.sabor || ' ' || vp.tamanho_litros || 'L', ', ' order by vp.linha_ordem, vp.sabor) as itens
         from pedidos p join clientes c on c.id = p.cliente_id
         join itens_pedido i on i.pedido_id = p.id join v_produtos vp on vp.id = i.produto_id
        where p.data_agendada = $1 and p.status = 'confirmado'
        group by p.id, c.id order by p.hora_agendada nulls last, p.numero`,
      [data],
    ),
  ]);
  const total = soma.reduce((s, x) => s + x.caixas, 0);
  const porLinha = new Map<string, typeof soma>();
  soma.forEach((x) => porLinha.set(x.linha, [...(porLinha.get(x.linha) ?? []), x]));

  return (
    <Pagina titulo="Separação do dia" voltar="/mais">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/separacao?data=${somarDias(data, -1)}`} className="rounded-xl bg-white px-4 py-2 ring-1 ring-slate-200">‹</Link>
        <span className="font-semibold">{formatarData(data)}</span>
        <Link href={`/separacao?data=${somarDias(data, 1)}`} className="rounded-xl bg-white px-4 py-2 ring-1 ring-slate-200">›</Link>
      </div>
      {soma.length === 0 ? (
        <Vazio>Nada para separar neste dia.</Vazio>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            <b>{total} caixas</b> em {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"} confirmado{pedidos.length === 1 ? "" : "s"}.
          </p>
          {[...porLinha].map(([linha, lista]) => (
            <Secao key={linha} titulo={linha}>
              <Cartao className="divide-y divide-slate-100 p-0">
                {lista.map((x) => (
                  <div key={x.produto} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-lg">{x.produto}</span>
                    <span className="flex items-center gap-3">
                      {x.disponivel_fisico < x.caixas && <span className="text-xs font-semibold text-red-700">só tem {x.disponivel_fisico}</span>}
                      <span className="min-w-12 rounded-lg bg-roxo px-3 py-1 text-center text-xl font-bold text-white tabular-nums">{x.caixas}</span>
                    </span>
                  </div>
                ))}
              </Cartao>
            </Secao>
          ))}
          <Secao titulo="Por pedido">
            <div className="space-y-3">
              {pedidos.map((p) => (
                <Cartao key={p.id}>
                  <Link href={`/pedidos/${p.id}`} className="block">
                    <div className="font-semibold">nº {p.numero} · {p.nome_loja}</div>
                    <div className="text-sm text-slate-500">{p.tipo === "entrega" ? "Entrega" : "Retirada"}{p.hora ? ` às ${p.hora}` : ""}</div>
                    <div className="mt-1 text-sm">{p.itens}</div>
                  </Link>
                  {u.perfil !== "entregador" && (
                    <div className="mt-2">
                      <BotaoAvancar id={p.id} status="separado" rotulo="Marcar separado ✓" />
                    </div>
                  )}
                </Cartao>
              ))}
            </div>
          </Secao>
        </>
      )}
    </Pagina>
  );
}
