import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StarTop Pedidos",
    short_name: "StarTop",
    description: "Pedidos, estoque e clientes da StarTop CostaV",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f3f8",
    theme_color: "#3d0b36",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
