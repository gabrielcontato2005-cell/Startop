import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import RegistrarSw from "@/components/registrar-sw";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "StarTop Pedidos", template: "%s · StarTop" },
  description: "Pedidos, estoque e clientes da StarTop CostaV",
  appleWebApp: { capable: true, title: "StarTop", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#3d0b36",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <RegistrarSw />
      </body>
    </html>
  );
}
