import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { asc, count, desc, eq, graphql, replaceBigInts } from "ponder";
import { isAddress } from "viem";

const app = new Hono();

const json = (value: unknown) => replaceBigInts(value, (v) => v.toString());
const LEADERBOARD_LIMIT = 50;
const LEADERBOARD_KEYS = {
  hash: schema.walletStats.totalHash,
  claimed: schema.walletStats.totalClaimed,
  burned: schema.walletStats.totalBurned,
} as const;
type LeaderboardKey = keyof typeof LEADERBOARD_KEYS;

app.use("/graphql", graphql({ db, schema }));

/** GET /season → season row plus counts. 404 until the first SeasonMine event is indexed. */
app.get("/season", async (c) => {
  const [s] = await db.select().from(schema.season).limit(1);
  if (!s) return c.json({ error: "season not indexed yet" }, 404);
  const [rigs] = await db.select({ n: count() }).from(schema.rig);
  const [wallets] = await db.select({ n: count() }).from(schema.walletStats);
  const blocks = await db.select().from(schema.rewardBlock).orderBy(asc(schema.rewardBlock.id));
  return c.json(json({ ...s, rigCount: rigs?.n ?? 0, walletCount: wallets?.n ?? 0, blocks }));
});

/** GET /shifts → ended shifts in order, with found blocks. */
app.get("/shifts", async (c) => {
  const shifts = await db.select().from(schema.shift).orderBy(asc(schema.shift.id));
  const blocks = await db.select().from(schema.rewardBlock).orderBy(asc(schema.rewardBlock.id));
  return c.json(json({ shifts, blocks }));
});

/** GET /leaderboard?by=hash|claimed|burned → top 50 wallets. */
app.get("/leaderboard", async (c) => {
  const by = c.req.query("by") ?? "hash";
  if (!(by in LEADERBOARD_KEYS)) {
    return c.json({ error: "by must be one of hash, claimed, burned" }, 400);
  }
  const key = LEADERBOARD_KEYS[by as LeaderboardKey];
  const rows = await db
    .select()
    .from(schema.walletStats)
    .orderBy(desc(key), asc(schema.walletStats.id))
    .limit(LEADERBOARD_LIMIT);
  return c.json(json({ by, rows: rows.map((r, i) => ({ rank: i + 1, ...r })) }));
});

/** GET /rigs/:owner → the wallet's rigs (active first) with its aggregate stats and history. */
app.get("/rigs/:owner", async (c) => {
  const raw = c.req.param("owner");
  if (!isAddress(raw)) return c.json({ error: "invalid address" }, 400);
  const owner = raw.toLowerCase() as `0x${string}`;

  const rigs = await db
    .select()
    .from(schema.rig)
    .where(eq(schema.rig.owner, owner))
    .orderBy(desc(schema.rig.active), asc(schema.rig.id));
  const [stats] = await db.select().from(schema.walletStats).where(eq(schema.walletStats.id, owner));
  const claims = await db
    .select()
    .from(schema.claim)
    .where(eq(schema.claim.owner, owner))
    .orderBy(asc(schema.claim.timestamp));
  const burns = await db
    .select()
    .from(schema.burn)
    .where(eq(schema.burn.owner, owner))
    .orderBy(asc(schema.burn.timestamp));
  const redemptions = await db
    .select()
    .from(schema.redemption)
    .where(eq(schema.redemption.user, owner))
    .orderBy(asc(schema.redemption.timestamp));

  return c.json(json({ owner, stats: stats ?? null, rigs, claims, burns, redemptions }));
});

export default app;
