import Link from "next/link";
import { notFound } from "next/navigation";
import { NOME_CLIENTE_SQL, PAGAMENTO, ehUuid, lerConfig } from "@/lib/dados";
import { consultar, consultarUm } from "@/lib/db";
import { formatarReais } from "@/lib/regras/dinheiro";
import { formatarData, formatarDataHora } from "@/lib/regras/horario";
import { nomeFormaPagamento } from "@/lib/regras/resumo";
import { formatarWhatsapp } from "@/lib/regras/telefone";
import { exigirUsuario } from "@/lib/sessao";
import Imprimir from "./imprimir";

export const metadata = { title: "Nota do pedido" };

type Pedido = {
  numero: number; nome_loja: string; responsavel: string | null; whatsapp: string | null; endereco: string | null;
  tipo: "entrega" | "retirada"; data_agendada: string; hora_agendada: string | null; status: string; status_pagamento: string;
  forma_pagamento: string; subtotal_centavos: number; desconto_centavos: number; taxa_entrega_centavos: number;
  acrescimo_cartao_centavos: number; total_centavos: number; pago_centavos: number; total_caixas: number;
  observacoes: string | null; a_preco_de_custo: boolean; avulsa: boolean; comprador_nome: string | null; criado_em: string; criado_por: string | null;
};

type Item = { descricao: string; quantidade: number; preco_unitario_centavos: number; total_centavos: number };

/**
 * Nota do pedido para imprimir, sem valor fiscal: uma via de controle (fica na fábrica, com conferência e
 * assinaturas) e uma via do cliente. "Bobina" é para impressora térmica de 80 mm; "A4" põe as duas vias lado a lado
 * numa folha comum.
 */
