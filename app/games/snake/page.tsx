import { listScores } from "@/lib/store";
import { SnakeGame } from "@/components/games/SnakeGame";

export default async function SnakePage() {
  const scores = await listScores("snake");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Snake</h1>
      <SnakeGame initialScores={scores} />
    </div>
  );
}
