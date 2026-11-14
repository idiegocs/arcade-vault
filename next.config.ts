import path from "node:path";
import type { NextConfig } from "next";
import { publicEnv } from "./lib/env.public";

// Valida las variables del ambiente al arrancar `next dev`, `next build` y
// `next start` (spec 18). Faltantes o un build de prod que apunte a la base de
// dev cortan acá, con el mensaje de lib/env.public.ts, en vez de fallar a mitad
// de una request.
publicEnv();

// Headers de seguridad (spec 16). Van acá y no en proxy.ts porque el matcher
// del proxy excluye _next/static y las imágenes. HSTS sin `preload` (difícil de
// revertir, todavía no hay dominio de producción) y solo en producción: con
// `next dev --experimental-https` fijaría localhost a HTTPS por 2 años.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
  // Sin `X-Powered-By: Next.js` (spec 17): no anunciar el framework.
  poweredByHeader: false,
  // Turbopack detecta otro lockfile en C:\Users\idieg\package-lock.json (fuera
  // del proyecto) y duda cuál es la raíz real — se la fijamos explícitamente.
  turbopack: {
    root: path.join(__dirname),
  },
  // En dev, Next bloquea los assets/HMR pedidos desde orígenes que no sean
  // localhost: abriendo la app por la IP de la red local (p. ej. desde el
  // celular) la página no hidrata y los juegos se quedan en "CARGANDO…".
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
