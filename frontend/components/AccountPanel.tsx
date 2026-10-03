"use client";

import { useState } from "react";
import { useWallet } from "@/lib/genlayer/wallet";
import { GENLAYER_NETWORK } from "@/lib/genlayer/client";
import { error, userRejected } from "@/lib/utils/toast";

const METAMASK_INSTALL_URL = "https://metamask.io/download/";

function SeqRow({ k, v, tone = "indigo" }: { k: string; v: string; tone?: "indigo" | "rust" | "faint" }) {
  const color = tone === "indigo" ? "var(--indigo-bright)" : tone === "rust" ? "var(--rust)" : "var(--ink-faint)";
  return (
    <div className="grid gap-2.5 items-baseline" style={{ gridTemplateColumns: "76px 1fr" }}>
      <span className="font-mono text-[0.64rem] tracking-[0.08em]" style={{ color: "var(--ink-faint)" }}>{k}</span>
      <span
        className="font-mono text-[0.72rem] pb-2"
        style={{ color, borderBottom: "1px dotted var(--border)" }}
      >
        {v}
      </span>
    </div>
  );
}

export function AccountPanel() {
  const {
    address, isConnected, isMetaMaskInstalled, isOnCorrectNetwork, isLoading,
    connectWallet, disconnectWallet, switchWalletAccount,
  } = useWallet();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleConnect = async () => {
    if (!isMetaMaskInstalled) return;
    try {
      setIsConnecting(true);
      await connectWallet();
    } catch (err: any) {
      if (err.message?.includes("rejected")) {
        userRejected("Connection cancelled");
      } else {
        error("Failed to connect wallet", { description: err.message || "Check your MetaMask and try again." });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      setIsSwitching(true);
      await switchWalletAccount();
    } catch (err: any) {
      if (!err.message?.includes("rejected")) {
        error("Failed to switch account", { description: err.message || "Please try again." });
      } else {
        userRejected("Account switch cancelled");
      }
    } finally {
      setIsSwitching(false);
    }
  };

  const walletLabel = isMetaMaskInstalled ? "MetaMask detected" : "Not found";
  const walletTone = isMetaMaskInstalled ? "indigo" : "rust";
  const networkLabel = !isConnected
    ? "Not connected"
    : isOnCorrectNetwork
      ? `${GENLAYER_NETWORK.chainName.replace(/^GenLayer\s+/i, "")} ✓`
      : "Wrong network";
  const networkTone = !isConnected ? "faint" : isOnCorrectNetwork ? "indigo" : "rust";
  const addressLabel = isConnected && address ? `0x${address.slice(2, 6)}…${address.slice(-4)}` : "—";
  const addressTone = isConnected ? "indigo" : "faint";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsPanelOpen((v) => !v)}
        disabled={isLoading}
        className="wallet-chip"
      >
        <span className={`mark-dot ${isConnected ? "" : "off"}`} />
        {isConnected && address ? `0x${address.slice(2, 6)}…${address.slice(-4)}` : "Connect Wallet"}
      </button>

      {isPanelOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsPanelOpen(false)} />
          <div
            className="fixed left-4 right-4 sm:left-auto sm:right-5 top-[86px] z-50 sm:w-[300px] p-5 rounded-xl"
            style={{ background: "var(--card)", border: "1px solid var(--border-bright)" }}
          >
            <div className="eyebrow mb-4">Wallet</div>

            <div className="flex flex-col gap-2.5 mb-5">
              <SeqRow k="PROVIDER" v={walletLabel} tone={walletTone as any} />
              <SeqRow k="NETWORK" v={networkLabel} tone={networkTone as any} />
              <SeqRow k="ADDRESS" v={addressLabel} tone={addressTone as any} />
            </div>

            <div className="flex flex-col gap-2">
              {!isMetaMaskInstalled && (
                <button type="button" onClick={() => window.open(METAMASK_INSTALL_URL, "_blank")} className="btn-indm solid w-full">
                  Install MetaMask
                </button>
              )}
              {isMetaMaskInstalled && !isConnected && (
                <button type="button" onClick={handleConnect} disabled={isConnecting} className="btn-indm solid w-full">
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              )}
              {isConnected && (
                <>
                  <button type="button" onClick={handleSwitchAccount} disabled={isSwitching} className="btn-indm ghost w-full">
                    {isSwitching ? "Switching…" : "Switch Account"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { disconnectWallet(); setIsPanelOpen(false); }}
                    className="btn-indm danger w-full"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
