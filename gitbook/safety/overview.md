# Overview: what can and cannot happen

This section is the plain-language version of the guarantees the contracts enforce, the powers that exist, and the things that can go wrong. It is written so you can decide how much to stake without reading Solidity. Where a statement is enforced by code we say so; where it depends on people, we say that too.

## Enforced by the contracts

| Guarantee | How |
| --- | --- |
| Your stake is returned | `exit` returns the deposit minus the 3% fee at any time; after a halt, `emergencyWithdraw` returns it in full with no fee and no deadline |
| Nobody can change the rules | No proxies, no setters. Round length, claim window, fees and upgrade tables are fixed at deployment |
| A round never pays more than its pot | Every claim is a share of the round's recorded pot; the sum of claims cannot exceed it |
| Your share is your work | Reward = pot × your work in the round ÷ everyone's work in the round, from exact hash × seconds accounting |
| Unclaimed rewards stay in the game | What is not claimed in the 15-minute window is added to the next round's pot, never taken by the operator |
| Upgrade spend is burned, not collected | Every upgrade payment is a transfer to `0x…dEaD` |
| A pause cannot trap your stake | After the grace period (30 min default) `emergencyWithdraw` returns your deposit and the mine halts |
| Claimed fragments are always backed | The vault must hold the stock behind every un-redeemed fragment; even a rescue after a halt leaves that behind |
| No randomness, no oracle in the mine | Outcomes are a deterministic function of stake, spend and time. The only oracle use is the cash-out price |

## Powers the team has, and says so

| Power | Who | What it means for you |
| --- | --- | --- |
| **Halt the mine** | Operator, any time | No further round closes, no claim window opens. Your deposit comes back in full. Fragments you already claimed stay redeemable. The unclaimed and running pots return to the operator |
| **Pause** | Treasury key | Blocks actions for up to the grace period; the clock keeps running. Past the grace period players halt it themselves |

The team is publicly known and these powers are stated here and on the site. They exist so a broken launch can be unwound in minutes instead of leaving money locked, which is what happened on 2026-09-05.

## Depends on people or external systems

| Item | Who | What if it fails |
| --- | --- | --- |
| Funding the pots | The team's fee wallet | A round with no fees in pays only the rollover; the site shows it |
| Chainlink price feeds | Chainlink | Cash-out pauses on a stale price (four-day cap covers weekends). In-kind redemption is unaffected |
| Robinhood Stock Tokens | Robinhood | Issued and priced by Robinhood; no ownership or voting rights in the underlying company |
| The chain's sequencer | Robinhood Chain | If the chain stalls you cannot act; work keeps accruing by timestamp when it resumes |
| The keeper | The team | Rounds close on the clock regardless; a missed poke only delays the claim window until the next transaction |

## What you can lose

* **Every $RIG you burn on upgrades**, in all cases.
* **The exit fee** (3% default) when you leave.
* **A round's share**, if you do not claim inside its 15-minute window. It rolls into the next pot.
* **Value**, because $RIG and the Stock Tokens are volatile and fragments are worth whatever the stock is worth when you redeem.
