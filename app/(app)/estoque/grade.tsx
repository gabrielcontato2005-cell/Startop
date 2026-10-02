"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { EstadoAcao } from "@/components/formulario";
import { Aviso, Botao, Campo, Cartao, Secao } from "@/components/ui";
import { formatarReais } from "@/lib/regras/dinheiro";
import { hojeSP } from "@/lib/regras/horario";
import { registrarContagem, registrarLote } from "./acoes";

export type ProdutoGrade = { id: string; sabor: string; linha: string; tamanho_litros: number; fisico: number; custo_centavos: number };

/**
 * Grade com todos os sabores. Modo "lote": digita quantas caixas chegaram (e o custo, se mudou).
 * Modo "contagem": digita quanto existe na câmara fria e o sistema ajusta a diferença.
 */
export default function Grade({ produtos, modo }: { produtos: ProdutoGrade[]; modo: "lote" | "contagem" }) {
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [custo, setCusto] = useState<Record<string, string>>({});
  const [data, setData] = useState(hojeSP());
  const [nota, setNota] = useState("");
  const [obs, setObs] = useState("");
  const [estado, setEstado] = useState<EstadoAcao>(null);
  const [enviando, iniciar] = useTransition();
  const router = useRouter();

  const grupos = useMemo(() => {
    const g = new Map<string, ProdutoGrade[]>();
    for (const p of produtos) g.set(`${p.linha} · ${p.tamanho_litros} L`, [...(g.get(`${p.linha} · ${p.tamanho_litros} L`) ?? []), p]);
    return [...g];
  }, [produtos]);

  const preenchidos = produtos.filter((p) => (qtd[p.id] ?? "").trim() !== "");
  const totalCaixas = preenchidos.reduce((s, p) => s + (Number(qtd[p.id]) || 0), 0);
  const diferencas = preenchidos.filter((p) => Number(qtd[p.id]) !== p.fisico).length;

  function enviar() {
    const itens = preenchidos.map((p) => ({ produto_id: p.id, quantidade: Number(qtd[p.id]), custo: custo[p.id] }));
    if (itens.some((i) => !Number.isInteger(i.quantidade) || i.quantidade < 0)) {
      setEstado({ erro: "Use só números inteiros nas quantidades." });
      return;
    }
    iniciar(async () => {
      const r = modo === "lote" ? await registrarLote({ data, nota, obs, itens }) : await registrarContagem(itens);
      setEstado(r);
      if (r?.ok) {
        setQtd({});
        setCusto({});
        setNota("");
        setObs("");
        router.refresh();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  return (
    <div>
      {estado?.ok && <div className="mb-4"><Aviso tipo="ok">{estado.ok}</Aviso></div>}
      {modo === "lote" ? (
        <Cartao className="mb-5 grid grid-cols-2 gap-3">
          <Campo rotulo="Data da chegada" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <Campo rotulo="Nota / número" value={nota} onChange={(e) => setNota(e.target.value)} />
          <Campo rotulo="Observação" value={obs} onChange={(e) => setObs(e.target.value)} className="col-span-2" />
        </Cartao>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          Digite quantas caixas existem de verdade. Deixe em branco o que não contou. O sistema ajusta a diferença e guarda no histórico.
        </p>
      )}

      {grupos.map(([titulo, lista]) => (
        <Secao key={titulo} titulo={titulo}>
          <Cartao className="divide-y divide-slate-100 p-0">
            {lista.map((p) => {
              const valor = qtd[p.id] ?? "";
              const dif = valor.trim() !== "" ? Number(valor) - p.fisico : 0;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.sabor}</div>
                    <div className="text-xs text-slate-500">
                      tem {p.fisico}
                      {modo === "contagem" && valor.trim() !== "" && dif !== 0 && (
                        <span className={dif > 0 ? "text-green-700" : "text-red-700"}> · {dif > 0 ? "+" : ""}{dif}</span>
                      )}
                    </div>
                  </div>
                  {modo === "lote" && (
                    <input
                      aria-label={`Custo ${p.sabor}`}
                      inputMode="decimal"
                      placeholder={formatarReais(p.custo_centavos).replace("R$ ", "")}
                      value={custo[p.id] ?? ""}
                      onChange={(e) => setCusto({ ...custo, [p.id]: e.target.value })}
                      className="h-11 w-20 rounded-xl border border-slate-200 px-2 text-right text-sm"
                    />
                  )}
                  <input
                    aria-label={`Quantidade ${p.sabor}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    value={valor}
                    onChange={(e) => setQtd({ ...qtd, [p.id]: e.target.value.replace(/\D/g, "") })}
                    className="h-11 w-16 rounded-xl border border-slate-300 px-2 text-center text-lg font-semibold"
                  />
                </div>
              );
            })}
          </Cartao>
        </Secao>
      ))}
      {modo === "lote" && <p className="mb-24 text-xs text-slate-500">O campo menor é o custo por caixa deste lote. Em branco, mantém o custo atual.</p>}

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-2">
          {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
          <Botao grande className="w-full" onClick={enviar} disabled={enviando || preenchidos.length === 0}>
            {enviando
              ? "Salvando…"
              : modo === "lote"
                ? `Dar entrada em ${totalCaixas} caixas`
                : `Salvar contagem (${diferencas} diferença${diferencas === 1 ? "" : "s"})`}
          </Botao>
        </div>
      </div>
    </div>
  );
}
