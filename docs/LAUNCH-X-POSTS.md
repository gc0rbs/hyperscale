# Launch day on X – the first 24 hours

| | |
|---|---|
| Status | Draft 2026-09-10 for the $VRAM launch. Copy follows `app/src/lib/brand.ts` and the round mine (`docs/13-ROUNDS.md`). |
| Voice | docs/12 §6: plain, literal, one mechanic per post. No "moon", no price talk, no promises of return. |
| Placeholders | `{SITE}` = https://www.hyperscaling.xyz · `{PONS}` = the $VRAM buy link · `{CA}` = token contract · `{MINE}` = RoundMine address on Robinhood Chain · `{H}` = @handle |

## 0. Ground rules that every post obeys

1. **Compliance lines are not optional.** Stock Tokens are unavailable to persons in the US, Canada,
   the UK and Switzerland, and so is the game. That line goes in the pinned thread, the bio, and
   every post that links to `{PONS}`. Never say "invest", "returns", "profit", "guaranteed", "APY".
   Say "earn shards", "get paid in", "your share of the pot". Stock Tokens track a share price and
   carry no ownership rights; say so once in the thread and in the FAQ post.
2. **Only claim what the contracts do.** Hourly round, 15-minute claim window, rollover, 100% burn,
   stakes come back minus 3%, operator can halt (say it; it is on the site). Nothing on your device
   computes anything.
3. **One idea per post.** The algorithm rewards replies and dwell, and a reader replies to one clear
   thing. A post that explains three things gets zero replies.
4. **Every post has a reason to reply, quote or repost.** A question, a number to guess, a
   screenshot to post, a name to tag. Passive announcements are the last resort.
5. **Media on everything that matters.** Screenshot of the live pot, the tick bar, a claim receipt,
   the leaderboard. Native video and images beat links; put the link in the first reply where the
   post is a hook, and in the body where the post is a call to action.
6. **Reply to every reply for the first six hours.** Replies within minutes are the strongest
   distribution signal on X. Rotate two people on the account.

## 1. Engagement playbook (why the schedule looks like this)

- **The hour is the hook.** The game makes a new pot every hour and pays it out in fifteen minutes.
  That is a built-in reason to post every hour with a fresh number, and a built-in reason for players
  to check X every hour. Every hourly post follows the same skeleton so people learn to look for it:
  `Round N closed · pot $X · Y GPUs · top share Z% · claim window open until HH:MM UTC`.
- **Screenshots from players beat screenshots from us.** Every claim post asks people to post their
  receipt. Quote the best ones within minutes. A quote from the project account is the cheapest
  reward that exists and it makes the next person post.
- **Predictions get replies.** "Guess the round 6 pot, closest wins a shout-out" costs nothing and
  produces dozens of replies, each one a distribution event.
- **Ride the AI-trade timeline.** NVDA, MU, SNDK, QQQ are what CT and FinTwit already argue about.
  Hang posts on their tickers with the cashtag ($NVDA) so the post lands in those feeds. Do not
  comment on their prices; comment on how many shards the round paid.
- **Tag the ecosystem, not influencers.** Robinhood Chain, Pons, Arbitrum Orbit. Reply under their
  posts with a live number instead of a pitch. A reply that adds a number gets quoted; a reply that
  says "check us out" gets muted.
- **Spaces at the peaks.** One at launch + 2h (when the first round has paid), one at launch + 12h
  (the US-evening / Asia-morning overlap). Fifteen minutes each, on the timer: open at a round close,
  walk people through claiming live, end when the claim window shuts.
- **Cadence.** Hourly beat post at every round close (`:00`), one explainer or community post at
  `:30`. Nothing else. Twenty-four beats + twenty-four fillers is the whole day; skip a filler before
  skipping a beat.
- **Timing the launch.** Genesis is rounded to the hour on chain. Launch at `:00` UTC so round
  closes fall on the hour in every timezone, which is what makes "the top of the hour" the habit.

## 2. Before T-0 (the hour before launch)

**T-60m · Pinned thread (post now, pin, keep pinned all day).**

> 1/ Hyperscaler goes live at {HH:00} UTC.
>
> Virtual GPUs. Stock-token rewards.
>
> Stake $VRAM to bring a GPU online. Every hour the pot is split by the compute each GPU served. The pot is paid in NVDA, MU, SNDK and QQQ.
>
> How it works, in 6 posts 🧵

