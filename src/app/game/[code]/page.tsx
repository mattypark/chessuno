"use client";

import { use, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { Board } from "@/components/Board";
import { CardBack, CardFace } from "@/components/CardFace";
import { Hand } from "@/components/Hand";
import { getPlayerToken } from "@/lib/playerToken";
import type { Army } from "@/lib/rules/types";

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const roomCode = code.toUpperCase();

  const searchParams = useSearchParams();
  const profile = searchParams.get("as") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      join({ code: roomCode, playerToken: token }).catch((e) => setError(readableError(e)));
    }
  }, [game, join, roomCode, token]);

  // A dispatch is a round trip, and until it lands the view still shows the old
  // turn — lit cards, movable pieces. Without this, a second click before the
  // answer arrives sends a second action and the player is told off for something
  // the interface invited them to do.
  async function send(action: Parameters<typeof dispatch>[0]["action"]) {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      await dispatch({ code: roomCode, playerToken: token, action });
    } catch (e) {
      setError(readableError(e));
    } finally {
      setPending(false);
    }
  }

  if (game === undefined) {
    return <Shell code={roomCode}><p className="text-chalk">Loading…</p></Shell>;
  }
  if (game === null) {
    return <Shell code={roomCode}><p className="text-chalk">No game with that code.</p></Shell>;
  }

  const seated = game.seat !== null;
  // The server already folded "are there two players" into these, so the UI and
  // the mutation can never disagree about what is possible.
  const yourTurn = game.isYourTurn;
  const waiting = !game.ready;
  const canAct = yourTurn && !pending;
  const canMove = canAct && game.movesRemaining > 0;

  if (waiting) {
    return (
      <Shell code={roomCode}>
        <div data-testid="waiting">
          <WaitingRoom code={roomCode} seated={seated} error={error} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell code={roomCode}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* min-w-0: grid children default to min-width:auto, so the scrolling hand
            would otherwise widen the column and drag the board off screen. */}
        <div className="min-w-0 space-y-4">
          <Board
            fen={game.fen}
            orientation={(game.yourArmy ?? "w") as Army}
            legalMoves={game.legalMoves}
            canMove={canMove}
            onMove={(move) => send({ type: "MAKE_MOVE", ...move })}
          />

          <div className="flex flex-wrap items-center gap-3">
            <StatusLine
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
                testId="draw"
                disabled={!canAct || game.cardPlayedThisTurn || game.drewThisTurn}
                onClick={() => send({ type: "DRAW_CARD" })}
              >
                draw
              </ActionButton>
              <ActionButton
                testId="end-turn"
                disabled={!canAct || (!game.cardPlayedThisTurn && !game.drewThisTurn)}
                onClick={() => send({ type: "END_TURN" })}
              >
                end turn
              </ActionButton>
              <ActionButton
                testId="resign"
                disabled={!seated || pending || game.status !== "active"}
                onClick={() => send({ type: "RESIGN" })}
              >
                resign
              </ActionButton>
            </div>
          </div>

          <Hand
            hand={game.hand}
            playableCardIds={canAct ? game.playableCardIds : []}
            onPlay={(cardId, declaredColor) =>
              send({ type: "PLAY_CARD", cardId, declaredColor })
            }
          />

          {error && (
            <p
              role="alert"
              data-testid="error"
              className="rounded-lg bg-uno-red/20 px-3 py-2 text-sm text-cream"
            >
              {error}
            </p>
          )}
        </div>

        <aside className="min-w-0 space-y-5">
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

/**
 * Convex wraps a thrown Error in a stack trace before it reaches the client, so a
 * plain `.message` puts "Uncaught Error … at handler" in front of the player. The
 * server throws ConvexError precisely so the payload survives intact.
 */
function readableError(error: unknown): string {
  if (error instanceof ConvexError) return String(error.data);
  const raw = error instanceof Error ? error.message : String(error);
  return raw.match(/Uncaught (?:Convex)?Error:\s*(.*)/)?.[1]?.trim() ?? raw;
}

/**
 * A room with one player in it is not a game. Saying so plainly beats rendering a
 * board that looks live and refuses every click.
 */
function WaitingRoom({
  code,
  seated,
  error,
}: {
  code: string;
  seated: boolean;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="mx-auto max-w-md space-y-7 py-10">
      <div className="space-y-2">
        <h1 className="font-mono text-2xl">Waiting for an opponent</h1>
        <p className="text-sm leading-relaxed text-chalk">
          {seated
            ? "You have a seat. The game starts the moment someone else opens this room."
            : "This room is full."}
        </p>
      </div>

      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-chalk">room code</p>
        <button
          type="button"
          onClick={() => copy(code)}
          className="w-full rounded-lg border-2 border-cream/25 bg-black/25 px-5 py-4 text-left font-mono text-4xl tracking-[0.4em] transition-colors hover:border-uno-yellow"
        >
          {code}
        </button>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => copy(window.location.href)}
          className="w-full rounded-lg bg-uno-red px-5 py-3 font-mono font-bold text-cream shadow-lg shadow-black/40 transition-transform hover:-translate-y-0.5"
        >
          {copied ? "copied" : "copy invite link"}
        </button>
        <p className="text-sm leading-relaxed text-chalk">
          Testing alone? Open{" "}
          <code className="text-cream">?as=2</code> on the end of this URL in a second tab —
          that tab gets its own identity and takes the other seat.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-uno-red/20 px-3 py-2 text-sm text-cream">
          {error}
        </p>
      )}
    </div>
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
  testId,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border-2 border-cream/25 px-3 py-1.5 font-mono text-sm transition-colors hover:border-uno-yellow disabled:opacity-35 disabled:hover:border-cream/25"
    >
      {children}
    </button>
  );
}

function StatusLine(props: {
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
    if (!props.yourTurn) return "Their turn.";
    if (props.movesRemaining > 0) {
      return `${props.movesRemaining} move${props.movesRemaining === 1 ? "" : "s"} left.`;
    }
    return props.cardPlayed ? "Turn spent — end it." : "Your turn — play a card.";
  })();

  return (
    <p data-testid="status" className="font-mono text-sm text-cream">
      {text}
    </p>
  );
}
