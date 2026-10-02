import "server-only";
import pg from "pg";

// bigint (centavos, contagens) e numeric (km, %) viram number; datas ficam como texto AAAA-MM-DD.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1184, (v) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString());

const globalComPool = globalThis as unknown as { __startopPool?: pg.Pool };

function criarPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return new pg.Pool({
    connectionString: url,
    // o pooler do Supabase exige TLS; o certificado é da própria Supabase
    ssl: local || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: false },
    max: 3,
  });
}

function pool() {
  globalComPool.__startopPool ??= criarPool();
  return globalComPool.__startopPool;
}

export async function consultar<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool().query(sql, params);
  return r.rows as T[];
}

export async function consultarUm<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await consultar<T>(sql, params))[0] ?? null;
}

/** Mensagem de erro do banco própria para mostrar na tela (as funções SQL já escrevem em português). */
export function mensagemDoBanco(e: unknown): string {
  const err = e as { code?: string; message?: string; constraint?: string };
  if (err.code === "23505" && err.constraint?.includes("whatsapp")) return "Já existe um cliente com esse WhatsApp.";
  if (err.code === "23505") return "Já existe um cadastro igual.";
  if (err.code === "P0001" && err.message) return err.message.replace(/^ESTOQUE_INSUFICIENTE: /, "Estoque insuficiente: ");
  console.error(e);
  return "Não deu para salvar. Tente de novo.";
}

export function ehEstoqueInsuficiente(e: unknown) {
  return (e as { message?: string }).message?.startsWith("ESTOQUE_INSUFICIENTE") ?? false;
}
