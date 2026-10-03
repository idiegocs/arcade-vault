"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveScore } from "@/app/actions/scores";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  DEFAULT_SKIN,
  type EngineHandle,
  type EngineState,
  type SkinId,
} from "./game-engine";
import { GAME_ENGINES } from "./registry";
import { getSavedSkin, saveSkin, SKIN_LABELS } from "./skins";
import { TouchGamepad } from "./touch-gamepad";

type Props = {
  gameId: string;
  gameTitle: string;
  /** Username de la sesión activa, o `null` si no hay sesión (invitado). */
  username: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const INITIAL_STATE: EngineState = { score: 0, lives: 3, level: 1, phase: "playing" };

/** Teclas de juego cuya acción por defecto del navegador se cancela durante
 * la partida (ver el efecto en `GamePlayerShell`). */
const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const COARSE_POINTER = "(pointer: coarse)";

function subscribeCoarsePointer(onChange: () => void) {
  const mq = window.matchMedia(COARSE_POINTER);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}
const noopSubscribe = () => () => {};

/** Si el navegador permite pantalla completa en elementos (iPhone Safari
 * no). `false` en el servidor, igual que `useIsTouch`. */
function useFullscreenEnabled() {
  return useSyncExternalStore(
    noopSubscribe,
    () => !!document.fullscreenEnabled,
    () => false
  );
}

function useIsFullscreen() {
  return useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement !== null,
    () => false
  );
}

/** `true` si el puntero principal es táctil. En el servidor (y durante la
 * hidratación) vale `false`, así el primer render calza con el HTML. */
function useIsTouch() {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false
  );
}

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
  // Arranca en el default para calzar con el render del servidor; la skin
  // guardada se lee recién en el cliente, al crear el motor (ver nav.tsx,
  // mismo gotcha de hidratación que el mute).
  const [skin, setSkin] = useState<SkinId>(DEFAULT_SKIN);

  const skinOptions = GAME_ENGINES[gameId]?.skins;
  const touchControls = GAME_ENGINES[gameId]?.touchControls;
  const isTouch = useIsTouch();
  const showGamepad = isTouch && !!touchControls;
  const playerRef = useRef<HTMLDivElement>(null);
  const fullscreenEnabled = useFullscreenEnabled();
  const isFullscreen = useIsFullscreen();

  useEffect(() => {
    let cancelled = false;
    let handle: EngineHandle | null = null;

    const registration = GAME_ENGINES[gameId];
    const loadEngine = registration?.load;
    if (!loadEngine) return;

    const savedSkin = getSavedSkin(gameId);
    const initialSkin = registration.skins?.includes(savedSkin) ? savedSkin : DEFAULT_SKIN;

    loadEngine().then((createEngine) => {
      if (cancelled || !canvasRef.current) return;
      handle = createEngine(canvasRef.current, (next) => setState(next), { skin: initialSkin });
      engineRef.current = handle;
      setSkin(initialSkin);
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

  // Vibración (spec 12): corta al perder una vida, patrón largo al game over.
  // Si la última vida se pierde junto con el game over, solo suena el largo.
  // `navigator.vibrate` no existe en iOS: ahí no hace nada.
  const prevLivesRef = useRef(state.lives);
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const vibrate = (pattern: number | number[]) => navigator.vibrate?.(pattern);
    if (state.phase === "gameover" && prevPhaseRef.current !== "gameover") {
      vibrate([100, 60, 100, 60, 300]);
    } else if (state.lives < prevLivesRef.current) {
      vibrate(150);
    }
    prevLivesRef.current = state.lives;
    prevPhaseRef.current = state.phase;
  }, [state.lives, state.phase]);

  // Pausa automática al ocultarse la pestaña (cambio de pestaña/app, celular
  // bloqueado), en todos los dispositivos. Nunca reanuda sola: al volver
  // queda EN PAUSA hasta tocar REANUDAR.
  const phaseRef = useRef(state.phase);
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && phaseRef.current === "playing") engineRef.current?.pause();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Mientras se juega, Espacio y flechas son del juego: se cancela su acción
  // por defecto (scroll de la página, o "presionar" el botón con foco, p. ej.
  // PANTALLA COMPLETA). En captura, antes que el botón con foco; los motores
  // igual reciben la tecla, porque `preventDefault` no frena el evento.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== "playing" || !GAME_KEYS.has(e.code)) return;
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

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

  /** Solo visual: no reinicia la partida ni toca el guardado de score. */
  const handleSkinChange = (next: SkinId) => {
    if (next === skin) return;
    setSkin(next);
    saveSkin(gameId, next);
    engineRef.current?.setSkin?.(next);
  };

  const handleFullscreenToggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void playerRef.current?.requestFullscreen();
  };

  const isGameOver = state.phase === "gameover";

  return (
    <div
      ref={playerRef}
      className={showGamepad ? "av-player fade-in is-touch" : "av-player fade-in"}
    >
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
          {skinOptions && skinOptions.length > 0 ? (
            <div className="hud-stat">
              <div className="l" id="skin-label">
                Skin
              </div>
              {isTouch ? (
                // En táctil, un desplegable ocupa mucho menos que tres botones.
                <select
                  className="hud-skin-select"
                  aria-labelledby="skin-label"
                  value={skin}
                  disabled={!ready}
                  onChange={(e) => handleSkinChange(e.target.value as SkinId)}
                >
                  {skinOptions.map((id) => (
                    <option key={id} value={id}>
                      {SKIN_LABELS[id]}
                    </option>
                  ))}
                </select>
              ) : (
                <div role="group" aria-labelledby="skin-label" style={{ display: "flex", gap: 6 }}>
                  {skinOptions.map((id) => {
                    const active = id === skin;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        className={active ? "btn" : "btn ghost"}
                        disabled={!ready}
                        onClick={() => handleSkinChange(id)}
                        style={{
                          padding: "6px 10px",
                          fontSize: 8,
                          color: active ? "var(--cyan)" : undefined,
                          textShadow: active ? "0 0 6px rgba(0,245,255,0.5)" : undefined,
                        }}
                      >
                        {SKIN_LABELS[id]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className={isTouch ? "hud-actions is-icons" : "hud-actions"}>
          <button
            className="btn yellow"
            type="button"
            onClick={handlePauseToggle}
            disabled={!ready || isGameOver}
            aria-label={state.phase === "paused" ? "Reanudar" : "Pausa"}
          >
            {isTouch
              ? state.phase === "paused"
                ? "▶"
                : "❚❚"
              : state.phase === "paused"
                ? "REANUDAR"
                : "PAUSA"}
          </button>
          <button
            className="btn magenta"
            type="button"
            onClick={handleFin}
            disabled={!ready || isGameOver}
            aria-label="Fin"
          >
            {isTouch ? "■" : "FIN"}
          </button>
          {fullscreenEnabled ? (
            <button
              className="btn"
              type="button"
              onClick={handleFullscreenToggle}
              aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              {isTouch
                ? isFullscreen
                  ? "⤡"
                  : "⤢"
                : isFullscreen
                  ? "SALIR DE PANTALLA COMPLETA"
                  : "PANTALLA COMPLETA"}
            </button>
          ) : null}
          <Link href={`/juegos/${gameId}`} className="btn ghost" aria-label="Salir">
            {isTouch ? "✕" : "SALIR"}
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

      {showGamepad && touchControls ? <TouchGamepad controls={touchControls} /> : null}

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
