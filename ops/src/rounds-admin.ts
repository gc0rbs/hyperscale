/**
 * Round-mine admin (docs/13 §2 "Halt", §5). Every broadcasting command prints exactly what it would
 * do and refuses to send without --yes: these are irreversible on-chain actions with client money.
 *
 *   pnpm --filter @stock-miner/ops rounds-admin status
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin launch --token 0x… [--genesis next-hour] --yes   # pre-token deployments, once
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin set-source --token 0x… [--factory 0x…] --yes   # wire the Pons V2 collect calls after the token launch
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin halt [--yes]
 *   OPERATOR_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin rescue [--yes]       # after halt
 *   GUARDIAN_KEY=0x… pnpm --filter @stock-miner/ops rounds-admin pause|unpause [--yes]
 */
import { decodeEventLog, formatUnits, type Address } from "viem";
import { catchUp, feeFunderAbi, loadRoundsDeployment, ponsV2Collects, ponsV2EscrowAbi, ponsV2FactoryAbi, ponsV2PoolId, roundClock, roundMineAbi, roundVaultAbi, syncLaunchFromChain } from "./lib/rounds.js";
import { arg, clients, erc20Abi, hasFlag } from "./lib/season.js";

const TAG = "[rounds-admin]";

async function main() {
  const cmd = process.argv[2];
  const dep = loadRoundsDeployment();
  const isGuardian = cmd === "pause" || cmd === "unpause";
  const { pub, wallet, account } = clients(isGuardian ? "GUARDIAN_KEY" : "OPERATOR_KEY");
  await syncLaunchFromChain(dep, pub);
  const yes = hasFlag("--yes");
  const mine = { abi: roundMineAbi, address: dep.mine } as const;
  const vault = { abi: roundVaultAbi, address: dep.vault } as const;
  const read = <T,>(fn: string, args: unknown[] = []) => pub.readContract({ ...mine, functionName: fn, args }) as Promise<T>;
  const readVault = <T,>(fn: string, args: unknown[] = []) => pub.readContract({ ...vault, functionName: fn, args }) as Promise<T>;

  const [operator, halted, paused, pausedAt, current, closed, params, block] = await Promise.all([
    read<Address>("operator"), read<boolean>("halted"), read<boolean>("paused"), read<bigint>("pausedAt"),
    read<bigint>("currentRound"), read<bigint>("closedRounds"),
    read<{ treasury: Address; pauseGraceSeconds: number }>("params"), pub.getBlock(),
  ]);
  const now = Number(block.timestamp);
  const cur = Number(current);
  const decimals: number[] = [];
  for (const t of dep.stocks) decimals.push((await pub.readContract({ abi: erc20Abi, address: t, functionName: "decimals" })) as number);
  const fmt = (s: number, v: bigint) => `${formatUnits(v, decimals[s])} ${dep.symbols[s]}`;

  async function broadcast(label: string, address: Address, abi: typeof roundMineAbi, fn: string, args: unknown[] = []) {
    // Everything but poke/halt reverts with NotCaughtUp while boundaries are unrecorded (docs/13 §2):
    // poke first when broadcasting (a dry run only reports it, since the simulation would fail).
    if (fn !== "halt" && fn !== "rescue" && fn !== "launch" && fn !== "setFlusher" && fn !== "setCollects") {
      if (yes) await catchUp(pub, wallet, dep.mine, TAG);
      else if (now >= dep.genesis && closed < current) console.log(`${TAG} mine is ${current - closed} rounds behind; the real run pokes first`);
    }
    // Simulate first so a revert is explained before anyone is asked to confirm.
    const sim = await pub.simulateContract({ abi, address, functionName: fn, args, account });
    if (!yes) {
      console.log(`${TAG} DRY: would send ${label} from ${account.address}. Re-run with --yes to broadcast.`);
      return { hash: undefined, result: sim.result, logs: [] as { data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] | [] }[] };
    }
    const hash = await wallet.writeContract(sim.request);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted (${hash})`);
    console.log(`${TAG} sent ${label}: ${hash} gas=${r.gasUsed}`);
    return { hash, result: sim.result, logs: r.logs };
  }
  function requireKey(expected: Address, role: string, env: string) {
    if (account.address.toLowerCase() !== expected.toLowerCase()) throw new Error(`${env} is ${account.address}, the mine's ${role} is ${expected}`);
  }

  if (cmd === "status" || !cmd) {
    const clock = roundClock(dep.genesis, dep.roundSeconds, dep.claimSeconds, now);
    const [totalHash, rigCount, reserve, udec] = await Promise.all([
      read<bigint>("totalHash"), read<bigint>("rigCount"), readVault<bigint>("reserve"),
      pub.readContract({ abi: erc20Abi, address: dep.usdc, functionName: "decimals" }) as Promise<number>,
    ]);
    console.log(`${TAG} chain ${dep.chainId} mine ${dep.mine} vault ${dep.vault}`);
    console.log(`${TAG} operator ${operator} guardian ${params.treasury}`);
    console.log(`${TAG} halted=${halted} paused=${paused}${paused ? ` (since ${new Date(Number(pausedAt) * 1000).toISOString()}, grace ends ${new Date((Number(pausedAt) + params.pauseGraceSeconds) * 1000).toISOString()})` : ""}`);
    console.log(`${TAG} now ${new Date(now * 1000).toISOString()}${now < dep.genesis ? ` (genesis in ${dep.genesis - now}s)` : ""} round ${cur} closes in ${clock.secondsToClose}s; closedRounds=${closed}${clock.inClaimWindow ? `; claim window for round ${cur - 1} open ${clock.claimOpenUntil - now}s` : ""}`);
    console.log(`${TAG} totalHash=${formatUnits(totalHash, 18)} rigs=${rigCount}`);
    for (let s = 0; s < dep.stocks.length; s++) {
      const pot = await read<bigint>("pot", [current, s]);
      const [bal, required] = await Promise.all([
        pub.readContract({ abi: erc20Abi, address: dep.stocks[s], functionName: "balanceOf", args: [dep.vault] }) as Promise<bigint>,
        readVault<bigint>("requiredOf", [BigInt(s)]),
      ]);
      console.log(`${TAG} ${dep.symbols[s].padEnd(6)} pot r${cur} so far=${formatUnits(pot, decimals[s])} vault=${formatUnits(bal, decimals[s])} requiredOf=${formatUnits(required, decimals[s])}`);
    }
    console.log(`${TAG} vault USDG reserve ${formatUnits(reserve, udec)}`);
    if (dep.feeFunder) {
      const funder = { abi: feeFunderAbi, address: dep.feeFunder } as const;
      const [pendingEth, collects] = await Promise.all([
        pub.readContract({ ...funder, functionName: "pending" }) as Promise<bigint>,
        pub.readContract({ ...funder, functionName: "collectCount" }) as Promise<bigint>,
      ]);
      const escrowed = dep.ponsFeeEscrow ? (await pub.readContract({ abi: ponsV2EscrowAbi, address: dep.ponsFeeEscrow, functionName: "balanceOf", args: [dep.feeFunder] })) : undefined;
      console.log(`${TAG} FeeFunder ${dep.feeFunder} (Pons creator fee recipient): ${formatUnits(pendingEth, 18)} ETH/WETH held${escrowed !== undefined ? ` + ${formatUnits(escrowed, 18)} ETH claimable in the Pons escrow` : ""}; ${collects > 0n ? `${collects} collect calls wired` : "NOT WIRED (rounds-admin set-source after the token launch)"}`);
    }
    return;
  }

  if (cmd === "halt") {
    requireKey(operator, "operator", "OPERATOR_KEY");
    if (halted) throw new Error("already halted");
    console.log(`${TAG} HALT: the mine stops for good. No round closes after this (round ${cur} will never pay out); stakes come back in full via emergencyWithdraw; the unclaimed and running pots return to the operator through 'rounds-admin rescue'; claimed fragments stay redeemable. IRREVERSIBLE.`);
    await broadcast("halt()", dep.mine, roundMineAbi, "halt");
    return;
  }

  if (cmd === "rescue") {
    requireKey(operator, "operator", "OPERATOR_KEY");
    if (!halted) throw new Error("mine is not halted; rescue only works after 'rounds-admin halt'");
    const reserve = await readVault<bigint>("reserve");
    const excess: bigint[] = [];
    for (let s = 0; s < dep.stocks.length; s++) {
      const [bal, required] = await Promise.all([
        pub.readContract({ abi: erc20Abi, address: dep.stocks[s], functionName: "balanceOf", args: [dep.vault] }) as Promise<bigint>,
        readVault<bigint>("requiredOf", [BigInt(s)]),
      ]);
      excess.push(bal > required ? bal - required : 0n);
      console.log(`${TAG} ${dep.symbols[s].padEnd(6)} vault=${formatUnits(bal, decimals[s])} requiredOf=${formatUnits(required, decimals[s])} → rescue ${formatUnits(excess[s], decimals[s])}`);
    }
    console.log(`${TAG} RESCUE: moves the stock above requiredOf plus the whole USDG reserve (${formatUnits(reserve, 6)}) to the operator ${operator}. A stock whose hook refuses the operator stays and can be retried.`);
    const { logs } = await broadcast("rescue()", dep.vault, roundVaultAbi, "rescue");
    if (!yes) return;
    for (const log of logs) {
      try {
        const ev = decodeEventLog({ abi: roundVaultAbi, data: log.data, topics: log.topics });
        if (ev.eventName !== "Rescued") continue;
        const { tokens, usdc } = ev.args as unknown as { tokens: readonly bigint[]; usdc: bigint };
        for (let s = 0; s < dep.stocks.length; s++) {
          const moved = tokens[s] ?? 0n;
          const stayed = excess[s] - moved;
          console.log(`${TAG} ${dep.symbols[s].padEnd(6)} moved ${formatUnits(moved, decimals[s])}${stayed > 0n ? ` STAYED ${formatUnits(stayed, decimals[s])} (hook refused the operator; retry rescue later)` : ""}`);
        }
        console.log(`${TAG} USDG moved ${formatUnits(usdc, 6)}`);
      } catch { /* not a vault event */ }
    }
    return;
  }

  if (cmd === "pause" || cmd === "unpause") {
    requireKey(params.treasury, "guardian", "GUARDIAN_KEY");
    if (halted) throw new Error("mine is halted; pause/unpause are impossible");
    if (cmd === "pause") {
      if (paused) throw new Error("already paused");
      console.log(`${TAG} PAUSE: players cannot act; rounds still close on the clock. If the pause outlives ${params.pauseGraceSeconds}s any player can emergencyWithdraw, which HALTS the mine for good.`);
    } else {
      if (!paused) throw new Error("not paused");
      console.log(`${TAG} UNPAUSE: players can act again.`);
    }
    await broadcast(`${cmd}()`, dep.mine, roundMineAbi, cmd);
    return;
  }

  if (cmd === "launch") {
    requireKey(operator, "operator", "OPERATOR_KEY");
    const live = (await pub.readContract({ abi: roundMineAbi, address: dep.mine, functionName: "params" })) as { rig: Address; genesis: bigint };
    if (Number(live.genesis) !== 0) throw new Error(`already launched: rig ${live.rig}, genesis ${live.genesis}`);
    const token = arg("--token") as Address | undefined;
    if (!token || !/^0x[0-9a-fA-F]{40}$/.test(token) || /^0x0{40}$/i.test(token)) throw new Error("--token <the $VRAM address> is required");
    const genesisArg = arg("--genesis", "next-hour")!;
    const genesis = genesisArg === "next-hour" ? Math.ceil((now + 120) / 3600) * 3600 : genesisArg.startsWith("+") ? now + Number(genesisArg.slice(1)) : Number(genesisArg);
    if (!(genesis > now)) throw new Error(`genesis ${genesis} is not in the future (now ${now})`);
    const code = await pub.getCode({ address: token });
    if (!code || code === "0x") throw new Error(`no contract at ${token}`);
    const [sym, dec] = await Promise.all([
      pub.readContract({ abi: erc20Abi, address: token, functionName: "symbol" }) as Promise<string>,
      pub.readContract({ abi: erc20Abi, address: token, functionName: "decimals" }) as Promise<number>,
    ]);
    if (dec !== 18) throw new Error(`${sym} has ${dec} decimals; the mine expects 18`);
    console.log(`${TAG} LAUNCH: token ${token} (${sym}) genesis ${genesis} (${new Date(genesis * 1000).toISOString()}, round 0 opens then). Both are fixed for good after this. Anything already funded is in round 0's pot.`);
    await broadcast(`launch(${token}, ${genesis})`, dep.mine, roundMineAbi, "launch", [token, BigInt(genesis)]);
    return;
  }

  if (cmd === "set-flusher") {
    requireKey(operator, "operator", "OPERATOR_KEY");
    if (!dep.feeFunder) throw new Error("no FeeFunder in the deployment");
    const who = arg("--address") as Address | undefined;
    if (!who) throw new Error("--address <flusher> is required");
    const allowed = !hasFlag("--revoke");
    console.log(`${TAG} FeeFunder ${dep.feeFunder}: ${allowed ? "allow" : "revoke"} flusher ${who}`);
    await broadcast(`setFlusher(${who}, ${allowed})`, dep.feeFunder, feeFunderAbi as typeof roundMineAbi, "setFlusher", [who, allowed]);
    return;
  }

  if (cmd === "set-source") {
    requireKey(operator, "operator", "OPERATOR_KEY");
    if (!dep.feeFunder) throw new Error("no FeeFunder in the deployment");
    const token = arg("--token") as Address | undefined;
    if (!token || !/^0x[0-9a-fA-F]{40}$/.test(token)) throw new Error("--token <the game token> is required");
    // Pons V2 (docs/13 §2): the factory records the launch; its curve (pre-graduation) and the meme hook
    // (post-graduation) credit the creator fee recipient in the fee escrow. The funder's collect calls
    // sweep both and claim, in that order.
    const factory = (arg("--factory") ?? dep.ponsFactory) as Address | undefined;
    if (!factory) throw new Error("--factory <Pons V2 launch factory> is required (or ponsFactory in the deployment file / PONS_FACTORY_ADDRESS)");
    const launched = await pub.readContract({ address: factory, abi: ponsV2FactoryAbi, functionName: "getLaunchedToken", args: [token] });
    if (!launched.exists) throw new Error(`${token} is not a Pons V2 launch on factory ${factory}`);
    const [escrow, hook] = await Promise.all([
      pub.readContract({ address: factory, abi: ponsV2FactoryAbi, functionName: "feeEscrow" }),
      pub.readContract({ address: factory, abi: ponsV2FactoryAbi, functionName: "memeHook" }),
    ]);
    if (!/^0x0{40}$/i.test(launched.pairToken)) throw new Error(`the launch is quoted in ${launched.pairToken}, not native ETH: the funder only flushes ETH/WETH`);
    const phase = ["NotGraduated", "Swept", "PoolCreated", "Rescued"][launched.phase] ?? String(launched.phase);
    console.log(`${TAG} Pons V2 launch of ${token} by ${launched.deployer}: curve ${launched.curve}, creator tax ${launched.creatorTaxBps} bps, buyback ${launched.buybackEnabled ? "ON" : "off"}, phase ${phase}`);
    console.log(`${TAG} creator fee recipient ${launched.creatorFeeRecipient}${launched.creatorFeeRecipient.toLowerCase() === dep.feeFunder.toLowerCase() ? " = the FeeFunder ✓" : ` ≠ the FeeFunder ${dep.feeFunder}: the fees will NOT reach the pots. The current recipient must call transferCreatorFeeRecipient(token, funder) on the factory (3-day timelock), or relaunch with the funder as the recipient.`}`);
    if (launched.buybackEnabled) console.log(`${TAG} WARNING: buyback is on, so part of the creator fee is locked as a vest instead of paid; the funder cannot claim that part.`);
    const poolId = ponsV2PoolId(token, launched.pairToken, launched.poolFee, launched.tickSpacing, hook);
    const collects = ponsV2Collects(launched.curve, hook, poolId, escrow);
    console.log(`${TAG} SET COLLECTS on FeeFunder ${dep.feeFunder}: curve.sweepFees(0) → hook.sweepPoolFees(${poolId}, 0, 0) → escrow ${escrow}.claim()`);
    await broadcast(`setCollects(3 calls)`, dep.feeFunder, feeFunderAbi as typeof roundMineAbi, "setCollects", [collects]);
    console.log(`${TAG} check: rounds-admin status shows "3 collect calls wired"; FLUSHER_KEY=… flush-fees --once --dry-run quotes what the next flush claims and buys`);
    return;
  }

  throw new Error("usage: rounds-admin status | launch --token 0x… [--genesis next-hour|+seconds|unix] | halt | rescue | pause | unpause | set-flusher --address 0x… [--revoke] | set-source --token 0x… [--factory 0x…]  [--yes]");
}

main().catch((e: Error) => { console.error(`${TAG} failed:`, e.message ?? e); process.exit(1); });
