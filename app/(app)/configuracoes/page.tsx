import { revalidatePath } from "next/cache";
import { BotaoEnviar, Formulario, type EstadoAcao } from "@/components/formulario";
import { AreaTexto, Campo, Cartao, Pagina, Secao, Selecao } from "@/components/ui";
import { lerConfig } from "@/lib/dados";
import { consultar, mensagemDoBanco } from "@/lib/db";
import { lerReais } from "@/lib/regras/dinheiro";
import { normalizarWhatsapp } from "@/lib/regras/telefone";
import { exigirDono } from "@/lib/sessao";

export const metadata = { title: "Configurações" };

const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** "10 = 10,00" por linha → [{ ate_km: 10, valor_centavos: 1000 }] */
function lerFaixas(texto: string) {
  const faixas = [];
  for (const linha of texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = linha.match(/^(\d+(?:[.,]\d+)?)\s*(?:km)?\s*[=:]\s*(?:R\$)?\s*([\d.,]+)$/i);
    if (!m) return null;
    const valor = lerReais(m[2]);
    if (valor == null) return null;
    faixas.push({ ate_km: Number(m[1].replace(",", ".")), valor_centavos: valor });
  }
  return faixas.sort((a, b) => a.ate_km - b.ate_km);
}

async function salvar(_: EstadoAcao, d: FormData): Promise<EstadoAcao> {
  "use server";
  const u = await exigirDono();
  const num = (c: string) => Number(String(d.get(c) ?? "").replace(",", "."));
  const txt = (c: string) => String(d.get(c) ?? "").trim();

  const km = num("km_por_caixa");
  const piso = num("pedido_minimo_piso");
  const raio = txt("raio_max_km") === "" ? null : num("raio_max_km");
  const porKm = lerReais(txt("taxa_por_km") || "0");
  const cartao = num("cartao_acrescimo_pct");
  const faixas = lerFaixas(txt("faixas"));
  const sumidoFator = num("sumido_fator");
  const sumidoDias = num("sumido_dias_padrao");
  const zap = txt("fabrica_whatsapp");

  if (!(km > 0)) return { erro: "Km por caixa precisa ser maior que zero." };
  if (!Number.isInteger(piso) || piso < 0) return { erro: "Pedido mínimo inválido." };
  if (raio != null && !(raio > 0)) return { erro: "Raio máximo inválido." };
  if (porKm == null || porKm < 0) return { erro: "Valor por km inválido." };
  if (!(cartao >= 0 && cartao <= 100)) return { erro: "Acréscimo do cartão inválido." };
  if (!faixas) return { erro: 'Faixas: use uma por linha, no formato "10 = 15,00" (até 10 km, R$ 15).' };
  if (!(sumidoFator > 0) || !Number.isInteger(sumidoDias) || sumidoDias < 1) return { erro: "Regra de cliente sumido inválida." };
  if (txt("horario_abertura") >= txt("horario_fechamento")) return { erro: "O horário de abertura precisa ser antes do fechamento." };
  if (zap && !normalizarWhatsapp(zap)) return { erro: "WhatsApp da fábrica inválido." };

  try {
    await consultar(
      `update configuracoes set fabrica_nome = $1, fabrica_endereco = $2, fabrica_cep = $3, fabrica_whatsapp = $4,
              km_por_caixa = $5, pedido_minimo_piso = $6, raio_max_km = $7, taxa_entrega_modo = $8,
              taxa_entrega_por_km_centavos = $9, taxa_entrega_faixas = $10, cartao_acrescimo_pct = $11,
              horario_abertura = $12, horario_fechamento = $13, sumido_fator = $14, sumido_dias_padrao = $15,
              atualizado_por = $16, atualizado_em = now()
        where id = 1`,
      [
        txt("fabrica_nome") || "StarTop CostaV", txt("fabrica_endereco"), txt("fabrica_cep").replace(/\D/g, "") || null,
        normalizarWhatsapp(zap), km, piso, raio, txt("taxa_entrega_modo") === "por_faixa" ? "por_faixa" : "por_km",
        porKm, JSON.stringify(faixas), cartao, txt("horario_abertura"), txt("horario_fechamento"), sumidoFator, sumidoDias, u.id,
      ],
    );
  } catch (e) {
    return { erro: mensagemDoBanco(e) };
  }
  revalidatePath("/", "layout");
  return { ok: "Configurações salvas." };
}

