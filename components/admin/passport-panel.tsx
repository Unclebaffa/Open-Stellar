"use client"

import { useState, type ReactNode } from "react"
import {
  Activity,
  Coins,
  Cpu,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
} from "lucide-react"
import {
  CONTRACTS,
  mintPassport,
  replaySpentProof,
  verifyOnChain,
  type MintedProof,
  type OnChainResult,
} from "@/lib/passport/passport"

const EXPLORER = (id: string) => `https://stellar.expert/explorer/testnet/contract/${id}`
const toStroops = (xlm: number) => BigInt(Math.round(xlm * 1e7)).toString()
const fromStroops = (s: string) => (Number(BigInt(s)) / 1e7).toLocaleString()
const short = (s = "", n = 14) => (s.length > n ? `${s.slice(0, n)}…` : s)

type PayResult = { authorized: boolean; reason: string; amount: number }

export function PassportPanel() {
  const [cap, setCap] = useState(50)
  const [payAmount, setPayAmount] = useState(20)
  const [minted, setMinted] = useState<MintedProof | null>(null)
  const [verifyRes, setVerifyRes] = useState<OnChainResult | null>(null)
  const [payRes, setPayRes] = useState<PayResult | null>(null)
  const [replay, setReplay] = useState<OnChainResult | null>(null)
  const [proving, setProving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [paying, setPaying] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const addLog = (line: string) =>
    setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${line}`].slice(-40))

  async function doMint() {
    setProving(true)
    setMinted(null)
    setVerifyRes(null)
    setPayRes(null)
    addLog(`> generating witness + Groth16 proof client-side (cap ${cap} XLM)…`)
    try {
      const m = await mintPassport(toStroops(cap))
      setMinted(m)
      addLog(`+ proof generated in ${m.provingMs} ms · off-chain verify: ${m.offChainValid}`)
      addLog(`  agent #${m.agentId} · nullifier ${short(m.nullifierHash, 20)}`)
    } catch (e) {
      addLog(`! proving failed: ${String((e as Error).message)}`)
    } finally {
      setProving(false)
    }
  }

  async function doVerify() {
    if (!minted) return
    setVerifying(true)
    addLog(`> submitting proof to AgentPassportValidator (BN254 pairing on-chain)…`)
    const r = await verifyOnChain(minted)
    setVerifyRes(r)
    addLog(r.ok ? `+ ON-CHAIN VERIFIED · attestation minted (ledger ${r.attestation?.ledger})` : `! rejected: ${r.error}`)
    setVerifying(false)
  }

  // x402 gate: the proven (hidden) spend cap covers the requested amount.
  async function doPay() {
    if (!verifyRes?.ok || !verifyRes.attestation) return
    setPaying(true)
    addLog(`> agent #${minted?.agentId} requests payment of ${payAmount} XLM (x402 gate)…`)
    const cap = BigInt(verifyRes.attestation.spend_cap)
    const amount = BigInt(toStroops(payAmount))
    const authorized = cap >= amount
    const reason = authorized ? "Within proven spend cap" : "Exceeds proven spend cap"
    setPayRes({ authorized, reason, amount: payAmount })
    addLog(authorized ? `+ APPROVED — ${reason}` : `x DENIED — ${reason}`)
    setPaying(false)
  }

  async function doReplay() {
    setReplaying(true)
    addLog(`> replaying a previously-spent passport (agent #42)…`)
    const r = await replaySpentProof()
    setReplay(r)
    addLog(r.ok ? `! unexpectedly accepted` : `+ chain rejected replay — ${r.error}`)
    setReplaying(false)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      {/* LEFT — the 4-step flow */}
      <div className="space-y-4">
        <Step n="01" title="Mint passport" subtitle="Client-side Groth16 proof — keys never leave the browser">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[180px]">
              <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Spend cap (XLM)</span>
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
                className="mt-3 w-full accent-cyan-400"
              />
              <span className="mt-1 block font-mono text-sm text-cyan-200">{cap} XLM proven, hidden balance</span>
            </label>
            <button
              type="button"
              onClick={doMint}
              disabled={proving}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300 disabled:opacity-50"
            >
              {proving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
              {proving ? "Proving…" : "Generate proof"}
            </button>
          </div>
          {minted && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Fact label="Agent id" value={`#${minted.agentId}`} />
              <Fact label="Proving time" value={`${minted.provingMs} ms`} />
              <Fact label="Off-chain valid" value={minted.offChainValid ? "true" : "false"} />
              <Fact label="Nullifier" value={short(minted.nullifierHash)} mono />
            </div>
          )}
        </Step>

        <Step n="02" title="Verify on-chain" subtitle="BN254 pairing checked by the Soroban validator (read-only sim)">
          <button
            type="button"
            onClick={doVerify}
            disabled={!minted || verifying}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:opacity-40"
          >
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {verifying ? "Verifying…" : "Verify proof on Stellar"}
          </button>
          {verifyRes && (
            <div
              className={`mt-4 rounded-2xl border p-4 ${
                verifyRes.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
              }`}
            >
              {verifyRes.ok && verifyRes.attestation ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Fact label="Status" value="ATTESTATION MINTED" tone="text-emerald-300" />
                  <Fact label="Ledger" value={String(verifyRes.attestation.ledger)} />
                  <Fact label="Proven cap" value={`${fromStroops(verifyRes.attestation.spend_cap)} XLM`} />
                  <Fact label="Registry root" value={short(verifyRes.attestation.registry_root)} mono />
                </div>
              ) : (
                <p className="font-mono text-sm text-rose-300">Rejected — {verifyRes.error}</p>
              )}
            </div>
          )}
        </Step>

        <Step n="03" title="Authorize x402 payment" subtitle="Settles only if amount ≤ proven spend cap">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[180px]">
              <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Payment (XLM)</span>
              <input
                type="range"
                min={5}
                max={500}
                step={5}
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="mt-3 w-full accent-amber-400"
              />
              <span className="mt-1 block font-mono text-sm text-amber-200">{payAmount} XLM requested</span>
            </label>
            <button
              type="button"
              onClick={doPay}
              disabled={!verifyRes?.ok || paying}
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-200 transition hover:border-amber-300 disabled:opacity-40"
            >
              {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
              Request payment
            </button>
          </div>
          {payRes && (
            <p
              className={`mt-4 font-mono text-sm ${payRes.authorized ? "text-emerald-300" : "text-rose-300"}`}
            >
              {payRes.authorized ? "✓ APPROVED" : "✗ DENIED"} · {payRes.amount} XLM — {payRes.reason}
            </p>
          )}
        </Step>

        <Step n="04" title="Replay attack — blocked" subtitle="A real previously-spent proof is rejected on-chain (NullifierUsed)">
          <button
            type="button"
            onClick={doReplay}
            disabled={replaying}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-40"
          >
            {replaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Replay spent proof
          </button>
          {replay && (
            <p className={`mt-4 font-mono text-sm ${replay.ok ? "text-rose-300" : "text-emerald-300"}`}>
              {replay.ok ? "! unexpectedly accepted" : `✓ chain rejected replay — ${replay.error}`}
            </p>
          )}
        </Step>
      </div>

      {/* RIGHT — credential + console + contracts */}
      <div className="space-y-4">
        <PassportCardMini cap={minted?.spendCap ?? toStroops(cap)} minted={minted} verified={!!verifyRes?.ok} />

        <div className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5">
          <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Live console</p>
          <div className="mt-3 h-56 overflow-auto rounded-2xl border border-slate-800 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
            {log.length === 0 ? (
              <span className="text-slate-600">// waiting for the first proof…</span>
            ) : (
              log.map((l, i) => (
                <div key={i} className={l.includes("DENIED") || l.startsWith("!") ? "text-rose-300" : l.includes("APPROVED") || l.includes("VERIFIED") ? "text-emerald-300" : ""}>
                  {l}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Deployed contracts (testnet)</p>
          <ContractRow icon={<ShieldCheck className="h-4 w-4" />} label="Validator" id={CONTRACTS.validator} />
          <ContractRow icon={<Lock className="h-4 w-4" />} label="Groth16 verifier" id={CONTRACTS.verifier} />
        </div>
      </div>
    </div>
  )
}

function Step({
  n,
  title,
  subtitle,
  children,
}: {
  n: string
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 font-mono text-[11px] text-cyan-300">
          {n}
        </span>
        <div>
          <h3 className="font-pixel text-sm uppercase text-slate-100">{title}</h3>
          <p className="mt-1 font-vt323 text-lg leading-5 text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Fact({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#09101a] p-3">
      <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm ${mono ? "font-mono" : "font-mono"} ${tone ?? "text-slate-200"}`}>{value}</p>
    </div>
  )
}

function ContractRow({ icon, label, id }: { icon: ReactNode; label: string; id: string }) {
  return (
    <a
      href={EXPLORER(id)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 transition hover:border-cyan-400/40"
    >
      <div className="flex items-center gap-3">
        <span className="text-cyan-300">{icon}</span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-300">{short(id, 18)}</p>
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
    </a>
  )
}

function PassportCardMini({
  cap,
  minted,
  verified,
}: {
  cap: string
  minted: MintedProof | null
  verified: boolean
}) {
  const status = verified ? "VERIFIED ON-CHAIN" : minted ? "PROVEN" : "EMPTY"
  const tone = verified ? "text-emerald-300" : minted ? "text-cyan-300" : "text-slate-500"
  return (
    <div className="rounded-[28px] border border-cyan-500/20 bg-gradient-to-br from-slate-950 to-[#06101c] p-5 shadow-[0_24px_80px_rgba(2,8,23,0.55)]">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-cyan-200">
          <KeyRound className="h-4 w-4" />
          <span className="font-pixel text-xs uppercase">Agent Passport</span>
        </div>
        <span className={`font-mono text-[11px] ${tone}`}>{status}</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <CardStat icon={<Cpu className="h-3.5 w-3.5" />} label="Agent" value={minted ? `#${minted.agentId}` : "—"} />
        <CardStat icon={<Coins className="h-3.5 w-3.5" />} label="Spend cap" value={`${fromStroops(cap)} XLM`} />
        <CardStat icon={<Fingerprint className="h-3.5 w-3.5" />} label="Nullifier" value={minted ? short(minted.nullifierHash, 10) : "—"} />
        <CardStat icon={<Activity className="h-3.5 w-3.5" />} label="Proof" value={minted ? `${minted.provingMs}ms` : "—"} />
      </div>
      <p className="mt-5 font-vt323 text-base leading-5 text-slate-400">
        Owner key &amp; real balance never leave the browser — only the proof and its four public inputs go on-chain.
      </p>
    </div>
  )
}

function CardStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-black/30 p-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 font-mono text-sm text-slate-200">{value}</p>
    </div>
  )
}
