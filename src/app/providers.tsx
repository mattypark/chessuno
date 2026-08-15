"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (!client) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-3 p-8">
        <h1 className="font-mono text-lg text-accent">No Convex deployment</h1>
        <p className="text-sm text-text-dim">
          Run <code className="text-text">npx convex dev</code> once to provision a
          deployment. It writes <code className="text-text">NEXT_PUBLIC_CONVEX_URL</code>{" "}
          into <code className="text-text">.env.local</code> for you.
        </p>
      </main>
    );
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
