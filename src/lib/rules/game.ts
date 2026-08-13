import {
  describeCard,
  hasLegalPlay,
  isLegalPlay,
  isWild,
  moveBudget,
} from "./cards";
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

  if (next.pendingSkip) {
    const skipped = next.turnSeat;
    next = {
      ...next,
      pendingSkip: false,
      turnSeat: opponentOf(skipped),
      log: log(next, skipped, `${seatName(skipped)} is skipped.`),
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

  const top = state.discard[state.discard.length - 1];
  if (hasLegalPlay(state.hands[seat], top, state.activeColor)) {
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
  if (positionStatus(forceSideToMove(next.fen, opponentArmy)).checkmate) {
    return finish(next, seat, "checkmate");
  }

  return next.movesRemaining === 0 ? endTurn(next) : next;
}

function requestEndTurn(state: GameState, seat: Seat): GameState {
  requireActiveTurn(state, seat);
  if (!state.cardPlayedThisTurn && !state.drewThisTurn) {
    throw new IllegalActionError("turn-not-started", "Play or draw a card first.");
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
