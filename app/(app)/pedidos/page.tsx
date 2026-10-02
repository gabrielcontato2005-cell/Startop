import Link from "next/link";
import { Abas, Cartao, Etiqueta, Pagina, Vazio } from "@/components/ui";
import { PAGAMENTO, ROTULO_AVANCAR, STATUS, proximoStatus } from "@/lib/dados";
import { consultar } from "@/lib/db";
import { formatarReais } from "@/lib/regras/dinheiro";
import { formatarData, hojeSP, somarDias } from "@/lib/regras/horario";
import { exigirUsuario } from "@/lib/sessao";
import { BotaoAvancar } from "./botoes-status";

export const metadata = { title: "Pedidos" };

const FILTROS = [
  { valor: "abertos", rotulo: "Em aberto" },
  { valor: "todos", rotulo: "Todos" },
  { valor: "entregues", rotulo: "Entregues" },
  { valor: "a_receber", rotulo: "A receber" },
  { valor: "cancelados", rotulo: "Cancelados" },
];

export default async function Pedidos({ searchParams }: PageProps<"/pedidos">) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const hoje = hojeSP();
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje;
  const filtro = typeof sp.filtro === "string" && FILTROS.some((f) => f.valor === sp.filtro) ? sp.filtro : "abertos";
  // "a receber" mostra todos os dias; os outros filtros mostram o dia escolhido
  const pedidos = await consultar<{
    id: string; numero: number; nome_loja: string; bairro: string | null; tipo: string; data_agendada: string; hora_agendada: string | null;
    status: string; status_pagamento: string; total_caixas: number; total_centavos: number; pago_centavos: number;
  }>(
    `select p.id, p.numero, c.nome_loja, c.bairro, p.tipo, p.data_agendada, to_char(p.hora_agendada, 'HH24:MI') as hora_agendada,
            p.status, p.status_pagamento, p.total_caixas, p.total_centavos, p.pago_centavos
       from pedidos p join clientes c on c.id = p.cliente_id
      where case $2
              when 'a_receber' then p.status not in ('novo', 'cancelado') and p.status_pagamento <> 'pago'
              else p.data_agendada = $1 and case $2
                when 'abertos' then p.status not in ('entregue', 'cancelado')
                when 'entregues' then p.status = 'entregue'
                when 'cancelados' then p.status = 'cancelado'
                else true end
            end
      order by case when $2 = 'a_receber' then p.data_agendada end, p.hora_agendada nulls last, p.numero
      limit 300`,
    [data, filtro],
  );

  const qs = (d: string, f = filtro) => `/pedidos?data=${d}&filtro=${f}`;
  const total = pedidos.filter((p) => p.status !== "cancelado").reduce((s, p) => s + (filtro === "a_receber" ? p.total_centavos - p.pago_centavos : p.total_centavos), 0);

  return (
    <Pagina titulo="Pedidos">
      {filtro !== "a_receber" && (
        <div className="mb-3 flex items-center gap-2">
          <Link href={qs(somarDias(data, -1))} className="rounded-xl bg-white px-4 py-2.5 text-lg ring-1 ring-slate-200" aria-label="Dia anterior">‹</Link>
          <form className="flex-1">
            <input type="hidden" name="filtro" value={filtro} />
            <input type="date" name="data" defaultValue={data} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-center font-semibold" />
          </form>
          <Link href={qs(somarDias(data, 1))} className="rounded-xl bg-white px-4 py-2.5 text-lg ring-1 ring-slate-200" aria-label="Próximo dia">›</Link>
        </div>
      )}
      {data !== hoje && filtro !== "a_receber" && (
        <Link href={qs(hoje)} className="mb-3 block text-center text-sm font-medium text-roxo">Voltar para hoje</Link>
      )}
      <Abas ativo={filtro} itens={FILTROS.map((f) => ({ ...f, href: qs(data, f.valor) }))} />
      <p className="mb-3 text-sm text-slate-600">
        {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"} · {filtro === "a_receber" ? "a receber " : ""}
        <b>{formatarReais(total)}</b>
      </p>
      {pedidos.length === 0 ? (
        <Vazio>Nenhum pedido {filtro === "a_receber" ? "a receber" : `em ${formatarData(data)}`}.</Vazio>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const prox = proximoStatus(p.status, p.tipo);
            const pode = prox && (u.perfil !== "entregador" || ["saiu_para_entrega", "entregue"].includes(prox));
            return (
              <Cartao key={p.id} className="p-0">
                <Link href={`/pedidos/${p.id}`} className="block px-4 pt-3 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{p.nome_loja}</div>
                      <div className="text-sm text-slate-500">
                        nº {p.numero} · {p.tipo === "entrega" ? "Entrega" : "Retirada"}
                        {filtro === "a_receber" ? ` · ${formatarData(p.data_agendada)}` : p.hora_agendada ? ` · ${p.hora_agendada}` : ""}
                        {p.bairro ? ` · ${p.bairro}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold tabular-nums">{formatarReais(p.total_centavos)}</div>
                      <div className="text-sm text-slate-500">{p.total_caixas} cx</div>
                    </div>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Etiqueta cor={STATUS[p.status].cor}>{STATUS[p.status].nome}</Etiqueta>
                    {p.status !== "cancelado" && <Etiqueta cor={PAGAMENTO[p.status_pagamento].cor}>{PAGAMENTO[p.status_pagamento].nome}</Etiqueta>}
                  </div>
                </Link>
                {pode && filtro !== "a_receber" && (
                  <div className="border-t border-slate-100 px-4 py-2">
                    <BotaoAvancar id={p.id} status={prox!} rotulo={`${ROTULO_AVANCAR[prox!]} →`} />
                  </div>
                )}
              </Cartao>
            );
          })}
        </div>
      )}
    </Pagina>
  );
}
