"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  glyphFor,
  isLightSquare,
  isPromotion,
  parseFen,
  squaresFor,
} from "@/lib/board";
import type { LegalMove } from "@/lib/rules/chessAdapter";
import type { Army } from "@/lib/rules/types";

export interface BoardProps {
  fen: string;
  /** Which way up the board is drawn — always the viewer's own army. */
  orientation: Army;
  legalMoves: LegalMove[];
  canMove: boolean;
  onMove: (move: { from: string; to: string; promotion?: string }) => void;
}

export function Board({ fen, orientation, legalMoves, canMove, onMove }: BoardProps) {
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
      const piece = board[selected];
      onMove({
        from: selected,
        to: square,
        promotion: isPromotion(piece, square) ? "q" : undefined,
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
      className="rounded-xl border-4 border-rail bg-rail p-1 shadow-2xl shadow-black/50 [transform-style:preserve-3d]"
    >
      <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-sm">
        {squares.map((square) => {
          const piece = board[square];
          const isTarget = targets.includes(square);
          const isSelected = selected === square;

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
                "relative grid place-items-center leading-none",
                isLightSquare(square) ? "bg-square-light" : "bg-square-dark",
                isSelected ? "outline outline-4 -outline-offset-4 outline-square-move" : "",
                canMove && movable.has(square) ? "cursor-pointer" : "cursor-default",
              ].join(" ")}
            >
              {piece && (
                <span
                  className={[
                    "select-none text-[clamp(1.4rem,5.2vw,2.6rem)]",
                    piece.color === "w" ? "text-cream" : "text-ink",
                  ].join(" ")}
                  style={{
                    // Both armies use the same filled glyph, so each needs an
                    // outline in the opposite tone to stay legible on either
                    // colour of square.
                    WebkitTextStroke:
                      piece.color === "w" ? "1.5px var(--ink)" : "1px rgba(243,234,216,0.45)",
                    paintOrder: "stroke fill",
                  }}
                >
                  {glyphFor(piece)}
                </span>
              )}
              {isTarget && (
                <span
                  className={[
                    "pointer-events-none absolute",
                    piece
                      ? "inset-0 rounded-sm ring-4 ring-inset ring-square-move"
                      : "h-1/3 w-1/3 rounded-full bg-square-move/80",
                  ].join(" ")}
                />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
