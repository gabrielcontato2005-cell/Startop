import Navegacao from "@/components/navegacao";
import { exigirUsuario } from "@/lib/sessao";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const usuario = await exigirUsuario();
  return (
    <>
      <main className="min-h-dvh">{children}</main>
      <Navegacao perfil={usuario.perfil} />
    </>
  );
}
