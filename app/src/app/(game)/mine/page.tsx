"use client";
import { useAnyDeployment } from "@/app/providers";
import { SeasonShell } from "@/components/SeasonShell";
import { MineView } from "@/components/MineView";
import { RoundShell } from "@/components/rounds/RoundShell";
import { RoundView } from "@/components/rounds/RoundView";

export default function MinePage() {
  const dep = useAnyDeployment();
  if (dep.kind === "rounds") return <RoundShell>{(snap) => <RoundView snap={snap} />}</RoundShell>;
  return <SeasonShell>{(snap) => <MineView snap={snap} />}</SeasonShell>;
}
