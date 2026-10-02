import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Etiqueta, Pagina, Secao, Selecao } from "@/components/ui";
import { PAGAMENTO, ROTULO_AVANCAR, STATUS, ehUuid, lerConfig, proximoStatus } from "@/lib/dados";
import { consultar, consultarUm } from "@/lib/db";
import { formatarReais } from "@/lib/regras/dinheiro";
import { formatarData, formatarDataHora } from "@/lib/regras/horario";
import { nomeFormaPagamento, textoResumoPedido } from "@/lib/regras/resumo";
import { formatarWhatsapp, linkWhatsapp } from "@/lib/regras/telefone";
import { exigirUsuario } from "@/lib/sessao";
import { registrarPagamento } from "../acoes";
import { BotaoAvancar, Cancelar } from "../botoes-status";

export const metadata = { title: "Pedido" };

type Pedido = {
  id: string; numero: number; cliente_id: string; nome_loja: string; whatsapp: string | null; endereco: string | null;
  tipo: "entrega" | "retirada"; data_agendada: string; hora_agendada: string | null; status: string; status_pagamento: string;
  forma_pagamento: string; subtotal_centavos: number; desconto_centavos: number; taxa_entrega_sugerida_centavos: number;
  taxa_entrega_centavos: number; acrescimo_cartao_centavos: number; total_centavos: number; pago_centavos: number;
  custo_total_centavos: number; lucro_centavos: number; total_caixas: number; distancia_km_usada: number | null;
  pedido_minimo_usado: number | null; liberado_por: string | null; observacoes: string | null; motivo_cancelamento: string | null;
  criado_em: string; criado_por: string | null;
};

const NOMES_CAMPOS: Record<string, string> = {
  status: "status", total_centavos: "total", data_agendada: "data", hora_agendada: "horário", tipo: "tipo",
  forma_pagamento: "pagamento", taxa_entrega_centavos: "taxa", status_pagamento: "pagamento",
};

