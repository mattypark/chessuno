"use client";

import type { Card, CardColor } from "@/lib/rules/types";

const COLOR_CLASS: Record<CardColor, string> = {
  red: "bg-uno-red",
  yellow: "bg-uno-yellow",
  green: "bg-uno-green",
  blue: "bg-uno-blue",
};

/** Wilds keep a black face until a colour is declared, then wear it as a ring. */
function faceClass(card: Card): string {
  if (card.kind === "wild" || card.kind === "wild4") return "bg-ink";
  return COLOR_CLASS[card.color ?? "red"];
}

function symbol(card: Card): string {
  switch (card.kind) {
    case "number":
      return String(card.value);
    case "skip":
      return "⊘";
    case "reverse":
      return "⇄";
    case "draw2":
      return "+2";
    case "wild":
      return "★";
    case "wild4":
      return "+4";
  }
}

export interface CardFaceProps {
  card: Card;
  playable?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}

export function CardFace({ card, playable, onClick, size = "md" }: CardFaceProps) {
  const dims = size === "sm" ? "h-20 w-14 text-xl" : "h-28 w-20 text-3xl";
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      aria-label={`${card.color ?? "wild"} ${symbol(card)}`}
      data-testid="card"
      data-card-id={card.id}
      data-card-kind={card.kind}
      data-playable={String(Boolean(playable))}
      className={[
        dims,
        faceClass(card),
        "relative shrink-0 rounded-xl border-2 border-cream/90 shadow-lg shadow-black/40",
        "transition-transform duration-150 will-change-transform",
        interactive ? "cursor-pointer hover:-translate-y-2 focus-visible:-translate-y-2" : "",
        // Dimmed, not desaturated — the colour is the information you plan with.
        playable === false ? "opacity-50" : "",
        playable ? "ring-2 ring-cream/90 ring-offset-2 ring-offset-felt-deep" : "",
      ].join(" ")}
    >
      <span className="absolute inset-2 rounded-[50%] bg-cream/90 rotate-[-20deg]" />
      <span className="absolute inset-0 grid place-items-center font-mono font-bold text-ink">
        {symbol(card)}
      </span>
      <span className="absolute left-1 top-0.5 font-mono text-[0.6rem] text-cream drop-shadow">
        {symbol(card)}
      </span>
    </button>
  );
}

/** The face-down back, used for the draw pile and the opponent's hand. */
export function CardBack({ size = "md" }: { size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-20 w-14 text-base" : "h-28 w-20 text-lg";
  return (
    <div
      className={`${dims} relative shrink-0 rounded-xl border-2 border-cream/90 bg-ink shadow-lg shadow-black/40`}
    >
      <span className="absolute inset-2 rounded-[50%] bg-uno-red/80 rotate-[-20deg]" />
      <span className="absolute inset-0 grid place-items-center font-mono font-bold italic text-cream">
        cu
      </span>
    </div>
  );
}
