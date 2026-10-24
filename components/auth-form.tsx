"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp } from "@/app/actions/auth";
import { version } from "@/package.json";

/**
 * Tarjeta de /auth. `next` es el destino (ya validado con `safeNext`) tras
 * entrar; `linkError` es el error con el que volvió /auth/callback, si hubo.
 */
export function AuthForm({ next, linkError }: { next: string; linkError: string | null }) {
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
  // El error del callback se muestra solo hasta el primer intento en el formulario.
  const touched = signInState !== undefined || signUpState !== undefined;
  const error =
    state && "error" in state ? state.error : touched ? undefined : (linkError ?? undefined);
  const checkEmail = tab === "up" && state && "notice" in state && state.notice === "check-email";
  const shake = Boolean(error) && !pending;

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
            ACCESO AL SISTEMA · v{version}
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

        {checkEmail ? (
          <div className="terminal-success">
            <div className="term-bar">
              <span className="dot r" />
              <span className="dot y" />
              <span className="dot g" />
              <span className="term-title">VAULT-OS // REGISTRO</span>
            </div>
            <div className="term-body">
              <div className="line">
                <span className="prompt">vault@arcade:~$</span> ./crear_cuenta --user={username}
              </div>
              <div className="line dim">[OK] Cuenta creada.</div>
              <div className="line success">
                &gt; REVISA TU CORREO. TE ENVIAMOS UN ENLACE A {email.toUpperCase()} PARA ACTIVAR TU
                CUENTA.
                <span className="caret">_</span>
              </div>
            </div>
          </div>
        ) : (
          <form action={action}>
            <input type="hidden" name="next" value={next} />
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

            {error && (
              <div className="contact-error" style={{ marginTop: 14 }}>
                [ERROR] {error}
              </div>
            )}
          </form>
        )}

        <Link href="/games" className="btn ghost" style={{ width: "100%", marginTop: 10 }}>
          JUGAR COMO INVITADO
        </Link>

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
