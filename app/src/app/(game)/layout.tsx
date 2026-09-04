import { getDeployment } from "@/lib/deployment";
import { Providers } from "../providers";
import { Nav } from "@/components/Nav";
import { DevAccountProvider } from "@/components/DevAccountProvider";
import { SeasonUnavailable } from "@/components/SeasonUnavailable";

export const dynamic = "force-dynamic";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const deployment = getDeployment();
  if (!deployment) return <SeasonUnavailable />;
  return <Providers deployment={deployment}><DevAccountProvider><Nav />{children}</DevAccountProvider></Providers>;
}
