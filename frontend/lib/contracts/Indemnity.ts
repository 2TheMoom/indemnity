import { createClient } from "genlayer-js";
import { getGenLayerChain } from "../genlayer/chains";
import type { Product } from "./types";
import {
  estimateWriteFeePreset,
  feePresetToTransactionFees,
  type FeePresetEstimate,
  type FeePresetLevel,
} from "../genlayer/fees";

/**
 * genlayer-js decodes Python dicts (and dataclasses) as JS Map instances,
 * keyed by field name. This flattens one level of the Map into a plain
 * object.
 */
function toPlainObject(raw: any): Record<string, any> {
  const entries = raw instanceof Map ? Array.from(raw.entries()) : Object.entries(raw ?? {});
  const obj: Record<string, any> = {};
  for (const [key, value] of entries) {
    obj[key] = value;
  }
  return obj;
}

function decodeProduct(raw: any): Product {
  const obj = toPlainObject(raw);
  return {
    creator: String(obj.creator ?? ""),
    title: String(obj.title ?? ""),
    json_path: String(obj.json_path ?? ""),
    comparison_op: String(obj.comparison_op ?? ""),
    threshold_scaled: String(obj.threshold_scaled ?? "0"),
    tolerance_bps: String(obj.tolerance_bps ?? "0"),
    threshold_count: String(obj.threshold_count ?? "0"),
    source_count: String(obj.source_count ?? "0"),
    premium_bps: String(obj.premium_bps ?? "0"),
    target: String(obj.target ?? "0"),
    underwritten: String(obj.underwritten ?? "0"),
    coverage_sold: String(obj.coverage_sold ?? "0"),
    premium_pool: String(obj.premium_pool ?? "0"),
    close_time: String(obj.close_time ?? "0"),
    expiry: String(obj.expiry ?? "0"),
    status: String(obj.status ?? "open") as Product["status"],
    triggered_at: String(obj.triggered_at ?? "0"),
    dispute_reason: String(obj.dispute_reason ?? ""),
    resolution_note: String(obj.resolution_note ?? ""),
    challenge_deadline: String(obj.challenge_deadline ?? "0"),
  };
}

/**
 * Indemnity contract class - a parametric insurance exchange. underwrite
 * and buy_coverage are the only payable writes; every other write only
 * moves a product between states or pays out what's already on record.
 */
class Indemnity {
  private contractAddress: `0x${string}`;
  private client: any;
  private rpcUrl?: string;

  constructor(contractAddress: string, address?: string | null, rpcUrl?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.rpcUrl = rpcUrl;

    const config: any = { chain: getGenLayerChain() };
    if (address) config.account = address as `0x${string}`;
    if (rpcUrl) config.endpoint = rpcUrl;

    this.client = createClient(config);
  }

  updateAccount(address: string): void {
    const config: any = { chain: getGenLayerChain(), account: address as `0x${string}` };
    if (this.rpcUrl) config.endpoint = this.rpcUrl;
    this.client = createClient(config);
  }

  private async estimateFees(
    functionName: string,
    args: unknown[],
    level: FeePresetLevel = "standard"
  ): Promise<FeePresetEstimate | undefined> {
    return estimateWriteFeePreset(this.client, { address: this.contractAddress, functionName, args }, level);
  }

  // -- views --

  async getProduct(productId: string): Promise<Product | null> {
    try {
      const result = await this.client.readContract({
        address: this.contractAddress, functionName: "get_product", args: [productId],
      });
      return decodeProduct(result);
    } catch {
      return null;
    }
  }

  async getAllProductIds(): Promise<string[]> {
    const result: any = await this.client.readContract({
      address: this.contractAddress, functionName: "get_all_product_ids", args: [],
    });
    return Array.isArray(result) ? result.map(String) : [];
  }

  async getSources(productId: string): Promise<string[]> {
    const result: any = await this.client.readContract({
      address: this.contractAddress, functionName: "get_sources", args: [productId],
    });
    return Array.isArray(result) ? result.map(String) : [];
  }

  async getUnderwriting(productId: string, wallet: string): Promise<string> {
    const result: any = await this.client.readContract({
      address: this.contractAddress, functionName: "get_underwriting", args: [productId, wallet],
    });
    return String(result ?? "0");
  }

  async getCoverage(productId: string, wallet: string): Promise<string> {
    const result: any = await this.client.readContract({
      address: this.contractAddress, functionName: "get_coverage", args: [productId, wallet],
    });
    return String(result ?? "0");
  }

  async hasWithdrawn(productId: string, wallet: string): Promise<boolean> {
    return Boolean(await this.client.readContract({
      address: this.contractAddress, functionName: "has_withdrawn", args: [productId, wallet],
    }));
  }

  async hasClaimedCoverage(productId: string, wallet: string): Promise<boolean> {
    return Boolean(await this.client.readContract({
      address: this.contractAddress, functionName: "has_claimed_coverage", args: [productId, wallet],
    }));
  }

  async getUnderwriters(productId: string): Promise<string[]> {
    const result: any = await this.client.readContract({
      address: this.contractAddress, functionName: "get_underwriters", args: [productId],
    });
    return Array.isArray(result) ? result.map(String) : [];
  }

