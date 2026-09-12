import { getGames } from "@/lib/games";
import { HomeContent } from "@/components/home-content";

export default async function Home() {
  const games = await getGames();

  return <HomeContent games={games} />;
}
