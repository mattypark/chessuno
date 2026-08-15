"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChessPiece } from "./ChessPiece";
import { isLightSquare, isPromotion, parseFen, squaresFor } from "@/lib/board";
import type { LegalMove } from "@/lib/rules/chessAdapter";
import type { Army } from "@/lib/rules/types";

export interface BoardProps {
  fen: string;
  /** Which way up the board is drawn — always the viewer's own army. */
  orientation: Army;
  legalMoves: LegalMove[];
  lastMove: { from: string; to: string } | null;
  canMove: boolean;
  onMove: (move: { from: string; to: string; promotion?: string }) => void;
}

export function Board({
  fen,
  orientation,
  legalMoves,
  lastMove,
  canMove,
  onMove,
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const board = useMemo(() => parseFen(fen), [fen]);
  const squares = useMemo(() => squaresFor(orientation), [orientation]);

  const targets = useMemo(
    () => (selected ? legalMoves.filter((m) => m.from === selected).map((m) => m.to) : []),
    [selected, legalMoves],
  );
  const movable = useMemo(() => new Set(legalMoves.map((m) => m.from)), [legalMoves]);

  function handleSquare(square: string) {
    if (!canMove) return;

    if (selected && targets.includes(square)) {
      onMove({
        from: selected,
        to: square,
        promotion: isPromotion(board[selected], square) ? "q" : undefined,
      });
      setSelected(null);
      return;
    }

    setSelected(movable.has(square) && square !== selected ? square : null);
  }

  return (
    <motion.div
      // Remounting on orientation change makes Reverse land as a physical flip:
      // the board turns over and you are suddenly on the other side of it.
      key={orientation}
      initial={{ rotateY: 180, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-md shadow-2xl shadow-black/40 [transform-style:preserve-3d]"
    >
      <div className="grid aspect-square w-full grid-cols-8">
        {squares.map((square, index) => {
          const piece = board[square];
          const light = isLightSquare(square);
          const isTarget = targets.includes(square);
          const isSelected = selected === square;
          const isLast = lastMove?.from === square || lastMove?.to === square;

          // Coordinates ride the edges of the board, as on a real set: files
          // along the bottom row, ranks up the left.
          const showFile = index >= 56;
          const showRank = index % 8 === 0;
          const label = light ? "text-square-dark" : "text-square-light";

          return (
            <button
              key={square}
              type="button"
              onClick={() => handleSquare(square)}
              aria-label={square}
              data-square={square}
              data-movable={String(canMove && movable.has(square))}
              data-target={String(isTarget)}
              className={[
                "relative grid place-items-center",
                light ? "bg-square-light" : "bg-square-dark",
                canMove && movable.has(square) ? "cursor-pointer" : "cursor-default",
              ].join(" ")}
            >
              {(isLast || isSelected) && (
                <span className="pointer-events-none absolute inset-0 bg-square-marked/55" />
              )}

              {piece && (
                <ChessPiece piece={piece} className="relative h-[86%] w-[86%] drop-shadow-sm" />
              )}

              {isTarget &&
                (piece ? (
                  // Captures get a ring around the victim rather than a dot on top
                  // of it, so you can still see what you are taking.
                  <span className="pointer-events-none absolute inset-0 rounded-[3px] border-[6px] border-square-hint" />
                ) : (
                  <span className="pointer-events-none absolute h-[30%] w-[30%] rounded-full bg-square-hint" />
                ))}

              {showRank && (
                <span
                  className={`pointer-events-none absolute left-0.5 top-0 text-[0.55rem] font-bold ${label}`}
                >
                  {square[1]}
                </span>
              )}
              {showFile && (
                <span
                  className={`pointer-events-none absolute bottom-0 right-0.5 text-[0.55rem] font-bold ${label}`}
                >
                  {square[0]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