> 2/ Where the pot comes from.
>
> Every $VRAM trade on Pons pays a creator fee. A share of that fee is swapped into the four Stock Tokens and dropped into the running round as it arrives.
>
> More trading → bigger pot. There is no other source. No emissions, no treasury.

> 3/ How it is split.
>
> Compute = throughput × seconds.
> Your share = your compute ÷ everyone's compute.
>
> Nothing runs on your device. Throughput is a number the contract derives from your stake and upgrades.

> 4/ The clock.
>
> Round closes on the hour.
> You have 15 minutes to claim.
> Miss it → your share rolls into the next pot. Nothing goes to us.
>
> Set an alarm for :00.

> 5/ Upgrades.
>
> GPU tiers (up to 2x throughput), cooling, overclocks (+50% until the end of next round).
> Every upgrade is paid in $VRAM and 100% burned. Not to a treasury. To 0x…dEaD.

> 6/ What you keep.
>
> Your stake comes back when you decommission (minus 3%).
> Claimed shards are yours: 1,000,000 shards = 1 Stock Token. Redeem for the token or cash out at the Chainlink price, any time.
>
> The operator can pause or halt the game; stakes always return in full. It says so on the site.

> 7/ Who can play.
>
> Stock Tokens are not available in the US, Canada, UK or Switzerland, and neither is Hyperscaler. Stock Tokens track a share price and carry no ownership rights. Not investment advice.
>
> Everything else: {SITE}/how-it-works

**T-30m · Countdown + contract.**

> Contracts are deployed and verified on Robinhood Chain (chain 4663).
> Mine: {MINE}
> Token: launches on Pons at {HH:00} UTC → {CA} (posted the second it exists, only from this account).
>
> Anyone posting a different CA is not us.

**T-10m · Prediction (first reply-farm).**

> Round 1 opens in 10 minutes.
> Guess the round 1 pot in USD. Closest reply gets a shout-out at :00 + a quote.
> Rules: pot = whatever fees arrive in the first hour, swapped to NVDA/MU/SNDK/QQQ.

## 3. Hour 0 → 6: launch and the first pots

Each hour has a **beat** (`:00`, at round close) and a **filler** (`:30`). Numbers in `{ }` are filled
from the mine page at post time. Post the beat within two minutes of the close; the claim window is
the news.

**H0 :00 · LIVE.**

> LIVE. $VRAM is on Pons: {PONS}
> CA: {CA}
>
> 1. Buy $VRAM
> 2. Go to {SITE}, connect, "Bring a GPU online" (min 100 $VRAM)
> 3. Come back at :00. Claim.
>
> Not available in US/CA/UK/CH. Not investment advice.
>
> [video: 20s screen recording of steps 2–3]

**H0 :05 · Quote the CA post from Pons / Robinhood Chain accounts if they post; otherwise reply under their latest post with the live link.**

**H0 :30 · The first pot filling (screenshot).**

> Round 1, 30 minutes in. The pot so far: ${X} across NVDA / MU / SNDK / QQQ.
> {N} GPUs online. Cluster throughput {T}.
>
> Every trade on Pons adds to this number. Closes in 30 minutes. [screenshot of the pot card]

**H1 :00 · First close (the most important post of the day).**

> ROUND 1 CLOSED.
> Pot: ${X}
> GPUs: {N}
> Top share: {Z}%
>
> Claim window open until {HH:15} UTC. One click per GPU. Miss it and it rolls into round 2.
>
> Post your claim receipt below 👇 [screenshot of claim button]

**H1 :05 · Prediction winner.** Quote the closest guess from T-10m: "@user called ${Y}. Actual: ${X}. Round 2 guesses open below."

**H1 :15 · Window closed.**

> Claim window closed. {C}% of round 1 claimed, ${R} rolled into round 2.
> Round 2 pot starts at ${R} + whatever trades next.
> Next close {HH:00} UTC.

**H1 :30 · Explainer: why more players does not mean nothing left.**

> "What if everyone joins?"
>
> The pot is trading fees. More people trading = more fees = bigger pot.
> Your share = your compute ÷ total compute, so a bigger crowd splits a bigger pot.
>
> This is not an emission schedule. There is nothing to run out.

