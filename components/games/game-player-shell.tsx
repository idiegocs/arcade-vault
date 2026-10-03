"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { saveScore } from "@/app/actions/scores";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  DEFAULT_SKIN,
  type EngineHandle,
  type EngineState,
  type SkinId,
} from "./game-engine";
import {
  getMusicVolume,
  getSavedMusic,
  pauseMusic,
  playTrack,
  resumeMusic,
  saveMusic,
  setMusicVolume,
  stopMusic,
} from "./music";
import { MUSIC_TRACKS, TRACK_IDS, type MusicChoice } from "./music-tracks";
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
  // Música (spec 13): mismo patrón que la skin — default del registro en el
  // primer render; lo guardado se lee en el efecto que crea el motor.
  const music = GAME_ENGINES[gameId]?.music;
  const [musicChoice, setMusicChoice] = useState<MusicChoice>(music ?? "none");
  const [musicVolume, setMusicVolumeState] = useState(30);
  const musicChoiceRef = useRef(musicChoice);
  /** Se cambió de pista en pausa: al reanudar arranca la nueva desde el inicio. */
  const musicRestartRef = useRef(false);

  const skinOptions = GAME_ENGINES[gameId]?.skins;
  const hasSettings = (skinOptions?.length ?? 0) > 0 || !!music;
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
    const initialMusic = registration.music ? getSavedMusic(gameId, registration.music) : "none";
    const initialSkin = registration.skins?.includes(savedSkin) ? savedSkin : DEFAULT_SKIN;

    loadEngine().then((createEngine) => {
      if (cancelled || !canvasRef.current) return;
      handle = createEngine(canvasRef.current, (next) => setState(next), { skin: initialSkin });
      engineRef.current = handle;
      setSkin(initialSkin);
      setReady(true);
      handle.start();
      // Música de fondo (spec 13): antes del primer gesto queda en espera y
      // arranca sola con la primera tecla o toque (ver `music.ts`).
      musicChoiceRef.current = initialMusic;
      setMusicChoice(initialMusic);
      setMusicVolumeState(getMusicVolume());
      if (initialMusic !== "none") playTrack(initialMusic);
    });

    return () => {
      cancelled = true;
      handle?.destroy();
      engineRef.current = null;
      stopMusic();
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

  // Música según la partida (spec 13): se pausa con la pausa (también la
  // automática), se detiene en game over y arranca desde el inicio al
  // reiniciar. El primer `playTrack` lo hace el efecto que crea el motor.
  const musicPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = musicPhaseRef.current;
    musicPhaseRef.current = state.phase;
    if (!music || prev === state.phase) return;
    const choice = musicChoiceRef.current;
    if (state.phase === "paused") pauseMusic();
    else if (state.phase === "gameover") stopMusic();
    else if (prev === "paused" && !musicRestartRef.current) resumeMusic();
    else if (choice !== "none") playTrack(choice); // JUGAR DE NUEVO, o pista cambiada en pausa
    musicRestartRef.current = false;
  }, [state.phase, music]);

  const handleMusicChange = (next: MusicChoice) => {
    musicChoiceRef.current = next;
    setMusicChoice(next);
    saveMusic(gameId, next);
    if (state.phase === "playing") {
      if (next === "none") stopMusic();
      else playTrack(next);
    } else if (state.phase === "paused") {
      // En pausa no suena nada: la nueva pista arranca al reanudar.
      stopMusic();
      musicRestartRef.current = true;
    }
  };

  const handleMusicVolume = (next: number) => {
    setMusicVolumeState(next);
    setMusicVolume(next);
  };

  // Fase actual para handlers y listeners que no se re-crean con cada cambio
  // (pausa automática, teclas de juego, cierre del panel de ajustes).
  const phaseRef = useRef(state.phase);
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  // Panel de ajustes ⚙ (spec 13): skin y música detrás de un solo ícono, en
  // todos los dispositivos. Pausa la partida al abrirse y, al cerrarse, la
  // reanuda solo si fue el panel quien la pausó.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pausedBySettingsRef = useRef(false);

  const openSettings = () => {
    pausedBySettingsRef.current = state.phase === "playing";
    if (pausedBySettingsRef.current) engineRef.current?.pause();
    setSettingsOpen(true);
  };

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (pausedBySettingsRef.current && phaseRef.current === "paused") engineRef.current?.resume();
    pausedBySettingsRef.current = false;
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [settingsOpen, closeSettings]);

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
          <div className="hud-stat player">
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
        {/* Íconos en todos los dispositivos (spec 12 en táctil, spec 13 en
            desktop); `aria-label` y `title` conservan el nombre de cada acción. */}
        <div className="hud-actions is-icons">
          {hasSettings ? (
            <button
              className="btn"
              type="button"
              onClick={openSettings}
              disabled={!ready}
              aria-label="Ajustes"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              title="Ajustes"
            >
              ⚙
            </button>
          ) : null}
          <button
            className="btn yellow"
            type="button"
            onClick={handlePauseToggle}
            disabled={!ready || isGameOver}
            aria-label={state.phase === "paused" ? "Reanudar" : "Pausa"}
            title={state.phase === "paused" ? "Reanudar" : "Pausa"}
          >
            {state.phase === "paused" ? "▶" : "❚❚"}
          </button>
          <button
            className="btn magenta"
            type="button"
            onClick={handleFin}
            disabled={!ready || isGameOver}
            aria-label="Fin"
            title="Fin"
          >
            ■
          </button>
          {fullscreenEnabled ? (
            <button
              className="btn"
              type="button"
              onClick={handleFullscreenToggle}
              aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              {isFullscreen ? "⤡" : "⤢"}
            </button>
          ) : null}
          <Link href={`/juegos/${gameId}`} className="btn ghost" aria-label="Salir" title="Salir">
            ✕
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

      {settingsOpen && (
        <div className="modal-bd" onClick={closeSettings}>
          <div
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="settings-title">AJUSTES</h2>
            {skinOptions && skinOptions.length > 0 ? (
              <div className="settings-field">
                <div className="l" id="skin-label">
                  Skin
                </div>
                <select
                  className="hud-skin-select"
                  aria-labelledby="skin-label"
                  value={skin}
                  onChange={(e) => handleSkinChange(e.target.value as SkinId)}
                >
                  {skinOptions.map((id) => (
                    <option key={id} value={id}>
                      {SKIN_LABELS[id]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {music ? (
              <div className="settings-field">
                <div className="l" id="music-label">
                  Música
                </div>
                <select
                  className="hud-skin-select"
                  aria-labelledby="music-label"
                  value={musicChoice}
                  onChange={(e) => handleMusicChange(e.target.value as MusicChoice)}
                >
                  {TRACK_IDS.map((id) => (
                    <option key={id} value={id}>
                      {MUSIC_TRACKS[id].label}
                    </option>
                  ))}
                  <option value="none">SIN MÚSICA</option>
                </select>
                <div className="settings-volume">
                  <input
                    type="range"
                    className="vu-slider"
                    min={0}
                    max={100}
                    step={10}
                    value={musicVolume}
                    onChange={(e) => handleMusicVolume(Number(e.target.value))}
                    aria-label="Volumen de la música"
                    aria-valuetext={`${musicVolume} %`}
                    style={{ "--level": `${musicVolume}%` } as CSSProperties}
                  />
                  <span className="vu-value" aria-hidden="true">
                    {String(musicVolume).padStart(3, "0")}
                  </span>
                </div>
              </div>
            ) : null}
            <button className="btn" type="button" onClick={closeSettings} autoFocus>
              LISTO
            </button>
          </div>
        </div>
      )}

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
