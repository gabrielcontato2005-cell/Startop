import { redirect } from "next/navigation";
import { Formulario, BotaoEnviar, type EstadoAcao } from "@/components/formulario";
import { Campo } from "@/components/ui";
import { usuarioLogado } from "@/lib/sessao";
import { supabaseDaSessao } from "@/lib/supabase";

export const metadata = { title: "Entrar" };

async function entrar(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  "use server";
  const supabase = await supabaseDaSessao();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(dados.get("email") ?? "").trim(),
    password: String(dados.get("senha") ?? ""),
  });
  if (error) return { erro: "E-mail ou senha errados." };
  redirect("/");
}

export default async function Entrar() {
  if (await usuarioLogado()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-roxo-escuro px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center text-white">
          <div className="text-4xl font-black tracking-tight">
            Star<span className="text-amarelo">Top</span>
          </div>
          <div className="mt-1 text-white/70">Pedidos · Estoque · Clientes</div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-xl">
          <Formulario acao={entrar}>
            <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" required inputMode="email" />
            <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required />
            <BotaoEnviar grande className="w-full">
              Entrar
            </BotaoEnviar>
          </Formulario>
        </div>
      </div>
    </main>
  );
}
