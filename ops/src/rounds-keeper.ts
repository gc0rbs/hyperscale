/**
 * Round keeper (docs/13 §2): pokes RoundMine ~5 s after each round boundary when the chain has not
 * recorded the close yet (closedRounds() < currentRound()), so the round closes and the claim window
 * opens within seconds of the boundary. Anyone's transaction records the boundary too; correctness
 * never depends on the keeper. Stops when the mine is halted.
 *
 *   KEEPER_KEY=0x… RPC_URL=… pnpm --filter @stock-miner/ops rounds-keeper [--interval 20] [--once]
 *
 * Low-gas alert: the keeper's ETH balance is read every tick and alerted (ALERT_WEBHOOK_URL, same
 * helper as watch) when it drops below KEEPER_MIN_ETH (default 0.01).
 */
import { formatEther, parseEther } from "viem";
import { createAlert } from "./lib/alert.js";
import { loadRoundsDeployment, roundMineAbi } from "./lib/rounds.js";
import { roundKeeperDecision, type RoundKeeperOptions } from "./lib/rounds-keeper-logic.js";
import { arg, clients, hasFlag } from "./lib/season.js";

const opts: RoundKeeperOptions = { intervalSec: Number(arg("--interval", "20")), settleDelaySec: Number(arg("--settle-delay", "5")) };
const once = hasFlag("--once");
const minEthWei = parseEther(process.env.KEEPER_MIN_ETH ?? "0.01");
const alert = createAlert("rounds-keeper");
let lastPokedRound: number | null = null;

async function tick(): Promise<{ go: boolean; sleepSec: number }> {
  const dep = loadRoundsDeployment();
  const { pub, wallet, account } = clients();
  const [block, currentRound, closedRounds, halted, ethBalanceWei] = await Promise.all([
    pub.getBlock(),
    pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "currentRound" }) as Promise<bigint>,
    pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "closedRounds" }) as Promise<bigint>,
    pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "halted" }) as Promise<boolean>,
    pub.getBalance({ address: account.address }),
  ]);
  const d = roundKeeperDecision({
    now: Number(block.timestamp), genesis: dep.genesis, roundSeconds: dep.roundSeconds,
    currentRound: Number(currentRound), closedRounds: Number(closedRounds), halted, lastPokedRound, ethBalanceWei, minEthWei,
  }, opts);
  if (d.lowGas) alert("warn", `keeper ${account.address} has ${formatEther(ethBalanceWei)} ETH, below KEEPER_MIN_ETH ${formatEther(minEthWei)}`);
  if (d.action === "stop") {
    console.log(`[rounds-keeper] ${d.reason}; stopping`);
    return { go: false, sleepSec: 0 };
  }
  if (d.action === "wait") {
    console.log(`[rounds-keeper] ok ${d.reason}; next tick in ${d.sleepSec}s`);
    return { go: true, sleepSec: d.sleepSec };
  }
  const hash = await wallet.writeContract({ abi: roundMineAbi, address: dep.mine, functionName: "poke" });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") throw new Error(`poke ${hash} reverted`);
  lastPokedRound = Number(currentRound);
  const closedAfter = (await pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "closedRounds" })) as bigint;
  console.log(`[rounds-keeper] poke ${hash.slice(0, 10)} gas=${rcpt.gasUsed} closedRounds ${closedRounds}->${closedAfter} (${d.reason})`);
  return { go: true, sleepSec: d.sleepSec };
}

(async () => {
  for (;;) {
    let go = true;
    let sleepSec = opts.intervalSec;
    try {
      ({ go, sleepSec } = await tick());
    } catch (e) {
      console.error("[rounds-keeper] error", (e as Error).message);
    }
    if (!go || once) break;
    await new Promise((r) => setTimeout(r, sleepSec * 1000));
  }
})();
