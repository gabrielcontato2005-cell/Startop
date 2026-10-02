/** "08:00" ou "08:00:00" → minutos desde a meia-noite. */
export function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Entregas e retiradas só dentro do horário de funcionamento (padrão 8:00 às 17:00, inclusive). */
export function dentroDoHorario(hora: string | null | undefined, abertura: string, fechamento: string): boolean {
  if (!hora) return true;
  const m = minutos(hora);
  return m >= minutos(abertura) && m <= minutos(fechamento);
}

const FUSO = "America/Sao_Paulo";

/** Data de hoje em São Paulo, no formato AAAA-MM-DD. */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function formatarData(data: string | null | undefined): string {
  if (!data) return "";
  const [a, m, d] = data.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
