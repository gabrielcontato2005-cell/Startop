import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { consultarUm } from "./db";
import { supabaseDaSessao } from "./supabase";

export type Perfil = "dono" | "atendente" | "entregador";
export type Usuario = { id: string; nome: string; email: string | null; perfil: Perfil };

/**
 * Só para rodar o app no computador sem Supabase Auth: entra direto com o usuário deste e-mail.
 * Ignorado em produção.
 */
const EMAIL_DEV = process.env.NODE_ENV !== "production" ? process.env.AUTH_DEV_EMAIL : undefined;

export const usuarioLogado = cache(async (): Promise<Usuario | null> => {
  if (EMAIL_DEV) {
    return consultarUm<Usuario>(`select id, nome, email, perfil from usuarios where email = $1 and ativo`, [EMAIL_DEV]);
  }
  const supabase = await supabaseDaSessao();
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) return null;
  return consultarUm<Usuario>(`select id, nome, email, perfil from usuarios where id = $1 and ativo`, [id]);
});

/** Exige login e, se informado, um dos perfis. Toda página e ação do servidor passa por aqui. */
export async function exigirUsuario(perfis?: Perfil[]): Promise<Usuario> {
  const u = await usuarioLogado();
  if (!u) redirect("/entrar");
  if (perfis && !perfis.includes(u.perfil)) redirect("/");
  return u;
}

export const exigirDono = () => exigirUsuario(["dono"]);
export const exigirEquipe = () => exigirUsuario(["dono", "atendente"]);

export const authDevAtivo = () => Boolean(EMAIL_DEV);
