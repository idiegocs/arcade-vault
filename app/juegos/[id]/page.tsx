import Link from "next/link";
import { notFound } from "next/navigation";
import { getGameById } from "@/lib/games";
import { getBestScore, getPlaysCount, getTopScoresByGame } from "@/lib/scores";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES");
}

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGameById(id);
  if (!game) notFound();

  const [scores, best, plays] = await Promise.all([
    getTopScoresByGame(id, 10),
    getBestScore(id),
    getPlaysCount(id),
  ]);

  return (
    <div className="av-detail fade-in">
      <div>
        <div className="detail-cover">
          <div className={`cover-bg ${game.cover}`} />
        </div>
        <div style={{ marginTop: 20 }} className="detail-info">
          <div className="detail-tags">
            <span>{game.cat}</span>
            <span>1 JUGADOR</span>
            <span>TECLADO / TÁCTIL</span>
            <span>RETRO 1985</span>
          </div>
          <h2 className="neon-cyan">{game.title}</h2>
          <p>{game.long}</p>
          <div className="stat-strip">
            <div>
              <div className="l">Partidas</div>
              <div className="v">{plays.toLocaleString("es-ES")}</div>
            </div>
            <div>
              <div className="l">Mejor global</div>
              <div
                className="v"
                style={{ color: "var(--magenta)", textShadow: "0 0 6px rgba(255,0,110,0.5)" }}
              >
                {best == null ? "SIN RÉCORD" : best.toLocaleString("es-ES")}
              </div>
            </div>
            <div>
              <div className="l">Dificultad</div>
              <div
                className="v"
                style={{ color: "var(--yellow)", textShadow: "0 0 6px rgba(245,255,0,0.5)" }}
              >
                ★ ★ ★ ☆ ☆
              </div>
            </div>
          </div>
          <div className="detail-actions">
            <Link href={`/juegos/${game.id}/jugar`} className="btn xl pulse">
              ▶ JUGAR AHORA
            </Link>
            <Link href="/" className="btn ghost lg">
              VOLVER AL VAULT
            </Link>
          </div>
        </div>
      </div>

      <aside>
        <div className="leaderboard">
          <h3>MEJORES PUNTUACIONES</h3>
          {scores.length === 0 ? (
            <p
              className="mono"
              style={{ color: "var(--ink-faint)", fontSize: 13, padding: "8px 0" }}
            >
              Todavía nadie registró un puntaje en {game.title}.
            </p>
          ) : (
            scores.map((r, i) => (
              <div
                key={r.username + i}
                className={`lb-row${i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : ""}`}
              >
                <div className="rk">#{String(i + 1).padStart(2, "0")}</div>
                <div className="pl">
                  {r.username}
                  <div style={{ fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.1em" }}>
                    {formatDate(r.created_at)}
                  </div>
                </div>
                <div className="sc">{r.score.toLocaleString("es-ES")}</div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
