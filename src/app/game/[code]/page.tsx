"use client";

import { use, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Board } from "@/components/Board";
import { CardBack, CardFace } from "@/components/CardFace";
import { Hand } from "@/components/Hand";
import { getPlayerToken } from "@/lib/playerToken";
import type { Army, CardColor } from "@/lib/rules/types";

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const roomCode = code.toUpperCase();

  const searchParams = useSearchParams();
  const profile = searchParams.get("as") ?? "";
  const [error, setError] = useState<string | null>(null);

  // The token lives in localStorage, so it does not exist during SSR. Reading it
  // through an external store keeps the server snapshot empty without bouncing
  // state through an effect.
  const token = useSyncExternalStore(
    useCallback(() => () => {}, []),
    useCallback(() => getPlayerToken(profile), [profile]),
    () => "",
  );

  const game = useQuery(api.games.get, token ? { code: roomCode, playerToken: token } : "skip");
  const join = useMutation(api.games.join);
  const dispatch = useMutation(api.games.dispatch);

  // Anyone who opens the link and finds a free seat takes it.
  useEffect(() => {
    if (!token || !game) return;
    if (game.seat === null && game.playerCount < 2) {
      join({ code: roomCode, playerToken: token }).catch((e) => setError(String(e.message ?? e)));
    }
  }, [game, join, roomCode, token]);

  async function send(action: Parameters<typeof dispatch>[0]["action"]) {
    setError(null);
    try {
      await dispatch({ code: roomCode, playerToken: token, action });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (game === undefined) {
    return <Shell code={roomCode}><p className="text-chalk">Loading…</p></Shell>;
  }
  if (game === null) {
    return <Shell code={roomCode}><p className="text-chalk">No game with that code.</p></Shell>;
  }

  const seated = game.seat !== null;
  const yourTurn = seated && game.seat === game.turnSeat && game.status === "active";
  const waiting = game.playerCount < 2;
  const canPlayCard = yourTurn && !waiting && !game.cardPlayedThisTurn;
  const canMove = yourTurn && !waiting && game.movesRemaining > 0;

  return (
    <Shell code={roomCode}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Board
            fen={game.fen}
            orientation={(game.yourArmy ?? "w") as Army}
            legalMoves={game.legalMoves}
            canMove={canMove}
            onMove={(move) => send({ type: "MAKE_MOVE", ...move })}
          />

          <div className="flex flex-wrap items-center gap-3">
            <StatusLine
              waiting={waiting}
              status={game.status}
              yourTurn={yourTurn}
              seated={seated}
              movesRemaining={game.movesRemaining}
              cardPlayed={game.cardPlayedThisTurn}
              winner={game.winner}
              seat={game.seat}
              result={game.result}
            />
            <div className="ml-auto flex gap-2">
              <ActionButton
                disabled={!canPlayCard || game.drewThisTurn}
                onClick={() => send({ type: "DRAW_CARD" })}
              >
                draw
              </ActionButton>
              <ActionButton
                disabled={!yourTurn || (!game.cardPlayedThisTurn && !game.drewThisTurn)}
                onClick={() => send({ type: "END_TURN" })}
              >
                end turn
              </ActionButton>
              <ActionButton disabled={!seated || game.status !== "active"} onClick={() => send({ type: "RESIGN" })}>
                resign
              </ActionButton>
            </div>
          </div>

          <Hand
            hand={game.hand}
            discardTop={game.discardTop}
            activeColor={game.activeColor as CardColor}
            canPlay={canPlayCard}
            onPlay={(cardId, declaredColor) =>
              send({ type: "PLAY_CARD", cardId, declaredColor })
            }
          />

          {error && (
            <p role="alert" className="rounded-lg bg-uno-red/20 px-3 py-2 text-sm text-cream">
              {error}
            </p>
          )}
        </div>

        <aside className="space-y-5">
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-chalk">discard</p>
              <CardFace card={game.discardTop} size="sm" />
            </div>
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-chalk">
                deck {game.deckCount}
              </p>
              <CardBack size="sm" />
            </div>
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-chalk">colour</p>
              <span
                className="block h-8 w-8 rounded-full border-2 border-cream/80"
                style={{ background: `var(--uno-${game.activeColor})` }}
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 font-mono text-sm">
            <Stat label="you are" value={game.yourArmy === "w" ? "white" : game.yourArmy === "b" ? "black" : "—"} />
            <Stat label="their cards" value={String(game.opponentCardCount)} />
            <Stat label="your cards" value={String(game.hand.length)} />
            <Stat label="moves left" value={String(game.movesRemaining)} />
          </dl>

          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest text-chalk">log</p>
            <ol className="max-h-72 space-y-1 overflow-y-auto rounded-lg bg-black/25 p-3 text-sm text-chalk">
              {game.log.slice(-40).reverse().map((entry, index) => (
                <li key={`${index}-${entry.text}`}>{entry.text}</li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">
      <header className="flex items-baseline gap-4">
        <Link href="/" className="font-mono text-2xl font-bold">
          chess<span className="text-uno-yellow">uno</span>
        </Link>
        <span className="font-mono tracking-[0.35em] text-chalk">{code}</span>
      </header>
      {children}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/25 px-3 py-2">
      <dt className="text-[0.65rem] uppercase tracking-widest text-chalk">{label}</dt>
      <dd className="text-cream">{value}</dd>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border-2 border-cream/25 px-3 py-1.5 font-mono text-sm transition-colors hover:border-uno-yellow disabled:opacity-35 disabled:hover:border-cream/25"
    >
      {children}
    </button>
  );
}

function StatusLine(props: {
  waiting: boolean;
  status: string;
  yourTurn: boolean;
  seated: boolean;
  movesRemaining: number;
  cardPlayed: boolean;
  winner: number | null;
  seat: number | null;
  result: string | null;
}) {
  const text = (() => {
    if (props.status === "finished") {
      if (props.winner === null) return `Drawn — ${props.result}.`;
      return props.winner === props.seat
        ? `You win by ${props.result}.`
        : `You lose by ${props.result}.`;
    }
    if (!props.seated) return "Spectating — this game is full.";
    if (props.waiting) return "Waiting for a second player…";
    if (!props.yourTurn) return "Their turn.";
    if (props.movesRemaining > 0) {
      return `${props.movesRemaining} move${props.movesRemaining === 1 ? "" : "s"} left.`;
    }
    return props.cardPlayed ? "Turn spent — end it." : "Your turn — play a card.";
  })();

  return <p className="font-mono text-sm text-cream">{text}</p>;
}
