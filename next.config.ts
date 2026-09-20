import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack detecta otro lockfile en C:\Users\idieg\package-lock.json (fuera
  // del proyecto) y duda cuál es la raíz real — se la fijamos explícitamente.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