**H2 :00 · Beat (round 2).** Same skeleton. Add the rollover line: "Includes ${R} rolled from round 1."

**H2 :10 · Space #1 (15 min).** "Claim it live." Title the Space with the round number. Walk through a claim, answer "how do I", end at :15 when the window shuts. Pin a post with the Space link at :05.

**H2 :30 · Player spotlight.** Quote the best claim screenshot from H1 or H2. "First {shard count} NVDA shards claimed on Hyperscaler. 1,000,000 shards = 1 Stock Token. Who's next?"

**H3 :00 · Beat (round 3).**

**H3 :30 · Upgrades explained with a number.**

> Upgrade math, using a real GPU from round 3:
> Stake {S} $VRAM, Gen 0 → {T} throughput → {share}% of the pot.
> Tier 1 GPU costs 4% of stake, burned, +20% throughput forever.
> {N} rounds to pay it back at the current pot.
>
> Would you buy it? Reply yes/no.

**H4 :00 · Beat (round 4).**

**H4 :30 · Burn counter.**

> $VRAM burned so far: {B} ({pct}% of supply).
> Every upgrade goes to 0x…dEaD. There is no treasury, no team allocation from upgrades.
> Proof: {burn address link}

**H5 :00 · Beat (round 5).**

**H5 :30 · The overclock.**

> The overclock: 2% of your stake, burned, +50% throughput until the end of the next round. Stack up to 3. Heat goes up; cooling brings it down each round.
>
> Best time to overclock: when the pot is big and the crowd is small. Like right now? [screenshot of pot vs GPU count]

**H6 :00 · Beat (round 6) + 6-hour stats card.**

> Six hours in.
> Pots paid: ${total} · Rounds: 6 · GPUs online: {N} · $VRAM burned: {B} · Shards claimed: {shards}
>
> Next close {HH:00} UTC. [stats image]

## 4. Hour 6 → 12: the second wave

Fillers switch from "how it works" to "what people did", which brings in the second wave of
players who wait to see others get paid.

**H6 :30 · Leaderboard.** Top 5 GPUs by shards claimed. Tag handles that posted receipts. "Want on this list? Bring a GPU online before :00."

**H7 :00 · Beat.**

**H7 :30 · The AI-stack hook (cashtags).**

> You cannot buy 0.3 $NVDA on Robinhood.
> You can earn 0.3 NVDA worth of shards here by running a virtual GPU for an hour.
> $NVDA $MU $SNDK $QQQ: the pot is the AI supply chain. [image: four tickers, four pot slices]

**H8 :00 · Beat.**

**H8 :30 · Poll.**

> Round 9 strategy poll:
> ○ Stake more, Gen 0
> ○ Same stake, buy Gen 2
> ○ Overclock every round
> ○ Just claim and chill
> Results at :00, we post the math for the winner.

**H9 :00 · Beat.**

**H9 :30 · Poll payoff.** Post the math for the winning option with a real GPU from the mine.

**H10 :00 · Beat.**

**H10 :30 · Rollover story.**

> Round {n} had a {C}% claim rate. ${R} rolled over.
> The people who claimed round {n+1} got that money.
> Set. An. Alarm. :00 every hour. [screenshot of the rolled-over line on the pot card]

**H11 :00 · Beat.**

**H11 :30 · Space #2 teaser + 12-hour card next hour.**

**H12 :00 · Beat + 12-hour stats card.** Same layout as the 6-hour card. This is the post to boost if you boost anything.

**H12 :05 · Space #2 (15 min).** "Halfway. Ask us anything about the mine." End at :15.

## 5. Hour 12 → 18: keep the habit, answer the sceptics

**H12 :30 · The honest post (pre-empt the FUD, it reads as confidence).**

> Things people ask, answered straight:
> · Can the team rug? The operator can halt. Stakes come back in full, claimed shards stay redeemable, unclaimed pot returns to the operator. On chain, stated on the site.
> · Is it mining? No. Nothing runs on your device.
> · Where's the yield from? Trading fees. Nowhere else.

**H13 :00 · Beat.**

**H13 :30 · Meme slot.** Tick-bar meme: the 8-tick round bar at 7/8 with "me refreshing at :59". Native image, no link.

**H14 :00 · Beat.**

**H14 :30 · Cooling explained.**

