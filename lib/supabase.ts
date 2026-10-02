import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const CHAVE_SECRETA = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Cliente do Supabase Auth com a sessão do usuário (cookies). Só para login. */
export async function supabaseDaSessao() {
  const loja = await cookies();
  return createServerClient(SUPABASE_URL, CHAVE_PUBLICA, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => loja.set(name, value, options));
        } catch {
          // chamado de um Server Component: o proxy.ts renova a sessão
        }
      },
    },
  });
}

/** Cliente administrativo, só para criar usuários na tela de Usuários. */
export function supabaseAdmin() {
  return createClient(SUPABASE_URL, CHAVE_SECRETA, { auth: { persistSession: false, autoRefreshToken: false } });
}
