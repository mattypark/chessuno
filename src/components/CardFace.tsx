"use client";

import type { Card, CardColor } from "@/lib/rules/types";

/**
 * A real Uno card is built from three layers: a white border, a coloured face,
 * and a white ellipse tilted across it carrying the value in the card's own
 * colour. Corner indices sit on the colour, in white. Copying that construction
 * — rather than approximating it with a coloured rectangle — is what makes these
 * read as cards instead of as buttons.
 */

const FACE: Record<CardColor, string> = {
  red: "var(--uno-red)",
  yellow: "var(--uno-yellow)",
  green: "var(--uno-green)",
  blue: "var(--uno-blue)",
};

function faceColor(card: Card): string {
  if (card.kind === "wild" || card.kind === "wild4") return "#1a1a18";
  return FACE[card.color ?? "red"];
}

/** Yellow is too light to carry white text; everything else is fine. */
function indexColor(card: Card): string {
  return card.color === "yellow" && card.kind !== "wild" && card.kind !== "wild4"
    ? "rgba(0,0,0,0.55)"
    : "rgba(255,255,255,0.95)";
}

function symbol(card: Card): string {
  switch (card.kind) {
    case "number":
      return String(card.value);
    case "skip":
      return "⃠";
    case "reverse":
      return "⇄";
    case "draw2":
      return "+2";
    case "wild":
      return "";
    case "wild4":
      return "+4";
  }
}

function cornerSymbol(card: Card): string {
  if (card.kind === "wild") return "W";
  return symbol(card);
}

export interface CardFaceProps {
  card: Card;
  playable?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}

export function CardFace({ card, playable, onClick, size = "md" }: CardFaceProps) {
  const interactive = Boolean(onClick);
  const wild = card.kind === "wild" || card.kind === "wild4";
  const dims = size === "sm" ? "h-[4.6rem] w-[3.1rem]" : "h-[6.4rem] w-[4.4rem]";
  const glyph = size === "sm" ? "text-xl" : "text-3xl";

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      aria-label={`${card.color ?? "wild"} ${cornerSymbol(card) || "wild"}`}
      data-testid="card"
      data-card-id={card.id}
      data-card-kind={card.kind}
      data-playable={String(Boolean(playable))}
      className={[
        dims,
        "relative shrink-0 select-none rounded-lg bg-card-face p-[3px]",
        "shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition-transform duration-150 will-change-transform",
        interactive ? "cursor-pointer hover:-translate-y-2.5" : "",
        playable === false ? "opacity-55" : "",
        playable ? "ring-2 ring-accent-bright" : "",
      ].join(" ")}
    >
      <span
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[5px]"
        style={{ background: faceColor(card) }}
      >
        {/* The tilted ellipse. On a wild it carries the four colours instead. */}
        <span
          className="absolute h-[86%] w-[62%] rotate-[34deg] overflow-hidden rounded-[50%]"
          style={{ background: wild ? "transparent" : "var(--card-face)" }}
        >
          {wild && (
            <span className="grid h-full w-full grid-cols-2 grid-rows-2">
              <span style={{ background: "var(--uno-red)" }} />
              <span style={{ background: "var(--uno-blue)" }} />
              <span style={{ background: "var(--uno-yellow)" }} />
              <span style={{ background: "var(--uno-green)" }} />
            </span>
          )}
        </span>

        {!wild && (
          <span
            className={`relative font-mono font-black leading-none ${glyph}`}
            style={{
              color: faceColor(card),
              WebkitTextStroke: "1px rgba(0,0,0,0.35)",
              paintOrder: "stroke fill",
            }}
          >
            {symbol(card)}
          </span>
        )}

        {card.kind === "wild4" && (
          <span
            className={`relative font-mono font-black leading-none text-white ${glyph}`}
            style={{ WebkitTextStroke: "1.5px rgba(0,0,0,0.6)", paintOrder: "stroke fill" }}
          >
            +4
          </span>
        )}

        <span
          className="absolute left-1 top-0.5 font-mono text-[0.6rem] font-bold leading-none"
          style={{ color: indexColor(card) }}
        >
          {cornerSymbol(card)}
        </span>
        <span
          className="absolute bottom-0.5 right-1 rotate-180 font-mono text-[0.6rem] font-bold leading-none"
          style={{ color: indexColor(card) }}
        >
          {cornerSymbol(card)}
        </span>
      </span>
    </button>
  );
}

/** The face-down back, used for the draw pile. */
export function CardBack({ size = "md" }: { size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-[4.6rem] w-[3.1rem]" : "h-[6.4rem] w-[4.4rem]";

  return (
    <div
      className={`${dims} relative shrink-0 rounded-lg bg-card-face p-[3px] shadow-[0_2px_6px_rgba(0,0,0,0.45)]`}
    >
      <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[5px] bg-card-ink">
        <span className="absolute h-[86%] w-[62%] rotate-[34deg] rounded-[50%] bg-uno-red" />
        <span className="relative font-mono text-sm font-black italic text-white">CU</span>
      </span>
    </div>
  );
}
