# chessuno

Uno and chess, fused. The cards decide what you're allowed to do on the board.

Two ways to win, both live at once: **checkmate your opponent**, or **empty your hand**.

## Rules

**Setup.** Standard 108-card Uno deck, standard chess start. Seven cards each. One card
flipped to open the discard pile. Player 1 owns White.

**A turn.**

1. Play one card matching the discard top by colour, number, or symbol (wilds always
   legal). No legal card? Draw one — play it if you can, otherwise your turn ends with no
   moves made.
2. The card grants a **move budget**.
3. Spend it. Every move must be legal chess for the army you currently own. In check? Your
   first move has to resolve it. Same piece twice is fine. Ending early is fine.

Win conditions are checked after every single move, not just at end of turn.

## Cards

| Card | Effect |
| --- | --- |
| Number `N` (0–9) | Move budget = `max(1, ceil(N / 3))` — so 0–3 gives 1 move, 4–6 gives 2, 7–9 gives 3 |
| Skip | Opponent loses their entire next turn. You get 1 move. |
| Reverse | **The two players swap armies.** You now control their pieces. Then you get 1 move. |
| Draw 2 | Opponent draws 2. You get 1 move. |
| Wild | You declare the active colour. 1 move. |
| Wild Draw 4 | Opponent draws 4, you declare the colour. 1 move. |

### Reverse is the whole game

Reverse swaps who owns which army. The board itself doesn't move — castling rights, en
passant, everything stays exactly where it was. Your hand stays with you; hands belong to
players, never to armies.

Which means: playing Reverse from a losing position steals the winning side. It also means
you can Reverse straight into a checked or mated position and lose on the spot. That risk
is what the card costs.

## Stack

Next.js 16 · TypeScript · Tailwind · Convex (realtime, server-authoritative) ·
chess.js · Vitest

The entire ruleset lives in `src/lib/rules/` as pure, dependency-free functions. Convex and
the UI are thin shells over it — the client never decides legality.

## Development

```bash
npm install
npx convex dev      # first run creates your deployment and writes .env.local
npm run dev
```

Copy `.env.example` to `.env.local` if you want to point at an existing deployment.

```bash
npx vitest run      # the ruleset is proven here first
```
