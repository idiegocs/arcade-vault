"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveScore } from "@/app/actions/scores";
import { ARENA_HEIGHT, ARENA_WIDTH, type EngineHandle, type EngineState } from "./game-engine";
import { GAME_ENGINES } from "./registry";

type Props = {
  gameId: string;
  gameTitle: string;
  /** Username de la sesión activa, o `null` si no hay sesión (invitado). */
  username: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const INITIAL_STATE: EngineState = { score: 0, lives: 3, level: 1, phase: "playing" };

/**
 * Shell genérico y reutilizable para cualquier motor de juego que cumpla
 * `EngineFactory`. Ver `README.md` (en esta carpeta) para agregar un juego
 * nuevo — este archivo no debería necesitar cambios.
 */
export function GamePlayerShell({ gameId, gameTitle, username }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const savedForRunRef = useRef(false);

  const [state, setState] = useState<EngineState>(INITIAL_STATE);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: EngineHandle | null = null;

    const loadEngine = GAME_ENGINES[gameId];
    if (!loadEngine) return;

    loadEngine().then((createEngine) => {
      if (cancelled || !canvasRef.current) return;
      handle = createEngine(canvasRef.current, (next) => setState(next));
      engineRef.current = handle;
      setReady(true);
      handle.start();
    });

    return () => {
      cancelled = true;
      handle?.destroy();
      engineRef.current = null;
    };
  }, [gameId]);

  const doSaveScore = useCallback(
    async (score: number) => {
      setSaveStatus("saving");
      setSaveError(null);
      const result = await saveScore(gameId, score);
      if (result.ok) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        setSaveError(result.error);
      }
    },
    [gameId]
  );

  // Guarda automáticamente al entrar a game over, una sola vez por partida.
  useEffect(() => {
    if (state.phase !== "gameover") return;
    if (!username) return;
    if (savedForRunRef.current) return;
    savedForRunRef.current = true;
    void doSaveScore(state.score);
  }, [state.phase, state.score, username, doSaveScore]);

  const handlePauseToggle = () => {
    if (!engineRef.current) return;
    if (state.phase === "paused") engineRef.current.resume();
    else if (state.phase === "playing") engineRef.current.pause();
  };

  const handleFin = () => {
    engineRef.current?.endGame();
  };

  const handleRestart = () => {
    savedForRunRef.current = false;
    setSaveStatus("idle");
    setSaveError(null);
    engineRef.current?.restart();
  };

  const isGameOver = state.phase === "gameover";

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {username ? username.toUpperCase() : "INVITADO"}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{state.score.toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">{"♥ ".repeat(Math.max(state.lives, 0)).trim() || "—"}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(state.level).padStart(2, "0")}</div>
          </div>
          {state.badge ? (
            <div className="hud-stat">
              <div className="l">{state.badge.label}</div>
              <div className="v" style={{ color: "var(--cyan)" }}>
                {state.badge.value}
              </div>
            </div>
          ) : null}
        </div>
        <div className="hud-actions">
          <button
            className="btn yellow"
            type="button"
            onClick={handlePauseToggle}
            disabled={!ready || isGameOver}
          >
            {state.phase === "paused" ? "REANUDAR" : "PAUSA"}
          </button>
          <button
            className="btn magenta"
            type="button"
            onClick={handleFin}
            disabled={!ready || isGameOver}
          >
            FIN
          </button>
          <Link href={`/juegos/${gameId}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          <canvas
            ref={canvasRef}
            width={ARENA_WIDTH}
            height={ARENA_HEIGHT}
            style={{ display: "block", width: "100%", height: "100%" }}
          />
          {!ready && (
            <div className="crt-content" style={{ zIndex: 5 }}>
              CARGANDO…
            </div>
          )}
          {state.phase === "paused" && (
            <div className="crt-content" style={{ background: "rgba(0,0,0,0.6)", zIndex: 5 }}>
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-dim)",
                    marginTop: 10,
                    letterSpacing: "0.16em",
                  }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{gameTitle} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {isGameOver && (
        <div className="modal-bd">
          <div className="modal">
            <h2>FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{state.score.toLocaleString("es-ES")}</div>

            {username ? (
              saveStatus === "saved" ? (
                <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
              ) : saveStatus === "error" ? (
                <div style={{ marginTop: 14 }}>
                  <div className="mono" style={{ fontSize: 12, color: "var(--magenta)" }}>
                    {saveError ?? "No se pudo guardar la puntuación."}
                  </div>
                  <button
                    className="btn yellow"
                    type="button"
                    style={{ marginTop: 10 }}
                    onClick={() => void doSaveScore(state.score)}
                  >
                    REINTENTAR
                  </button>
                </div>
              ) : (
                <div
                  className="mono"
                  style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 14 }}
                >
                  GUARDANDO…
                </div>
              )
            ) : (
              <div style={{ marginTop: 14 }}>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                  Inicia sesión para guardar tu puntuación.
                </div>
                <Link
                  href="/auth"
                  className="btn yellow"
                  style={{ marginTop: 10, display: "inline-block" }}
                >
                  INICIAR SESIÓN
                </Link>
              </div>
            )}

            <div className="actions">
              <button className="btn" type="button" onClick={handleRestart}>
                JUGAR DE NUEVO
              </button>
              <Link href={`/juegos/${gameId}`} className="btn magenta">
                VOLVER AL VAULT
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