  async getPolicyholders(productId: string): Promise<string[]> {
    const result: any = await this.client.readContract({
      address: this.contractAddress, functionName: "get_policyholders", args: [productId],
    });
    return Array.isArray(result) ? result.map(String) : [];
  }

  // -- writes --

  private async submitWrite(
    functionName: string,
    args: unknown[],
    feePreset?: FeePresetEstimate,
    onSubmitted?: (txHash: string) => void,
    value: bigint = BigInt(0)
  ): Promise<string> {
    const fees = feePresetToTransactionFees(feePreset);
    let txHash: string;
    try {
      txHash = await this.client.writeContract({
        address: this.contractAddress,
        functionName,
        args,
        value,
        ...(fees ? { fees } : {}),
      });
    } catch (error) {
      console.error(`Error calling ${functionName}:`, error);
      throw new Error(`Failed to submit the ${functionName} transaction. Please try again.`);
    }

    onSubmitted?.(txHash);

    try {
      await this.client.waitForTransactionReceipt({ hash: txHash, status: "ACCEPTED" as any, retries: 40, interval: 5000 });
      return txHash;
    } catch (error) {
      console.error(`Error confirming ${functionName} transaction:`, error);
      throw new Error(
        `Transaction ${txHash} was submitted but confirmation timed out. It may still complete - check the explorer.`
      );
    }
  }

  async estimateCreateProductFees(
    productId: string, title: string, sources: string[], jsonPath: string, comparisonOp: string,
    thresholdScaled: number, toleranceBps: number, thresholdCount: number, premiumBps: number,
    target: number, closeTime: number, expiry: number, level: FeePresetLevel = "standard"
  ) {
    return this.estimateFees("create_product", [
      productId, title, sources, jsonPath, comparisonOp, thresholdScaled, toleranceBps,
      thresholdCount, premiumBps, target, closeTime, expiry,
    ], level);
  }

  async createProduct(
    productId: string, title: string, sources: string[], jsonPath: string, comparisonOp: string,
    thresholdScaled: number, toleranceBps: number, thresholdCount: number, premiumBps: number,
    target: number, closeTime: number, expiry: number,
    feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void
  ) {
    return this.submitWrite("create_product", [
      productId, title, sources, jsonPath, comparisonOp, thresholdScaled, toleranceBps,
      thresholdCount, premiumBps, target, closeTime, expiry,
    ], feePreset, onSubmitted);
  }

  async estimateUnderwriteFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("underwrite", [productId], level);
  }

  async underwrite(productId: string, amountWei: bigint, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("underwrite", [productId], feePreset, onSubmitted, amountWei);
  }

  async estimateBuyCoverageFees(productId: string, amount: number, level: FeePresetLevel = "standard") {
    return this.estimateFees("buy_coverage", [productId, amount], level);
  }

  async buyCoverage(productId: string, amount: number, premiumWei: bigint, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("buy_coverage", [productId, amount], feePreset, onSubmitted, premiumWei);
  }

  async estimateCheckTriggerFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("check_trigger", [productId], level);
  }

  async checkTrigger(productId: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("check_trigger", [productId], feePreset, onSubmitted);
  }

  async estimateChallengeFees(productId: string, reason: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("challenge", [productId, reason], level);
  }

  async challenge(productId: string, reason: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("challenge", [productId, reason], feePreset, onSubmitted);
  }

  async estimateResolveDisputeFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("resolve_dispute", [productId], level);
  }

  async resolveDispute(productId: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("resolve_dispute", [productId], feePreset, onSubmitted);
  }

  async estimateResolveStaleDisputeFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("resolve_stale_dispute", [productId], level);
  }

  async resolveStaleDispute(productId: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("resolve_stale_dispute", [productId], feePreset, onSubmitted);
  }

  async estimateExpireFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("expire", [productId], level);
  }

  async expire(productId: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("expire", [productId], feePreset, onSubmitted);
  }

  async estimateClaimCoverageFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("claim_coverage", [productId], level);
  }

  async claimCoverage(productId: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("claim_coverage", [productId], feePreset, onSubmitted);
  }

  async estimateWithdrawUnderwritingFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("withdraw_underwriting", [productId], level);
  }

  async withdrawUnderwriting(productId: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("withdraw_underwriting", [productId], feePreset, onSubmitted);
  }

  async estimateRetryCoverageClaimFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("retry_coverage_claim", [productId], level);
  }

  async retryCoverageClaim(productId: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("retry_coverage_claim", [productId], feePreset, onSubmitted);
  }

  async estimateRetryUnderwritingWithdrawalFees(productId: string, level: FeePresetLevel = "standard") {
    return this.estimateFees("retry_underwriting_withdrawal", [productId], level);
  }

  async retryUnderwritingWithdrawal(productId: string, feePreset?: FeePresetEstimate, onSubmitted?: (txHash: string) => void) {
    return this.submitWrite("retry_underwriting_withdrawal", [productId], feePreset, onSubmitted);
  }
}

export default Indemnity;
