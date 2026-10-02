"use client";

export default function Imprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 flex-1 rounded-xl bg-roxo-escuro px-4 font-semibold text-white">
      Imprimir
    </button>
  );
}
