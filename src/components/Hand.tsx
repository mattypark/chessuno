"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CardFace } from "./CardFace";
import { CARD_COLORS } from "@/lib/rules/deck";
import type { Card, CardColor } from "@/lib/rules/types";

const SWATCH: Record<CardColor, string> = {
  red: "bg-uno-red",
  yellow: "bg-uno-yellow",
  green: "bg-uno-green",
  blue: "bg-uno-blue",
};

export interface HandProps {
  hand: Card[];
  /** Decided by the server — Uno legality plus the chess restrictions. */
  playableCardIds: string[];
  onPlay: (cardId: string, declaredColor?: CardColor) => void;
}

export function Hand({ hand, playableCardIds, onPlay }: HandProps) {
  const playableSet = new Set(playableCardIds);
  const [pendingWild, setPendingWild] = useState<string | null>(null);

  function choose(card: Card) {
    if (card.kind === "wild" || card.kind === "wild4") {
      setPendingWild(card.id);
      return;
    }
    onPlay(card.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence>
        {pendingWild && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2"
          >
            <span className="text-sm text-chalk">Declare a colour</span>
            {CARD_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => {
                  onPlay(pendingWild, color);
                  setPendingWild(null);
                }}
                className={`${SWATCH[color]} h-7 w-7 rounded-full border-2 border-cream/80 transition-transform hover:scale-110`}
              />
            ))}
            <button
              type="button"
              onClick={() => setPendingWild(null)}
              className="ml-auto text-sm text-chalk underline underline-offset-2"
            >
              cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {hand.map((card) => {
          const playable = playableSet.has(card.id);
          return (
            <CardFace
              key={card.id}
              card={card}
              playable={playable}
              onClick={playable ? () => choose(card) : undefined}
            />
          );
        })}
        {hand.length === 0 && <p className="text-sm text-chalk">No cards.</p>}
      </div>
    </div>
  );
}