export default async function NotaPedido({ params, searchParams }: PageProps<"/nota/[id]">) {
  await exigirUsuario();
  const { id } = await params;
  const { papel, via } = await searchParams;
  if (!ehUuid(id)) notFound();
  const a4 = papel === "a4";
  const vias = via === "cliente" ? (["cliente"] as const) : via === "controle" ? (["controle"] as const) : (["controle", "cliente"] as const);

  const [p, itens, cfg] = await Promise.all([
    consultarUm<Pedido>(
      `select p.*, to_char(p.hora_agendada, 'HH24:MI') as hora_agendada, ${NOME_CLIENTE_SQL} as nome_loja, c.responsavel,
              coalesce(p.comprador_telefone, c.whatsapp) as whatsapp, c.consumidor_final as avulsa,
              concat_ws(', ', nullif(concat_ws(' ', c.logradouro, c.numero), ''), c.complemento, c.bairro, c.cidade) as endereco,
              uc.nome as criado_por
         from pedidos p join clientes c on c.id = p.cliente_id
         left join usuarios uc on uc.id = p.criado_por
        where p.id = $1`,
      [id],
    ),
    consultar<Item>(
      `select case when vp.linha like 'Açaí mesclado%' then 'Mesclado ' else '' end || vp.sabor || ' ' || vp.tamanho_litros || ' L' as descricao,
              i.quantidade, i.preco_unitario_centavos, i.total_centavos
         from itens_pedido i join v_produtos vp on vp.id = i.produto_id
        where i.pedido_id = $1 order by vp.linha_ordem, vp.tamanho_litros desc, vp.sabor`,
      [id],
    ),
    lerConfig(),
  ]);
  if (!p) notFound();

  const falta = Math.max(0, p.total_centavos - p.pago_centavos);
  const quando = `${formatarData(p.data_agendada)}${p.hora_agendada ? ` às ${p.hora_agendada}` : ""}`;
  const link = (mudar: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ papel, via, ...mudar }).filter((e): e is [string, string] => typeof e[1] === "string"));
    return `/nota/${id}${q.size ? `?${q}` : ""}`;
  };

  const Via = ({ tipo }: { tipo: "controle" | "cliente" }) => (
    <section className="via mx-auto w-full max-w-[76mm] break-inside-avoid font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <div className="text-[15px] font-bold">{cfg.fabrica_nome}</div>
        {cfg.fabrica_endereco && <div>{cfg.fabrica_endereco}</div>}
        {cfg.fabrica_whatsapp && <div>WhatsApp {formatarWhatsapp(cfg.fabrica_whatsapp)}</div>}
      </div>
      <div className="my-2 border-y border-dashed border-black py-1 text-center">
        <div className="text-[14px] font-bold">PEDIDO Nº {p.numero}</div>
        <div className="font-bold">{tipo === "controle" ? "VIA DE CONTROLE" : "VIA DO CLIENTE"}</div>
        <div>Documento sem valor fiscal</div>
      </div>

      <div><b>Cliente:</b> {p.avulsa ? `${p.comprador_nome ?? "Consumidor"} (venda avulsa)` : p.nome_loja}</div>
      {p.responsavel && <div><b>Responsável:</b> {p.responsavel}</div>}
      {p.whatsapp && <div><b>WhatsApp:</b> {formatarWhatsapp(p.whatsapp)}</div>}
      {p.tipo === "entrega" && p.endereco && <div><b>Endereço:</b> {p.endereco}</div>}
      <div><b>{p.tipo === "entrega" ? "Entrega" : "Retirada na fábrica"}:</b> {quando}</div>
      <div><b>Feito em:</b> {formatarDataHora(p.criado_em)}{tipo === "controle" && p.criado_por ? ` por ${p.criado_por}` : ""}</div>
      {tipo === "controle" && p.a_preco_de_custo && <div className="font-bold">LOJA PRÓPRIA · PREÇO DE CUSTO</div>}

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            {tipo === "controle" && <th className="w-5 pr-1 font-bold">✓</th>}
            <th className="pr-1 font-bold">Qtd</th>
            <th className="pr-1 font-bold">Produto</th>
            <th className="text-right font-bold">Valor</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i, n) => (
            <tr key={n} className="border-b border-dotted border-black align-top">
              {tipo === "controle" && <td className="pr-1">☐</td>}
              <td className="pr-1 font-bold">{i.quantidade}</td>
              <td className="pr-1">
                {i.descricao}
                <div className="text-[11px]">{formatarReais(i.preco_unitario_centavos)} cada</div>
              </td>
              <td className="text-right whitespace-nowrap">{formatarReais(i.quantidade * i.preco_unitario_centavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 space-y-0.5">
        <Linha rotulo={`Caixas`} valor={String(p.total_caixas)} />
        <Linha rotulo="Subtotal" valor={formatarReais(p.subtotal_centavos)} />
        {p.desconto_centavos > 0 && <Linha rotulo="Desconto" valor={`−${formatarReais(p.desconto_centavos)}`} />}
        {p.tipo === "entrega" && <Linha rotulo="Entrega" valor={formatarReais(p.taxa_entrega_centavos)} />}
        {p.acrescimo_cartao_centavos > 0 && <Linha rotulo="Acréscimo do cartão" valor={formatarReais(p.acrescimo_cartao_centavos)} />}
        <div className="flex justify-between border-t border-black pt-1 text-[14px] font-bold">
          <span>TOTAL</span>
          <span>{formatarReais(p.total_centavos)}</span>
        </div>
        <Linha rotulo="Pagamento" valor={nomeFormaPagamento(p.forma_pagamento)} />
        {p.status !== "cancelado" && <Linha rotulo="Situação" valor={PAGAMENTO[p.status_pagamento]?.nome ?? p.status_pagamento} />}
        {p.pago_centavos > 0 && falta > 0 && <Linha rotulo="Já pago" valor={formatarReais(p.pago_centavos)} />}
        {falta > 0 && p.status !== "cancelado" && <Linha rotulo="A pagar" valor={formatarReais(falta)} negrito />}
      </div>

      {p.status === "cancelado" && <div className="mt-2 text-center text-[14px] font-bold">PEDIDO CANCELADO</div>}
      {p.observacoes && <div className="mt-2 whitespace-pre-line"><b>Obs.:</b> {p.observacoes}</div>}

      {tipo === "controle" ? (
        <div className="mt-4 space-y-5">
          <Assinatura rotulo="Separado por" />
          <Assinatura rotulo={p.tipo === "entrega" ? "Entregue por" : "Entregue no balcão por"} />
          <Assinatura rotulo="Recebido por (cliente)" />
        </div>
      ) : (
        <div className="mt-3 text-center">Obrigado pela preferência!</div>
      )}
    </section>
  );

  return (
    <div className="nota min-h-dvh bg-white p-4">
      <style>{`
        @page { margin: ${a4 ? "10mm" : "3mm"}; ${a4 ? "size: A4;" : "size: 80mm auto;"} }
        @media print {
          .nao-imprimir { display: none !important; }
          .nota { padding: 0 !important; }
          ${a4 ? "" : ".via + .via { break-before: page; }"}
        }
      `}</style>

      <div className="nao-imprimir mx-auto mb-4 max-w-md space-y-3 font-sans">
        <div className="flex gap-2">
          <Link href={`/pedidos/${id}`} className="flex min-h-11 items-center rounded-xl border border-slate-300 px-4 font-medium">
            Voltar
          </Link>
          <Imprimir />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Opcao ativo={!a4} href={link({ papel: undefined })}>Bobina 80 mm</Opcao>
          <Opcao ativo={a4} href={link({ papel: "a4" })}>Folha A4</Opcao>
          <span className="w-2" />
          <Opcao ativo={vias.length === 2} href={link({ via: undefined })}>2 vias</Opcao>
          <Opcao ativo={via === "controle"} href={link({ via: "controle" })}>Controle</Opcao>
          <Opcao ativo={via === "cliente"} href={link({ via: "cliente" })}>Cliente</Opcao>
        </div>
      </div>

      <div className={a4 ? "grid grid-cols-2 gap-8" : "space-y-8"}>
        {vias.map((v) => (
          <Via key={v} tipo={v} />
        ))}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, negrito }: { rotulo: string; valor: string; negrito?: boolean }) {
  return (
    <div className={`flex justify-between ${negrito ? "font-bold" : ""}`}>
      <span>{rotulo}</span>
      <span>{valor}</span>
    </div>
  );
}

function Assinatura({ rotulo }: { rotulo: string }) {
  return (
    <div>
      <div className="h-6 border-b border-black" />
      <div className="text-[11px]">{rotulo} · data ___/___</div>
    </div>
  );
}

function Opcao({ ativo, href, children }: { ativo: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full border px-3 py-1 ${ativo ? "border-roxo-escuro bg-roxo-escuro text-white" : "border-slate-300"}`}>
      {children}
    </Link>
  );
}
