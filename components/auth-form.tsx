"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { requestPasswordReset, signIn, signInWithProvider, signUp } from "@/app/actions/auth";
import { version } from "@/package.json";

/**
 * Tarjeta de /auth. `next` es el destino (ya validado con `safeNext`) tras
 * entrar; `linkError` es el error con el que volvió /auth/callback, si hubo.
 */
export function AuthForm({ next, linkError }: { next: string; linkError: string | null }) {
  const [tab, setTab] = useState<"in" | "up">("in");
  // "¿Olvidaste tu contraseña?" reemplaza el form de INICIAR SESIÓN hasta volver.
  const [forgot, setForgot] = useState(false);
  const [signInState, signInAction, signInPending] = useActionState(signIn, undefined);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, undefined);

  // Inputs controlados: un <form action={...}> resetea los campos no
  // controlados cada vez que la Server Action termina (incluso si devuelve
  // un error en vez de lanzar), así que el valor tiene que vivir en React,
  // no en el DOM, para sobrevivir a un intento fallido.
  const [username, setUsername] = useState("");
  // Separados: lo que se escribe para entrar (usuario o correo) no se arrastra
  // al campo de correo de CREAR CUENTA, que exige formato de email.
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const state = tab === "in" ? signInState : signUpState;
  const pending = tab === "in" ? signInPending : signUpPending;
  const action = tab === "in" ? signInAction : signUpAction;
  // El error del callback se muestra solo hasta el primer intento en el formulario.
  const touched = signInState !== undefined || signUpState !== undefined;
  const error =
    state && "error" in state ? state.error : touched ? undefined : (linkError ?? undefined);
  // El aviso "REVISA TU CORREO" se oculta al cambiar de pestaña, para poder
  // corregir el correo y registrarse de nuevo sin recargar.
  const [dismissedNotice, setDismissedNotice] = useState<typeof signUpState>(undefined);
  const checkEmail =
    tab === "up" &&
    signUpState !== dismissedNotice &&
    state &&
    "notice" in state &&
    state.notice === "check-email";

  const switchTab = (next: "in" | "up") => {
    setTab(next);
    setForgot(false);
    setDismissedNotice(signUpState);
  };
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
          <button
            type="button"
            className={tab === "in" ? "on" : ""}
            onClick={() => switchTab("in")}
          >
            INICIAR SESIÓN
          </button>
          <button
            type="button"
            className={tab === "up" ? "on" : ""}
            onClick={() => switchTab("up")}
          >
            CREAR CUENTA
          </button>
        </div>

        {tab === "in" && forgot ? (
          <ForgotPassword
            email={identifier.includes("@") ? identifier : ""}
            onBack={() => setForgot(false)}
          />
        ) : checkEmail ? (
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
              <label>{tab === "in" ? "Usuario o correo" : "Correo electrónico"}</label>
              <input
                name={tab === "in" ? "identifier" : "email"}
                type={tab === "in" ? "text" : "email"}
                autoComplete={tab === "in" ? "username" : "email"}
                value={tab === "in" ? identifier : email}
                onChange={(e) => (tab === "in" ? setIdentifier : setEmail)(e.target.value)}
                placeholder={tab === "in" ? "px_kai o jugador@vault.gg" : "jugador@vault.gg"}
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

            {tab === "in" && (
              <button
                type="button"
                className="auth-forgot"
                onClick={() => setForgot(true)}
                disabled={pending}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}

            {error && (
              <div className="contact-error" style={{ marginTop: 14 }}>
                [ERROR] {error}
              </div>
            )}
          </form>
        )}

        <Link href="/games" className="btn ghost" style={{ width: "100%", marginTop: 10 }}>
          VER CATÁLOGO
        </Link>

        <div className="auth-divider">O CONTINÚA CON</div>
        <div className="social">
          <ProviderButton provider="google" label="◆ GOOGLE" next={next} />
          <ProviderButton provider="github" label="▣ GITHUB" next={next} />
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

/** Un form por proveedor: la Server Action redirige a Google/GitHub. */
function ProviderButton({
  provider,
  label,
  next,
}: {
  provider: "google" | "github";
  label: string;
  next: string;
}) {
  return (
    <form action={signInWithProvider}>
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="next" value={next} />
      <ProviderSubmit label={label} />
    </form>
  );
}

// useFormStatus solo ve el form que lo contiene, por eso va en un hijo.
function ProviderSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn ghost" type="submit" disabled={pending} style={{ width: "100%" }}>
      {pending ? "CONECTANDO…" : label}
    </button>
  );
}

/** Pide el correo y manda el enlace de recuperación. */
function ForgotPassword({ email: initialEmail, onBack }: { email: string; onBack: () => void }) {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  const [email, setEmail] = useState(initialEmail);

  const error = state && "error" in state ? state.error : undefined;
  const sent = state && "notice" in state && state.notice === "reset-sent";

  if (sent) {
    return (
      <div className="terminal-success">
        <div className="term-bar">
          <span className="dot r" />
          <span className="dot y" />
          <span className="dot g" />
          <span className="term-title">VAULT-OS // RECUPERAR</span>
        </div>
        <div className="term-body">
          <div className="line">
            <span className="prompt">vault@arcade:~$</span> ./recuperar --email={email}
          </div>
          <div className="line success">
            &gt; SI {email.toUpperCase()} TIENE UNA CUENTA, TE ENVIAMOS UN ENLACE PARA ELEGIR UNA
            CONTRASEÑA NUEVA.
            <span className="caret">_</span>
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="btn ghost" type="button" onClick={onBack}>
              VOLVER A INICIAR SESIÓN
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={action}>
      <div className="field">
        <label>Correo de tu cuenta</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jugador@vault.gg"
          disabled={pending}
        />
      </div>

      <button
        className="btn lg"
        type="submit"
        style={{ width: "100%", marginTop: 8 }}
        disabled={pending}
      >
        {pending ? "ENVIANDO…" : "ENVIAR ENLACE"}
      </button>

      <button type="button" className="auth-forgot" onClick={onBack} disabled={pending}>
        Volver a iniciar sesión
      </button>

      {error && (
        <div className="contact-error" style={{ marginTop: 14 }}>
          [ERROR] {error}
        </div>
      )}
    </form>
  );
}
