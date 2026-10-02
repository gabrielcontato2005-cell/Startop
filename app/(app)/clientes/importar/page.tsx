import { Pagina } from "@/components/ui";
import { consultar } from "@/lib/db";
import { exigirDono } from "@/lib/sessao";
import Importador from "./importador";

export const metadata = { title: "Importar clientes" };

export default async function ImportarClientes() {
  await exigirDono();
  const existentes = await consultar<{ whatsapp: string }>(`select whatsapp from clientes where whatsapp is not null`);
  return (
    <Pagina titulo="Importar clientes" voltar="/clientes">
      <Importador whatsappsExistentes={existentes.map((e) => e.whatsapp)} />
    </Pagina>
  );
}
