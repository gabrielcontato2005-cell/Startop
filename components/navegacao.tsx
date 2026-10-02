"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Perfil } from "@/lib/sessao";

const ICONES = {
  inicio: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  pedidos: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  clientes: "M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M15.5 3.1a3.5 3.5 0 010 6.8",
  mais: "M4 6h16M4 12h16M4 18h16",
};

function Icone({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function Navegacao({ perfil }: { perfil: Perfil }) {
  const caminho = usePathname();
  const ativo = (href: string) =>
    href === "/" ? caminho === "/" : caminho.startsWith(href) && !(href === "/pedidos" && caminho === "/pedidos/novo");
  const item = (href: string, rotulo: string, icone: string) => (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${ativo(href) ? "text-roxo" : "text-slate-500"}`}
    >
      <Icone d={icone} />
      {rotulo}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-end">
        {item("/", "Início", ICONES.inicio)}
        {item("/pedidos", "Pedidos", ICONES.pedidos)}
        {perfil !== "entregador" && (
          <Link href="/pedidos/novo" className="-mt-5 flex flex-1 flex-col items-center gap-0.5 pb-2 text-[11px] font-semibold text-roxo">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amarelo text-3xl font-light text-roxo-escuro shadow-lg ring-4 ring-white">
              +
            </span>
            Novo pedido
          </Link>
        )}
        {perfil !== "entregador" && item("/clientes", "Clientes", ICONES.clientes)}
        {item("/mais", "Mais", ICONES.mais)}
      </div>
    </nav>
  );
}