> Air cooling removes 10 heat per round. Immersion removes 36.
> Overclocking every round without cooling caps you at 100% thermal load by round 3.
> Cooling is the upgrade for people who plan to be here all week.

**H15 :00 · Beat.**

**H15 :30 · Quote-storm.** Quote three player receipts in a row with one line each. Keep them 5 minutes apart.

**H16 :00 · Beat.**

**H16 :30 · Robinhood Chain ecosystem post.** "Built on Robinhood Chain (Arbitrum Orbit). Stock Tokens on chain, hourly, no oracle in the game loop, Chainlink only at cash-out." Tag @RobinhoodChain-equivalent handles; reply under their posts with the 12-hour card.

**H17 :00 · Beat.**

**H17 :30 · Prediction #3.** "Guess the round 20 pot. Closest reply gets quoted."

**H18 :00 · Beat + 18-hour stats card.**

## 6. Hour 18 → 24: close the day, set up tomorrow

**H18 :30 · Player story.** DM the biggest earner who posted, ask for one sentence, quote it.

**H19 :00 · Beat.**

**H19 :30 · Decommission explained.**

> Leaving is one click. Decommission → stake back minus 3% → shards stay yours.
> The GPU's work in the round it left still counts.
> No lockup, no vesting, no "unstaking period".

**H20 :00 · Beat.**

**H20 :30 · Shards → Stock Token walkthrough.** 15s video of redeeming shards for a Stock Token or cashing out to USDG. "Any time. No deadline."

**H21 :00 · Beat.**

**H21 :30 · Biggest pot of the day.** "Round {n} paid ${X}, the biggest so far. Rounds don't stop. The next one is at :00." [screenshot]

**H22 :00 · Beat.**

**H22 :30 · Ask for the day-2 idea.** "What should day 2 look like? Leaderboard prizes? Team clusters? Reply." (Do not promise anything in the contracts; these are social features only.)

**H23 :00 · Beat.**

**H23 :30 · Thank-you + tomorrow.** "24 rounds. {total} paid. {N} GPUs. {B} $VRAM gone forever. Same time tomorrow: every hour, on the hour."

**H24 :00 · Beat + 24-hour card, then re-pin.** Replace the pinned thread's first post with the 24-hour card quoting the thread, so the numbers are the first thing new visitors see and the explainer is one click away.

## 7. Reply templates (paste, fill, send within five minutes)

| Someone says | Reply |
|---|---|
| "how do I start" | "Buy $VRAM on Pons → {SITE} → Bring a GPU online (min 100 $VRAM) → claim at :00. 60 seconds. Not available in US/CA/UK/CH." |
| "is this mining / does it use my GPU" | "No. Nothing runs on your device. Throughput is a number the contract derives from your stake and upgrades." |
| "what's the APY" | "There isn't one. Each hour's pot is that hour's trading fees, split by compute share. The mine page shows the running pot." |
| "can the team rug" | "The operator can halt. Stakes return in full, claimed shards stay redeemable. It's in the contract and on the site: {SITE}/how-it-works" |
| "I missed the claim window" | "It rolled into the next pot, not to us. Next window opens at :00. Set an alarm." |
| "where does the burn go" | "0x…dEaD. Burn address link: {link}. 100% of every upgrade." |
| "US?" | "Sorry, Stock Tokens aren't available in the US, Canada, UK or Switzerland, and neither is the game." |
| Any CA that is not ours | "Not us. The only CA is {CA}, posted from this account." |

## 8. Assets to prepare before T-0

- 20s "buy → bring online → claim" screen recording, vertical and landscape.
- Stat card template (6h / 12h / 18h / 24h) in the brand green, tick bar on it.
- Claim-receipt frame players can screenshot into (the app share card already exists; check it shows round number and shard count).
- Four-ticker pot image (NVDA / MU / SNDK / QQQ slices).
- Tick-bar meme template (blank 8-tick bar).
- Prewritten hourly beat with the six `{ }` fields, saved as a text snippet.

## 9. What not to post

- Price of $VRAM, price of any stock, "up only", charts with green candles.
- Any number you cannot read off the mine page or the explorer at post time.
- Anything about US users being able to play via a VPN.
- A CA from anywhere except the deployer's verified announcement.
- Promises about day 2 features that are not shipped.
