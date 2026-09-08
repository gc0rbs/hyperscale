"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createContext, useContext, useMemo, useState } from "react";
import type { AnyDeployment, Deployment, RoundsDeployment } from "@/lib/deployment";
import { makeWagmiConfig } from "@/lib/wagmi";

const DeploymentContext = createContext<AnyDeployment | null>(null);

/** Whichever deployment the game layout chose (season or rounds). */
export const useAnyDeployment = (): AnyDeployment => {
  const d = useContext(DeploymentContext);
  if (!d) throw new Error("no deployment");
  return d;
};

/** The season deployment. Season components render only under a season deployment. */
export const useDeployment = (): Deployment => {
  const d = useAnyDeployment();
  if (d.kind !== "season") throw new Error("season component rendered under a rounds deployment");
  return d;
};

/** The rounds deployment. Rounds components render only under a rounds deployment. */
export const useRoundsDeployment = (): RoundsDeployment => {
  const d = useAnyDeployment();
  if (d.kind !== "rounds") throw new Error("rounds component rendered under a season deployment");
  return d;
};

export function Providers({ deployment, children }: { deployment: AnyDeployment; children: React.ReactNode }) {
  const config = useMemo(() => makeWagmiConfig(deployment.chainId, deployment.rpcUrl), [deployment.chainId, deployment.rpcUrl]);
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } }));
  return (
    <DeploymentContext.Provider value={deployment}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </WagmiProvider>
    </DeploymentContext.Provider>
  );
}
