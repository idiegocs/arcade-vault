import { GameCard } from "@/components/game-card";
import { CATEGORIES, GAMES } from "@/lib/data";
import { getBestScoresByGames } from "@/lib/scores";

export default async function Home() {
  const bestScores = await getBestScoresByGames(GAMES.map((g) => g.id));

  return (
    <div className="fade-in">
      <section className="av-hero">
        <h1 className="flicker">ARCADE VAULT</h1>
        <div className="sub">
          INSERTA UNA MONEDA PARA JUGAR <span className="blink">_</span>
        </div>
      </section>

      <div className="av-filters">
        <div className="av-search">
          <span className="ico">⌕</span>
          <input placeholder="Buscar un juego por nombre…" />
        </div>
        <div className="av-chips">
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip${c === "TODOS" ? " active" : ""}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="av-grid">
        {GAMES.map((game) => (
          <GameCard key={game.id} game={game} best={bestScores[game.id]} />
        ))}
      </div>
    </div>
  );
}
