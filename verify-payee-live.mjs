// End-to-end live verification of Indemnity's full product lifecycle,
// including both payable calls the bare `genlayer write` CLI can't make
// (underwrite, buy_coverage - no --value flag exists), run against the
// real Bradbury contract with real GEN.
//
// Runs: create_product -> underwrite (account A, "underwriter") ->
// buy_coverage (account B, "policyholder") -> wait for close_time ->
// check_trigger (real consensus against two live https:// sources) ->
// wait out the challenge window -> claim_coverage -> withdraw_underwriting.
// Reads A and B's real on-chain GEN balance before and after each payout
// to confirm value actually moved, the same rigor as the sibling
// projects' own verify-payee-live.mjs - a clean receipt is not proof of
// delivery (see genvm-manager#20 / docs/genlayer-emit-transfer-platform-bug
// if present in memory).
//
// Usage (PowerShell):
//   $env:PK = "0x<64-hex-char private key of account A, the UNDERWRITER>"
//   $env:PK2 = "0x<64-hex-char private key of account B, the POLICYHOLDER>"
//   node verify-payee-live.mjs
//
// Get both via: genlayer account export --name <account-name>
// (exports a keystore file; decrypt it yourself, this script never sees
// your password). Use small testnet amounts - this sends real GEN.

import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const CONTRACT = "0x08E74A12aB7328fF26622A6Ad6080f9c0a991FEe";
const PRODUCT_ID = "indm-e2e-" + Date.now();
const SOURCE_A = "https://raw.githubusercontent.com/2TheMoom/indemnity/main/test-data/source-a.json";
const SOURCE_B = "https://raw.githubusercontent.com/2TheMoom/indemnity/main/test-data/source-b.json";
const JSON_PATH = "delay_minutes"; // both sources serve 150
const THRESHOLD_SCALED = 100n * 100_000_000n; // trigger if delay_minutes >= 100
const TOLERANCE_BPS = 0;
const THRESHOLD_COUNT = 2;
const PREMIUM_BPS = 500; // 5%
const TARGET = 2_000_000_000_000_000n; // 0.002 GEN underwriting cap
const UNDERWRITE_VALUE = 2_000_000_000_000_000n; // 0.002 GEN, fills target exactly
const COVERAGE_AMOUNT = 1_000_000_000_000_000n; // 0.001 GEN of coverage
const PREMIUM_VALUE = (COVERAGE_AMOUNT * BigInt(PREMIUM_BPS)) / 10_000n;
const CLOSE_LEAD_SECONDS = 90; // underwriting window - short, for a fast test
const EXPIRY_LEAD_SECONDS = 3600;
const CHALLENGE_WINDOW_SECONDS = 600; // must match the contract constant

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Set $env:${name} first`);
  return v.startsWith("0x") ? v : "0x" + v;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitAccepted(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({ hash, retries: 200 });
  console.log(`  [${label}] status=${receipt.statusName} result=${receipt.resultName} exec=${receipt.txExecutionResultName}`);
  if (receipt.statusName !== "ACCEPTED" && receipt.statusName !== "FINALIZED") {
    throw new Error(`[${label}] Transaction not accepted: ${JSON.stringify(receipt)}`);
  }
  return receipt;
}

async function main() {
  const underwriterAccount = createAccount(need("PK"));
  const policyholderAccount = createAccount(need("PK2"));

  const underwriterClient = createClient({ chain: testnetBradbury, account: underwriterAccount });
  const policyholderClient = createClient({ chain: testnetBradbury, account: policyholderAccount });

  const underwriterAddr = underwriterAccount.address;
  const policyholderAddr = policyholderAccount.address;

  console.log(`Underwriter: ${underwriterAddr}`);
  console.log(`Policyholder: ${policyholderAddr}`);
  console.log(`Product: ${PRODUCT_ID}`);

  const now = Math.floor(Date.now() / 1000);
  const closeTime = now + CLOSE_LEAD_SECONDS;
  const expiry = now + EXPIRY_LEAD_SECONDS;

  console.log("\n1. create_product...");
  let hash = await underwriterClient.writeContract({
    address: CONTRACT,
    functionName: "create_product",
    args: [
      PRODUCT_ID,
      "E2E Verification Product",
      [SOURCE_A, SOURCE_B],
      JSON_PATH,
      ">=",
      Number(THRESHOLD_SCALED),
      TOLERANCE_BPS,
      THRESHOLD_COUNT,
      PREMIUM_BPS,
      Number(TARGET),
      closeTime,
      expiry,
    ],
  });
  await waitAccepted(underwriterClient, hash, "create_product");

  console.log("\n2. underwrite (payable, from account A)...");
  hash = await underwriterClient.writeContract({
    address: CONTRACT,
    functionName: "underwrite",
    args: [PRODUCT_ID],
    value: UNDERWRITE_VALUE,
  });
  await waitAccepted(underwriterClient, hash, "underwrite");

  console.log("\n3. buy_coverage (payable, from account B)...");
  hash = await policyholderClient.writeContract({
    address: CONTRACT,
    functionName: "buy_coverage",
    args: [PRODUCT_ID, Number(COVERAGE_AMOUNT)],
    value: PREMIUM_VALUE,
  });
  await waitAccepted(policyholderClient, hash, "buy_coverage");

  const waitForClose = closeTime - Math.floor(Date.now() / 1000) + 5;
  if (waitForClose > 0) {
    console.log(`\nWaiting ${waitForClose}s for underwriting to close...`);
    await sleep(waitForClose * 1000);
  }

  console.log("\n4. check_trigger (real consensus against the two live sources)...");
  hash = await underwriterClient.writeContract({
    address: CONTRACT,
    functionName: "check_trigger",
    args: [PRODUCT_ID],
  });
  await waitAccepted(underwriterClient, hash, "check_trigger");

  console.log(`\nWaiting ${CHALLENGE_WINDOW_SECONDS + 15}s for the challenge window to close...`);
  await sleep((CHALLENGE_WINDOW_SECONDS + 15) * 1000);

  const policyholderBalanceBefore = await underwriterClient.getBalance({ address: policyholderAddr });
  const underwriterBalanceBefore = await underwriterClient.getBalance({ address: underwriterAddr });
  console.log(`\nPolicyholder balance before claim: ${policyholderBalanceBefore} wei`);
  console.log(`Underwriter balance before withdrawal: ${underwriterBalanceBefore} wei`);

  console.log("\n5. claim_coverage (account B)...");
  hash = await policyholderClient.writeContract({
    address: CONTRACT,
    functionName: "claim_coverage",
    args: [PRODUCT_ID],
  });
  await waitAccepted(policyholderClient, hash, "claim_coverage");

  console.log("\n6. withdraw_underwriting (account A)...");
  hash = await underwriterClient.writeContract({
    address: CONTRACT,
    functionName: "withdraw_underwriting",
    args: [PRODUCT_ID],
  });
  await waitAccepted(underwriterClient, hash, "withdraw_underwriting");

  const policyholderBalanceAfter = await underwriterClient.getBalance({ address: policyholderAddr });
  const underwriterBalanceAfter = await underwriterClient.getBalance({ address: underwriterAddr });
  const claimDelta = policyholderBalanceAfter - policyholderBalanceBefore;
  const withdrawDelta = underwriterBalanceAfter - underwriterBalanceBefore;

  console.log(`\nPolicyholder balance after: ${policyholderBalanceAfter} wei (delta ${claimDelta}, expected ${COVERAGE_AMOUNT})`);
  console.log(`Underwriter balance after: ${underwriterBalanceAfter} wei (delta ${withdrawDelta}, expected up to ${UNDERWRITE_VALUE + PREMIUM_VALUE})`);

  const claimOk = claimDelta === COVERAGE_AMOUNT;
  const withdrawOk = withdrawDelta > 0n;

  console.log(claimOk
    ? "\n✔ CONFIRMED: claim_coverage delivered the exact coverage amount."
    : "\n✖ claim_coverage delta did not match expected coverage amount - investigate (could be the known delayed-delivery behavior; try retry_coverage_claim after a wait).");
  console.log(withdrawOk
    ? "✔ CONFIRMED: withdraw_underwriting delivered a positive payout."
    : "✖ withdraw_underwriting delivered no value - investigate (could be the known delayed-delivery behavior; try retry_underwriting_withdrawal after a wait).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
