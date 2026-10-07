"use client";

import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { UmbrellaGlyph } from "@/components/UmbrellaGlyph";
import { useWallet } from "@/lib/genlayer/wallet";
import {
  useProduct,
  useProductList,
  useSources,
  useMyUnderwriting,
  useMyCoverage,
  useCreateProduct,
  useUnderwrite,
  useBuyCoverage,
  useCheckTrigger,
  useChallenge,
  useResolveDispute,
  useResolveStaleDispute,
  useExpireProduct,
  useClaimCoverage,
  useWithdrawUnderwriting,
  useRetryCoverageClaim,
  useRetryUnderwritingWithdrawal,
} from "@/lib/hooks/useIndemnity";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Product } from "@/lib/contracts/types";

const CHALLENGE_WINDOW_SECONDS = 600;
const SCALE = 100_000_000;
const COMPARISON_OPS = [">=", "<=", "==", ">", "<"];

function shortAddr(hex: string): string {
  if (!hex) return "—";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return `0x${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

function sameAddr(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function formatGen(wei: string): string {
  const n = Number(wei) / 1e18;
  if (!Number.isFinite(n)) return "0.000";
  return n.toFixed(3);
}

function genToWei(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) return BigInt(0);
  const neg = trimmed.startsWith("-");
  const body = neg ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = body.split(".");
  const intPart = intPartRaw || "0";
  const fracPart = (fracPartRaw + "0".repeat(18)).slice(0, 18);
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) return BigInt(0);
  const wei = BigInt(intPart) * BigInt(10) ** BigInt(18) + BigInt(fracPart || "0");
  return neg ? -wei : wei;
}

function weiToAmount(wei: bigint): number {
  // genlayer-js's write args want a plain JS number for int params; for
  // amounts below Number.MAX_SAFE_INTEGER (sensible for testnet GEN) this
  // round-trips cleanly through BigInt.
  return Number(wei);
}

function formatScaled(scaled: string): string {
  const n = Number(scaled) / SCALE;
  if (!Number.isFinite(n)) return "0";
  return n.toString();
}

function toScaled(input: string): number {
  const n = Number(input.trim());
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * SCALE);
}

function formatBps(bps: string): string {
  const n = Number(bps) / 100;
  if (!Number.isFinite(n)) return "0%";
  return `${n}%`;
}

function formatDate(ts: string): string {
  const n = Number(ts);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function useNow(tickMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusPillClass(status: string): string {
  if (status === "triggered") return "status-pill triggered";
  if (status === "disputed") return "status-pill disputed";
  if (status === "expired") return "status-pill expired";
  return "status-pill";
}

function statusLabel(p: Product, now: number): string {
  switch (p.status) {
    case "open": return now < Number(p.close_time) ? "Open · Accepting Capital" : "Open · Awaiting Trigger Check";
    case "triggered": {
      const closes = Number(p.challenge_deadline);
      return now < closes ? "Triggered · Challenge Window" : "Triggered · Settled";
    }
    case "disputed": return "Disputed · Awaiting Resolution";
    case "expired": return "Expired";
    default: return p.status;
  }
}

function CreateProductDialog() {
  const { address } = useWallet();
  const create = useCreateProduct();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "", title: "", sources: "", jsonPath: "", comparisonOp: ">=", threshold: "",
    toleranceBps: "500", thresholdCount: "2", premiumBps: "450", target: "", closeTime: "", expiry: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = () => {
    const sources = form.sources.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!form.id || !form.title || sources.length < 2 || !form.jsonPath || !form.threshold || !form.target || !form.closeTime || !form.expiry) return;
    const closeTs = Math.floor(new Date(form.closeTime).getTime() / 1000);
    const expiryTs = Math.floor(new Date(form.expiry).getTime() / 1000);
    create.run(
      {
        id: form.id, title: form.title, sources, jsonPath: form.jsonPath, comparisonOp: form.comparisonOp,
        thresholdScaled: toScaled(form.threshold), toleranceBps: Number(form.toleranceBps) || 0,
        thresholdCount: Number(form.thresholdCount) || 2, premiumBps: Number(form.premiumBps) || 0,
        target: weiToAmount(genToWei(form.target)), closeTime: closeTs, expiry: expiryTs,
      },
      { onSuccess: () => { setOpen(false); } } as any
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn-indm solid" disabled={!address}>+ New Product</button>
      </DialogTrigger>
      <DialogContent className="!rounded-2xl !bg-card !border-border-bright sm:!max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-head">New Coverage Product</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3.5 mt-1">
          <div>
            <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Product ID</Label>
            <Input value={form.id} onChange={set("id")} placeholder="flight-delay-ba117" className="mt-1 font-mono" />
          </div>
          <div>
            <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Title</Label>
            <Input value={form.title} onChange={set("title")} placeholder="Flight Delay — BA117 JFK→LHR" className="mt-1" />
          </div>
          <div>
            <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Sources (one https:// URL per line, 2-5)</Label>
            <textarea
              value={form.sources} onChange={set("sources")}
              placeholder={"https://a.example.com/data\nhttps://b.example.com/data"}
              rows={3}
              className="mt-1 w-full px-3 py-2 text-sm bg-transparent border border-input rounded-md outline-none focus-visible:border-ring font-mono"
              style={{ color: "var(--foreground)" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>JSON Path</Label>
              <Input value={form.jsonPath} onChange={set("jsonPath")} placeholder="delay_minutes" className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Comparison</Label>
              <select value={form.comparisonOp} onChange={set("comparisonOp") as any} className="mt-1 w-full h-9 px-3 text-sm bg-transparent border border-input rounded-md font-mono" style={{ color: "var(--foreground)" }}>
                {COMPARISON_OPS.map((op) => <option key={op} value={op} style={{ background: "var(--card)" }}>{op}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Threshold</Label>
              <Input value={form.threshold} onChange={set("threshold")} placeholder="120" className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Tolerance (bps)</Label>
              <Input value={form.toleranceBps} onChange={set("toleranceBps")} className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Min Agreeing</Label>
              <Input value={form.thresholdCount} onChange={set("thresholdCount")} className="mt-1 font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Premium (bps)</Label>
              <Input value={form.premiumBps} onChange={set("premiumBps")} placeholder="450 = 4.5%" className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Target Capital (GEN)</Label>
              <Input value={form.target} onChange={set("target")} placeholder="10" className="mt-1 font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Underwriting Closes</Label>
              <Input type="datetime-local" value={form.closeTime} onChange={set("closeTime")} className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Expiry</Label>
              <Input type="datetime-local" value={form.expiry} onChange={set("expiry")} className="mt-1 font-mono" />
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <button className="btn-indm solid w-full" onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create Product"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnderwriteDialog({ productId }: { productId: string }) {
  const underwrite = useUnderwrite();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn-indm ghost">Underwrite</button>
      </DialogTrigger>
      <DialogContent className="!rounded-2xl !bg-card !border-border-bright sm:!max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-head">Underwrite This Product</DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Amount (GEN)</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2.5" className="mt-1 font-mono" />
        </div>
        <DialogFooter className="mt-4">
          <button
            className="btn-indm solid w-full"
            disabled={!amount || underwrite.isPending}
            onClick={() => underwrite.run({ id: productId, amountWei: genToWei(amount) }, { onSuccess: () => { setOpen(false); setAmount(""); } } as any)}
          >
            {underwrite.isPending ? "Staking…" : "Stake Capital"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BuyCoverageDialog({ productId, premiumBps }: { productId: string; premiumBps: string }) {
  const buy = useBuyCoverage();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  const amountWei = genToWei(amount || "0");
  const premiumWei = (amountWei * BigInt(Math.round(Number(premiumBps) || 0))) / BigInt(10_000);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn-indm solid">Buy Coverage</button>
      </DialogTrigger>
      <DialogContent className="!rounded-2xl !bg-card !border-border-bright sm:!max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-head">Buy Coverage</DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Coverage Amount (GEN)</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.0" className="mt-1 font-mono" />
          {amount && (
            <div className="font-mono text-xs mt-2" style={{ color: "var(--amber-bright)" }}>
              Premium due: {formatGen(premiumWei.toString())} GEN
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <button
            className="btn-indm solid w-full"
            disabled={!amount || buy.isPending}
            onClick={() => buy.run({ id: productId, amount: weiToAmount(amountWei), premiumWei }, { onSuccess: () => { setOpen(false); setAmount(""); } } as any)}
          >
            {buy.isPending ? "Buying…" : "Pay Premium & Buy"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChallengeDialog({ productId }: { productId: string }) {
  const challenge = useChallenge();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn-indm danger">Challenge Trigger</button>
      </DialogTrigger>
      <DialogContent className="!rounded-2xl !bg-card !border-border-bright sm:!max-w-md">
        <DialogHeader>
          <DialogTitle className="font-head">Challenge This Trigger</DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <Label className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Why doesn&apos;t this reflect the real data?</Label>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="mt-1 w-full px-3 py-2 text-sm bg-transparent border border-input rounded-md outline-none focus-visible:border-ring"
            style={{ color: "var(--foreground)" }}
          />
        </div>
        <DialogFooter className="mt-4">
          <button
            className="btn-indm danger w-full"
            disabled={!reason || challenge.isPending}
            onClick={() => challenge.run({ id: productId, reason }, { onSuccess: () => { setOpen(false); setReason(""); } } as any)}
          >
            {challenge.isPending ? "Filing…" : "File Challenge"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourcesList({ productId }: { productId: string }) {
  const { data: sources } = useSources(productId);
  if (!sources || sources.length === 0) return null;
  return (
    <div>
      {sources.map((s) => (
        <div key={s} className="source-row">
          <span className="source-dot" />
          <span className="break-all flex-1" style={{ color: "var(--foreground)" }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function ProductHero({ id }: { id: string }) {
  const { data: p, isLoading } = useProduct(id);
  const { address } = useWallet();
  const now = useNow();
  const { data: myUnderwriting } = useMyUnderwriting(id);
  const { data: myCoverage } = useMyCoverage(id);
  const checkTrigger = useCheckTrigger();
  const resolveDispute = useResolveDispute();
  const resolveStale = useResolveStaleDispute();
  const expireAction = useExpireProduct();
  const claimAction = useClaimCoverage();
  const withdrawAction = useWithdrawUnderwriting();
  const retryClaim = useRetryCoverageClaim();
  const retryWithdraw = useRetryUnderwritingWithdrawal();

  if (isLoading) {
    return <div className="p-8 text-center font-mono text-sm" style={{ color: "var(--ink-faint)" }}>Loading product…</div>;
  }
  if (!p) {
    return (
      <div className="p-8 text-center font-mono text-sm" style={{ color: "var(--ink-faint)" }}>
        Product &quot;{id}&quot; not found.
      </div>
    );
  }

  const isCreator = sameAddr(address, p.creator);
  const hasStake = Number(myUnderwriting ?? "0") > 0;
  const hasCoverage = Number(myCoverage ?? "0") > 0;
  const uwPct = Number(p.target) > 0 ? Math.min(100, (Number(p.underwritten) / Number(p.target)) * 100) : 0;
  const challengeCloses = Number(p.challenge_deadline);
  const challengeOpen = p.status === "triggered" && now < challengeCloses;
  const closeTimePassed = now >= Number(p.close_time);
  const expiryPassed = now >= Number(p.expiry);
  const disputeStale = p.status === "disputed" && now >= Number(p.challenge_deadline) + 86400;

  return (
    <div className="p-7 sm:p-8 rounded-2xl" style={{ background: "var(--card)", border: "1px solid var(--border-bright)" }}>
      <div className="flex justify-between items-start gap-5 flex-wrap mb-5">
        <div>
          <div className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
            CREATOR {shortAddr(p.creator)}
          </div>
          <h2 className="font-head mt-1 text-2xl max-w-[42ch]" style={{ textWrap: "balance" }}>
            {p.title}
          </h2>
        </div>
        <span className={statusPillClass(p.status)}>
          <span className="dot" /> {statusLabel(p, now)}
        </span>
      </div>

      <div className="mb-6">
        <div className="flex justify-between items-baseline mb-2">
          <span className="eyebrow">Underwritten</span>
          <span className="font-mono text-sm tabular">{formatGen(p.underwritten)} / {formatGen(p.target)} GEN</span>
        </div>
        <div className="uw-bar">
          <div className={`fill ${p.status === "triggered" ? "triggered" : ""}`} style={{ width: `${uwPct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-6">
        <div>
          <div className="eyebrow mb-2">Trigger Rule</div>
          <p className="field-note break-words">
            Triggers when <span style={{ color: "var(--indigo-bright)" }}>{p.json_path}</span>{" "}
            <span style={{ color: "var(--amber-bright)" }}>{p.comparison_op}</span>{" "}
            <span style={{ color: "var(--amber-bright)" }}>{formatScaled(p.threshold_scaled)}</span>, with at least{" "}
            <span style={{ color: "var(--indigo-bright)" }}>{p.threshold_count} of {p.source_count}</span>{" "}
            independent sources agreeing (tolerance {formatBps(p.tolerance_bps)}).
            {p.dispute_reason && (
              <>
                <br /><br />
                <span style={{ color: "var(--rust)" }}>Dispute:</span> {p.dispute_reason}
              </>
            )}
            {p.resolution_note && (
              <>
                <br /><br />
                <span style={{ color: "var(--indigo-bright)" }}>Resolution:</span> {p.resolution_note}
              </>
            )}
          </p>
          <div className="mt-3">
            <SourcesList productId={id} />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="eyebrow mb-1">Terms</div>
          <div className="kv-row"><span className="k">PREMIUM</span><span className="v amount">{formatBps(p.premium_bps)}</span></div>
          <div className="kv-row"><span className="k">COVERAGE SOLD</span><span className="v indigo">{formatGen(p.coverage_sold)} GEN</span></div>
          <div className="kv-row"><span className="k">PREMIUM POOL</span><span className="v amount">{formatGen(p.premium_pool)} GEN</span></div>
          <div className="kv-row"><span className="k">UNDERWRITING CLOSES</span><span className="v">{formatDate(p.close_time)}</span></div>
          <div className="kv-row"><span className="k">EXPIRY</span><span className="v">{formatDate(p.expiry)}</span></div>
          {challengeOpen && (
            <div className="kv-row"><span className="k">CHALLENGE CLOSES</span><span className="v indigo tabular">T−{formatCountdown(challengeCloses - now)}</span></div>
          )}
          {hasStake && <div className="kv-row"><span className="k">YOUR STAKE</span><span className="v indigo">{formatGen(myUnderwriting ?? "0")} GEN</span></div>}
          {hasCoverage && <div className="kv-row"><span className="k">YOUR COVERAGE</span><span className="v indigo">{formatGen(myCoverage ?? "0")} GEN</span></div>}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap mt-6 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
        {p.status === "open" && !closeTimePassed && <UnderwriteDialog productId={id} />}
        {p.status === "open" && !closeTimePassed && <BuyCoverageDialog productId={id} premiumBps={p.premium_bps} />}
        {p.status === "open" && closeTimePassed && (
          <button className="btn-indm solid" disabled={checkTrigger.isPending} onClick={() => checkTrigger.run({ id })}>
            {checkTrigger.isPending ? "Checking…" : "Check Trigger"}
          </button>
        )}
        {p.status === "open" && closeTimePassed && expiryPassed && (
          <button className="btn-indm ghost" disabled={expireAction.isPending} onClick={() => expireAction.run({ id })}>
            {expireAction.isPending ? "Expiring…" : "Mark Expired"}
          </button>
        )}
        {p.status === "triggered" && challengeOpen && hasStake && <ChallengeDialog productId={id} />}
        {p.status === "disputed" && (
          <button className="btn-indm solid" disabled={resolveDispute.isPending} onClick={() => resolveDispute.run({ id })}>
            {resolveDispute.isPending ? "Resolving…" : "Resolve Dispute"}
          </button>
        )}
        {p.status === "disputed" && disputeStale && (
          <button className="btn-indm ghost" disabled={resolveStale.isPending} onClick={() => resolveStale.run({ id })}>
            {resolveStale.isPending ? "Settling…" : "Settle Stale Dispute"}
          </button>
        )}
        {p.status === "triggered" && !challengeOpen && hasCoverage && (
          <button className="btn-indm solid" disabled={claimAction.isPending} onClick={() => claimAction.run({ id })}>
            {claimAction.isPending ? "Claiming…" : "Claim Coverage"}
          </button>
        )}
        {(p.status === "triggered" || p.status === "expired") && !challengeOpen && hasStake && (
          <button className="btn-indm ghost" disabled={withdrawAction.isPending} onClick={() => withdrawAction.run({ id })}>
            {withdrawAction.isPending ? "Withdrawing…" : "Withdraw Underwriting"}
          </button>
        )}
        {!address && <span className="font-mono text-xs self-center" style={{ color: "var(--ink-faint)" }}>Connect your wallet above to act on this product.</span>}
      </div>

      {address && (hasCoverage || hasStake) && (p.status === "triggered" || p.status === "expired") && (
        <div className="flex gap-4 mt-3 font-mono text-[0.7rem]" style={{ color: "var(--ink-faint)" }}>
          {hasCoverage && (
            <button className="underline" disabled={retryClaim.isPending} onClick={() => address && retryClaim.run({ id })}>
              Didn&apos;t receive your claim? Retry delivery
            </button>
          )}
          {hasStake && (
            <button className="underline" disabled={retryWithdraw.isPending} onClick={() => address && retryWithdraw.run({ id })}>
              Didn&apos;t receive your withdrawal? Retry delivery
            </button>
          )}
        </div>
      )}

      {challengeOpen && (
        <div className="mt-4 flex items-center gap-2 font-mono text-xs" style={{ color: "var(--rust)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--rust)" }} />
          An underwriter can still challenge for {formatCountdown(challengeCloses - now)} before claims settle.
        </div>
      )}
    </div>
  );
}

