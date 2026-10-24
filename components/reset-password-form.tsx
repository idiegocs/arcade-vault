"use client";

import { useActionState, useState } from "react";
import { updatePassword } from "@/app/actions/auth";

/** Tarjeta de /auth/restablecer: misma estética que la de /auth. */
export function ResetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  // Controlados por lo mismo que en AuthForm: sobreviven a un intento fallido.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const error = state && "error" in state ? state.error : undefined;

  return (
    <div className="av-auth-wrap fade-in">
      <div className={`auth-card${error && !pending ? " shake" : ""}`}>
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">NUEVA CONTRASEÑA</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            {email.toUpperCase()}
          </div>
        </div>

        <form action={action}>
          <div className="field">
            <label>Contraseña nueva</label>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              disabled={pending}
            />
          </div>
          <div className="field">
            <label>Repite la contraseña</label>
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              disabled={pending}
            />
          </div>

          <button
            className="btn lg"
            type="submit"
            style={{ width: "100%", marginTop: 8 }}
            disabled={pending}
          >
            {pending ? "GUARDANDO…" : "GUARDAR CONTRASEÑA"}
          </button>

          {error && (
            <div className="contact-error" style={{ marginTop: 14 }}>
              [ERROR] {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
