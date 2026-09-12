"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/actions/auth";
import { version } from "@/package.json";
import { isMuted, toggleMuted } from "./games/audio";

type NavTarget = "inicio" | "biblioteca" | "salon" | "acerca" | "auth";

export function Nav({ username }: { username: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Arranca en `false` para calzar con el render del servidor (no hay
  // `localStorage` ahí) y se sincroniza con el valor real ya en el cliente.
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // Sincroniza con `localStorage` recién en el cliente, después de
    // hidratar — leerlo antes (en el render inicial o en el initializer de
    // useState) rompería la hidratación, porque el servidor no tiene acceso
    // a `localStorage` y siempre "ve" `false`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(isMuted());
  }, []);

  const handleToggleMute = () => setMuted(toggleMuted());

  const isActive = (target: NavTarget) => {
    if (target === "inicio") return pathname === "/";
    if (target === "biblioteca") return pathname === "/games" || pathname.startsWith("/juegos");
    if (target === "salon") return pathname === "/salon-de-la-fama";
    if (target === "acerca") return pathname === "/about";
    return pathname === "/auth";
  };

  const close = () => setOpen(false);

  return (
    <>
      <nav className="av-nav">
        <Link href="/" className="logo" onClick={close}>
          <div className="logo-mark" />
          <div className="logo-text neon-cyan">
            ARCADE <span className="neon-magenta">VAULT</span>
          </div>
        </Link>
        <div className="links">
          <Link href="/" className={isActive("inicio") ? "active" : ""}>
            Inicio
          </Link>
          <Link href="/games" className={isActive("biblioteca") ? "active" : ""}>
            Biblioteca
          </Link>
          <Link href="/salon-de-la-fama" className={isActive("salon") ? "active" : ""}>
            Salón de la Fama
          </Link>
          <Link href="/about" className={isActive("acerca") ? "active" : ""}>
            Acerca de
          </Link>
        </div>
        <div className="spacer" />
        <div className="coin-counter">
          <span className="coin" />
          <span>CRÉDITOS · 03</span>
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={handleToggleMute}
          aria-label={muted ? "Activar sonido" : "Silenciar sonido"}
          title={muted ? "Activar sonido" : "Silenciar sonido"}
        >
          {muted ? "♪ OFF" : "♪ ON"}
        </button>
        {username ? (
          <form action={signOut} className="nav-session">
            <span className="nav-username mono">{username.toUpperCase()}</span>
            <button type="submit" className="btn ghost">
              Salir
            </button>
          </form>
        ) : (
          <Link href="/auth" className="btn auth-btn">
            Iniciar Sesión
          </Link>
        )}
        <button
          type="button"
          className="btn ghost hamburger"
          onClick={() => setOpen(true)}
          aria-label="Menú"
        >
          ≡
        </button>
      </nav>

      <div className={`av-mobile-backdrop${open ? " open" : ""}`} onClick={close} />
      <aside className={`av-mobile-panel${open ? " open" : ""}`}>
        <div className="pixel neon-cyan" style={{ fontSize: 11, marginBottom: 16 }}>
          MENÚ
        </div>
        <Link href="/" className={isActive("inicio") ? "active" : ""} onClick={close}>
          Inicio
        </Link>
        <Link href="/games" className={isActive("biblioteca") ? "active" : ""} onClick={close}>
          Biblioteca
        </Link>
        <Link
          href="/salon-de-la-fama"
          className={isActive("salon") ? "active" : ""}
          onClick={close}
        >
          Salón de la Fama
        </Link>
        <Link href="/about" className={isActive("acerca") ? "active" : ""} onClick={close}>
          Acerca de
        </Link>
        {username ? (
          <form action={signOut}>
            <button type="submit" style={{ width: "100%" }}>
              Salir ({username.toUpperCase()})
            </button>
          </form>
        ) : (
          <Link href="/auth" className={isActive("auth") ? "active" : ""} onClick={close}>
            Iniciar Sesión
          </Link>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={handleToggleMute}
          aria-label={muted ? "Activar sonido" : "Silenciar sonido"}
          style={{ width: "100%" }}
        >
          {muted ? "♪ SONIDO OFF" : "♪ SONIDO ON"}
        </button>
        <div style={{ flex: 1 }} />
        <div
          className="pixel"
          style={{ fontSize: 9, color: "var(--ink-faint)", letterSpacing: "0.16em" }}
        >
          CRÉDITOS · 03
        </div>
      </aside>
    </>
  );
}

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        padding: "20px 32px",
        textAlign: "center",
        color: "var(--ink-faint)",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "0.16em",
      }}
    >
      © 2026 ARCADE VAULT · HECHO CON PIXELES Y NEÓN · v{version}
    </footer>
  );
}
