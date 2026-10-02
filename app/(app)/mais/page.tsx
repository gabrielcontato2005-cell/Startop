import Link from "next/link";
import { redirect } from "next/navigation";
import { Cartao, Pagina } from "@/components/ui";
import { exigirUsuario } from "@/lib/sessao";
import { supabaseDaSessao } from "@/lib/supabase";

export const metadata = { title: "Mais" };

async function sair() {
  "use server";
  const supabase = await supabaseDaSessao();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export default async function Mais() {
  const u = await exigirUsuario();
  const dono = u.perfil === "dono";
  const grupos: { titulo: string; itens: { href: string; nome: string; desc: string }[] }[] = [
    {
      titulo: "Operação",
      itens: [
        { href: "/separacao", nome: "Separação do dia", desc: "Quanto separar de cada sabor" },
        ...(u.perfil !== "entregador" ? [{ href: "/estoque", nome: "Estoque", desc: "Saldo por sabor e tamanho" }] : []),
        ...(dono
          ? [
              { href: "/estoque/lote", nome: "Chegou mercadoria", desc: "Entrada de lote da fábrica" },
              { href: "/estoque/contagem", nome: "Contagem de estoque", desc: "Digitar o que tem na câmara fria" },
            ]
          : []),
      ],
    },
    ...(dono
      ? [
          {
            titulo: "Gestão",
            itens: [
              { href: "/relatorios", nome: "Relatórios", desc: "Faturamento, lucro e rankings" },
              { href: "/produtos", nome: "Produtos e preços", desc: "Sabores, preço, custo e margem" },
              { href: "/produtos/descontos", nome: "Descontos", desc: "Regras de desconto por quantidade" },
              { href: "/clientes/importar", nome: "Importar clientes", desc: "Planilha, contatos ou lista" },
              { href: "/configuracoes", nome: "Configurações", desc: "Entrega, horário, cartão" },
              { href: "/usuarios", nome: "Usuários", desc: "Quem usa o sistema" },
            ],
          },
        ]
      : []),
  ];

  return (
    <Pagina titulo="Mais">
      {grupos.map((g) => (
        <section key={g.titulo} className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{g.titulo}</h2>
          <Cartao className="divide-y divide-slate-100 p-0">
            {g.itens.map((i) => (
              <Link key={i.href} href={i.href} className="flex items-center justify-between px-4 py-3 active:bg-slate-50">
                <span>
                  <span className="block font-medium">{i.nome}</span>
                  <span className="block text-sm text-slate-500">{i.desc}</span>
                </span>
                <span className="text-xl text-slate-400">›</span>
              </Link>
            ))}
          </Cartao>
        </section>
      ))}
      <Cartao className="flex items-center justify-between">
        <span>
          <span className="block font-medium">{u.nome}</span>
          <span className="block text-sm capitalize text-slate-500">{u.perfil}</span>
        </span>
        <form action={sair}>
          <button className="rounded-xl px-3 py-2 font-medium text-red-700 active:bg-red-50">Sair</button>
        </form>
      </Cartao>
    </Pagina>
  );
}
