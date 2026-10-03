import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
