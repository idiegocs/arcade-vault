/**
 * Variables públicas de la app, validadas (spec 18).
 *
 * El ambiente lo dice `NEXT_PUBLIC_APP_ENV`, no `NODE_ENV`: un `next build`
 * local tiene `NODE_ENV=production` aunque lea las variables de dev. Ver
 * db/README.md → "Cómo sabe la app en qué ambiente está".
 *
 * Sin `server-only`: lo importan el proxy y `next.config.ts`. Las lecturas son
 * `process.env.NEXT_PUBLIC_X` literales a propósito, porque Next solo inlinea
 * esa forma en el bundle del navegador.
 */

export type AppEnv = "development" | "production";

export type PublicEnv = {
  appEnv: AppEnv;
  siteUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

const APP_ENVS: readonly AppEnv[] = ["development", "production"];

export function publicEnv(): PublicEnv {
  const values = {
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno: ${missing.join(", ")}. ` +
        "Ver db/environments/<ambiente>/.env.example."
    );
  }

  const appEnv = values.NEXT_PUBLIC_APP_ENV as AppEnv;
  if (!APP_ENVS.includes(appEnv)) {
    throw new Error(
      `NEXT_PUBLIC_APP_ENV="${values.NEXT_PUBLIC_APP_ENV}" no es válido: usar "development" o "production".`
    );
  }

  const env: PublicEnv = {
    appEnv,
    siteUrl: (values.NEXT_PUBLIC_SITE_URL as string).replace(/\/+$/, ""),
    supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL as string,
    supabasePublishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
  };

  assertNotDevInProd(env);
  return env;
}

/**
 * Guarda anti-dev-en-prod: con `NEXT_PUBLIC_APP_ENV=production`, la URL de
 * Supabase no puede ser la del proyecto de dev. `SUPABASE_DEV_PROJECT_REF` no es
 * pública, así que la guarda solo corre en el servidor, donde es obligatoria.
 * En el navegador es `undefined` y no se valida.
 */
function assertNotDevInProd(env: PublicEnv): void {
  if (env.appEnv !== "production" || typeof window !== "undefined") return;

  const devRef = process.env.SUPABASE_DEV_PROJECT_REF;
  if (!devRef) {
    throw new Error(
      "Falta SUPABASE_DEV_PROJECT_REF: en producción es obligatoria (guarda anti-dev-en-prod)."
    );
  }
  if (env.supabaseUrl.includes(devRef)) {
    throw new Error(
      `NEXT_PUBLIC_APP_ENV=production pero NEXT_PUBLIC_SUPABASE_URL apunta al proyecto de dev (${devRef}). ` +
        "Cargar las variables de prod (db/environments/prod/.env.example)."
    );
  }
}
