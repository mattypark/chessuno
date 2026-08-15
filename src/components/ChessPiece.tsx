import type { Piece } from "@/lib/board";

/**
 * An original flat piece set, built from simple geometry rather than borrowed
 * artwork. Every piece shares a plinth and a collar, so the six silhouettes read
 * as one family and differ only where it matters — the head.
 *
 * Drawn on a 45x45 grid to match the usual chess-piece convention, and filled
 * with a contrasting outline so both armies stay legible on either square colour.
 */

const PLINTH = "M10.5 39.5h24a2 2 0 0 1 2 2v2h-28v-2a2 2 0 0 1 2-2z";
const COLLAR = "M13.5 35h18l2.5 4.5h-23z";

const BODIES: Record<string, string> = {
  p: [
    "M22.5 9a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4z",
    "M16.8 20.2h11.4l1.2 2.8H15.6z",
    "M16 23.6h13c0 6.2 1.4 8.8 3.2 11.4H12.8c1.8-2.6 3.2-5.2 3.2-11.4z",
  ].join(" "),

  r: [
    // Crenellated top: three merlons cut by two gaps.
    "M11.5 8.5h5v3.2h4.2V8.5h3.6v3.2h4.2V8.5h5v9.2h-22z",
    "M14.2 17.7h16.6l-1.4 17.3H15.6z",
  ].join(" "),

  n: [
    // A horse head facing left: ear top right, muzzle low left, neck flaring to
    // the collar. Built as one outline so the silhouette stays clean when the
    // board shrinks.
    "M25.6 5.2l4.6 6.2c3.2 4.2 4.4 9.2 4.4 15.6V35H14.4c0-5.4 1-9.4 3.2-12.6l-3.8.8c-2 .4-3.2-1.6-2-3.2l4.6-6-2.6-1.4 6.8-4 1-4z",
    // Eye and mane notch, punched back out in the square colour underneath.
    "M22.6 14.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z",
  ].join(" "),

  b: [
    "M22.5 5.4a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2z",
    "M22.5 9.2c3.4 3 5.6 6.4 5.6 9.8 0 3.4-2.5 6-5.6 6s-5.6-2.6-5.6-6c0-3.4 2.2-6.8 5.6-9.8z",
    "M15.8 25.6h13.4l-1 9.4H16.8z",
  ].join(" "),

  q: [
    // Five points, each capped with an orb.
    "M11 21.4l1.8-9.2 4.4 6.6 3.3-10 3.3 10 4.4-6.6 1.8 9.2z",
    "M12.6 22.6h19.8l-1.8 12.4H14.4z",
    "M10.6 8.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z",
    "M17.2 5.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z",
    "M22.5 3.8a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z",
    "M27.8 5.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z",
    "M34.4 8.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z",
  ].join(" "),

  k: [
    "M21.3 3.4h2.4v3.2h3.2V9h-3.2v3.4h-2.4V9h-3.2V6.6h3.2z",
    "M12.2 22.6c0-5.4 4.6-8.8 10.3-8.8s10.3 3.4 10.3 8.8z",
    "M12.8 23.8h19.4l-1.8 11.2H14.6z",
  ].join(" "),
};

export function ChessPiece({ piece, className }: { piece: Piece; className?: string }) {
  const isWhite = piece.color === "w";

  return (
    <svg
      viewBox="0 0 45 45"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{
        fill: isWhite ? "#fbfbf9" : "#2b2926",
        stroke: isWhite ? "#1c1b19" : "#0d0d0c",
        strokeWidth: 1.6,
        strokeLinejoin: "round",
      }}
    >
      <path d={BODIES[piece.type]} />
      <path d={COLLAR} />
      <path d={PLINTH} />
    </svg>
  );
}
