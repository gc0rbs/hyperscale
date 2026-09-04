"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createContext, useContext, useMemo, useState } from "react";
import type { Deployment } from "@/lib/deployment";
import { makeWagmiConfig } from "@/lib/wagmi";

const DeploymentContext = createContext<Deployment | null>(null);
export const useDeployment = () => {
  const d = useContext(DeploymentContext);
  if (!d) throw new Error("no deployment");
  return d;
};

export function Providers({ deployment, children }: { deployment: Deployment; children: React.ReactNode }) {
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