function ProductLogRow({ id, p, onSelect, active }: { id: string; p: Product; onSelect: () => void; active: boolean }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left grid gap-4 items-center py-4 px-1"
      style={{
        gridTemplateColumns: "1fr auto auto",
        borderBottom: "1px solid var(--border)",
        background: active ? "var(--secondary)" : "transparent",
      }}
    >
      <div>
        <div className="text-[0.95rem]" style={{ color: "var(--foreground)" }}>
          {p.title}
        </div>
        <div className="font-mono text-[0.68rem] mt-0.5" style={{ color: "var(--ink-faint)" }}>
          {id} &middot; {shortAddr(p.creator)}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm tabular" style={{ color: "var(--indigo-bright)" }}>{formatGen(p.underwritten)} GEN</div>
      </div>
      <div className={statusPillClass(p.status)} style={{ padding: "4px 10px" }}>
        <span className="dot" /> {p.status}
      </div>
    </button>
  );
}

export default function HomePage() {
  const { data: list, isLoading } = useProductList();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && list && list.length > 0) {
      setSelectedId(list[list.length - 1].id);
    }
  }, [list, selectedId]);

  const others = useMemo(() => (list ?? []).filter((r) => r.id !== selectedId).slice().reverse(), [list, selectedId]);

  return (
    <div className="max-w-[1040px] mx-auto px-5 pb-16 pt-7 overflow-x-hidden">
      <Navbar />

      <div className="flex justify-between items-end gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-head text-3xl" style={{ textWrap: "balance" }}>
            {selectedId ? "Coverage Product" : "No Products Yet"}
          </h1>
          <div className="font-mono text-xs mt-1.5 max-w-[48ch]" style={{ color: "var(--ink-faint)" }}>
            Independent sources settle every trigger automatically &mdash; no claims process, no adjuster.
          </div>
        </div>
        <CreateProductDialog />
      </div>

      <div className="mb-10">
        {isLoading && (
          <div className="p-8 text-center font-mono text-sm" style={{ color: "var(--ink-faint)" }}>Loading…</div>
        )}
        {!isLoading && !selectedId && (
          <div className="p-10 flex flex-col items-center gap-3 text-center rounded-2xl" style={{ background: "var(--card)", border: "1px dashed var(--border-bright)" }}>
            <UmbrellaGlyph size={44} />
            <div className="font-mono text-sm" style={{ color: "var(--ink-faint)" }}>
              No products on this contract yet. Create the first one to see it here.
            </div>
          </div>
        )}
        {selectedId && <ProductHero id={selectedId} />}
      </div>

      {others.length > 0 && (
        <div>
          <div className="eyebrow mb-2">Other Products</div>
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {others.map(({ id, product }) => (
              <ProductLogRow key={id} id={id} p={product} active={id === selectedId} onSelect={() => setSelectedId(id)} />
            ))}
          </div>
        </div>
      )}

      <footer className="flex justify-between flex-wrap gap-2 mt-14 pt-5 font-mono text-[0.68rem]" style={{ borderTop: "1px solid var(--border)", color: "var(--ink-faint)" }}>
        <div>Indemnity &mdash; every trigger is independently settled by GenLayer validators, not taken on trust.</div>
      </footer>
    </div>
  );
}
