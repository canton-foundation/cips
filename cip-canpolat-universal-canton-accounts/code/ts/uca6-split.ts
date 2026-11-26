// UCA-6 Host share of app rewards.
// Splits one reward between the serving wallet's provider party and the party's
// Confirmation hosts. Weights use Daml Decimal precision (10 places) and always
// sum to exactly 1.0. Default 70/30; the Tokenomics Committee publishes the final figure.

export type Beneficiary = { beneficiary: string; weight: string };

const SCALE = 10_000_000_000n; // 1.0 at 10 decimal places
const MAX_BENEFICIARIES = 20;

function fmt(units: bigint): string {
  const whole = units / SCALE;
  const frac = (units % SCALE).toString().padStart(10, "0");
  return `${whole}.${frac}`;
}

export function rewardSplit(opts: {
  walletProvider: string; // provider party of the serving wallet
  walletValidatorHostsParty: boolean; // the serving wallet's validator is itself a host
  hostRewardParties: string[]; // reward parties of hosts with Confirmation permission
  hostShareBps?: number; // basis points, default 3000 (30%)
}): Beneficiary[] {
  const hosts = [...new Set(opts.hostRewardParties)].filter((p) => p !== opts.walletProvider);
  if (opts.walletValidatorHostsParty || hosts.length === 0) {
    return [{ beneficiary: opts.walletProvider, weight: fmt(SCALE) }];
  }
  if (hosts.length + 1 > MAX_BENEFICIARIES) throw new Error("too_many_beneficiaries");
  const bps = BigInt(opts.hostShareBps ?? 3000);
  if (bps <= 0n || bps >= 10000n) throw new Error("host_share_out_of_range");

  const hostTotal = (SCALE * bps) / 10000n;
  const walletUnits = SCALE - hostTotal;
  const each = hostTotal / BigInt(hosts.length);
  const out: Beneficiary[] = [{ beneficiary: opts.walletProvider, weight: fmt(walletUnits) }];
  hosts.forEach((h, i) => {
    // the last host takes the rounding remainder so the sum is exactly 1.0
    const units = i === hosts.length - 1 ? hostTotal - each * BigInt(hosts.length - 1) : each;
    out.push({ beneficiary: h, weight: fmt(units) });
  });
  return out;
}
