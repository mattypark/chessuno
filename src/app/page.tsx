"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { getPlayerToken } from "@/lib/playerToken";

export default function LobbyPage() {
  const router = useRouter();
  const create = useMutation(api.games.create);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    try {
      const { code: newCode } = await create({ playerToken: getPlayerToken() });
      router.push(`/game/${newCode}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-10 p-6">
      <header className="space-y-3">
        <h1 className="font-mono text-5xl font-bold tracking-tight">
          chess<span className="text-uno-yellow">uno</span>
        </h1>
        <p className="max-w-sm text-balance leading-relaxed text-chalk">
          The cards decide what you may do on the board. Checkmate them, or empty your
          hand — both count.
        </p>
      </header>

      <div className="space-y-5">
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="w-full rounded-lg bg-uno-red px-5 py-3 font-mono text-lg font-bold text-cream shadow-lg shadow-black/40 transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          {busy ? "dealing…" : "new game"}
        </button>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim().length > 0) router.push(`/game/${code.trim().toUpperCase()}`);
          }}
          className="flex gap-2"
        >
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={4}
            aria-label="Room code"
            className="min-w-0 flex-1 rounded-lg border-2 border-cream/25 bg-black/25 px-4 py-3 font-mono text-lg tracking-[0.3em] placeholder:text-chalk/50 focus:border-uno-yellow focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border-2 border-cream/25 px-5 font-mono font-bold text-cream transition-colors hover:border-uno-yellow"
          >
            join
          </button>
        </form>
      </div>

      <section className="space-y-2 text-sm leading-relaxed text-chalk">
        <h2 className="font-mono text-cream">How a turn goes</h2>
        <p>
          Play a card matching the discard. Numbers buy you moves —{" "}
          <span className="text-cream">ceil(N/3)</span>, so a 7 is three moves in a row.
          Skip costs them their turn. Draw 2 and Wild Draw 4 stuff their hand.
        </p>
        <p>
          <span className="text-uno-yellow">Reverse swaps armies.</span> You take over
          their pieces, they take over yours. Your hand stays yours.
        </p>
      </section>
    </main>
  );
}
