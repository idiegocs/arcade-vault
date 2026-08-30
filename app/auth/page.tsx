"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "@/app/actions/auth";

export default function AuthPage() {
  const [tab, setTab] = useState<"in" | "up">("in");
  const [signInState, signInAction, signInPending] = useActionState(signIn, undefined);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, undefined);

  // Inputs controlados: un <form action={...}> resetea los campos no
  // controlados cada vez que la Server Action termina (incluso si devuelve
  // un error en vez de lanzar), así que el valor tiene que vivir en React,
  // no en el DOM, para sobrevivir a un intento fallido.
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const state = tab === "in" ? signInState : signUpState;
  const pending = tab === "in" ? signInPending : signUpPending;
  const action = tab === "in" ? signInAction : signUpAction;
  const shake = Boolean(state?.error) && !pending;

  return (
    <div className="av-auth-wrap fade-in">
      <div className={`auth-card${shake ? " shake" : ""}`}>
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">ARCADE VAULT</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            ACCESO AL SISTEMA · v2.6
          </div>
        </div>

        <div className="auth-tabs">
          <button type="button" className={tab === "in" ? "on" : ""} onClick={() => setTab("in")}>
            INICIAR SESIÓN
          </button>
          <button type="button" className={tab === "up" ? "on" : ""} onClick={() => setTab("up")}>
            CREAR CUENTA
          </button>
        </div>

        <form action={action}>
          {tab === "up" && (
            <div className="field slide-in">
              <label>Usuario</label>
              <input
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="px_kai"
                disabled={pending}
              />
            </div>
          )}
          <div className="field">
            <label>Correo electrónico</label>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jugador@vault.gg"
              disabled={pending}
            />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {pending
              ? tab === "in"
                ? "ENTRANDO…"
                : "CREANDO…"
              : tab === "in"
                ? "ENTRAR AL VAULT"
                : "CREAR Y JUGAR"}
          </button>

          {state?.error && (
            <div className="contact-error" style={{ marginTop: 14 }}>
              [ERROR] {state.error}
            </div>
          )}
        </form>

        <button className="btn ghost" type="button" style={{ width: "100%", marginTop: 10 }}>
          JUGAR COMO INVITADO
        </button>

        <div className="auth-divider">O CONTINÚA CON</div>
        <div className="social">
          <button className="btn ghost" type="button">
            ◆ GOOGLE
          </button>
          <button className="btn ghost" type="button">
            ▣ GITHUB
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            textAlign: "center",
            fontSize: 11,
            color: "var(--ink-faint)",
            letterSpacing: "0.1em",
          }}
        >
          AL ENTRAR ACEPTAS LOS TÉRMINOS DEL SALÓN ARCADE
        </div>
      </div>
    </div>
  );
}
