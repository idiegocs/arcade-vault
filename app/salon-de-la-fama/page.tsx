import Link from "next/link";
import { GAMES } from "@/lib/data";
import { getTopScoresByGame } from "@/lib/scores";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES");
}

export default async function HallOfFamePage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game: gameParam } = await searchParams;
  const game = GAMES.find((g) => g.id === gameParam) ?? GAMES[0];
  const rows = await getTopScoresByGame(game.id, 12);

  return (
    <div className="av-hall fade-in">
      <div className="hall-head">
        <h1>SALÓN DE LA FAMA</h1>
        <p className="pixel" style={{ fontSize: 10 }}>
          LOS NOMBRES QUE NUNCA SE BORRAN DE LA PANTALLA
        </p>
      </div>

      <div className="hall-tabs">
        {GAMES.map((g) => (
          <Link
            key={g.id}
            href={`/salon-de-la-fama?game=${g.id}`}
            className={`chip${g.id === game.id ? " active" : ""}`}
          >
            {g.title}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="hall-empty" style={{ textAlign: "center", padding: "48px 16px" }}>
          <p className="pixel neon-cyan" style={{ fontSize: 12, letterSpacing: "0.14em" }}>
            SIN PUNTAJES AÚN
          </p>
          <p className="mono" style={{ color: "var(--ink-faint)", marginTop: 10, fontSize: 13 }}>
            Todavía nadie registró un puntaje en {game.title}. Sé el primero en aparecer aquí.
          </p>
        </div>
      ) : (
        <>
          {rows.length >= 3 && (
            <div className="podium">
              <div className="podium-slot silver">
                <div className="rank-num">02</div>
                <div className="name">{rows[1].username}</div>
                <div className="score">{rows[1].score.toLocaleString("es-ES")}</div>
                <div className="date">{formatDate(rows[1].created_at)}</div>
              </div>
              <div className="podium-slot gold">
                <div
                  className="pixel"
                  style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "0.18em" }}
                >
                  CAMPEÓN
                </div>
                <div className="rank-num" style={{ fontSize: 36, marginTop: 4 }}>
                  01
                </div>
                <div className="name">{rows[0].username}</div>
                <div className="score" style={{ fontSize: 20 }}>
                  {rows[0].score.toLocaleString("es-ES")}
                </div>
                <div className="date">{formatDate(rows[0].created_at)}</div>
              </div>
              <div className="podium-slot bronze">
                <div className="rank-num">03</div>
                <div className="name">{rows[2].username}</div>
                <div className="score">{rows[2].score.toLocaleString("es-ES")}</div>
                <div className="date">{formatDate(rows[2].created_at)}</div>
              </div>
            </div>
          )}

          <div className="hall-table">
            <div className="th">
              <div>RANGO</div>
              <div>JUGADOR</div>
              <div>PUNTUACIÓN</div>
              <div>FECHA</div>
            </div>
            {rows.map((r, i) => (
              <div
                key={r.username + i}
                className={`tr${i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : ""}`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="rk">#{String(i + 1).padStart(2, "0")}</div>
                <div className="pl">{r.username}</div>
                <div className="sc">{r.score.toLocaleString("es-ES")}</div>
                <div className="dt">{formatDate(r.created_at)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link href="/games" className="btn lg">
          VOLVER A LA BIBLIOTECA
        </Link>
      </div>
    </div>
  );
}
