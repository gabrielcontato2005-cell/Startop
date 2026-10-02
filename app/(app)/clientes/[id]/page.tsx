import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Cartao, Etiqueta, Numero, Pagina, Secao, Vazio } from "@/components/ui";
import { PAGAMENTO, STATUS, ehUuid, lerConfig } from "@/lib/dados";
import { consultar, consultarUm } from "@/lib/db";
import { formatarReais } from "@/lib/regras/dinheiro";
import { pedidoMinimo } from "@/lib/regras/entrega";
import { formatarData } from "@/lib/regras/horario";
import { formatarWhatsapp, linkWhatsapp } from "@/lib/regras/telefone";
import { exigirEquipe } from "@/lib/sessao";
import { marcarLojaPropria } from "../acoes";

export const metadata = { title: "Cliente" };

export default async function FichaCliente({ params }: PageProps<"/clientes/[id]">) {
  const u = await exigirEquipe();
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const dono = u.perfil === "dono";

  const [c, m, sabores, pedidos, cfg, aReceber] = await Promise.all([
    consultarUm<{
      nome_loja: string; responsavel: string | null; whatsapp: string | null; cep: string | null; logradouro: string | null;
      numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null;
      distancia_km: number | null; pedido_minimo_manual: number | null; observacoes: string | null; ativo: boolean; criado_em: string;
      loja_propria: boolean;
    }>(`select * from clientes where id = $1`, [id]),
    consultarUm<{
      pedidos: number; ultimo_pedido: string | null; frequencia_dias: number | null; ticket_medio_centavos: number | null;
      faturado_centavos: number; lucro_centavos: number; caixas: number; dias_sem_comprar: number | null; sumido: boolean;
    }>(`select * from v_cliente_metricas where cliente_id = $1`, [id]),
    consultar<{ produto: string; caixas: number }>(
      `select vp.sabor || ' ' || vp.tamanho_litros || ' L' as produto, sum(i.quantidade) as caixas
         from itens_pedido i join v_vendas v on v.id = i.pedido_id join v_produtos vp on vp.id = i.produto_id
        where v.cliente_id = $1 group by 1 order by 2 desc limit 6`,
      [id],
    ),
    consultar<{ id: string; numero: number; data_agendada: string; status: string; status_pagamento: string; total_caixas: number; total_centavos: number; lucro_centavos: number }>(
      `select id, numero, data_agendada, status, status_pagamento, total_caixas, total_centavos, lucro_centavos
         from pedidos where cliente_id = $1 order by data_agendada desc, numero desc limit 50`,
      [id],
    ),
    lerConfig(),
    consultarUm<{ valor: number }>(
      `select coalesce(sum(total_centavos - pago_centavos), 0) as valor from v_vendas where cliente_id = $1 and status_pagamento <> 'pago'`,
      [id],
    ),
  ]);
  if (!c || !m) notFound();

  const minimo = c.pedido_minimo_manual ?? pedidoMinimo(c.distancia_km, cfg);
  const endereco = [
    [c.logradouro, c.numero].filter(Boolean).join(", "),
    c.complemento,
    c.bairro,
    [c.cidade, c.uf].filter(Boolean).join("/"),
  ].filter(Boolean).join(" · ");
  const msg = m.sumido
    ? `Oi${c.responsavel ? `, ${c.responsavel}` : ""}! Aqui é da StarTop. Faz ${m.dias_sem_comprar} dias do seu último pedido. Bora repor o açaí? Me fala os sabores que eu já separo.`
    : `Oi${c.responsavel ? `, ${c.responsavel}` : ""}! Aqui é da StarTop.`;

  return (
    <Pagina titulo={c.nome_loja} voltar="/clientes" acao={<BotaoLink href={`/clientes/${id}/editar`} estilo="secundario">Editar</BotaoLink>}>
      <div className="mb-4 flex flex-wrap gap-2">
        {m.sumido && <Etiqueta cor="bg-red-100 text-red-700">Sumido há {m.dias_sem_comprar} dias</Etiqueta>}
        {!c.ativo && <Etiqueta cor="bg-slate-200 text-slate-600">Inativo</Etiqueta>}
        {c.loja_propria && <Etiqueta cor="bg-roxo/15 text-roxo">Loja própria · preço de custo</Etiqueta>}
        {aReceber && aReceber.valor > 0 && <Etiqueta cor="bg-orange-100 text-orange-800">A receber {formatarReais(aReceber.valor)}</Etiqueta>}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <BotaoLink href={`/pedidos/novo?cliente=${id}`} grande estilo="destaque">
          Novo pedido
        </BotaoLink>
        <a
          href={linkWhatsapp(c.whatsapp, msg)}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex min-h-14 items-center justify-center rounded-xl bg-[#25D366] px-4 text-lg font-semibold text-white ${c.whatsapp ? "" : "pointer-events-none opacity-40"}`}
        >
          WhatsApp
        </a>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Numero rotulo="Faturado" valor={formatarReais(m.faturado_centavos)} detalhe={`${m.pedidos} pedidos · ${m.caixas} caixas`} />
        {dono ? (
          <Numero rotulo="Lucro" valor={formatarReais(m.lucro_centavos)} destaque
            detalhe={m.faturado_centavos > 0 ? `margem ${((100 * m.lucro_centavos) / m.faturado_centavos).toFixed(1).replace(".", ",")}%` : undefined} />
        ) : (
          <Numero rotulo="Caixas" valor={m.caixas} />
        )}
        <Numero rotulo="Ticket médio" valor={m.ticket_medio_centavos ? formatarReais(m.ticket_medio_centavos) : "—"} />
        <Numero
          rotulo="Compra a cada"
          valor={m.frequencia_dias != null ? `${Math.round(m.frequencia_dias)} dias` : "—"}
          detalhe={m.ultimo_pedido ? `último em ${formatarData(m.ultimo_pedido)}` : "ainda não comprou"}
        />
      </div>

      {sabores.length > 0 && (
        <Secao titulo="Sabores que mais compra">
          <Cartao className="flex flex-wrap gap-2">
            {sabores.map((s) => (
              <span key={s.produto} className="rounded-full bg-roxo/10 px-3 py-1 text-sm font-medium text-roxo-escuro">
                {s.produto} <span className="text-roxo">· {s.caixas}</span>
              </span>
            ))}
          </Cartao>
        </Secao>
      )}

      <Secao titulo="Dados">
        <Cartao className="space-y-1 text-sm">
          {c.responsavel && <div>Responsável: {c.responsavel}</div>}
          {c.whatsapp && <div>WhatsApp: {formatarWhatsapp(c.whatsapp)}</div>}
          {endereco && <div>{endereco}{c.cep ? ` · CEP ${c.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}` : ""}</div>}
          <div>
            Distância: {c.distancia_km != null ? `${String(c.distancia_km).replace(".", ",")} km` : "não informada"}
            {minimo != null && ` · mínimo para entrega: ${minimo} caixa${minimo > 1 ? "s" : ""}`}
            {c.pedido_minimo_manual != null && " (combinado)"}
          </div>
          {c.observacoes && <div className="whitespace-pre-line text-slate-600">{c.observacoes}</div>}
          <div className="text-slate-400">Cliente desde {formatarData(c.criado_em.slice(0, 10))}</div>
        </Cartao>
      </Secao>

      <Secao titulo="Histórico de pedidos">
        {pedidos.length === 0 ? (
          <Vazio>Nenhum pedido ainda.</Vazio>
        ) : (
          <Cartao className="divide-y divide-slate-100 p-0">
            {pedidos.map((p) => (
              <Link key={p.id} href={`/pedidos/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-3 active:bg-slate-50">
                <div>
                  <div className="font-medium">{formatarData(p.data_agendada)} <span className="text-sm font-normal text-slate-400">nº {p.numero}</span></div>
                  <div className="mt-0.5 flex gap-1">
                    <Etiqueta cor={STATUS[p.status].cor}>{STATUS[p.status].nome}</Etiqueta>
                    {p.status !== "cancelado" && <Etiqueta cor={PAGAMENTO[p.status_pagamento].cor}>{PAGAMENTO[p.status_pagamento].nome}</Etiqueta>}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold tabular-nums">{formatarReais(p.total_centavos)}</div>
                  <div className="text-slate-500">{p.total_caixas} cx</div>
                  {dono && p.status !== "novo" && p.status !== "cancelado" && <div className="text-xs text-green-700">lucro {formatarReais(p.lucro_centavos)}</div>}
                </div>
              </Link>
            ))}
          </Cartao>
        )}
      </Secao>

      {dono && (
        <Secao titulo="Loja própria">
          <Cartao>
            <Formulario acao={marcarLojaPropria} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="ligar" value={c.loja_propria ? "nao" : "sim"} />
              <p className="text-sm text-slate-600">
                {c.loja_propria
                  ? "Os pedidos desta loja saem a preço de custo, sem desconto nem pedido mínimo, e ficam fora do faturamento e do lucro. Só o dono faz pedido para ela."
                  : "Para uma loja da própria StarTop: os pedidos passam a sair a preço de custo e ficam fora do faturamento e do lucro. Os pedidos já feitos não mudam."}
              </p>
              <BotaoEnviar estilo="secundario" className="w-full">
                {c.loja_propria ? "Voltar a ser cliente comum" : "Marcar como loja própria"}
              </BotaoEnviar>
            </Formulario>
          </Cartao>
        </Secao>
      )}
    </Pagina>
  );
}
