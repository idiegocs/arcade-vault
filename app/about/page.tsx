"use client";

import { useEffect, useState } from "react";

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

type HighlightIconKind = "HEART" | "BROWSER" | "PLANT";

function HighlightIcon({ kind }: { kind: HighlightIconKind }) {
  const C = "currentColor";
  if (kind === "HEART")
    return (
      <svg className="hl-icon" viewBox="0 0 16 16">
        <g fill={C}>
          <rect x="2" y="3" width="4" height="2" />
          <rect x="10" y="3" width="4" height="2" />
          <rect x="1" y="4" width="2" height="4" />
          <rect x="13" y="4" width="2" height="4" />
          <rect x="2" y="8" width="2" height="2" />
          <rect x="12" y="8" width="2" height="2" />
          <rect x="3" y="9" width="10" height="2" />
          <rect x="4" y="11" width="8" height="2" />
          <rect x="5" y="12" width="6" height="2" />
          <rect x="6" y="13" width="4" height="1" />
          <rect x="7" y="14" width="2" height="1" />
        </g>
      </svg>
    );
  if (kind === "BROWSER")
    return (
      <svg className="hl-icon" viewBox="0 0 16 16">
        <g fill={C}>
          <rect x="1" y="2" width="14" height="12" fill="none" stroke={C} strokeWidth="1.4" />
          <rect x="1" y="2" width="14" height="3" />
          <rect x="3" y="3" width="1" height="1" fill="#0a0a0f" />
          <rect x="5" y="3" width="1" height="1" fill="#0a0a0f" />
          <rect x="7" y="3" width="1" height="1" fill="#0a0a0f" />
          <rect x="3" y="7" width="4" height="1" />
          <rect x="3" y="9" width="6" height="1" />
          <rect x="3" y="11" width="3" height="1" />
        </g>
      </svg>
    );
  return (
    <svg className="hl-icon" viewBox="0 0 16 16">
      <g fill={C}>
        <rect x="7" y="2" width="2" height="10" />
        <rect x="4" y="4" width="3" height="2" />
        <rect x="9" y="6" width="3" height="2" />
        <rect x="3" y="3" width="2" height="2" />
        <rect x="11" y="5" width="2" height="2" />
        <rect x="3" y="12" width="10" height="2" />
        <rect x="4" y="14" width="8" height="1" />
      </g>
    </svg>
  );
}

const HIGHLIGHTS: { i: HighlightIconKind; t: string; c: "magenta" | "cyan" | "green" }[] = [
  { i: "HEART", t: "HECHO CON ❤️ PARA JUGADORES", c: "magenta" },
  { i: "BROWSER", t: "JUEGOS EN HTML — CORREN EN CUALQUIER NAVEGADOR", c: "cyan" },
  { i: "PLANT", t: "PROYECTO EN CONSTANTE CRECIMIENTO", c: "green" },
];

type SubmitStatus = "idle" | "sending" | "sent" | "error";

export default function About() {
  useReveal();

  const [form, setForm] = useState({ name: "", email: "", msg: "" });
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [sentName, setSentName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [shake, setShake] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.msg.trim()) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          message: form.msg.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo enviar el mensaje.");
      }
      setSentName(form.name.trim());
      setStatus("sent");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo enviar el mensaje.");
      setStatus("error");
    }
  };

  return (
    <div className="about fade-in">
      <section className="about-hero">
        <div className="kicker pixel neon-yellow">▸ ACERCA DE</div>
        <h1 className="about-title">ACERCA DE ARCADE VAULT</h1>
        <p className="about-mission">
          ARCADE VAULT nació del amor por los videojuegos clásicos. Nuestra misión es preservar y
          celebrar los arcades que definieron una generación, haciéndolos accesibles para todos, en
          cualquier lugar y sin costo.
        </p>

        <div className="highlight-row">
          {HIGHLIGHTS.map((h, i) => (
            <div
              key={h.t}
              className={`highlight ${h.c}`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <HighlightIcon kind={h.i} />
              <div className="hl-text pixel">{h.t}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="about-divider reveal" aria-hidden="true">
        <div className="div-bar" />
        <div className="div-pixels">
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className="div-bar" />
      </div>

      <section className="about-contact reveal">
        <div className="contact-grid">
          <div className="contact-intro">
            <div className="kicker pixel neon-cyan">▸ CONTACTO</div>
            <h2 className="contact-title">CONTÁCTANOS</h2>
            <p className="contact-sub">
              ¿Tienes alguna sugerencia, quieres proponer un juego, o simplemente quieres saludar?
              Escríbenos.
            </p>
            <div className="contact-tips">
              <div className="tip">
                <span className="tip-led" />
                RESPUESTA EN 24-48H
              </div>
              <div className="tip">
                <span className="tip-led y" />
                SUGERENCIAS BIENVENIDAS
              </div>
              <div className="tip">
                <span className="tip-led m" />
                SIN SPAM, JAMÁS
              </div>
            </div>
          </div>

          <form className={`contact-form${shake ? " shake" : ""}`} onSubmit={onSubmit}>
            {status !== "sent" ? (
              <>
                <div className="field">
                  <label>NOMBRE</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="px_kai"
                    disabled={status === "sending"}
                  />
                </div>
                <div className="field">
                  <label>CORREO ELECTRÓNICO</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="jugador@vault.gg"
                    disabled={status === "sending"}
                  />
                </div>
                <div className="field">
                  <label>MENSAJE</label>
                  <textarea
                    rows={5}
                    value={form.msg}
                    onChange={(e) => setForm({ ...form, msg: e.target.value })}
                    placeholder="Cuéntanos qué tienes en mente…"
                    disabled={status === "sending"}
                  />
                </div>
                <button
                  className="btn xl press"
                  type="submit"
                  style={{ width: "100%" }}
                  disabled={status === "sending"}
                >
                  {status === "sending" ? "ENVIANDO…" : "▶ ENVIAR MENSAJE"}
                </button>
                {status === "error" && (
                  <div className="contact-error">
                    <div>[ERROR] {errorMessage}</div>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => setStatus("idle")}
                    >
                      REINTENTAR
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="terminal-success">
                <div className="term-bar">
                  <span className="dot r" />
                  <span className="dot y" />
                  <span className="dot g" />
                  <span className="term-title">VAULT-OS // TERMINAL</span>
                </div>
                <div className="term-body">
                  <div className="line">
                    <span className="prompt">vault@arcade:~$</span> ./send_message --to=team
                  </div>
                  <div className="line dim">[OK] Conectando con servidor…</div>
                  <div className="line dim">[OK] Validando contenido…</div>
                  <div className="line dim">[OK] Transmitiendo paquete…</div>
                  <div className="line success">
                    &gt; MENSAJE RECIBIDO. TE RESPONDEREMOS PRONTO. GRACIAS, {sentName.toUpperCase()}.
                    <span className="caret">_</span>
                  </div>
                  <div style={{ marginTop: 18 }}>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => {
                        setStatus("idle");
                        setForm({ name: "", email: "", msg: "" });
                      }}
                    >
                      ENVIAR OTRO MENSAJE
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
