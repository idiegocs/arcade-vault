"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary de segmento: atrapa cualquier excepción lanzada al renderizar
 * una página (típicamente `getGames`/`getScores` en lib/games.ts y lib/scores.ts,
 * que lanzan a propósito cuando Supabase no responde, para no confundir un
 * error de red con "0 juegos"/"0 puntajes"). Nav y Footer siguen visibles
 * porque este boundary no envuelve el layout, solo el contenido de la página.
 */
export default function ErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[arcade-vault] error de página:", error);
  }, [error]);

  return (
    <div className="av-hero fade-in" style={{ paddingTop: 96 }}>
      <h1 className="neon-magenta pixel" style={{ fontSize: "clamp(20px, 4vw, 34px)" }}>
        GAME OVER
      </h1>
      <div className="sub" style={{ color: "var(--ink-dim)", marginTop: 18 }}>
        NO PUDIMOS CONECTAR CON EL ARCADE <span className="blink">_</span>
      </div>
      <p
        className="mono"
        style={{
          color: "var(--ink-faint)",
          maxWidth: 480,
          margin: "18px auto 0",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        La base de datos no respondió. Puede ser una caída temporal del servicio — probá de nuevo en
        unos segundos.
        {error.digest && (
          <>
            <br />
            <span style={{ fontSize: 11 }}>Código de referencia: {error.digest}</span>
          </>
        )}
      </p>
      <div
        style={{
          display: "flex",
          gap: 14,
          justifyContent: "center",
          marginTop: 32,
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="btn pulse" onClick={() => unstable_retry()}>
          REINTENTAR
        </button>
        <Link href="/" className="btn ghost">
          VOLVER AL INICIO
        </Link>
      </div>
    </div>
  );
}
