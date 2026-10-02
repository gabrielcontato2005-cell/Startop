import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Pagina({ titulo, voltar, acao, children }: { titulo: string; voltar?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <header className="mb-4 flex items-center gap-2">
        {voltar && (
          <Link href={voltar} className="-ml-2 rounded-full p-2 text-2xl leading-none text-roxo" aria-label="Voltar">
            ‹
          </Link>
        )}
        <h1 className="flex-1 text-xl font-bold text-roxo-escuro">{titulo}</h1>
        {acao}
      </header>
      {children}
    </div>
  );
}

export function Cartao({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 ${className}`} {...props} />;
}

export function Secao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

const ESTILOS = {
  primario: "bg-roxo text-white active:bg-roxo-escuro disabled:bg-slate-300",
  secundario: "bg-white text-roxo ring-1 ring-roxo/30 active:bg-roxo/5 disabled:text-slate-400",
  perigo: "bg-white text-red-700 ring-1 ring-red-300 active:bg-red-50",
  destaque: "bg-amarelo text-roxo-escuro active:brightness-95 disabled:bg-slate-300",
};

export type EstiloBotao = keyof typeof ESTILOS;

export function classeBotao(estilo: EstiloBotao = "primario", grande = false) {
  return `inline-flex items-center justify-center gap-2 rounded-xl px-4 font-semibold transition disabled:cursor-not-allowed ${
    grande ? "min-h-14 text-lg" : "min-h-11"
  } ${ESTILOS[estilo]}`;
}

export function Botao({ estilo = "primario", grande, className = "", ...props }: ComponentProps<"button"> & { estilo?: EstiloBotao; grande?: boolean }) {
  return <button className={`${classeBotao(estilo, grande)} ${className}`} {...props} />;
}

export function BotaoLink({ estilo = "primario", grande, className = "", ...props }: ComponentProps<typeof Link> & { estilo?: EstiloBotao; grande?: boolean }) {
  return <Link className={`${classeBotao(estilo, grande)} ${className}`} {...props} />;
}

export const classeCampo =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-roxo focus:ring-2 focus:ring-roxo/20";

export function Campo({ rotulo, dica, className = "", ...props }: ComponentProps<"input"> & { rotulo: string; dica?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>
      <input className={classeCampo} {...props} />
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
    </label>
  );
}

export function Selecao({ rotulo, children, className = "", ...props }: ComponentProps<"select"> & { rotulo: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>
      <select className={classeCampo} {...props}>
        {children}
      </select>
    </label>
  );
}

export function AreaTexto({ rotulo, className = "", ...props }: ComponentProps<"textarea"> & { rotulo: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>
      <textarea className={`${classeCampo} py-2`} rows={3} {...props} />
    </label>
  );
}

export function Etiqueta({ cor, children }: { cor: string; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cor}`}>{children}</span>;
}

export function Numero({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; destaque?: boolean }) {
  return (
    <Cartao className={destaque ? "bg-roxo text-white ring-0" : ""}>
      <div className={`text-xs font-medium uppercase tracking-wide ${destaque ? "text-white/70" : "text-slate-500"}`}>{rotulo}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{valor}</div>
      {detalhe && <div className={`mt-0.5 text-sm ${destaque ? "text-white/80" : "text-slate-500"}`}>{detalhe}</div>}
    </Cartao>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "erro" | "ok" | "alerta"; children: ReactNode }) {
  const cores = {
    info: "bg-blue-50 text-blue-900 ring-blue-200",
    erro: "bg-red-50 text-red-800 ring-red-200",
    ok: "bg-green-50 text-green-800 ring-green-200",
    alerta: "bg-amber-50 text-amber-900 ring-amber-200",
  };
  return <div className={`rounded-xl px-4 py-3 text-sm ring-1 ${cores[tipo]}`}>{children}</div>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">{children}</p>;
}

/** Abas por link (?filtro=...). */
export function Abas({ itens, ativo }: { itens: { valor: string; rotulo: string; href: string }[]; ativo: string }) {
  return (
    <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {itens.map((i) => (
        <Link
          key={i.valor}
          href={i.href}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
            i.valor === ativo ? "bg-roxo text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
          }`}
        >
          {i.rotulo}
        </Link>
      ))}
    </nav>
  );
}
