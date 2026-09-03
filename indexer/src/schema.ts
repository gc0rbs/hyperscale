/**
 * Indexer entity sketch (docs/06 §5). Replaced by a real Ponder schema in phase 3 once the
 * contract ABI exists. Kept type-only so `check` has something to verify.
 */
export interface Season { id: string; mine: `0x${string}`; openTime: number; closeX?: bigint }
export interface Shift { seasonId: string; index: number; endX: bigint; totalHashAfter: bigint }
export interface Rig { id: string; seasonId: string; owner: `0x${string}`; weight: bigint; gpuTier: number; coolingTier: number }
export interface Claim { rigId: string; blockIdx: number; fragments: bigint; txHash: `0x${string}` }
export interface Burn { rigId: string; kind: "gpu" | "cooling" | "overclock"; amount: bigint }
