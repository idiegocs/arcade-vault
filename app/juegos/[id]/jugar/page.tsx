import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGameById } from "@/lib/games";
import { authRedirectPath } from "@/lib/auth-errors";
import { getSessionPlayer } from "@/lib/session";
import { GAME_ENGINES } from "@/components/games/registry";
import { GamePlayerShell } from "@/components/games/game-player-shell";

export default async function GamePlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const [player, game] = await Promise.all([getSessionPlayer(), getGameById(id)]);

  // Jugar requiere cuenta (spec 16). El proxy ya redirige; esto es la segunda
  // línea por si la regla del proxy falla o cambia. Solo sin sesión: con
  // sesión y sin perfil se juega (sin guardar) en vez de rebotar entre /auth y /.
  if (!player) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      for (const v of [value ?? []].flat()) query.append(key, v);
    }
    const search = query.size ? `?${query}` : "";
    redirect(authRedirectPath(`/juegos/${id}/jugar${search}`));
  }

  if (!game) notFound();
  const { username } = player;

  if (GAME_ENGINES[id]) {
    return <GamePlayerShell gameId={game.id} gameTitle={game.title} username={username} />;
  }

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {username ? username.toUpperCase() : "INVITADO"}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{(12450).toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">♥ ♥ ♥</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">03</div>
          </div>
        </div>
        <div className="hud-actions">
          <button className="btn yellow" type="button">
            PAUSA
          </button>
          <button className="btn magenta" type="button">
            FIN
          </button>
          <Link href={`/juegos/${game.id}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          <div className="game-arena">
            <div className="grid-floor" />
            <div className="enemy e1" />
            <div className="enemy e2" />
            <div className="enemy e3" />
            <div className="player-ship" />
          </div>
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>
    </div>
  );
}
