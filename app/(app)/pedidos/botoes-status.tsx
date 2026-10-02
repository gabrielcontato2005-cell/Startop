"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Aviso, Botao, classeCampo } from "@/components/ui";
import { mudarStatus } from "./acoes";

function Enviar({ children, estilo = "primario", grande }: { children: React.ReactNode; estilo?: "primario" | "perigo" | "destaque" | "secundario"; grande?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" estilo={estilo} grande={grande} disabled={pending} className="w-full">
      {pending ? "…" : children}
    </Botao>
  );
}

/** Botão de avançar etapa (usado na lista e no detalhe). */
export function BotaoAvancar({ id, status, rotulo, grande, forcavel }: { id: string; status: string; rotulo: string; grande?: boolean; forcavel?: boolean }) {
  const [estado, acao] = useActionState(mudarStatus, null);
  const [forcar, setForcar] = useState(false);
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      {forcar && <input type="hidden" name="forcar" value="sim" />}
      {estado?.erro && (
        <Aviso tipo="erro">
          {estado.erro}
          {forcavel && estado.erro.startsWith("Estoque insuficiente") && (
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} className="h-5 w-5" />
              Confirmar mesmo sem estoque
            </label>
          )}
        </Aviso>
      )}
      <Enviar estilo="destaque" grande={grande}>{rotulo}</Enviar>
    </form>
  );
}

export function Cancelar({ id, entregue }: { id: string; entregue: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(mudarStatus, null);
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="w-full py-2 text-sm font-medium text-red-700">
        {entregue ? "Registrar devolução / cancelar" : "Cancelar pedido"}
      </button>
    );
  }
  return (
    <form action={acao} className="space-y-2 rounded-2xl bg-red-50 p-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="cancelado" />
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <p className="text-sm text-red-900">
        {entregue ? "As caixas voltam para o estoque físico." : "As caixas reservadas voltam para o estoque."}
      </p>
      <input name="motivo" required placeholder="Motivo" className={classeCampo} />
      <Enviar estilo="perigo">Confirmar cancelamento</Enviar>
    </form>
  );
}