export default async function DetalhePedido({ params }: PageProps<"/pedidos/[id]">) {
  const u = await exigirUsuario();
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const dono = u.perfil === "dono";

  const [p, itens, pagamentos, historico, cfg] = await Promise.all([
    consultarUm<Pedido>(
      `select p.*, to_char(p.hora_agendada, 'HH24:MI') as hora_agendada, c.nome_loja, c.whatsapp,
              concat_ws(', ', nullif(concat_ws(' ', c.logradouro, c.numero), ''), c.complemento, c.bairro, c.cidade) as endereco,
              ul.nome as liberado_por, uc.nome as criado_por
         from pedidos p join clientes c on c.id = p.cliente_id
         left join usuarios ul on ul.id = p.liberado_abaixo_minimo_por
         left join usuarios uc on uc.id = p.criado_por
        where p.id = $1`,
      [id],
    ),
    consultar<{ produto_id: string; descricao: string; linha: string; quantidade: number; preco_unitario_centavos: number; desconto_centavos: number; total_centavos: number; custo_total_centavos: number | null }>(
      `select i.produto_id, vp.sabor || ' ' || vp.tamanho_litros || ' L' as descricao, vp.linha, i.quantidade, i.preco_unitario_centavos,
              i.desconto_centavos, i.total_centavos, i.custo_total_centavos
         from itens_pedido i join v_produtos vp on vp.id = i.produto_id
        where i.pedido_id = $1 order by vp.linha_ordem, vp.tamanho_litros desc, vp.sabor`,
      [id],
    ),
    consultar<{ id: string; valor_centavos: number; forma: string; recebido_em: string; nome: string | null }>(
      `select pg.id, pg.valor_centavos, pg.forma, pg.recebido_em, u.nome from pagamentos pg left join usuarios u on u.id = pg.recebido_por
        where pg.pedido_id = $1 order by pg.recebido_em`,
      [id],
    ),
    consultar<{ acao: string; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; em: string; nome: string | null }>(
      `select a.acao, a.antes, a.depois, a.em, u.nome from auditoria a left join usuarios u on u.id = a.usuario_id
        where a.tabela = 'pedidos' and a.registro_id = $1 order by a.id`,
      [id],
    ),
    lerConfig(),
  ]);
  if (!p) notFound();

  const proximo = proximoStatus(p.status, p.tipo);
  const editavel = u.perfil !== "entregador" && ["novo", "confirmado", "separado"].includes(p.status);
  const podeAvancar = proximo && (u.perfil !== "entregador" || ["saiu_para_entrega", "entregue"].includes(proximo));
  const falta = Math.max(0, p.total_centavos - p.pago_centavos);
  const vendido = !["novo", "cancelado"].includes(p.status);

  const resumo = textoResumoPedido(
    {
      numero: p.numero,
      nome_loja: p.nome_loja,
      tipo: p.tipo,
      data_agendada: p.data_agendada,
      hora_agendada: p.hora_agendada,
      forma_pagamento: p.forma_pagamento,
      itens: itens.map((i) => ({ descricao: `${i.linha.startsWith("Açaí mesclado") ? "Mesclado " : ""}${i.descricao}`, quantidade: i.quantidade, total_centavos: i.total_centavos })),
      desconto_centavos: p.desconto_centavos,
      taxa_entrega_centavos: p.taxa_entrega_centavos,
      acrescimo_cartao_centavos: p.acrescimo_cartao_centavos,
      total_centavos: p.total_centavos,
    },
    cfg.fabrica_nome,
  );

  // linha do tempo a partir da auditoria: criação e cada mudança de campo importante
  const eventos = historico.flatMap((h) => {
    if (h.acao === "insert") return [{ em: h.em, nome: h.nome, texto: "Pedido criado" }];
    const mudou = Object.keys(NOMES_CAMPOS).filter((k) => JSON.stringify(h.antes?.[k]) !== JSON.stringify(h.depois?.[k]));
    if (mudou.length === 0) return [];
    const texto = mudou.includes("status")
      ? `${STATUS[String(h.depois?.status)]?.nome ?? h.depois?.status}`
      : `Alterado: ${[...new Set(mudou.map((k) => NOMES_CAMPOS[k]))].join(", ")}`;
    return [{ em: h.em, nome: h.nome, texto }];
  });

  return (
    <Pagina
      titulo={`Pedido nº ${p.numero}`}
      voltar="/pedidos"
      acao={editavel ? <BotaoLink href={`/pedidos/${id}/editar`} estilo="secundario">Editar</BotaoLink> : undefined}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Etiqueta cor={STATUS[p.status].cor}>{STATUS[p.status].nome}</Etiqueta>
        {p.status !== "cancelado" && <Etiqueta cor={PAGAMENTO[p.status_pagamento].cor}>{PAGAMENTO[p.status_pagamento].nome}</Etiqueta>}
        {p.liberado_por && <Etiqueta cor="bg-amber-100 text-amber-800">Abaixo do mínimo, liberado por {p.liberado_por}</Etiqueta>}
      </div>

      <Cartao className="mb-4">
        <Link href={`/clientes/${p.cliente_id}`} className="text-lg font-bold text-roxo-escuro underline-offset-2 hover:underline">
          {p.nome_loja}
        </Link>
        <div className="text-sm text-slate-600">
          {p.tipo === "entrega" ? "Entrega" : "Retirada na fábrica"} · {formatarData(p.data_agendada)}
          {p.hora_agendada && ` às ${p.hora_agendada}`}
        </div>
        {p.tipo === "entrega" && p.endereco && <div className="text-sm text-slate-500">{p.endereco}</div>}
        {p.whatsapp && <div className="text-sm text-slate-500">{formatarWhatsapp(p.whatsapp)}</div>}
        {p.observacoes && <div className="mt-2 whitespace-pre-line rounded-lg bg-amarelo/15 p-2 text-sm">{p.observacoes}</div>}
        {p.motivo_cancelamento && <div className="mt-2 text-sm text-red-700">Motivo do cancelamento: {p.motivo_cancelamento}</div>}
      </Cartao>

      {podeAvancar && (
        <div className="mb-3">
          <BotaoAvancar id={id} status={proximo!} rotulo={ROTULO_AVANCAR[proximo!]} grande forcavel={dono} />
        </div>
      )}
      <a
        href={linkWhatsapp(p.whatsapp, resumo)}
        target="_blank"
        rel="noreferrer"
        className="mb-5 flex min-h-12 items-center justify-center rounded-xl bg-[#25D366] font-semibold text-white"
      >
        Enviar resumo no WhatsApp
      </a>

      <Secao titulo={`Itens · ${p.total_caixas} caixas`}>
        <Cartao className="space-y-1 text-sm tabular-nums">
          {itens.map((i) => (
            <div key={i.produto_id} className="flex justify-between gap-2">
              <span>
                <b>{i.quantidade}×</b> {i.linha.startsWith("Açaí mesclado") ? "Mesclado " : ""}{i.descricao}
                <span className="text-slate-400"> · {formatarReais(i.preco_unitario_centavos)}</span>
              </span>
              <span>{formatarReais(i.quantidade * i.preco_unitario_centavos)}</span>
            </div>
          ))}
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {p.desconto_centavos > 0 && <div className="flex justify-between text-green-700"><span>Desconto de volume</span><span>−{formatarReais(p.desconto_centavos)}</span></div>}
            {p.tipo === "entrega" && (
              <div className="flex justify-between">
                <span>Entrega{p.taxa_entrega_centavos !== p.taxa_entrega_sugerida_centavos && <span className="text-slate-400"> (sugerida {formatarReais(p.taxa_entrega_sugerida_centavos)})</span>}</span>
                <span>{formatarReais(p.taxa_entrega_centavos)}</span>
              </div>
            )}
            {p.acrescimo_cartao_centavos > 0 && <div className="flex justify-between"><span>Acréscimo do cartão</span><span>{formatarReais(p.acrescimo_cartao_centavos)}</span></div>}
            <div className="flex justify-between text-base font-bold"><span>Total ({nomeFormaPagamento(p.forma_pagamento)})</span><span>{formatarReais(p.total_centavos)}</span></div>
            {dono && vendido && (
              <div className="flex justify-between text-green-700">
                <span>Lucro (custo {formatarReais(p.custo_total_centavos)})</span>
                <span className="font-semibold">{formatarReais(p.lucro_centavos)}</span>
              </div>
            )}
          </div>
          {p.tipo === "entrega" && p.pedido_minimo_usado != null && (
            <div className="pt-1 text-xs text-slate-500">
              {String(p.distancia_km_usada ?? "").replace(".", ",")} km · mínimo {p.pedido_minimo_usado} caixas
            </div>
          )}
        </Cartao>
      </Secao>

      {p.status !== "cancelado" && (
        <Secao titulo="Pagamento">
          <Cartao className="space-y-3">
            {pagamentos.map((pg) => (
              <div key={pg.id} className="flex justify-between text-sm">
                <span>{nomeFormaPagamento(pg.forma)} · {formatarDataHora(pg.recebido_em)}{pg.nome ? ` · ${pg.nome}` : ""}</span>
                <span className="font-semibold tabular-nums">{formatarReais(pg.valor_centavos)}</span>
              </div>
            ))}
            {falta > 0 ? (
              <Formulario acao={registrarPagamento} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <div className="grid grid-cols-2 gap-3">
                  <Campo rotulo="Recebido (R$)" name="valor" inputMode="decimal" defaultValue={(falta / 100).toFixed(2).replace(".", ",")} required />
                  <Selecao rotulo="Forma" name="forma" defaultValue={p.forma_pagamento}>
                    <option value="pix">Pix</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_credito">Cartão de crédito</option>
                  </Selecao>
                </div>
                <BotaoEnviar estilo="secundario" className="w-full">Registrar pagamento</BotaoEnviar>
              </Formulario>
            ) : (
              <p className="text-sm font-medium text-green-700">Pago.</p>
            )}
          </Cartao>
        </Secao>
      )}

      <Secao titulo="Histórico">
        <Cartao className="space-y-1 text-sm">
          {eventos.map((e, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span>{e.texto}</span>
              <span className="text-right text-slate-500">{formatarDataHora(e.em)}{e.nome ? ` · ${e.nome}` : ""}</span>
            </div>
          ))}
        </Cartao>
      </Secao>

      {p.status !== "cancelado" && u.perfil !== "entregador" && (p.status !== "entregue" || dono) && (
        <Cancelar id={id} entregue={p.status === "entregue"} />
      )}
    </Pagina>
  );
}
