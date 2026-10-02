"use client";

import { useState } from "react";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { AreaTexto, Campo, Selecao } from "@/components/ui";
import { pedidoMinimo } from "@/lib/regras/entrega";
import { formatarWhatsapp } from "@/lib/regras/telefone";
import { salvarCliente } from "./acoes";

export type ClienteForm = {
  id?: string;
  nome_loja?: string;
  responsavel?: string | null;
  whatsapp?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  distancia_km?: number | null;
  pedido_minimo_manual?: number | null;
  observacoes?: string | null;
  ativo?: boolean;
};

export default function FormCliente({
  cliente = {},
  kmPorCaixa,
  pisoMinimo,
  voltarPara,
}: {
  cliente?: ClienteForm;
  kmPorCaixa: number;
  pisoMinimo: number;
  voltarPara?: string;
}) {
  const [endereco, setEndereco] = useState({
    logradouro: cliente.logradouro ?? "",
    bairro: cliente.bairro ?? "",
    cidade: cliente.cidade ?? "",
    uf: cliente.uf ?? "",
  });
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState("");
  const [km, setKm] = useState(cliente.distancia_km?.toString().replace(".", ",") ?? "");

  async function buscarCep(valor: string) {
    const cep = valor.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    setAvisoCep("");
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) setAvisoCep("CEP não encontrado.");
      else setEndereco({ logradouro: d.logradouro ?? "", bairro: d.bairro ?? "", cidade: d.localidade ?? "", uf: d.uf ?? "" });
    } catch {
      setAvisoCep("Não consegui buscar o CEP agora. Preencha o endereço à mão.");
    } finally {
      setBuscandoCep(false);
    }
  }

  const kmNumero = km.trim() === "" ? null : Number(km.replace(",", "."));
  const minimo = kmNumero != null && Number.isFinite(kmNumero) ? pedidoMinimo(kmNumero, { km_por_caixa: kmPorCaixa, pedido_minimo_piso: pisoMinimo }) : null;

  return (
    <Formulario acao={salvarCliente}>
      {cliente.id && <input type="hidden" name="id" value={cliente.id} />}
      {voltarPara && <input type="hidden" name="voltar_para" value={voltarPara} />}
      <Campo rotulo="Nome da loja *" name="nome_loja" defaultValue={cliente.nome_loja} required autoFocus={!cliente.id} />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Responsável" name="responsavel" defaultValue={cliente.responsavel ?? ""} />
        <Campo rotulo="WhatsApp" name="whatsapp" type="tel" inputMode="tel" placeholder="(21) 99999-8888" defaultValue={formatarWhatsapp(cliente.whatsapp)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Campo
          rotulo={buscandoCep ? "CEP (buscando…)" : "CEP"}
          name="cep"
          inputMode="numeric"
          placeholder="23815-000"
          defaultValue={cliente.cep ?? ""}
          onBlur={(e) => buscarCep(e.target.value)}
          onChange={(e) => e.target.value.replace(/\D/g, "").length === 8 && buscarCep(e.target.value)}
          className="col-span-1"
        />
        <Campo rotulo="Rua" name="logradouro" value={endereco.logradouro} onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })} className="col-span-2" />
      </div>
      {avisoCep && <p className="text-sm text-amber-700">{avisoCep}</p>}
      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Número" name="numero" defaultValue={cliente.numero ?? ""} />
        <Campo rotulo="Complemento" name="complemento" defaultValue={cliente.complemento ?? ""} className="col-span-2" />
      </div>
      <div className="grid grid-cols-5 gap-3">
        <Campo rotulo="Bairro" name="bairro" value={endereco.bairro} onChange={(e) => setEndereco({ ...endereco, bairro: e.target.value })} className="col-span-2" />
        <Campo rotulo="Cidade" name="cidade" value={endereco.cidade} onChange={(e) => setEndereco({ ...endereco, cidade: e.target.value })} className="col-span-2" />
        <Campo rotulo="UF" name="uf" maxLength={2} value={endereco.uf} onChange={(e) => setEndereco({ ...endereco, uf: e.target.value.toUpperCase() })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          rotulo="Distância da fábrica (km)"
          name="distancia_km"
          inputMode="decimal"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          dica={minimo != null ? `Pedido mínimo para entrega: ${minimo} caixa${minimo > 1 ? "s" : ""}` : "Veja no Google Maps, de carro"}
        />
        <Campo
          rotulo="Mínimo combinado (opcional)"
          name="pedido_minimo_manual"
          inputMode="numeric"
          defaultValue={cliente.pedido_minimo_manual ?? ""}
          dica="Só se for diferente da regra"
        />
      </div>
      <AreaTexto rotulo="Observações" name="observacoes" defaultValue={cliente.observacoes ?? ""} />
      {cliente.id && (
        <Selecao rotulo="Situação" name="ativo" defaultValue={cliente.ativo === false ? "nao" : "sim"}>
          <option value="sim">Ativo</option>
          <option value="nao">Inativo (não aparece no pedido)</option>
        </Selecao>
      )}
      <BotaoEnviar grande className="w-full">
        Salvar cliente
      </BotaoEnviar>
    </Formulario>
  );
}
