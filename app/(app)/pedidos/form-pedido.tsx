"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Aviso, Botao, Cartao, Secao, classeCampo } from "@/components/ui";
import type { ClienteResumo, Config, ProdutoCatalogo } from "@/lib/dados";
import { formatarReais, lerReais } from "@/lib/regras/dinheiro";
import { formatarData } from "@/lib/regras/horario";
import { calcularPedido, precoConsumidor, precoDeCusto, type FormaPagamento, type RegraDesconto, type TipoPedido } from "@/lib/regras/pedido";
import { formatarWhatsapp } from "@/lib/regras/telefone";
import { habitosDoCliente, salvarPedido } from "./acoes";

export type PedidoInicial = {
  id: string;
  numero: number;
  cliente_id: string;
  tipo: TipoPedido;
  data_agendada: string;
  hora_agendada: string | null;
  forma_pagamento: FormaPagamento;
  taxa_entrega_centavos: number;
  observacoes: string | null;
  liberado: boolean;
  comprador_nome?: string | null;
  comprador_telefone?: string | null;
  itens: { produto_id: string; quantidade: number }[];
};

type Props = {
  clientes: ClienteResumo[];
  produtos: ProdutoCatalogo[];
  regras: RegraDesconto[];
  config: Config;
  /** custo atual por produto: só chega para o dono, para o pedido da loja própria */
  custos?: Record<string, number>;
  dono: boolean;
  dataPadrao: string;
  clienteInicial?: string;
  inicial?: PedidoInicial;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function FormPedido({ clientes, produtos, regras, config, custos, dono, dataPadrao, clienteInicial, inicial }: Props) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? clienteInicial ?? "");
  const [busca, setBusca] = useState("");
  const [qtd, setQtd] = useState<Record<string, number>>(() => Object.fromEntries((inicial?.itens ?? []).map((i) => [i.produto_id, i.quantidade])));
  const linhas = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; tamanhos: number[] }>();
    for (const p of produtos) {
      const l = m.get(p.linha_id) ?? { id: p.linha_id, nome: p.linha, tamanhos: [] };
      if (!l.tamanhos.includes(p.tamanho_litros)) l.tamanhos.push(p.tamanho_litros);
      m.set(p.linha_id, l);
    }
    return [...m.values()].map((l) => ({ ...l, tamanhos: l.tamanhos.sort((a, b) => b - a) }));
  }, [produtos]);
  const [linhaAtiva, setLinhaAtiva] = useState(linhas[0]?.id ?? "");
  const [tamanho, setTamanho] = useState<Record<string, number>>({});
  const ehAvulso = (id: string | undefined) => !!id && !!clientes.find((c) => c.id === id)?.consumidor_final;
  // a venda avulsa costuma ser no balcão: começa como retirada
  const [tipo, setTipo] = useState<TipoPedido>(inicial?.tipo ?? (ehAvulso(clienteInicial) ? "retirada" : "entrega"));
  const [data, setData] = useState(inicial?.data_agendada ?? dataPadrao);
  const [hora, setHora] = useState(inicial?.hora_agendada?.slice(0, 5) ?? "");
  const [forma, setForma] = useState<FormaPagamento>(inicial?.forma_pagamento ?? "pix");
  const [taxaTexto, setTaxaTexto] = useState(inicial && inicial.tipo === "entrega" ? (inicial.taxa_entrega_centavos / 100).toFixed(2).replace(".", ",") : "");
  const [obs, setObs] = useState(inicial?.observacoes ?? "");
  const [compradorNome, setCompradorNome] = useState(inicial?.comprador_nome ?? "");
  const [compradorTel, setCompradorTel] = useState(formatarWhatsapp(inicial?.comprador_telefone));
  const [liberar, setLiberar] = useState(inicial?.liberado ?? false);
  const [forcar, setForcar] = useState(false);
  const [erro, setErro] = useState<{ texto: string; semEstoque?: boolean } | null>(null);
  const [enviando, iniciar] = useTransition();
  const [habitos, setHabitos] = useState<Awaited<ReturnType<typeof habitosDoCliente>> | null>(null);

  const cliente = clientes.find((c) => c.id === clienteId);
  const avulsoCliente = clientes.find((c) => c.consumidor_final);
  const avulso = !!cliente?.consumidor_final;
  const mapaProdutos = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  useEffect(() => {
    if (!clienteId || inicial || avulso) return;
    let ativo = true;
    habitosDoCliente(clienteId).then((h) => ativo && setHabitos(h));
    return () => {
      ativo = false;
    };
  }, [clienteId, inicial, avulso]);

  const itens = Object.entries(qtd).filter(([, q]) => q > 0).map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
  const taxaDigitada = taxaTexto.trim() === "" ? null : lerReais(taxaTexto);
  const aCusto = useMemo(
    () => (cliente?.loja_propria && custos ? precoDeCusto(mapaProdutos, new Map(Object.entries(custos))) : null),
    [cliente?.loja_propria, custos, mapaProdutos],
  );
  const consumidor = useMemo(() => (avulso ? precoConsumidor(mapaProdutos) : null), [avulso, mapaProdutos]);
  const especial = aCusto ?? consumidor;
  const precos = especial?.produtos ?? mapaProdutos;
  const calc = calcularPedido(
    {
      itens,
      tipo,
      forma_pagamento: forma,
      distancia_km: cliente?.distancia_km ?? null,
      pedido_minimo_manual: especial ? especial.pedido_minimo_manual : cliente?.pedido_minimo_manual,
      taxa_entrega_centavos: taxaDigitada,
      hora_agendada: hora || null,
    },
    precos,
    especial?.regras ?? regras,
    config,
  );

  // o que reservar além do que este pedido já tinha (na edição o estoque já está reservado para ele)
  const jaReservado = useMemo(() => new Map((inicial?.itens ?? []).map((i) => [i.produto_id, i.quantidade])), [inicial]);
  const disponivel = (id: string) => (mapaProdutos.get(id)?.disponivel ?? 0) + (jaReservado.get(id) ?? 0);

  const mudar = (id: string, delta: number) => {
    setErro(null);
    setQtd((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));
  };
  const definir = (id: string, valor: string) => {
    setErro(null);
    const n = Number(valor.replace(/\D/g, ""));
    setQtd((q) => ({ ...q, [id]: Number.isFinite(n) ? Math.min(n, 9999) : 0 }));
  };

  const filtrados = useMemo(() => {
    const b = semAcento(busca.trim());
    const d = busca.replace(/\D/g, "");
    const lojas = clientes.filter((c) => !c.consumidor_final);
    if (!b) return lojas.slice(0, 30);
    return lojas
      .filter((c) => semAcento(`${c.nome_loja} ${c.responsavel ?? ""} ${c.bairro ?? ""}`).includes(b) || (d.length >= 3 && c.whatsapp?.includes(d)))
      .slice(0, 30);
  }, [busca, clientes]);

  const bloqueio =
    !cliente
      ? "Escolha o cliente"
      : calc.total_caixas === 0
        ? "Adicione caixas"
        : calc.fora_do_horario
          ? "Horário fora do funcionamento"
          : (calc.abaixo_do_minimo || calc.fora_do_raio) && !(dono && liberar)
            ? calc.fora_do_raio
              ? "Fora do raio de entrega"
              : `Mínimo de ${calc.pedido_minimo} caixas`
            : null;

  function enviar(confirmar: boolean) {
    if (!cliente) return;
    setErro(null);
    iniciar(async () => {
      const r = await salvarPedido({
        id: inicial?.id,
        cliente_id: cliente.id,
        tipo,
        data_agendada: data,
        hora_agendada: hora || null,
        forma_pagamento: forma,
        taxa_entrega_centavos: taxaDigitada,
        observacoes: obs,
        itens,
        confirmar,
        liberar_minimo: liberar,
        forcar_estoque: forcar,
        comprador_nome: compradorNome,
        comprador_telefone: compradorTel,
      });
      if (r.ok) router.push(`/pedidos/${r.id}`);
      else setErro({ texto: r.erro, semEstoque: r.semEstoque });
    });
  }

  // ---------- passo 1: cliente ----------
  if (!cliente) {
    return (
      <div>
        {avulsoCliente && (
          <Botao
            type="button"
            estilo="secundario"
            className="mb-3 w-full"
            onClick={() => (setClienteId(avulsoCliente.id), setTipo("retirada"))}
          >
            Venda avulsa (consumidor, sem cadastro)
          </Botao>
        )}
        <input
          autoFocus
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar loja por nome, bairro ou telefone"
          className={`${classeCampo} mb-3 min-h-12 text-lg`}
        />
        <Cartao className="divide-y divide-slate-100 p-0">
          {filtrados.map((c) => (
            <button key={c.id} type="button" onClick={() => setClienteId(c.id)} className="block w-full px-4 py-3 text-left active:bg-slate-50">
              <div className="font-semibold">{c.nome_loja}</div>
              <div className="text-sm text-slate-500">{[c.responsavel, formatarWhatsapp(c.whatsapp), c.bairro].filter(Boolean).join(" · ")}</div>
            </button>
          ))}
          {filtrados.length === 0 && <p className="p-4 text-center text-slate-500">Nenhuma loja encontrada.</p>}
        </Cartao>
        <Link href="/clientes/novo?voltar=pedido" className="mt-4 block text-center font-medium text-roxo underline">
          + Cadastrar loja nova
        </Link>
      </div>
    );
  }

  // ---------- passo 2: itens e entrega ----------
  const linha = linhas.find((l) => l.id === linhaAtiva) ?? linhas[0];
  const tamanhoAtivo = tamanho[linha.id] ?? linha.tamanhos[0];
  const daLinha = produtos.filter((p) => p.linha_id === linha.id && p.tamanho_litros === tamanhoAtivo);
  const habituais = (habitos?.habituais ?? []).map((id) => mapaProdutos.get(id)).filter((p): p is ProdutoCatalogo => !!p);
  const nome = (p: ProdutoCatalogo) => `${p.sabor} ${p.tamanho_litros} L`;

  return (
    <div className="pb-40">
      <Cartao className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{avulso ? "Venda avulsa" : cliente.nome_loja}</div>
          {avulso ? (
            <div className="text-sm text-slate-500">Consumidor final: preço de consumidor, sem desconto de volume e sem mínimo</div>
          ) : (
            <div className="text-sm text-slate-500">
              {cliente.distancia_km != null ? `${String(cliente.distancia_km).replace(".", ",")} km` : "distância não cadastrada"}
              {calc.pedido_minimo != null && !aCusto && ` · mínimo ${calc.pedido_minimo} cx`}
            </div>
          )}
          {aCusto && <div className="mt-1 text-sm font-semibold text-roxo">Loja própria: preço de custo, fora do faturamento e do lucro</div>}
        </div>
        {!inicial && (
          <button type="button" onClick={() => (setClienteId(""), setHabitos(null))} className="shrink-0 text-sm font-medium text-roxo">
            Trocar
          </button>
        )}
      </Cartao>

      {avulso && (
        <Secao titulo="Comprador (opcional)">
          <Cartao className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Nome</span>
              <input value={compradorNome} onChange={(e) => setCompradorNome(e.target.value)} maxLength={80} autoComplete="off" className={classeCampo} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">WhatsApp</span>
              <input value={compradorTel} onChange={(e) => setCompradorTel(e.target.value)} inputMode="tel" autoComplete="off" className={classeCampo} />
            </label>
          </Cartao>
        </Secao>
      )}

      {!inicial && habitos && habitos.ultimo.length > 0 && (
        <Botao
          type="button"
          estilo="secundario"
          className="mb-3 w-full"
          onClick={() => setQtd(Object.fromEntries(habitos.ultimo.filter((i) => mapaProdutos.has(i.produto_id)).map((i) => [i.produto_id, i.quantidade])))}
        >
          ↻ Repetir último pedido ({habitos.ultimo.reduce((s, i) => s + i.quantidade, 0)} cx, {formatarData(habitos.ultimaData)})
        </Botao>
      )}

      {habituais.length > 0 && (
        <div className="mb-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sabores de sempre</div>
          <div className="flex flex-wrap gap-2">
            {habituais.map((p) => (
              <button key={p.id} type="button" onClick={() => mudar(p.id, 1)} className="rounded-full bg-roxo/10 px-3 py-2 text-sm font-medium text-roxo-escuro active:bg-roxo/20">
                + {nome(p)} {qtd[p.id] ? <b className="text-roxo">({qtd[p.id]})</b> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {linhas.map((l) => {
          const n = produtos.filter((p) => p.linha_id === l.id).reduce((s, p) => s + (qtd[p.id] ?? 0), 0);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setLinhaAtiva(l.id)}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${l.id === linha.id ? "bg-roxo text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
            >
              {l.nome.replace("Sorvete ", "Sorv. ")}
              {n > 0 && <span className="ml-1 rounded-full bg-amarelo px-1.5 text-xs text-roxo-escuro">{n}</span>}
            </button>
          );
        })}
      </nav>

      {linha.tamanhos.length > 1 && (
        <div className="mb-2 flex gap-1 rounded-xl bg-slate-200/70 p-1">
          {linha.tamanhos.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTamanho({ ...tamanho, [linha.id]: t })}
              className={`flex-1 rounded-lg py-2 font-semibold ${t === tamanhoAtivo ? "bg-white text-roxo shadow-sm" : "text-slate-600"}`}
            >
              {t} L
            </button>
          ))}
        </div>
      )}

      <Cartao className="mb-5 divide-y divide-slate-100 p-0">
        {daLinha.map((p) => {
          const q = qtd[p.id] ?? 0;
          const livre = disponivel(p.id);
          return (
            <div key={p.id} className={`flex items-center gap-2 px-3 py-2 ${q > 0 ? "bg-amarelo/10" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.sabor}</div>
                <div className={`text-xs ${livre - q < 0 ? "font-semibold text-red-700" : "text-slate-500"}`}>
                  {formatarReais(precos.get(p.id)?.preco_centavos ?? p.preco_centavos)} · {livre} livre{livre === 1 ? "" : "s"}
                </div>
              </div>
              <button type="button" aria-label={`Menos ${p.sabor}`} onClick={() => mudar(p.id, -1)} disabled={q === 0}
                className="h-11 w-11 rounded-xl bg-slate-100 text-2xl font-semibold text-slate-700 disabled:opacity-30">
                −
              </button>
              <input
                aria-label={`Quantidade ${p.sabor}`}
                inputMode="numeric"
                value={q || ""}
                placeholder="0"
                onChange={(e) => definir(p.id, e.target.value)}
                className="h-11 w-12 rounded-xl border border-slate-200 text-center text-lg font-bold"
              />
              <button type="button" aria-label={`Mais ${p.sabor}`} onClick={() => mudar(p.id, 1)}
                className="h-11 w-11 rounded-xl bg-roxo text-2xl font-semibold text-white active:bg-roxo-escuro">
                +
              </button>
            </div>
          );
        })}
      </Cartao>

      {calc.itens.length > 0 && (
        <Secao titulo="Itens do pedido">
          <Cartao className="divide-y divide-slate-100 p-0 text-sm">
            {calc.itens.map((i) => {
              const p = mapaProdutos.get(i.produto_id)!;
              return (
                <div key={i.produto_id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0">
                    <b>{i.quantidade}×</b> {p.linha.startsWith("Açaí mesclado") ? "Mesclado " : ""}{nome(p)}
                    {i.desconto_centavos > 0 && <span className="block text-xs text-green-700">desconto −{formatarReais(i.desconto_centavos)}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 tabular-nums">
                    {formatarReais(i.total_centavos)}
                    <button type="button" onClick={() => setQtd({ ...qtd, [i.produto_id]: 0 })} className="p-1 text-slate-400" aria-label="Tirar">✕</button>
                  </span>
                </div>
              );
            })}
          </Cartao>
        </Secao>
      )}

      <Secao titulo="Entrega">
        <Cartao className="space-y-3">
          <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1">
            {(["entrega", "retirada"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)}
                className={`flex-1 rounded-lg py-2.5 font-semibold ${tipo === t ? "bg-white text-roxo shadow-sm" : "text-slate-600"}`}>
                {t === "entrega" ? "Entrega" : "Retirada"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={classeCampo} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Horário</span>
              <input type="time" value={hora} min={config.horario_abertura} max={config.horario_fechamento} step={900}
                onChange={(e) => setHora(e.target.value)} className={classeCampo} />
            </label>
          </div>
          <p className="-mt-1 text-xs text-slate-500">Funcionamento das {config.horario_abertura} às {config.horario_fechamento}.</p>
          {tipo === "entrega" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Taxa de entrega (R$)</span>
              <input
                inputMode="decimal"
                value={taxaTexto}
                onChange={(e) => setTaxaTexto(e.target.value)}
                placeholder={(calc.taxa_entrega_sugerida_centavos / 100).toFixed(2).replace(".", ",")}
                className={classeCampo}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Sugerida pela distância: {formatarReais(calc.taxa_entrega_sugerida_centavos)}. Deixe vazio para usar a sugerida.
              </span>
            </label>
          )}
        </Cartao>
      </Secao>

      <Secao titulo="Pagamento">
        <div className="grid grid-cols-3 gap-2">
          {([
            ["pix", "Pix"],
            ["dinheiro", "Dinheiro"],
            ["cartao_credito", `Cartão +${String(config.cartao_acrescimo_pct).replace(".", ",")}%`],
          ] as const).map(([f, rotulo]) => (
            <button key={f} type="button" onClick={() => setForma(f)}
              className={`min-h-12 rounded-xl px-2 text-sm font-semibold ${forma === f ? "bg-roxo text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
              {rotulo}
            </button>
          ))}
        </div>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações (opcional)" rows={2} className={`${classeCampo} mt-3 py-2`} />
      </Secao>

      <Cartao className="mb-4 space-y-1 text-sm tabular-nums">
        <div className="flex justify-between"><span>Produtos</span><span>{formatarReais(calc.subtotal_centavos)}</span></div>
        {calc.desconto_centavos > 0 && (
          <div className="flex justify-between text-green-700"><span>Desconto de volume</span><span>−{formatarReais(calc.desconto_centavos)}</span></div>
        )}
        {tipo === "entrega" && <div className="flex justify-between"><span>Entrega</span><span>{formatarReais(calc.taxa_entrega_centavos)}</span></div>}
        {calc.acrescimo_cartao_centavos > 0 && (
          <div className="flex justify-between"><span>Acréscimo do cartão</span><span>{formatarReais(calc.acrescimo_cartao_centavos)}</span></div>
        )}
        <div className="flex justify-between border-t border-slate-100 pt-1 text-base font-bold"><span>Total</span><span>{formatarReais(calc.total_centavos)}</span></div>
      </Cartao>

      <div className="space-y-2">
        {tipo === "entrega" && !especial && cliente.distancia_km == null && cliente.pedido_minimo_manual == null && (
          <Aviso tipo="info">Cliente sem distância cadastrada: não dá para conferir o pedido mínimo nem sugerir a taxa.</Aviso>
        )}
        {calc.fora_do_horario && <Aviso tipo="erro">Horário fora do funcionamento ({config.horario_abertura} às {config.horario_fechamento}).</Aviso>}
        {(calc.abaixo_do_minimo || calc.fora_do_raio) && (
          <Aviso tipo="alerta">
            {calc.fora_do_raio
              ? `Cliente a ${cliente.distancia_km} km, fora do raio de entrega (${config.raio_max_km} km).`
              : `Para entregar a ${String(cliente.distancia_km ?? "").replace(".", ",")} km o mínimo é ${calc.pedido_minimo} caixas. Faltam ${(calc.pedido_minimo ?? 0) - calc.total_caixas}.`}
            {dono ? (
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={liberar} onChange={(e) => setLiberar(e.target.checked)} className="h-5 w-5" />
                Liberar mesmo assim (fica registrado)
              </label>
            ) : (
              <div className="mt-1">Mude para retirada ou peça ao dono para liberar.</div>
            )}
          </Aviso>
        )}
        {erro && (
          <Aviso tipo="erro">
            {erro.texto}
            {erro.semEstoque && dono && (
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} className="h-5 w-5" />
                Vender mesmo sem estoque (fica registrado)
              </label>
            )}
            {erro.semEstoque && !inicial && (
              <button type="button" onClick={() => enviar(false)} className="mt-2 block font-semibold underline">
                Salvar sem reservar estoque (confirma depois)
              </button>
            )}
          </Aviso>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold tabular-nums">{formatarReais(calc.total_centavos)}</div>
            <div className={`text-sm ${calc.abaixo_do_minimo ? "font-semibold text-red-700" : "text-slate-600"}`}>
              {calc.total_caixas} caixa{calc.total_caixas === 1 ? "" : "s"}
              {calc.pedido_minimo != null && ` · mín. ${calc.pedido_minimo} ${calc.abaixo_do_minimo ? "✗" : "✓"}`}
            </div>
          </div>
          <Botao grande estilo="destaque" disabled={!!bloqueio || enviando} onClick={() => enviar(true)} className="shrink-0">
            {enviando ? "Salvando…" : bloqueio ?? (inicial ? "Salvar pedido" : "Confirmar pedido")}
          </Botao>
        </div>
      </div>
    </div>
  );
}
