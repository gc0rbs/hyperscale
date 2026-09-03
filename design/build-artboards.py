#!/usr/bin/env python3
"""Generate the Stock Miner mockup artboards (design/artboards/*.dc.html + canvas.json)
from the tokens in specs/design/tokens.css. Run from repo root: python3 design/build-artboards.py"""
import json, os, re, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design", "artboards")
os.makedirs(OUT, exist_ok=True)

css = open(os.path.join(ROOT, "specs/design/tokens.css")).read().split("@media")[0]
T = {m.group(1): m.group(2).strip() for m in re.finditer(r"--([a-z0-9-]+):\s*([^;]+);", css)}

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">'

BASE_CSS = f"""
    body {{ margin:0; font-family:{T['font-ui']}; color:{T['shell-fg']}; background:{T['shell-bg']}; -webkit-font-smoothing:antialiased; }}
    a {{ color:{T['signal-deep']}; text-decoration:none; }} a:hover {{ color:{T['ember-deep']}; }}
    .mono {{ font-family:{T['font-data']}; font-variant-numeric:tabular-nums; }}
    .disp {{ font-family:{T['font-display']}; text-transform:uppercase; letter-spacing:0.02em; font-weight:700; line-height:1.05; }}
    .row {{ display:flex; flex-direction:row; align-items:center; gap:12px; }}
    .col {{ display:flex; flex-direction:column; gap:12px; }}
    .nav {{ height:56px; display:flex; flex-direction:row; align-items:center; gap:32px; padding:0 32px; background:{T['shell-card']}; color:{T['shell-fg']}; border-bottom:1px solid {T['shell-line']}; }}
    .navlinks {{ display:flex; flex-direction:row; gap:24px; font-size:15px; font-weight:500; color:{T['shell-muted']}; }}
    .navlinks .on {{ color:{T['shell-fg']}; }}
    .wallet {{ margin-left:auto; height:36px; padding:0 14px; border:1px solid {T['shell-line-strong']}; border-radius:999px; display:flex; align-items:center; gap:8px; font-size:13px; }}
    .mine {{ background:{T['mine-bg']}; color:{T['mine-fg']}; }}
    .panel {{ background:{T['mine-panel']}; border:1px solid {T['mine-line']}; border-radius:{T['radius-md']}; padding:20px; }}
    .label {{ font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:{T['mine-muted']}; font-weight:500; }}
    .muted {{ color:{T['mine-muted']}; }}
    .dim {{ color:{T['mine-dim']}; }}
    .btn {{ height:40px; padding:0 16px; border-radius:{T['radius-sm']}; display:inline-flex; align-items:center; justify-content:center; gap:10px; font-size:14px; font-weight:600; border:1px solid transparent; white-space:nowrap; }}
    .btn-ember {{ background:{T['ember']}; color:#1A1408; }}
    .btn-signal {{ background:{T['signal']}; color:#062126; }}
    .btn-ghost {{ background:transparent; color:{T['mine-fg']}; border-color:{T['mine-line']}; }}
    .btn-shell {{ background:{T['shell-fg']}; color:#fff; }}
    .btn-shell-ghost {{ background:#fff; color:{T['shell-fg']}; border-color:{T['shell-line-strong']}; }}
    .btn .cost {{ font-family:{T['font-data']}; font-weight:400; font-size:12px; opacity:0.8; }}
    .chip {{ font-size:11px; letter-spacing:0.06em; text-transform:uppercase; padding:3px 7px; border:1px solid {T['mine-line']}; border-radius:3px; color:{T['mine-muted']}; }}
    .est {{ color:{T['signal']}; }}
    .pips {{ display:flex; flex-direction:row; gap:4px; }}
    .pip {{ width:14px; height:6px; background:{T['mine-line']}; border-radius:1px; }}
    .pip.on {{ background:{T['ember']}; }}
    .hair {{ height:1px; background:{T['mine-line']}; }}
    .card {{ background:{T['shell-card']}; border:1px solid {T['shell-line']}; border-radius:{T['radius-lg']}; padding:24px; }}
    .stream {{ position:relative; height:220px; overflow:hidden; font-family:{T['font-data']}; font-size:12px; line-height:20px; color:{T['mine-dim']}; }}
    .stream::before, .stream::after {{ content:""; position:absolute; left:0; right:0; height:40px; z-index:1; }}
    .stream::before {{ top:0; background:linear-gradient({T['mine-panel']}, transparent); }}
    .stream::after {{ bottom:0; background:linear-gradient(transparent, {T['mine-panel']}); }}
    .stream-inner {{ animation: scroll 6s linear infinite; }}
    .stream-inner .hit {{ color:{T['ember']}; }}
    @keyframes scroll {{ from {{ transform:translateY(0); }} to {{ transform:translateY(-50%); }} }}
    @media (prefers-reduced-motion: reduce) {{ .stream-inner {{ animation:none; }} }}
"""

def doc(body, extra_css="", bg=None):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONTS}
  <style>{BASE_CSS}{extra_css}</style>
