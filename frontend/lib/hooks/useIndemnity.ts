"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Indemnity from "../contracts/Indemnity";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import { success, error, configError } from "../utils/toast";
import type { Product } from "../contracts/types";

export function useIndemnityContract(): Indemnity | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const rpcUrl = getStudioUrl();

  const contract = useMemo(() => {
    if (!contractAddress) {
      configError(
        "Setup Required",
        "Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.",
        { label: "Setup Guide", onClick: () => window.open("/docs/setup", "_blank") }
      );
      return null;
    }
    return new Indemnity(contractAddress, address, rpcUrl);
  }, [contractAddress, address, rpcUrl]);

  return contract;
}

export function useProduct(productId: string) {
  const contract = useIndemnityContract();

  return useQuery<Product | null, Error>({
    queryKey: ["product", productId],
    queryFn: () => (contract ? contract.getProduct(productId) : Promise.resolve(null)),
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract && !!productId,
  });
}

export function useAllProductIds() {
  const contract = useIndemnityContract();

  return useQuery<string[], Error>({
    queryKey: ["productIds"],
    queryFn: () => (contract ? contract.getAllProductIds() : Promise.resolve([])),
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

export function useProductList() {
  const contract = useIndemnityContract();
  const idsQuery = useAllProductIds();

  const listQuery = useQuery<Array<{ id: string; product: Product }>, Error>({
    queryKey: ["productList", idsQuery.data],
    queryFn: async () => {
      if (!contract || !idsQuery.data) return [];
      const results = await Promise.all(
        idsQuery.data.map(async (id) => ({ id, product: await contract.getProduct(id) }))
      );
      return results.filter((r): r is { id: string; product: Product } => r.product !== null);
    },
    enabled: !!contract && !!idsQuery.data,
    staleTime: 2000,
  });

  return { ...listQuery, isLoading: idsQuery.isLoading || listQuery.isLoading };
}

export function useSources(productId: string) {
  const contract = useIndemnityContract();

  return useQuery<string[], Error>({
    queryKey: ["sources", productId],
    queryFn: () => (contract ? contract.getSources(productId) : Promise.resolve([])),
    staleTime: 60_000,
    enabled: !!contract && !!productId,
  });
}

export function useMyUnderwriting(productId: string) {
  const contract = useIndemnityContract();
  const { address } = useWallet();

  return useQuery<string, Error>({
    queryKey: ["underwriting", productId, address],
    queryFn: () => (contract && address ? contract.getUnderwriting(productId, address) : Promise.resolve("0")),
    staleTime: 2000,
    enabled: !!contract && !!productId && !!address,
  });
}

export function useMyCoverage(productId: string) {
  const contract = useIndemnityContract();
  const { address } = useWallet();

  return useQuery<string, Error>({
    queryKey: ["coverage", productId, address],
    queryFn: () => (contract && address ? contract.getCoverage(productId, address) : Promise.resolve("0")),
    staleTime: 2000,
    enabled: !!contract && !!productId && !!address,
  });
}

function useWriteAction<TArgs>(
  action: (contract: Indemnity, args: TArgs, feePreset: any, onSubmitted: (h: string) => void) => Promise<string>,
  successMessage: { title: string; description: string },
  errorTitle: string,
  getProductId: (args: TArgs) => string
) {
  const contract = useIndemnityContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (args: TArgs) => {
      if (!contract) throw new Error("Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.");
      if (!address) throw new Error("Wallet not connected. Please connect your wallet first.");
      setIsPending(true);
      setPendingTxHash(null);
      return action(contract, args, undefined, setPendingTxHash);
    },
    onSuccess: (_data, args) => {
      const productId = getProductId(args);
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      queryClient.invalidateQueries({ queryKey: ["productIds"] });
      queryClient.invalidateQueries({ queryKey: ["productList"] });
      queryClient.invalidateQueries({ queryKey: ["underwriting", productId] });
      queryClient.invalidateQueries({ queryKey: ["coverage", productId] });
      setIsPending(false);
      success(successMessage.title, { description: successMessage.description });
    },
    onError: (err: any) => {
      console.error(errorTitle, err);
      setIsPending(false);
      error(errorTitle, { description: err?.message || "Please try again." });
    },
  });

  return {
    ...mutation,
    isPending,
    pendingTxHash,
    clearPendingTx: () => setPendingTxHash(null),
    run: mutation.mutate,
  };
}

export interface CreateProductArgs {
  id: string;
  title: string;
  sources: string[];
  jsonPath: string;
  comparisonOp: string;
  thresholdScaled: number;
  toleranceBps: number;
  thresholdCount: number;
  premiumBps: number;
  target: number;
  closeTime: number;
  expiry: number;
}

export function useCreateProduct() {
  return useWriteAction<CreateProductArgs>(
    (c, a, fee, cb) => c.createProduct(
      a.id, a.title, a.sources, a.jsonPath, a.comparisonOp, a.thresholdScaled,
      a.toleranceBps, a.thresholdCount, a.premiumBps, a.target, a.closeTime, a.expiry, fee, cb
    ),
    { title: "Product created", description: "The coverage product is live on-chain." },
    "Failed to create product",
    (a) => a.id
  );
}

export function useUnderwrite() {
  return useWriteAction<{ id: string; amountWei: bigint }>(
    (c, a, fee, cb) => c.underwrite(a.id, a.amountWei, fee, cb),
    { title: "Underwritten", description: "Your capital is staked against the trigger." },
    "Failed to underwrite",
    (a) => a.id
  );
}

export function useBuyCoverage() {
  return useWriteAction<{ id: string; amount: number; premiumWei: bigint }>(
    (c, a, fee, cb) => c.buyCoverage(a.id, a.amount, a.premiumWei, fee, cb),
    { title: "Coverage purchased", description: "You're covered if the trigger fires." },
    "Failed to buy coverage",
    (a) => a.id
  );
}

export function useCheckTrigger() {
  return useWriteAction<{ id: string }>(
    (c, a, fee, cb) => c.checkTrigger(a.id, fee, cb),
    { title: "Trigger checked", description: "Validators reached consensus on the live data." },
    "Trigger check failed",
    (a) => a.id
  );
}

export function useChallenge() {
  return useWriteAction<{ id: string; reason: string }>(
    (c, a, fee, cb) => c.challenge(a.id, a.reason, fee, cb),
    { title: "Challenge filed", description: "Escalated for reasoned review." },
    "Failed to challenge",
    (a) => a.id
  );
}

export function useResolveDispute() {
  return useWriteAction<{ id: string }>(
    (c, a, fee, cb) => c.resolveDispute(a.id, fee, cb),
    { title: "Dispute resolved", description: "Validators reached a verdict." },
    "Failed to resolve dispute",
    (a) => a.id
  );
}

export function useResolveStaleDispute() {
  return useWriteAction<{ id: string }>(
    (c, a, fee, cb) => c.resolveStaleDispute(a.id, fee, cb),
    { title: "Dispute settled", description: "Settled at the pre-dispute trigger after the stale window." },
    "Failed to settle dispute",
    (a) => a.id
  );
}

export function useExpireProduct() {
  return useWriteAction<{ id: string }>(
    (c, a, fee, cb) => c.expire(a.id, fee, cb),
    { title: "Expired", description: "Marked expired - underwriters can withdraw their capital." },
    "Failed to expire",
    (a) => a.id
  );
}

export function useClaimCoverage() {
  return useWriteAction<{ id: string }>(
    (c, a, fee, cb) => c.claimCoverage(a.id, fee, cb),
    { title: "Coverage claimed", description: "Payout submitted to your wallet." },
    "Failed to claim coverage",
    (a) => a.id
  );
}

export function useWithdrawUnderwriting() {
  return useWriteAction<{ id: string }>(
    (c, a, fee, cb) => c.withdrawUnderwriting(a.id, fee, cb),
    { title: "Withdrawn", description: "Your share of the pool was submitted to your wallet." },
    "Failed to withdraw",
    (a) => a.id
  );
}

export function useRetryCoverageClaim() {
  return useWriteAction<{ id: string }>(
    (c, a, fee, cb) => c.retryCoverageClaim(a.id, fee, cb),
    { title: "Retry submitted", description: "Retried your own pending payout." },
    "Retry failed",
    (a) => a.id
  );
}

export function useRetryUnderwritingWithdrawal() {
  return useWriteAction<{ id: string }>(
    (c, a, fee, cb) => c.retryUnderwritingWithdrawal(a.id, fee, cb),
    { title: "Retry submitted", description: "Retried your own pending payout." },
    "Retry failed",
    (a) => a.id
  );
}
