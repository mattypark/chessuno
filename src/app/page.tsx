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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-9 p-6">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">
          chess<span className="text-accent">uno</span>
        </h1>
        <p className="text-balance leading-relaxed text-text-dim">
          The cards decide what you may do on the board. Checkmate them, or empty your
          hand — both count.
        </p>
      </header>

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          data-testid="create-game"
          className="w-full rounded-md bg-accent px-5 py-3.5 text-lg font-bold text-accent-ink shadow-[0_3px_0_#5d8a33] transition-colors hover:bg-accent-bright disabled:opacity-60"
        >
          {busy ? "Dealing…" : "Play a friend"}
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
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-4 py-3 font-mono text-lg tracking-[0.3em] placeholder:text-text-dim/60 focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md border border-line bg-panel-raised px-5 font-semibold transition-colors hover:border-accent"
          >
            Join
          </button>
        </form>
      </div>

      <section className="space-y-3 rounded-md border border-line bg-panel p-4 text-sm leading-relaxed text-text-dim">
        <h2 className="font-semibold text-text">How a turn goes</h2>
        <p>
          Play a card matching the discard. Numbers buy you moves —{" "}
          <span className="text-text">ceil(N/3)</span>, so a 7 is three moves in a row.
          Skip costs them their turn. Draw 2 and Wild Draw 4 stuff their hand.
        </p>
        <p>
          <span className="font-semibold text-accent">Reverse swaps armies.</span> You take
          over their pieces, they take over yours. Your hand stays yours.
        </p>
        <p>Check ends your turn. Take a piece and you draw a card.</p>
      </section>
    </main>
  );
}
