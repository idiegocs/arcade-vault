"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Gamepad virtual para pantallas táctiles. No sabe nada de los motores:
 * cada botón emite `KeyboardEvent` sintéticos sobre `window` con el `code`
 * de la tecla que el juego ya entiende. El layout de cada juego se declara
 * en `touchControls` de `registry.ts`.
 */

export type DpadSlot = "up" | "down" | "left" | "right";

export type TouchButton = {
  /** `KeyboardEvent.code` que se emite, ej. "ArrowLeft", "Space". */
  code: string;
  /** Texto visible en el botón, ej. "◀", "GIRAR". */
  label: string;
  /** Re-emite `keydown` mientras el botón sigue apretado, para motores que
   * dependen del auto-repeat nativo del teclado (CAÍDA). */
  repeat?: boolean;
};

export type TouchControls = {
  /** Cruceta (grupo izquierdo). Siempre se dibuja completa (▲▼◀▶); un slot
   * ausente se muestra deshabilitado. */
  dpad: Partial<Record<DpadSlot, TouchButton>>;
  /** Botones de acción (grupo derecho), en orden de izquierda a derecha. */
  actions?: TouchButton[];
};

/** Imitan el auto-repeat típico de un teclado. */
const REPEAT_DELAY_MS = 200;
const REPEAT_INTERVAL_MS = 60;

type Held = {
  id: string;
  button: TouchButton;
  /** Timer del auto-repeat (solo botones con `repeat`). */
  timer?: ReturnType<typeof setTimeout>;
};

const DPAD_SLOTS: readonly DpadSlot[] = ["up", "left", "right", "down"];

/** Flecha de un slot que el juego no declara (se dibuja deshabilitado). */
const DPAD_GLYPH: Record<DpadSlot, string> = {
  up: "▲",
  down: "▼",
  left: "◀",
  right: "▶",
};

const DPAD_ARIA: Record<DpadSlot, string> = {
  up: "Arriba",
  down: "Abajo",
  left: "Izquierda",
  right: "Derecha",
};

function emitKey(type: "keydown" | "keyup", code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
}

/** Corta el auto-repeat y emite el `keyup` de un botón soltado. */
function releaseHeld(held: Held) {
  clearTimeout(held.timer);
  clearInterval(held.timer);
  emitKey("keyup", held.button.code);
}

/**
 * Cada dedo (pointerId) que aprieta un botón queda registrado hasta que lo
 * suelta, para emitir su `keyup` aunque el dedo se salga del botón
 * (`setPointerCapture`) o el gamepad se desmonte a mitad de una pulsación.
 */
export function TouchGamepad({ controls }: { controls: TouchControls }) {
  const heldRef = useRef(new Map<number, Held>());
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set());

  const syncPressed = useCallback(() => {
    setPressed(new Set([...heldRef.current.values()].map((h) => h.id)));
  }, []);

  const press = (e: ReactPointerEvent<HTMLButtonElement>, id: string, button: TouchButton) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const held: Held = { id, button };
    heldRef.current.set(e.pointerId, held);
    emitKey("keydown", button.code);
    if (button.repeat) {
      // Mismo patrón que el auto-repeat del teclado: una pausa y después
      // ráfaga. `held.timer` pasa del timeout al interval al vencer la pausa.
      held.timer = setTimeout(() => {
        held.timer = setInterval(() => emitKey("keydown", button.code), REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    }
    syncPressed();
  };

  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const held = heldRef.current.get(e.pointerId);
    if (!held) return;
    heldRef.current.delete(e.pointerId);
    releaseHeld(held);
    syncPressed();
  };

  useEffect(() => {
    const held = heldRef.current;
    return () => {
      for (const h of held.values()) releaseHeld(h);
      held.clear();
    };
  }, []);

  const renderButton = (
    id: string,
    button: TouchButton,
    className: string,
    ariaLabel: string,
    content: string | null
  ) => (
    <button
      key={id}
      type="button"
      className={pressed.has(id) ? `${className} is-pressed` : className}
      aria-label={ariaLabel}
      onPointerDown={(e) => press(e, id, button)}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {content}
    </button>
  );

  const actions = controls.actions ?? [];

  return (
    <div className="touch-pad" role="group" aria-label="Controles táctiles">
      <div className="tp-dpad">
        {DPAD_SLOTS.map((slot) => {
          const button = controls.dpad[slot];
          return button ? (
            renderButton(`dpad-${slot}`, button, `tp-key tp-${slot}`, DPAD_ARIA[slot], button.label)
          ) : (
            <button
              key={`dpad-${slot}`}
              type="button"
              className={`tp-key tp-${slot}`}
              aria-label={DPAD_ARIA[slot]}
              disabled
            >
              {DPAD_GLYPH[slot]}
            </button>
          );
        })}
        <span className="tp-hub" aria-hidden="true" />
      </div>
      {actions.length > 0 ? (
        <div className="tp-actions">
          {actions.map((button, i) => (
            <div key={`action-${i}`} className="tp-action">
              {renderButton(
                `action-${i}`,
                button,
                `tp-round ${i % 2 === 0 ? "tp-magenta" : "tp-yellow"}`,
                button.label,
                null
              )}
              <span className="tp-plate" aria-hidden="true">
                {button.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
