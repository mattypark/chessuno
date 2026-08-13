import { describeCard, isLegalPlay, isWild, moveBudget } from "./cards";
import { STARTING_HAND_SIZE, buildDeck, drawCards } from "./deck";
import {
  STARTING_FEN,
  applyMove,
  forceSideToMove,
  positionStatus,
} from "./chessAdapter";
import { seedFromString, shuffle } from "./rng";
import {
  IllegalActionError,
  type Card,
  type CardColor,
  type GameAction,
  type GameState,
  type LogEntry,
  type Seat,
} from "./types";

export function opponentOf(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

function log(state: GameState, seat: Seat | null, text: string): LogEntry[] {
  return [...state.log, { seat, text }];
}

function seatName(seat: Seat): string {
  return `Player ${seat + 1}`;
}

/**
 * Deals a fresh game. The opening discard is always a number card — flipping a
 * Skip or a Reverse before anyone has had a turn has no sensible meaning here.
 */
export function createGame(roomCode: string): GameState {
  const { value: shuffled, seed } = shuffle(buildDeck(), seedFromString(roomCode));

  const openerIndex = shuffled.findIndex((card) => card.kind === "number");
  const opener = shuffled[openerIndex];
  const rest = shuffled.filter((_, i) => i !== openerIndex);

  const base: GameState = {
    fen: STARTING_FEN,
    deck: rest,
    discard: [opener],
    activeColor: opener.color as CardColor,
    hands: [[], []],
    ownership: ["w", "b"],
    turnSeat: 0,
    movesRemaining: 0,
    pendingSkip: false,
    cardPlayedThisTurn: false,
    drewThisTurn: false,
    status: "active",
    winner: null,
    result: null,
    log: [{ seat: null, text: `Opening card: ${describeCard(opener)}.` }],
    rngSeed: seed,
  };

  let dealt = base;
  for (let i = 0; i < STARTING_HAND_SIZE; i++) {
    dealt = drawCards(drawCards(dealt, 0, 1), 1, 1);
  }

  return beginTurn(dealt);
}

/**
 * Hands the turn to `state.turnSeat`, honouring a pending Skip, then re-derives the
 * side to move from ownership and settles the board before the player acts. A
 * player who is already mated cannot be saved by any card, so the game ends here.
 */
function beginTurn(state: GameState): GameState {
  let next: GameState = {
    ...state,
    movesRemaining: 0,
    cardPlayedThisTurn: false,
    drewThisTurn: false,
  };

  const incoming = next.turnSeat;
  const incomingInCheck = positionStatus(
    forceSideToMove(next.fen, next.ownership[incoming]),
  ).inCheck;

  if (next.pendingSkip) {
    // Check outranks Skip. Skipping a player who owes a check answer would hand
    // the turn back to the checker with the enemy king still hanging.
    next = incomingInCheck
      ? {
          ...next,
          pendingSkip: false,
          log: log(next, incoming, `${seatName(incoming)} is in check and cannot be skipped.`),
        }
      : {
          ...next,
          pendingSkip: false,
          turnSeat: opponentOf(incoming),
          log: log(next, incoming, `${seatName(incoming)} is skipped.`),
        };
  }

  next = { ...next, fen: forceSideToMove(next.fen, next.ownership[next.turnSeat]) };

  const status = positionStatus(next.fen);
  if (status.checkmate) {
    return finish(next, opponentOf(next.turnSeat), "checkmate");
  }
  if (status.stalemate) {
    return finish(next, null, "stalemate");
  }
  if (status.drawn) {
    return finish(next, null, "draw");
  }

  return status.inCheck ? ensureCheckCanBeAnswered(next) : next;
}

/**
 * A player in check must be able to act, because a turn that passes with the
 * check unanswered leaves the king capturable on the opponent's next move.
 *
 * Cards can otherwise leave you helpless — hold nothing playable and your turn
 * ends having moved nothing at all. So in check you draw until something is
 * playable. If the deck and the discard cannot supply it, the check is
 * unanswerable, which is what checkmate means here.
 */
function ensureCheckCanBeAnswered(state: GameState): GameState {
  let next = state;
  const seat = next.turnSeat;

  while (!next.hands[seat].some((card) => isPlayableNow(next, card))) {
    const before = next.hands[seat].length;
    next = drawCards(next, seat, 1);

    if (next.hands[seat].length === before) {
      return finish(next, opponentOf(seat), "checkmate");
    }
    next = {
      ...next,
      log: log(next, seat, `${seatName(seat)} is in check and draws to answer it.`),
    };
  }

  return next;
}

function endTurn(state: GameState): GameState {
  if (state.status !== "active") return state;
  return beginTurn({ ...state, turnSeat: opponentOf(state.turnSeat) });
}

function finish(
  state: GameState,
  winner: Seat | null,
  result: GameState["result"],
): GameState {
  const text =
    winner === null
      ? `Game drawn (${result}).`
      : `${seatName(winner)} wins by ${result === "empty-hand" ? "emptying their hand" : result}.`;

  return {
    ...state,
    status: "finished",
    winner,
    result,
    movesRemaining: 0,
    log: log(state, winner, text),
  };
}

function requireActiveTurn(state: GameState, seat: Seat): void {
  if (state.status !== "active") {
    throw new IllegalActionError("game-not-active", "The game is over.");
  }
  if (seat !== state.turnSeat) {
    throw new IllegalActionError("not-your-turn", "It is not your turn.");
  }
}

/**
 * Whether a card can actually be played right now.
 *
 * Uno legality is not the whole story: Reverse hands your army to your opponent,
 * which is forbidden while your own king is in check. Anything deciding what a
 * player may do — the draw rule, the UI's lit cards — has to ask this, not
 * `isLegalPlay` alone, or a hand of nothing but Reverses deadlocks the turn.
 */
export function isPlayableNow(state: GameState, card: Card): boolean {
  const top = state.discard[state.discard.length - 1];
  if (!isLegalPlay(card, top, state.activeColor)) return false;
  if (card.kind === "reverse" && positionStatus(state.fen).inCheck) return false;
  return true;
}

export function playableCardIds(state: GameState, seat: Seat): string[] {
  return state.hands[seat].filter((card) => isPlayableNow(state, card)).map((card) => card.id);
}

function playCard(
  state: GameState,
  seat: Seat,
  cardId: string,
  declaredColor?: CardColor,
): GameState {
  requireActiveTurn(state, seat);
  if (state.cardPlayedThisTurn) {
    throw new IllegalActionError("card-already-played", "You already played a card this turn.");
  }

  const hand = state.hands[seat];
  const card = hand.find((c) => c.id === cardId);
  if (!card) {
    throw new IllegalActionError("card-not-in-hand", "That card is not in your hand.");
  }

  const top = state.discard[state.discard.length - 1];
  if (!isLegalPlay(card, top, state.activeColor)) {
    throw new IllegalActionError(
      "card-does-not-match",
      `${describeCard(card)} does not match ${describeCard(top)}.`,
    );
  }
  if (isWild(card) && !declaredColor) {
    throw new IllegalActionError("no-color-declared", "Declare a colour for a wild card.");
  }

  // Reverse hands your army to your opponent. Doing that while your own king is in
  // check would abandon an illegal position, so check must be answered on the board.
  if (card.kind === "reverse" && positionStatus(state.fen).inCheck) {
    throw new IllegalActionError(
      "reverse-while-in-check",
      "You cannot swap armies while your king is in check.",
    );
  }

  const color = isWild(card) ? (declaredColor as CardColor) : (card.color as CardColor);
  const hands: GameState["hands"] = [state.hands[0], state.hands[1]];
  hands[seat] = hand.filter((c) => c.id !== cardId);

  const next: GameState = {
    ...state,
    hands,
    discard: [...state.discard, { ...card, color }],
    activeColor: color,
    cardPlayedThisTurn: true,
    movesRemaining: moveBudget(card),
    log: log(state, seat, `${seatName(seat)} plays ${describeCard(card)}.`),
  };

  // Emptying your hand wins outright, before the card's board effect resolves.
  if (hands[seat].length === 0) {
    return finish(next, seat, "empty-hand");
  }

  return applyCardEffect(next, seat, card);
}

function applyCardEffect(state: GameState, seat: Seat, card: Card): GameState {
  const opponent = opponentOf(seat);

  switch (card.kind) {
    case "number":
    case "wild":
      return state;

    case "skip":
      return {
        ...state,
        pendingSkip: true,
        log: log(state, seat, `${seatName(opponent)} will lose their next turn.`),
      };

    case "draw2":
      return {
        ...drawCards(state, opponent, 2),
        log: log(state, seat, `${seatName(opponent)} draws 2.`),
      };

    case "wild4":
      return {
        ...drawCards(state, opponent, 4),
        log: log(state, seat, `${seatName(opponent)} draws 4.`),
      };

    case "reverse":
      return applyReverse(state, seat);
  }
}

/**
 * Swaps army ownership. The board is untouched — castling rights and material stay
 * exactly where they were — but the side to move is re-derived, so the player who
 * played Reverse immediately moves the army they just took. Taking over a mated
 * position loses on the spot; that risk is what the card costs.
 */
function applyReverse(state: GameState, seat: Seat): GameState {
  const ownership: GameState["ownership"] = [state.ownership[1], state.ownership[0]];
  const army = ownership[seat];

  const swapped: GameState = {
    ...state,
    ownership,
    fen: forceSideToMove(state.fen, army),
    log: log(
      state,
      seat,
      `${seatName(seat)} plays Reverse and takes the ${army === "w" ? "white" : "black"} army.`,
    ),
  };

  const status = positionStatus(swapped.fen);
  if (status.checkmate) {
    return finish(swapped, opponentOf(seat), "checkmate");
  }
  if (status.stalemate) {
    return finish(swapped, null, "stalemate");
  }

  return swapped;
}

function drawCard(state: GameState, seat: Seat): GameState {
  requireActiveTurn(state, seat);
  if (state.cardPlayedThisTurn) {
    throw new IllegalActionError("card-already-played", "You already played a card this turn.");
  }
  if (state.drewThisTurn) {
    throw new IllegalActionError("already-drew", "You have already drawn this turn.");
  }

  if (state.hands[seat].some((card) => isPlayableNow(state, card))) {
    throw new IllegalActionError("must-play-legal-card", "You hold a playable card.");
  }

  return {
    ...drawCards(state, seat, 1),
    drewThisTurn: true,
    log: log(state, seat, `${seatName(seat)} draws a card.`),
  };
}

function makeMove(
  state: GameState,
  seat: Seat,
  from: string,
  to: string,
  promotion?: string,
): GameState {
  requireActiveTurn(state, seat);
  if (state.movesRemaining <= 0) {
    throw new IllegalActionError("no-moves-remaining", "Play a card to earn moves.");
  }

  const applied = applyMove(state.fen, { from, to, promotion });
  if (!applied) {
    throw new IllegalActionError("illegal-move", `${from}-${to} is not a legal move.`);
  }

  const next: GameState = {
    ...state,
    fen: applied.fen,
    movesRemaining: state.movesRemaining - 1,
    log: log(state, seat, `${seatName(seat)} plays ${applied.san}.`),
  };

  // Mate is checked after every move, not only at end of turn.
  const opponentArmy = next.ownership[opponentOf(seat)];
  const opponentStatus = positionStatus(forceSideToMove(next.fen, opponentArmy));
  if (opponentStatus.checkmate) {
    return finish(next, seat, "checkmate");
  }

  // Check ends your turn, and any moves left in the budget are forfeited.
  //
  // Without this, multi-move turns make check unanswerable: give check on the
  // first of three moves and the second simply captures the king. Ordinary chess
  // never reaches "the side not to move is in check", so nothing downstream
  // guards against it. Handing the turn over the instant check appears is what
  // keeps the chess underneath honest — and it makes checking a real cost, since
  // you now sequence your moves to check last.
  if (opponentStatus.inCheck) {
    return endTurn({
      ...next,
      movesRemaining: 0,
      log: log(next, seat, "Check — turn ends."),
    });
  }

  return next.movesRemaining === 0 ? endTurn(next) : next;
}

function requestEndTurn(state: GameState, seat: Seat): GameState {
  requireActiveTurn(state, seat);
  if (!state.cardPlayedThisTurn && !state.drewThisTurn) {
    throw new IllegalActionError("turn-not-started", "Play or draw a card first.");
  }
  // Walking away in check would leave the king capturable next turn.
  if (positionStatus(state.fen).inCheck) {
    throw new IllegalActionError("check-unanswered", "You must answer the check.");
  }
  return endTurn(state);
}

/**
 * The single entry point for every rule in the game. Convex and the UI both call
 * this; nothing else is allowed to mutate game state. Illegal actions throw
 * `IllegalActionError` rather than silently no-op.
 */
export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "PLAY_CARD":
      return playCard(state, action.seat, action.cardId, action.declaredColor);
    case "DRAW_CARD":
      return drawCard(state, action.seat);
    case "MAKE_MOVE":
      return makeMove(state, action.seat, action.from, action.to, action.promotion);
    case "END_TURN":
      return requestEndTurn(state, action.seat);
    case "RESIGN":
      // Resigning is legal on either player's turn.
      if (state.status !== "active") {
        throw new IllegalActionError("game-not-active", "The game is over.");
      }
      return finish(state, opponentOf(action.seat), "resign");
  }
}
