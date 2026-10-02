"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Aviso, Botao, type EstiloBotao } from "./ui";

export type EstadoAcao = { erro?: string; ok?: string } | null;

export function BotaoEnviar({ children, estilo, grande, className, ...resto }: { children: ReactNode; estilo?: EstiloBotao; grande?: boolean; className?: string; name?: string; value?: string; formAction?: (f: FormData) => void }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" estilo={estilo} grande={grande} disabled={pending} className={className} {...resto}>
      {pending ? "Salvando…" : children}
    </Botao>
  );
}

/** Formulário ligado a uma ação do servidor que devolve { erro } ou { ok }. */
export function Formulario({
  acao,
  children,
  className = "space-y-4",
}: {
  acao: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;
  children: ReactNode;
  className?: string;
}) {
  const [estado, enviar] = useActionState(acao, null);
  return (
    <form action={enviar} className={className}>
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado?.ok && <Aviso tipo="ok">{estado.ok}</Aviso>}
      {children}
    </form>
  );
}
