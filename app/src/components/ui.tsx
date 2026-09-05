"use client";
import type { ReactNode } from "react";
import { Icon } from "./Icons";

export const Label = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`text-[12px] tracking-[0.08em] uppercase text-mine-muted font-medium ${className}`}>{children}</div>
);

export const Mono = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`font-data tabular-nums ${className}`}>{children}</span>
);

export const Chip = ({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "signal" | "ember" }) => {
  const tones = { muted: "border-mine-line text-mine-muted", signal: "border-signal-deep text-signal", ember: "border-ember-deep text-ember" };
  return <span className={`text-[11px] tracking-[0.06em] uppercase px-[7px] py-[3px] border rounded-[3px] whitespace-nowrap ${tones[tone]}`}>{children}</span>;
};

export const Panel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`bg-mine-panel border border-mine-line rounded-md p-5 ${className}`}>{children}</div>
);

export function Stat({ label, value, sub, est = false, big = false }: { label: string; value: ReactNode; sub?: ReactNode; est?: boolean; big?: boolean }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <Label>{label}</Label>
      <div className={`font-data tabular-nums font-medium leading-[1.1] whitespace-nowrap overflow-hidden text-ellipsis ${big ? "text-[26px] xl:text-[30px]" : "text-[20px] xl:text-[22px]"} ${est ? "text-signal" : ""}`}>{value}</div>
      {sub && <div className="text-mine-muted text-[12px]">{sub}</div>}
    </div>
  );
}

type BtnProps = { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: "ember" | "signal" | "ghost" | "shell" | "shellGhost"; className?: string; type?: "button" | "submit"; title?: string; "data-testid"?: string };
export function Btn({ children, onClick, disabled, tone = "ghost", className = "", type = "button", title, ...rest }: BtnProps) {
  const tones = {
    ember: "bg-ember text-[#1A1408] border-transparent",
    signal: "bg-signal text-[#062126] border-transparent",
    ghost: "bg-transparent text-mine-fg border-mine-line",
    shell: "bg-shell-fg text-white border-transparent",
    shellGhost: "bg-white text-shell-fg border-[var(--shell-line-strong)]",
  };
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} {...rest} className={`h-10 px-4 rounded-sm inline-flex items-center justify-center gap-2 text-[14px] font-semibold border whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed transition-opacity ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

export const Cost = ({ children }: { children: ReactNode }) => <span className="font-data font-normal text-[12px] opacity-80">{children}</span>;

export function Progress({ pct, ticks = 8, head = true, color = "var(--signal)" }: { pct: number; ticks?: number; head?: boolean; color?: string }) {
  return (
    <div className="relative h-[10px] bg-mine-panel2 border border-mine-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="absolute left-0 top-0 bottom-0 transition-[width] duration-[400ms] ease-out motion-reduce:transition-none" style={{ width: `${pct}%`, background: color }} />
      {Array.from({ length: ticks - 1 }, (_, i) => {
        const left = ((i + 1) * 100) / ticks;
        return <div key={i} className="absolute -top-1 w-px h-[18px]" style={{ left: `${left}%`, background: left <= pct ? color : "var(--mine-line)", width: left <= pct ? 2 : 1 }} />;
      })}
      {head && <div className="absolute -top-[6px] w-[3px] h-[22px] bg-mine-fg transition-[left] duration-[400ms] ease-out motion-reduce:transition-none" style={{ left: `${pct}%` }} />}
    </div>
  );
}

export function Pips({ on, total, label }: { on: number; total: number; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label} tier {on}</Label>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => <div key={i} className={`w-[14px] h-[6px] rounded-[1px] ${i < on ? "bg-ember" : "bg-mine-line"}`} />)}
      </div>
    </div>
  );
}

export function HeatGauge({ value, ghost, max = 100 }: { value: number; ghost: number; max?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between"><Label className="flex items-center gap-1.5"><Icon name="heat" size={13} /> Heat</Label><Mono className="text-mine-muted text-[12px]">{value} / {max} · next overclock +{ghost}</Mono></div>
      <div className="relative h-2 bg-mine-panel2 border border-mine-line">
        <div className="absolute left-0 top-0 bottom-0 transition-[width] duration-[400ms] motion-reduce:transition-none" style={{ width: `${(value / max) * 100}%`, background: "linear-gradient(90deg, var(--ember), var(--ember) 60%, var(--heat-hot))" }} />
        <div className="absolute top-0 bottom-0 opacity-60" style={{ left: `${(value / max) * 100}%`, width: `${(Math.min(ghost, max - value) / max) * 100}%`, background: "repeating-linear-gradient(135deg, var(--ember) 0 3px, transparent 3px 6px)" }} />
      </div>
    </div>
  );
}

export function OcSlots({ active, max, expiresLabel }: { active: number; max: number; expiresLabel: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between"><Label>Overclocks</Label><Mono className="text-mine-muted text-[12px]">{active} / {max} · {active ? expiresLabel : "none active"}</Mono></div>
      <div className="flex gap-1.5">
        {Array.from({ length: max }, (_, i) =>
          i < active ? (
            <div key={i} className="flex-1 h-[26px] border border-ember bg-[var(--ember-tint)] relative"><Mono className="absolute inset-0 flex items-center justify-center text-[11px] text-ember">+50%</Mono></div>
          ) : (
            <div key={i} className="flex-1 h-[26px] border border-dashed border-mine-line" />
          ),
        )}
      </div>
    </div>
  );
}
