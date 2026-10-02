import Link from "next/link";
import { Abas, Cartao, Pagina, Vazio } from "@/components/ui";
import { ehUuid, lerCatalogo } from "@/lib/dados";
import { consultar } from "@/lib/db";
import { formatarDataHora } from "@/lib/regras/horario";
import { exigirDono } from "@/lib/sessao";

export const metadata = { title: "Movimentações" };

const TIPOS: Record<string, string> = {
  entrada_lote: "Entrada de lote",
  reserva: "Reserva",
  liberacao_reserva: "Reserva liberada",
  saida_pedido: "Saída por pedido",
  devolucao: "Devolução",
  ajuste: "Ajuste",
  perda: "Perda",
};

export default async function Movimentacoes({ searchParams }: PageProps<"/estoque/movimentacoes">) {
  await exigirDono();
  const sp = await searchParams;
  const tipo = typeof sp.tipo === "string" && sp.tipo in TIPOS ? sp.tipo : "";
  const produto = typeof sp.produto === "string" && ehUuid(sp.produto) ? sp.produto : "";
  const [movs, produtos] = await Promise.all([
    consultar<{ id: number; tipo: string; delta_fisico: number; delta_reservado: number; motivo: string | null; criado_em: string; produto: string; usuario: string | null; pedido_id: string | null; numero: number | null }>(
      `select m.id, m.tipo, m.delta_fisico, m.delta_reservado, m.motivo, m.criado_em,
              vp.sabor || ' ' || vp.tamanho_litros || ' L' as produto, u.nome as usuario, m.pedido_id, p.numero
         from movimentacoes_estoque m
         join v_produtos vp on vp.id = m.produto_id
         left join usuarios u on u.id = m.usuario_id
         left join pedidos p on p.id = m.pedido_id
        where ($1 = '' or m.tipo = $1) and ($2 = '' or m.produto_id::text = $2)
        order by m.id desc limit 300`,
      [tipo, produto],
    ),
    lerCatalogo(false),
  ]);
  const qs = (t: string) => `/estoque/movimentacoes?tipo=${t}${produto ? `&produto=${produto}` : ""}`;
  return (
    <Pagina titulo="Movimentações" voltar="/estoque">
      <form className="mb-3">
        <input type="hidden" name="tipo" value={tipo} />
        <select name="produto" defaultValue={produto} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" aria-label="Produto">
          <option value="">Todos os produtos</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>{p.linha} · {p.sabor} {p.tamanho_litros} L</option>
          ))}
        </select>
        <button className="mt-2 text-sm font-medium text-roxo">Filtrar</button>
      </form>
      <Abas ativo={tipo} itens={[{ valor: "", rotulo: "Tudo", href: qs("") }, ...Object.entries(TIPOS).map(([v, r]) => ({ valor: v, rotulo: r, href: qs(v) }))]} />
      {movs.length === 0 ? (
        <Vazio>Nenhuma movimentação.</Vazio>
      ) : (
        <Cartao className="divide-y divide-slate-100 p-0 text-sm">
          {movs.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-2 px-4 py-2">
              <div className="min-w-0">
                <div className="font-medium">{m.produto}</div>
                <div className="text-xs text-slate-500">
                  {TIPOS[m.tipo]} · {formatarDataHora(m.criado_em)}
                  {m.usuario && ` · ${m.usuario}`}
                  {m.pedido_id && (
                    <> · <Link className="text-roxo underline" href={`/pedidos/${m.pedido_id}`}>pedido {m.numero}</Link></>
                  )}
                  {m.motivo && ` · ${m.motivo}`}
                </div>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                {m.delta_fisico !== 0 && <div className={m.delta_fisico > 0 ? "text-green-700" : "text-red-700"}>{m.delta_fisico > 0 ? "+" : ""}{m.delta_fisico} físico</div>}
                {m.delta_reservado !== 0 && <div className="text-slate-500">{m.delta_reservado > 0 ? "+" : ""}{m.delta_reservado} reserv.</div>}
              </div>
            </div>
          ))}
        </Cartao>
      )}
    </Pagina>
  );
}
