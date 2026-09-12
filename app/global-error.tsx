"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Error boundary raíz: atrapa excepciones lanzadas por el propio RootLayout
 * (ej. `getSessionUsername` en lib/session.ts si Supabase no responde), casos
 * que app/error.tsx NO cubre porque ese boundary no envuelve el layout de su
 * mismo segmento. Al reemplazar el layout entero, no hay Nav/Footer — este
 * archivo define su propio <html>/<body> y evita depender de fuentes
 * next/font para no sumar otro punto de falla mientras el sitio ya está roto.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[arcade-vault] error global (root layout):", error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ background: "#0a0a0f", color: "#e6e9ff" }}>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "32px 16px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(22px, 5vw, 36px)",
              letterSpacing: "0.06em",
              color: "#ff006e",
              textShadow: "0 0 6px rgba(255,0,110,0.65), 0 0 16px rgba(255,0,110,0.45)",
            }}
          >
            ARCADE VAULT FUERA DE LÍNEA
          </h1>
          <p
            style={{
              color: "#8a8fb5",
              maxWidth: 460,
              marginTop: 16,
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            No pudimos conectar con la base de datos, así que ni siquiera pudimos cargar la sesión.
            Puede ser una caída temporal — probá de nuevo en unos segundos.
            {error.digest && (
              <>
                <br />
                <span style={{ fontSize: 12 }}>Código de referencia: {error.digest}</span>
              </>
            )}
          </p>
          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 28,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                padding: "12px 22px",
                background: "transparent",
                color: "#e6e9ff",
                border: "1px solid #00f5ff",
                cursor: "pointer",
                letterSpacing: "0.1em",
                fontSize: 13,
              }}
            >
              REINTENTAR
            </button>
            <a
              href="/"
              style={{
                padding: "12px 22px",
                border: "1px solid #4a4f70",
                color: "#8a8fb5",
                textDecoration: "none",
                letterSpacing: "0.1em",
                fontSize: 13,
              }}
            >
              VOLVER AL INICIO
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
