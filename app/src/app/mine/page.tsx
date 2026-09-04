"use client";
import { SeasonShell } from "@/components/SeasonShell";
import { MineView } from "@/components/MineView";

export default function MinePage() {
  return <SeasonShell>{(snap) => <MineView snap={snap} />}</SeasonShell>;
}
