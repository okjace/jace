import { listScores } from "@/lib/store";
import { MemoryGame } from "@/components/games/MemoryGame";

export default async function MemoryPage() {
  const scores = await listScores("memory");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Memory Match</h1>
      <MemoryGame initialScores={scores} />
    </div>
  );
}
