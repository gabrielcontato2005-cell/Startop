/**
 * Normaliza um WhatsApp brasileiro para só dígitos com DDI: "(21) 99999-8888" → "5521999998888".
 * Número sem DDD recebe o DDD padrão (21, Itaguaí). Devolve null se não parecer telefone.
 */
export function normalizarWhatsapp(texto: string | null | undefined, dddPadrao = "21"): string | null {
  if (!texto) return null;
  let d = texto.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 8 || d.length === 9) d = dddPadrao + d;
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) d = d.slice(0, 2) + "9" + d.slice(2); // celular antigo sem o 9
  if (d.length !== 10 && d.length !== 11) return null;
  return "55" + d;
}

export function formatarWhatsapp(numero: string | null | undefined): string {
  if (!numero) return "";
  const d = numero.startsWith("55") ? numero.slice(2) : numero;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return numero;
}

export function linkWhatsapp(numero: string | null | undefined, texto: string): string {
  const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}