</helmet>
{body}
</x-dc>
</body>
</html>
"""

# ── icons (stroke svg, 20px grid) ─────────────────────────────────────────
def ico(name, color="currentColor", size=18):
    paths = {
        "wallet": '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h5"/><path d="M3 10h18"/>',
        "bell": '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
        "check": '<path d="M5 12l4 4L19 7"/>',
        "bolt": '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
        "chip": '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
        "fan": '<circle cx="12" cy="12" r="2"/><path d="M12 10V4a3 3 0 0 1 3 3M14 12h6a3 3 0 0 1-3 3M12 14v6a3 3 0 0 1-3-3M10 12H4a3 3 0 0 1 3-3"/>',
        "lock": '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
        "x": '<path d="M6 6l12 12M18 6L6 18"/>',
        "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    }
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{paths[name]}</svg>'

LOGO = f'<div class="row" style="gap:10px;"><div style="width:22px;height:22px;background:{T["shell-fg"]};border-radius:3px;display:flex;align-items:center;justify-content:center;">{ico("bolt", T["ember"], 14)}</div><div class="disp" style="font-size:20px;">Stock Miner</div></div>'

def nav(active="Mine", wallet="0x8a3f…c21e"):
    links = "".join(f'<div class="{"on" if l==active else ""}">{l}</div>' for l in ["Mine","Claim","Redeem","Leaderboard"])
    return f'<div class="nav">{LOGO}<div class="navlinks">{links}</div><div class="wallet mono">{ico("wallet", T["shell-muted"], 16)}{wallet}</div></div>'

def progress(pct, shift, ticks=8, head=True, color=None):
    color = color or T["signal"]
    tick_html = "".join(
        f'<div style="position:absolute;left:{i*100/ticks}%;top:-4px;width:1px;height:18px;background:{T["mine-line"]};"></div>'
        for i in range(1, ticks))
    done_ticks = "".join(
        f'<div style="position:absolute;left:{i*100/ticks}%;top:-4px;width:2px;height:18px;background:{color};"></div>'
        for i in range(1, ticks) if i*100/ticks <= pct)
    headh = f'<div style="position:absolute;left:{pct}%;top:-6px;width:3px;height:22px;background:{T["mine-fg"]};"></div>' if head else ""
    return f'''<div style="position:relative;height:10px;background:{T["mine-panel-2"]};border:1px solid {T["mine-line"]};">
      <div style="position:absolute;left:0;top:0;bottom:0;width:{pct}%;background:{color};"></div>{tick_html}{done_ticks}{headh}
    </div>'''

def stat(label, value, sub="", est=False, big=False):
    vcls = "mono est" if est else "mono"
    size = "32px" if big else "22px"
    return f'''<div class="col" style="gap:4px;">
      <div class="label">{label}</div>
      <div class="{vcls}" style="font-size:{size};font-weight:500;line-height:1.1;white-space:nowrap;">{value}</div>
      {f'<div class="muted" style="font-size:12px;">{sub}</div>' if sub else ""}
    </div>'''

def heat(value, ghost=0, tier=1):
    return f'''<div class="col" style="gap:6px;">
      <div class="row" style="justify-content:space-between;"><div class="label">Heat</div><div class="mono muted" style="font-size:12px;">{value} / 100 · next overclock +{ghost}</div></div>
      <div style="position:relative;height:8px;background:{T["mine-panel-2"]};border:1px solid {T["mine-line"]};">
        <div style="position:absolute;left:0;top:0;bottom:0;width:{value}%;background:linear-gradient(90deg,{T["ember"]},{T["ember"]} 60%,{T["heat-hot"]});"></div>
        <div style="position:absolute;left:{value}%;top:0;bottom:0;width:{ghost}%;background:repeating-linear-gradient(135deg,{T["ember"]} 0 3px,transparent 3px 6px);opacity:0.6;"></div>
      </div>
    </div>'''

def oc_slots(active, remaining=None):
    slots = []
    for i in range(3):
        if i < active:
            slots.append(f'<div style="flex:1;height:26px;border:1px solid {T["ember"]};background:{T["ember-tint"]};position:relative;"><div style="position:absolute;left:0;top:0;bottom:0;width:{remaining}%;background:{T["ember"]};opacity:0.35;"></div><div class="mono" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:{T["ember"]};">+50%</div></div>')
        else:
            slots.append(f'<div style="flex:1;height:26px;border:1px dashed {T["mine-line"]};"></div>')
    sub = f"expire end of shift {remaining_shift(remaining)}" if active else "none active"
    return f'''<div class="col" style="gap:6px;"><div class="row" style="justify-content:space-between;"><div class="label">Overclocks</div><div class="mono muted" style="font-size:12px;">{active} / 3 · {sub}</div></div><div class="row" style="gap:6px;">{"".join(slots)}</div></div>'''

def remaining_shift(r): return "6"

def pips(on, total, label, icon):
    return f'''<div class="col" style="gap:6px;"><div class="row" style="gap:6px;">{ico(icon, T["mine-muted"], 14)}<div class="label">{label} tier {on}</div></div><div class="pips">{"".join(f'<div class="pip {"on" if i<on else ""}"></div>' for i in range(total))}</div></div>'''

def rig_card(rid, asset, stake, hashrate, fps, earned, earned_tok, gpu, cool, heat_v, ghost, oc, oc_rem, oc_cost, gpu_cost, cool_cost, width="100%"):
    return f'''<div class="panel col" style="gap:18px;width:{width};box-sizing:border-box;">
      <div class="row" style="justify-content:space-between;">
        <div class="row"><div class="disp" style="font-size:22px;">Rig #{rid}</div><div class="chip">{asset}</div></div>
        <div class="mono muted" style="font-size:12px;">stake {stake}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:16px;">
        {stat("Hashrate", f'{hashrate}<span class="muted" style="font-size:14px;"> H</span>', big=True)}
        {stat("Fragments / s", fps, "fixed for this block")}
        {stat("Earned this block", earned, earned_tok)}
      </div>
      <div class="hair"></div>
      <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:16px;">
        {pips(gpu, 5, "GPU", "chip")}
        {pips(cool, 3, "Cooling", "fan")}
      </div>
      {heat(heat_v, ghost)}
      {oc_slots(oc, oc_rem)}
      <div class="col" style="gap:8px;">
        <div class="btn btn-ember" style="height:44px;">{ico("bolt", "#1A1408", 16)}Overclock <span class="cost">burn {oc_cost}</span></div>
        <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:8px;">
          <div class="btn btn-ghost" style="padding:0 10px;">GPU → {gpu+1} <span class="cost">burn {gpu_cost}</span></div>
          <div class="btn btn-ghost" style="padding:0 10px;">Cooling → {cool+1} <span class="cost">burn {cool_cost}</span></div>
        </div>
      </div>
    </div>'''

def hash_stream(seed=7, lines=14):
    rnd = random.Random(seed)
    rows = []
    for i in range(lines):
        h = "".join(rnd.choice("0123456789abcdef") for _ in range(40))
        hit = i in (3, 9)
        rows.append(f'<div class="{"hit" if hit else ""}">0x{h}{" ◂" if hit else ""}</div>')
    body = "".join(rows)
    return f'''<div class="panel col" style="gap:10px;padding:16px 20px;">
      <div class="row" style="justify-content:space-between;"><div class="label">Hash stream</div><div class="mono dim" style="font-size:11px;">~8.0M H</div></div>
      <div class="stream"><div class="stream-inner">{body}{body}</div></div>
      <div class="dim" style="font-size:11px;">Cosmetic. Your rewards depend on hashrate, not on this.</div>
    </div>'''

def block_card(n, ticker, pool, pool_usd, pct, shift, next_shift, block_found, close, total_hash, share, dense=True):
    return f'''<div class="panel col" style="gap:20px;">
      <div class="row" style="justify-content:space-between;align-items:flex-end;">
        <div class="col" style="gap:4px;">
          <div class="label">Block {n} of 4</div>
          <div class="row" style="gap:14px;align-items:baseline;"><div class="disp" style="font-size:48px;">{ticker}</div><div class="mono muted" style="font-size:14px;">pool {pool} ≈ {pool_usd}</div></div>
        </div>
        <div class="col" style="gap:4px;align-items:flex-end;"><div class="label">Shift</div><div class="mono" style="font-size:22px;">{shift}<span class="muted"> / 8</span></div></div>
      </div>
      <div class="col" style="gap:10px;">
        {progress(pct, shift)}
        <div class="row" style="justify-content:space-between;"><div class="mono muted" style="font-size:12px;">{pct}% of block work done</div><div class="mono muted" style="font-size:12px;">total hash {total_hash}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:16px;">
        {stat("Next shift", next_shift, "est. at current hash", est=True)}
        {stat("Block found", block_found, "est.", est=True)}
        {stat("Mine closes", close, "est. · block 4 found", est=True)}
        {stat("Your share", share, "of total hash")}
      </div>
    </div>'''

def claimable(items, surface="mine"):
    rows = []
    for tk, frags, tok in items:
        rows.append(f'''<div class="row" style="justify-content:space-between;padding:10px 0;border-top:1px solid {T["mine-line"]};">
          <div class="col" style="gap:2px;"><div class="disp" style="font-size:18px;">{tk}</div><div class="mono muted" style="font-size:12px;">{frags} frag · {tok}</div></div>
          <div class="btn btn-signal" style="height:34px;">Claim</div></div>''')
    return f'''<div class="panel col" style="gap:8px;"><div class="label">Found · claimable</div>{"".join(rows)}</div>'''

def position(hash_, share, fps, close, exit_link=True):
    return f'''<div class="panel col" style="gap:16px;">
      <div class="label">Your position</div>
      <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:16px;">
        {stat("Your hash", hash_)}
        {stat("Fragments / s", fps)}
        {stat("Share of mine", share)}
        {stat("Mine closes", close, "est.", est=True)}
      </div>
      {f'<div class="hair"></div><div class="row" style="justify-content:space-between;"><div class="muted" style="font-size:13px;">Leave early: deposit back minus 3%</div><a href="#" style="font-size:13px;">Exit a rig</a></div>' if exit_link else ""}
    </div>'''

def mine_header(season, phase, right=""):
    return f'''<div class="row" style="justify-content:space-between;padding:0 0 4px;">
      <div class="row" style="gap:14px;"><div class="disp" style="font-size:22px;">Season {season}</div><div class="chip" style="color:{T["signal"]};border-color:{T["signal-deep"]};">{phase}</div></div>
      <div class="mono muted" style="font-size:12px;">{right}</div></div>'''

# ── 1. Live mining (Main) ─────────────────────────────────────────────────
def live_body(found_banner=False):
    banner = ""
    if found_banner:
        banner = f'''<div style="background:{T["signal"]};color:#062126;padding:14px 32px;display:flex;flex-direction:row;align-items:center;gap:24px;">
          <div class="disp" style="font-size:22px;">Block 2 found · TSLAx</div>
          <div class="mono" style="font-size:14px;">you mined 2,141,338 frag · 2.141 TSLAx</div>
          <div class="btn" style="margin-left:auto;background:#062126;color:{T["signal"]};height:36px;">Claim TSLAx</div>
          <div>{ico("x", "#062126", 18)}</div></div>'''
    return f'''<div style="width:1440px;min-height:940px;background:{T["mine-bg"]};" class="mine col">
      {nav("Mine")}{banner}
      <div style="padding:24px 32px 32px;display:grid;grid-template-columns:minmax(0, 2fr) minmax(0, 1fr);gap:24px;">
        <div class="col" style="gap:20px;">
          {mine_header(1, "Mine open", "block 2 pays 0.0000278 frag per hash-second")}
          {block_card(2, "TSLAx", "6.0 TSLAx", "$2,100", 58, 5, "8 min", "1h 18m", "8h 04m", "19.5M H", "41.0%")}
          <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:20px;">
            {rig_card("0142", "RIG", "5,000,000 RIG", "7.00M", "194.4", "1,249,020", "1.249 TSLAx", 2, 1, 30, 30, 0, 0, "100,000 RIG", "450,000 RIG", "250,000 RIG")}
            {rig_card("0207", "LP", "800,000 RIG/USDC LP · weight 1.0M", "1.00M", "27.8", "178,431", "0.178 TSLAx", 0, 0, 0, 40, 0, 0, "20,000 RIG", "40,000 RIG", "30,000 RIG")}
          </div>
        </div>
        <div class="col" style="gap:20px;padding-top:34px;">
          {position("8.00M H", "41.0%", "222.2", "8h 04m")}
          {claimable([("NVDAx", "2,051,339", "2.051 NVDAx")])}
          {hash_stream()}
        </div>
      </div>
    </div>'''

open(os.path.join(OUT, "Main.dc.html"), "w").write(doc(live_body()))
open(os.path.join(OUT, "BlockFound.dc.html"), "w").write(doc(live_body(found_banner=True)))

# ── 2. Long haul ──────────────────────────────────────────────────────────
long_body = f'''<div style="width:1440px;min-height:940px;" class="mine col">
  {nav("Mine")}
  <div style="padding:24px 32px 32px;display:grid;grid-template-columns:minmax(0, 2fr) minmax(0, 1fr);gap:24px;">
    <div class="col" style="gap:20px;">
      {mine_header(1, "Mine open · long haul", "block 2 pays 0.0000278 frag per hash-second")}
      <div class="panel col" style="gap:24px;padding:32px;">
        <div class="row" style="justify-content:space-between;align-items:flex-end;">
          <div class="col" style="gap:4px;"><div class="label">Block 2 of 4</div><div class="row" style="gap:14px;align-items:baseline;"><div class="disp" style="font-size:48px;">TSLAx</div><div class="mono muted" style="font-size:14px;">pool 6.0 TSLAx ≈ $2,100</div></div></div>
          <div class="col" style="gap:4px;align-items:flex-end;"><div class="label">Shift</div><div class="mono" style="font-size:22px;">2<span class="muted"> / 8</span></div></div>
        </div>
        {progress(21, 2)}
        <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:24px;align-items:end;">
          <div class="col" style="gap:4px;"><div class="label">Block found</div><div class="disp est" style="font-size:72px;">1d 14h</div><div class="muted" style="font-size:13px;">estimate at the current 1.2M H total. Anyone joining or overclocking changes it.</div></div>
          <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:16px;">
            {stat("Next shift", "4h 50m", "est.", est=True)}
            {stat("Mine closes", "6d 2h", "est.", est=True)}
            {stat("Total hash", "1.2M H", "quiet mine")}
            {stat("Your share", "10.0%", "")}
          </div>
        </div>
        <div class="hair"></div>
        <div class="row" style="justify-content:space-between;">
          <div class="row" style="gap:12px;">{ico("bell", T["signal"], 18)}<div style="font-size:14px;">Get notified at each shift end and when the block is found.</div></div>
          <div class="btn btn-ghost" style="height:36px;">Turn on notifications</div>
        </div>
      </div>
      <div class="panel col" style="gap:14px;">
        <div class="row" style="justify-content:space-between;"><div class="label">Best value now</div><div class="muted" style="font-size:12px;">a slow mine rewards permanent upgrades over overclocks</div></div>
        <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:12px;">
          <div class="col" style="gap:6px;padding:14px;border:1px solid {T["ember"]};background:{T["ember-tint"]};"><div class="row" style="gap:6px;">{ico("chip", T["ember"], 16)}<div class="label" style="color:{T["ember"]};">GPU → tier 2</div></div><div class="mono" style="font-size:18px;">+20% hash</div><div class="muted" style="font-size:12px;">covers 79% of the mine · burn 6,000 RIG</div></div>
          <div class="col" style="gap:6px;padding:14px;border:1px solid {T["mine-line"]};"><div class="row" style="gap:6px;">{ico("fan", T["mine-muted"], 16)}<div class="label">Cooling → tier 1</div></div><div class="mono" style="font-size:18px;">more overclocks</div><div class="muted" style="font-size:12px;">30 heat each, −18 per shift · burn 3,000 RIG</div></div>
          <div class="col" style="gap:6px;padding:14px;border:1px solid {T["mine-line"]};"><div class="row" style="gap:6px;">{ico("bolt", T["mine-muted"], 16)}<div class="label">Overclock</div></div><div class="mono" style="font-size:18px;">+50% for ~2 shifts</div><div class="muted" style="font-size:12px;">≈ 9h 40m at this pace · burn 2,000 RIG</div></div>
        </div>
      </div>
    </div>
    <div class="col" style="gap:20px;padding-top:34px;">
      {rig_card("0031", "RIG", "100,000 RIG", "120.0k", "3.33", "34,105", "0.034 TSLAx", 1, 0, 0, 40, 0, 0, "2,000 RIG", "6,000 RIG", "3,000 RIG")}
    </div>
  </div>
</div>'''
open(os.path.join(OUT, "LongHaul.dc.html"), "w").write(doc(long_body))

# ── 3. Pre-open ───────────────────────────────────────────────────────────
def pool_row(n, tk, pool, usd, diff):
    return f'''<div class="row" style="justify-content:space-between;padding:12px 0;border-top:1px solid {T["mine-line"]};">
      <div class="row" style="gap:14px;"><div class="mono dim" style="font-size:12px;">0{n}</div><div class="disp" style="font-size:22px;">{tk}</div></div>
      <div class="mono muted" style="font-size:13px;">{pool} ≈ {usd}</div><div class="mono dim" style="font-size:12px;">{diff} of work</div></div>'''

preopen_body = f'''<div style="width:1440px;min-height:940px;" class="mine col">
  {nav("Mine")}
  <div style="padding:24px 32px 32px;display:grid;grid-template-columns:minmax(0, 2fr) minmax(0, 1fr);gap:24px;">
    <div class="col" style="gap:20px;">
      {mine_header(1, "Pre-open", "parameters published 2026-09-01 · hash 0x3e1a…")}
      <div class="panel col" style="gap:24px;padding:32px;">
        <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:24px;">
          <div class="col" style="gap:4px;"><div class="label">Mine opens in</div><div class="disp" style="font-size:72px;">14h 22m</div><div class="muted" style="font-size:13px;">Rigs activated now start working the moment it opens.</div></div>
          <div class="col" style="gap:4px;"><div class="label">If it opened now, the season would run</div><div class="disp est" style="font-size:72px;">~1d 6h</div><div class="muted" style="font-size:13px;">estimate from 6.4M RIG-eq staked so far · sized for ~24h at 10M H</div></div>
        </div>
        <div class="hair"></div>
        <div class="col" style="gap:0;">
          <div class="row" style="justify-content:space-between;"><div class="label">Four blocks, four stocks</div><div class="mono muted" style="font-size:12px;">pool 27 tokens ≈ $9,900</div></div>
          {pool_row(1, "NVDAx", "5.0 NVDAx", "$860", "20%")}{pool_row(2, "TSLAx", "6.0 TSLAx", "$2,100", "25%")}{pool_row(3, "AAPLx", "10.0 AAPLx", "$2,300", "25%")}{pool_row(4, "SPYx", "6.0 SPYx", "$4,600", "30%")}
        </div>
      </div>
      <div class="panel col" style="gap:14px;">
        <div class="row" style="justify-content:space-between;"><div class="label">Upgrade shop · buy now, boost the whole mine</div><div class="muted" style="font-size:12px;">every tier bought before open covers 100% of the season's work</div></div>
        <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px;">
          <div class="col" style="gap:6px;padding:14px;border:1px solid {T["ember"]};background:{T["ember-tint"]};"><div class="row" style="gap:6px;">{ico("chip", T["ember"], 16)}<div class="label" style="color:{T["ember"]};">GPU → tier 1</div></div><div class="mono" style="font-size:18px;">+20% hash · covers 100%</div><div class="muted" style="font-size:12px;">burn 200,000 RIG permanently</div></div>
          <div class="col" style="gap:6px;padding:14px;border:1px solid {T["mine-line"]};"><div class="row" style="gap:6px;">{ico("fan", T["mine-muted"], 16)}<div class="label">Cooling → tier 1</div></div><div class="mono" style="font-size:18px;">30 heat / overclock · −18 per shift</div><div class="muted" style="font-size:12px;">burn 150,000 RIG permanently</div></div>
        </div>
      </div>
    </div>
    <div class="col" style="gap:20px;padding-top:34px;">
      <div class="panel col" style="gap:16px;">
        <div class="row" style="justify-content:space-between;"><div class="row"><div class="disp" style="font-size:22px;">Rig #0142</div><div class="chip">RIG</div></div><div class="chip" style="color:{T["signal"]};border-color:{T["signal-deep"]};">Ready</div></div>
        <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:16px;">{stat("Stake", "5,000,000")}{stat("Hashrate at open", "5.00M H")}</div>
        <div class="hair"></div>
        <div class="muted" style="font-size:13px;">Overclocks unlock when the mine opens. Nothing accrues before then.</div>
      </div>
      <div class="btn btn-ember" style="height:48px;">Activate another rig</div>
      <div class="panel col" style="gap:10px;"><div class="label">Staked so far</div>{stat("RIG-equivalent", "6.4M")}<div class="muted" style="font-size:12px;">412 rigs · 288 wallets</div></div>
    </div>
  </div>
</div>'''
open(os.path.join(OUT, "PreOpen.dc.html"), "w").write(doc(preopen_body))

# ── 4. Closed ─────────────────────────────────────────────────────────────
closed_body = f'''<div style="width:1440px;min-height:940px;" class="mine col">
  {nav("Mine")}
  <div style="padding:24px 32px 32px;display:grid;grid-template-columns:minmax(0, 2fr) minmax(0, 1fr);gap:24px;">
    <div class="col" style="gap:20px;">
      {mine_header(1, "Mine sealed", "block 4 found 11 min ago")}
      <div class="panel col" style="gap:24px;padding:32px;border-color:{T["mine-dim"]};">
        <div class="row" style="gap:16px;">{ico("lock", T["mine-muted"], 28)}<div class="disp" style="font-size:48px;color:{T["mine-muted"]};">This mine has closed permanently</div></div>
        <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:16px;">
          {stat("Season ran", "9h 41m", "sized for ~24h")}
          {stat("Peak total hash", "24.1M H")}
          {stat("RIG burned", "3.82M", "of 9.6M staked")}
          {stat("Redemption window", "29d 23h", "closes 2026-10-04", est=False)}
        </div>
        <div class="col" style="gap:8px;opacity:0.5;">{progress(100, 8, head=False, color=T["mine-dim"])}<div class="mono dim" style="font-size:12px;">4 / 4 blocks found</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:20px;">
        <div class="panel col" style="gap:16px;">
          <div class="row" style="justify-content:space-between;"><div class="row"><div class="disp" style="font-size:22px;">Rig #0142</div><div class="chip">RIG</div></div><div class="chip">Stopped</div></div>
          {stat("Deposit to withdraw", "5,000,000 RIG", "returned in full · upgrades were burned")}
          <div class="btn btn-ember" style="height:44px;">Withdraw 5,000,000 RIG</div>
        </div>
        <div class="panel col" style="gap:16px;">
          <div class="row" style="justify-content:space-between;"><div class="row"><div class="disp" style="font-size:22px;">Rig #0207</div><div class="chip">RIG/USDC LP</div></div><div class="chip">Stopped</div></div>
          {stat("Deposit to withdraw", "800,000 LP", "returned in full")}
          <div class="btn btn-ember" style="height:44px;">Withdraw 800,000 LP</div>
        </div>
      </div>
    </div>
    <div class="col" style="gap:20px;padding-top:34px;">
      {claimable([("SPYx", "1,522,906", "1.523 SPYx")])}
      <div class="panel col" style="gap:12px;">
        <div class="label">Next</div>
        <div style="font-size:14px;line-height:1.45;">Fragments you hold can be redeemed for whole Stock Tokens, or cashed out in USDC, until the window closes. Unredeemed fragments are swept afterwards.</div>
        <div class="btn btn-signal" style="height:44px;">Go to redeem {ico("arrow", "#062126", 16)}</div>
      </div>
    </div>
  </div>
</div>'''
open(os.path.join(OUT, "Closed.dc.html"), "w").write(doc(closed_body))

# ── 5. Redeem (shell, light) ─────────────────────────────────────────────
def bal_row(tk, frags, tok, usd, last=False):
    return f'''<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:16px;align-items:center;padding:16px 0;{'' if last else f'border-bottom:1px solid {T["shell-line"]};'}">
      <div class="col" style="gap:2px;"><div class="disp" style="font-size:22px;">{tk}</div><div class="mono" style="font-size:12px;color:{T["shell-muted"]};">{frags} fragments</div></div>
      <div class="col" style="gap:2px;"><div class="mono" style="font-size:18px;">{tok}</div><div style="font-size:12px;color:{T["shell-muted"]};">whole tokens available</div></div>
      <div class="col" style="gap:2px;"><div class="mono" style="font-size:18px;">{usd}</div><div style="font-size:12px;color:{T["shell-muted"]};">cash-out quote · 1% fee</div></div>
      <div class="row" style="gap:8px;"><div class="btn btn-shell" style="height:38px;">Redeem</div><div class="btn btn-shell-ghost" style="height:38px;">Cash out</div></div>
    </div>'''

redeem_body = f'''<div style="width:1440px;min-height:940px;background:{T["shell-bg"]};" class="col">
  {nav("Redeem")}
  <div style="padding:40px 32px;display:grid;grid-template-columns:minmax(0, 2fr) minmax(0, 1fr);gap:32px;max-width:1240px;margin:0 auto;width:100%;box-sizing:border-box;">
    <div class="col" style="gap:24px;">
      <div class="col" style="gap:6px;"><div class="disp" style="font-size:48px;">Redeem fragments</div><div style="font-size:15px;color:{T["shell-muted"]};">Season 1 closed. One million fragments of a block equal one whole Stock Token of that block's stock.</div></div>
      <div class="card col" style="gap:0;padding:8px 24px;">
        {bal_row("NVDAx", "2,051,339", "2.051", "$353")}{bal_row("TSLAx", "2,141,338", "2.141", "$749")}{bal_row("AAPLx", "3,410,002", "3.410", "$784")}{bal_row("SPYx", "1,522,906", "1.523", "$1,167", last=True)}
      </div>
      <div style="font-size:13px;color:{T["shell-muted"]};line-height:1.5;">Redeeming in kind sends whole Stock Tokens to this wallet. Cash out pays USDC at the oracle price minus a 1% fee, limited by the vault's reserve. Amounts under one whole token can only be cashed out.</div>
    </div>
    <div class="col" style="gap:20px;padding-top:70px;">
      <div class="card col" style="gap:14px;border-color:{T["signal-deep"]};">
        <div class="row" style="gap:10px;"><div style="width:28px;height:28px;border-radius:50%;background:{T["signal-tint"]};display:flex;align-items:center;justify-content:center;">{ico("check", T["signal-deep"], 16)}</div><div style="font-weight:600;font-size:15px;">Eligible for in-kind redemption</div></div>
        <div style="font-size:13px;color:{T["shell-muted"]};line-height:1.5;">This wallet is on the Stock Token issuer's allowlist, so whole tokens can be sent to it directly.</div>
        <div class="mono" style="font-size:12px;color:{T["shell-muted"]};">0x8a3f…c21e</div>
      </div>
      <div class="card col" style="gap:12px;">
        <div class="row" style="justify-content:space-between;"><div style="font-weight:600;font-size:15px;">Redemption window</div><div class="mono" style="font-size:15px;">29d 23h</div></div>
        <div style="height:6px;background:{T["shell-line"]};border-radius:3px;position:relative;"><div style="position:absolute;left:0;top:0;bottom:0;width:2%;background:{T["signal-deep"]};border-radius:3px;"></div></div>
        <div style="font-size:13px;color:{T["shell-muted"]};line-height:1.5;">Closes 2026-10-04. Fragments left after that stay in your wallet but cannot be redeemed from this season's vault.</div>
      </div>
    </div>
  </div>
</div>'''
open(os.path.join(OUT, "Redeem.dc.html"), "w").write(doc(redeem_body))

# ── 6. Mobile live mining ────────────────────────────────────────────────
mobile_body = f'''<div style="width:390px;min-height:844px;" class="mine col">
  <div class="row" style="height:52px;padding:0 16px;justify-content:space-between;background:{T["shell-card"]};border-bottom:1px solid {T["shell-line"]};color:{T["shell-fg"]};">{LOGO}<div class="wallet mono" style="height:32px;padding:0 10px;">0x8a3f…c21e</div></div>
  <div class="col" style="padding:16px;gap:14px;">
    <div class="row" style="justify-content:space-between;"><div class="row" style="gap:10px;"><div class="disp" style="font-size:18px;">Season 1</div><div class="chip" style="color:{T["signal"]};border-color:{T["signal-deep"]};">Open</div></div><div class="mono muted" style="font-size:12px;">19.5M H</div></div>
    <div class="panel col" style="gap:14px;padding:16px;">
      <div class="row" style="justify-content:space-between;align-items:flex-end;"><div class="col" style="gap:2px;"><div class="label">Block 2 of 4</div><div class="disp" style="font-size:36px;">TSLAx</div></div><div class="col" style="gap:2px;align-items:flex-end;"><div class="label">Shift</div><div class="mono" style="font-size:20px;">5<span class="muted"> / 8</span></div></div></div>
      {progress(58, 5)}
      <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:10px;">
        <div class="col" style="gap:2px;"><div class="label" style="font-size:10px;">Next shift</div><div class="mono est" style="font-size:16px;">8 min</div></div>
        <div class="col" style="gap:2px;"><div class="label" style="font-size:10px;">Block found</div><div class="mono est" style="font-size:16px;">1h 18m</div></div>
        <div class="col" style="gap:2px;"><div class="label" style="font-size:10px;">Your share</div><div class="mono" style="font-size:16px;">41.0%</div></div>
      </div>
    </div>
    <div class="panel col" style="gap:14px;padding:16px;">
      <div class="row" style="justify-content:space-between;"><div class="row" style="gap:8px;"><div class="disp" style="font-size:18px;">Rig #0142</div><div class="chip">RIG</div></div><div class="mono muted" style="font-size:11px;">5,000,000</div></div>
      <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px;">
        <div class="col" style="gap:2px;"><div class="label" style="font-size:10px;">Hashrate</div><div class="mono" style="font-size:26px;font-weight:500;">7.00M</div></div>
        <div class="col" style="gap:2px;"><div class="label" style="font-size:10px;">Fragments / s</div><div class="mono" style="font-size:26px;font-weight:500;">194.4</div></div>
      </div>
      <div class="col" style="gap:2px;"><div class="label" style="font-size:10px;">Earned this block</div><div class="mono" style="font-size:16px;">1,249,020 <span class="muted">· 1.249 TSLAx</span></div></div>
      <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px;">{pips(2,5,"GPU","chip")}{pips(1,3,"Cooling","fan")}</div>
      {heat(30, 30)}
      {oc_slots(0)}
    </div>
    <div class="panel col" style="gap:8px;padding:14px 16px;">
      <div class="row" style="justify-content:space-between;"><div class="col" style="gap:2px;"><div class="disp" style="font-size:16px;">NVDAx · found</div><div class="mono muted" style="font-size:11px;">2,051,339 frag · 2.051 NVDAx</div></div><div class="btn btn-signal" style="height:36px;">Claim</div></div>
    </div>
  </div>
  <div style="margin-top:auto;position:sticky;bottom:0;padding:12px 16px 20px;background:linear-gradient(transparent, {T["mine-bg"]} 30%);" class="col">
    <div class="row" style="gap:8px;"><div class="btn btn-ember" style="flex:1;height:48px;">{ico("bolt", "#1A1408", 16)}Overclock <span class="cost">burn 100,000</span></div><div class="btn btn-ghost" style="height:48px;">GPU → 3</div></div>
  </div>
</div>'''
open(os.path.join(OUT, "Mobile.dc.html"), "w").write(doc(mobile_body))

# ── 7/8. Alternate directions (low-fi sketches) ──────────────────────────
SKETCH_CSS = """
    .sk { font-family: "Caveat", "Comic Sans MS", cursive; }
    .box { border:2px solid #444; }
"""
SK_FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap">'

def sketch(title, bg, fg, accent, blurb, tradeoff, mono=False):
    fam = "'Courier New', monospace" if mono else "'Caveat', cursive"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {SK_FONT}
  <style>
    body {{ margin:0; background:{bg}; color:{fg}; font-family:{fam}; }}
    a {{ color:{accent}; }} a:hover {{ color:{fg}; }}
    .box {{ border:2px solid {fg}; }}
  </style>
</helmet>
<div style="width:720px;height:480px;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;">
  <div style="display:flex;flex-direction:row;justify-content:space-between;align-items:baseline;"><div style="font-size:30px;font-weight:700;">{title}</div><div style="font-size:16px;opacity:0.7;">alternate direction · low-fi</div></div>
  <div style="display:flex;flex-direction:row;gap:14px;flex:1;">
    <div class="box" style="flex:2;padding:14px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;flex-direction:row;justify-content:space-between;"><div style="font-size:22px;">BLOCK 2 · TSLAx</div><div style="font-size:18px;">shift 5/8</div></div>
      <div class="box" style="height:16px;position:relative;"><div style="position:absolute;left:0;top:0;bottom:0;width:58%;background:{accent};"></div></div>
      <div style="display:flex;flex-direction:row;gap:14px;font-size:18px;"><div>next shift ~8m</div><div>block ~1h18m</div><div>share 41%</div></div>
      <div style="display:flex;flex-direction:row;gap:10px;flex:1;">
        <div class="box" style="flex:1;padding:10px;font-size:18px;">rig #0142<br>7.00M H<br>194.4 frag/s<br><span style="color:{accent};">[ overclock ]</span></div>
        <div class="box" style="flex:1;padding:10px;font-size:18px;">rig #0207<br>1.00M H<br>27.8 frag/s<br><span style="color:{accent};">[ overclock ]</span></div>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
      <div class="box" style="padding:10px;font-size:18px;">your position<br>8.00M H · 41%</div>
      <div class="box" style="padding:10px;font-size:18px;">claim NVDAx<br>2.051</div>
      <div class="box" style="flex:1;padding:10px;font-size:16px;opacity:0.7;">hash stream…</div>
    </div>
  </div>
  <div style="font-size:17px;line-height:1.3;"><b>Why:</b> {blurb}<br><b>Tradeoff:</b> {tradeoff}</div>
</div>
</x-dc>
</body>
</html>
"""
open(os.path.join(OUT, "AltTerminal.dc.html"), "w").write(sketch("All-dark terminal", "#0E0F10", "#D7DBD2", "#7CFF9B", "everything on black, mono type, dense grids, no shell/mine seam. Reads as a pro trading tool.", "hostile to newcomers; the redeem flow loses its 'real asset' register; the fintech audience bounces.", mono=True))
open(os.path.join(OUT, "AltArcade.dc.html"), "w").write(sketch("Bright arcade", "#FFF3D6", "#22203A", "#FF4F7A", "saturated colour blocks, chunky type, playful chrome. Best first-minute delight; feels like a game.", "colour-as-decoration collides with colour-as-meaning; undermines trust for a product paying out in equities."))


# ── 9. Moodboard (page 3) ────────────────────────────────────────────────
MOOD = [
  ("01-rig-hall.webp", "The mine at scale", "coal racks, amber pinpoints, one cyan strip at the vanishing point"),
  ("02-tick-marks.webp", "Progress texture", "hairline ticks on brushed metal, a single amber source"),
  ("03-heat.webp", "Heat", "ember running to red only at the tip"),
  ("04-typography.webp", "Type", "condensed stencil caps over a hot stripe; small light numerals"),
  ("05-shell-still-life.webp", "The shell", "warm off-white, paper, one black instrument, one amber object"),
  ("06-ore-vein.webp", "The vein", "a seam of ember in dark rock, cyan light at the exit"),
  ("07-signal-gauge.webp", "The ETA", "one cyan bar, fine ticks, a white needle; a gauge, not a clock"),
  ("08-the-seam.webp", "The seam", "a bright lobby opening straight into the dark machine hall"),
]
tiles = "".join(f'''<div class="col" style="gap:10px;">
      <img src="{f}" style="width:100%;aspect-ratio:3/2;object-fit:cover;display:block;border:1px solid {T["mine-line"]};">
      <div class="row" style="gap:10px;align-items:baseline;"><div class="mono dim" style="font-size:12px;">0{i+1}</div><div class="disp" style="font-size:20px;">{t}</div></div>
      <div class="muted" style="font-size:13px;line-height:1.4;">{c}</div>
    </div>''' for i,(f,t,c) in enumerate(MOOD))
mood_body = f'''<div style="width:1440px;min-height:1180px;padding:40px;box-sizing:border-box;" class="mine col">
  <div class="row" style="justify-content:space-between;align-items:flex-end;padding-bottom:28px;">
    <div class="col" style="gap:6px;"><div class="label">Moodboard</div><div class="disp" style="font-size:48px;">Clean shell, industrial mine</div></div>
    <div class="muted" style="font-size:13px;max-width:520px;text-align:right;line-height:1.45;">References for tone, light and material. Generated with the token palette as a constraint. Nothing here ships in the app.</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:28px 24px;">{tiles}</div>
  <div class="row" style="gap:16px;padding-top:36px;">
    {"".join(f'<div class="col" style="gap:6px;"><div style="width:96px;height:40px;background:{T[k]};border:1px solid {T["mine-line"]};"></div><div class="mono dim" style="font-size:11px;">--{k}</div></div>' for k in ["shell-bg","shell-fg","mine-bg","mine-panel","mine-line","mine-fg","ember","signal","heat-hot"])}
  </div>
</div>'''
open(os.path.join(OUT, "Moodboard.dc.html"), "w").write(doc(mood_body))

# ── canvas.json ──────────────────────────────────────────────────────────
canvas = {
  "pages": [{"id": "page-1", "name": "Screens"}, {"id": "page-2", "name": "Alternate directions"}, {"id": "page-3", "name": "Moodboard"}],
  "artboards": [
    {"file": "Main.dc.html",       "title": "1 · Live mining",   "x": 0,    "y": 0,    "w": 1440, "h": 940, "page": "page-1"},
    {"file": "BlockFound.dc.html", "title": "3 · Block found",   "x": 1540, "y": 0,    "w": 1440, "h": 940, "page": "page-1"},
    {"file": "Mobile.dc.html",     "title": "7 · Mobile live",   "x": 3080, "y": 0,    "w": 390,  "h": 844, "page": "page-1"},
    {"file": "LongHaul.dc.html",   "title": "2 · Long haul",     "x": 0,    "y": 1040, "w": 1440, "h": 940, "page": "page-1"},
    {"file": "PreOpen.dc.html",    "title": "4 · Pre-open",      "x": 1540, "y": 1040, "w": 1440, "h": 940, "page": "page-1"},
    {"file": "Closed.dc.html",     "title": "5 · Closed",        "x": 0,    "y": 2080, "w": 1440, "h": 940, "page": "page-1"},
    {"file": "Redeem.dc.html",     "title": "6 · Redeem (shell)","x": 1540, "y": 2080, "w": 1440, "h": 940, "page": "page-1"},
    {"file": "AltTerminal.dc.html","title": "Alt A · All-dark terminal", "x": 0,   "y": 0, "w": 720, "h": 480, "page": "page-2"},
    {"file": "AltArcade.dc.html",  "title": "Alt B · Bright arcade",     "x": 820, "y": 0, "w": 720, "h": 480, "page": "page-2"},
    {"file": "Moodboard.dc.html",  "title": "Moodboard",                 "x": 0,   "y": 0, "w": 1440, "h": 1180, "page": "page-3"},
  ],
  "annotations": [
    {"id": "direction", "x": 0, "y": -200, "w": 620, "page": "page-1",
     "text": "Direction: clean fintech shell, industrial mine inside.\nShell (nav, redeem) is light and calm; the mine is coal-dark and dense.\nEmber = energy you control (hash, overclock, burn). Signal = the mine's progress and what it gives back (ETA, found, claimable).\nEvery wall-clock figure is an estimate and says so. Progress bars with shift ticks are the primary clock."},
    {"id": "numbers", "x": 3080, "y": 1040, "w": 390, "page": "page-1",
     "text": "Numbers match the worked example in docs/03 §7: total hash 19.5M, rig #0142 at 7.00M H earning 194.4 frag/s in block 2 (TSLAx pool 6.0, difficulty 2.16e11). Pool USD values are placeholders."},
    {"id": "mood", "x": 0, "y": -150, "w": 700, "page": "page-3",
     "text": "Moodboard: eight Higgsfield images generated with the token palette as a constraint. Captions say which token or principle each one feeds. Sources in design/moodboard/README.md."},
    {"id": "alts", "x": 0, "y": -150, "w": 700, "page": "page-2",
     "text": "Two directions considered and not taken. Kept so the choice is visible. Say the word and either becomes the main direction; the tokens file is the only thing that changes."},
  ],
  "launch": {"view": "canvas", "page": "page-3"},
}
json.dump(canvas, open(os.path.join(OUT, "canvas.json"), "w"), indent=2)
print("wrote", sorted(os.listdir(OUT)))
