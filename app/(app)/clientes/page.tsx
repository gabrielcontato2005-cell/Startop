import Link from "next/link";
import { Abas, BotaoLink, Cartao, Etiqueta, Pagina, Vazio, classeCampo } from "@/components/ui";
import { consultar } from "@/lib/db";
import { formatarReais } from "@/lib/regras/dinheiro";
import { formatarData } from "@/lib/regras/horario";
import { formatarWhatsapp } from "@/lib/regras/telefone";
import { exigirEquipe } from "@/lib/sessao";

export const metadata = { title: "Clientes" };

type Linha = {
  id: string;
  nome_loja: string;
  responsavel: string | null;
  whatsapp: string | null;
  bairro: string | null;
  cidade: string | null;
  ativo: boolean;
  pedidos: number;
  ultimo_pedido: string | null;
  dias_sem_comprar: number | null;
  faturado_centavos: number;
  lucro_centavos: number;
  sumido: boolean;
  a_receber_centavos: number;
};

const FILTROS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "sumidos", rotulo: "Sumidos" },
  { valor: "devendo", rotulo: "A receber" },
  { valor: "inativos", rotulo: "Inativos" },
];

export default async function Clientes({ searchParams }: PageProps<"/clientes">) {
  const u = await exigirEquipe();
  const sp = await searchParams;
  const busca = typeof sp.q === "string" ? sp.q.trim() : "";
  const filtro = typeof sp.filtro === "string" && FILTROS.some((f) => f.valor === sp.filtro) ? sp.filtro : "ativos";
  const digitos = busca.replace(/\D/g, "");

  const clientes = await consultar<Linha>(
    `select c.id, c.nome_loja, c.responsavel, c.whatsapp, c.bairro, c.cidade, c.ativo,
            m.pedidos, m.ultimo_pedido, m.dias_sem_comprar, m.faturado_centavos, m.lucro_centavos, m.sumido,
            coalesce(r.a_receber, 0) as a_receber_centavos
       from clientes c
       join v_cliente_metricas m on m.cliente_id = c.id
       left join (select cliente_id, sum(total_centavos - pago_centavos) as a_receber
                    from v_vendas where status_pagamento <> 'pago' group by cliente_id) r on r.cliente_id = c.id
      where ($1 = '' or c.nome_loja ilike '%' || $1 || '%' or c.responsavel ilike '%' || $1 || '%'
             or c.bairro ilike '%' || $1 || '%' or ($2 <> '' and c.whatsapp like '%' || $2 || '%'))
        and case $3
              when 'ativos' then c.ativo
              when 'inativos' then not c.ativo
              when 'sumidos' then c.ativo and m.sumido
              when 'devendo' then coalesce(r.a_receber, 0) > 0
            end
      order by case when $3 = 'sumidos' then m.dias_sem_comprar end desc nulls last,
               case when $3 = 'devendo' then r.a_receber end desc nulls last,
               lower(c.nome_loja)
      limit 300`,
    [busca, digitos, filtro],
  );

  const dono = u.perfil === "dono";
  const href = (f: string) => `/clientes?filtro=${f}${busca ? `&q=${encodeURIComponent(busca)}` : ""}`;

  return (
    <Pagina titulo="Clientes" acao={<BotaoLink href="/clientes/novo">+ Novo</BotaoLink>}>
      <form className="mb-3">
        <input type="hidden" name="filtro" value={filtro} />
        <input name="q" defaultValue={busca} placeholder="Buscar por nome, bairro ou telefone" className={classeCampo} type="search" />
      </form>
      <Abas ativo={filtro} itens={FILTROS.map((f) => ({ ...f, href: href(f.valor) }))} />
      {clientes.length === 0 ? (
        <Vazio>
          Nenhum cliente aqui.{" "}
          {dono && filtro === "ativos" && !busca && (
            <Link href="/clientes/importar" className="font-medium text-roxo underline">
              Importar da planilha ou do celular
            </Link>
          )}
        </Vazio>
      ) : (
        <Cartao className="divide-y divide-slate-100 p-0">
          {clientes.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`} className="block px-4 py-3 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.nome_loja}</div>
                  <div className="truncate text-sm text-slate-500">
                    {[c.responsavel, formatarWhatsapp(c.whatsapp), c.bairro].filter(Boolean).join(" · ") || "Sem contato"}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  {filtro === "devendo" ? (
                    <div className="font-semibold text-orange-700">{formatarReais(c.a_receber_centavos)}</div>
                  ) : (
                    <div className="font-semibold tabular-nums">{formatarReais(c.faturado_centavos)}</div>
                  )}
                  {dono && filtro !== "devendo" && <div className="text-xs text-green-700">lucro {formatarReais(c.lucro_centavos)}</div>}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {c.ultimo_pedido ? <span>Último pedido {formatarData(c.ultimo_pedido)} ({c.dias_sem_comprar} dias)</span> : <span>Nunca comprou</span>}
                {c.sumido && <Etiqueta cor="bg-red-100 text-red-700">Sumido</Etiqueta>}
                {!c.ativo && <Etiqueta cor="bg-slate-200 text-slate-600">Inativo</Etiqueta>}
              </div>
            </Link>
          ))}
        </Cartao>
      )}
    </Pagina>
  );
}