export default async function Configuracoes() {
  await exigirDono();
  const c = await lerConfig();
  const faixas = c.taxa_entrega_faixas.map((f) => `${String(f.ate_km).replace(".", ",")} = ${reais(f.valor_centavos)}`).join("\n");
  return (
    <Pagina titulo="Configurações" voltar="/mais">
      <Formulario acao={salvar}>
        <Secao titulo="Fábrica">
          <Cartao className="space-y-3">
            <Campo rotulo="Nome" name="fabrica_nome" defaultValue={c.fabrica_nome} />
            <Campo rotulo="Endereço" name="fabrica_endereco" defaultValue={c.fabrica_endereco} />
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="CEP" name="fabrica_cep" inputMode="numeric" defaultValue={c.fabrica_cep ?? ""} />
              <Campo rotulo="WhatsApp" name="fabrica_whatsapp" inputMode="tel" defaultValue={c.fabrica_whatsapp ?? ""} />
            </div>
          </Cartao>
        </Secao>
        <Secao titulo="Entrega">
          <Cartao className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="Km por caixa" name="km_por_caixa" inputMode="decimal" defaultValue={String(c.km_por_caixa).replace(".", ",")} dica="5 = 1 caixa a cada 5 km" />
              <Campo rotulo="Mínimo de caixas" name="pedido_minimo_piso" inputMode="numeric" defaultValue={c.pedido_minimo_piso} dica="perto da fábrica" />
              <Campo rotulo="Raio máximo (km)" name="raio_max_km" inputMode="decimal" defaultValue={c.raio_max_km ?? ""} dica="vazio = sem limite" />
            </div>
            <Selecao rotulo="Taxa de entrega" name="taxa_entrega_modo" defaultValue={c.taxa_entrega_modo}>
              <option value="por_km">Por km rodado</option>
              <option value="por_faixa">Por faixa de distância</option>
            </Selecao>
            <Campo rotulo="Valor por km (R$)" name="taxa_por_km" inputMode="decimal" defaultValue={reais(c.taxa_entrega_por_km_centavos)} dica="Usado no modo por km. A taxa sugerida é arredondada para o real e pode ser alterada em cada pedido." />
            <AreaTexto rotulo="Faixas (até km = R$)" name="faixas" defaultValue={faixas} placeholder={"10 = 10,00\n20 = 20,00\n40 = 35,00"} />
          </Cartao>
        </Secao>
        <Secao titulo="Pagamento e horário">
          <Cartao className="space-y-3">
            <Campo rotulo="Acréscimo no cartão de crédito (%)" name="cartao_acrescimo_pct" inputMode="decimal" defaultValue={String(c.cartao_acrescimo_pct).replace(".", ",")} />
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Abre às" name="horario_abertura" type="time" defaultValue={c.horario_abertura} />
              <Campo rotulo="Fecha às" name="horario_fechamento" type="time" defaultValue={c.horario_fechamento} />
            </div>
          </Cartao>
        </Secao>
        <Secao titulo="Cliente sumido">
          <Cartao className="grid grid-cols-2 gap-3">
            <Campo rotulo="Vezes a frequência dele" name="sumido_fator" inputMode="decimal" defaultValue={String(c.sumido_fator).replace(".", ",")} dica="1,5 = passou 50% do normal" />
            <Campo rotulo="Dias (menos de 3 pedidos)" name="sumido_dias_padrao" inputMode="numeric" defaultValue={c.sumido_dias_padrao} />
          </Cartao>
        </Secao>
        <BotaoEnviar grande className="w-full">Salvar configurações</BotaoEnviar>
      </Formulario>
    </Pagina>
  );
}
