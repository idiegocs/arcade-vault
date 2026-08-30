import Link from "next/link";
import type { Game } from "@/lib/data";

export function GameCard({ game, best }: { game: Game; best?: number | null }) {
  return (
    <Link href={`/juegos/${game.id}`} className="card">
      <div className="cover">
        <div className={`cover-bg ${game.cover}`} />
        <div className="label">{game.cat}</div>
      </div>
      <div className="meta">
        <div className="title">{game.title}</div>
        <div className="desc">{game.short}</div>
        <div className="row">
          <div className="score-badge">
            <span>MEJOR PUNTUACIÓN</span>
            <b>{best == null ? "SIN RÉCORD" : best.toLocaleString("es-ES")}</b>
          </div>
          <span
            className={`btn ${game.color === "magenta" ? "magenta" : game.color === "yellow" ? "yellow" : ""}`}
          >
            JUGAR
          </span>
        </div>
      </div>
    </Link>
  );
}
