# Indemnity
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/license/mit/)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/8Jm4v89VAu)
[![Telegram](https://img.shields.io/badge/Telegram--T.svg?style=social&logo=telegram)](https://t.me/genlayer)
[![Twitter](https://img.shields.io/twitter/url/https/twitter.com/yeagerai.svg?style=social&label=Follow%20%40GenLayer)](https://x.com/GenLayer)

## About
Indemnity is a **parametric insurance exchange**. A creator defines a
trigger against 2-5 independent sources and a JSON path pulled from each -
reusing [Concord](https://github.com/2TheMoom/concord)'s own N-of-M
equivalence oracle directly: numeric readings cluster by a tolerance in
basis points, strings by exact match, and the largest cluster wins only if
enough sources agree. Underwriters stake GEN against that trigger up to a
target cap; policyholders pay a premium (a percentage of the coverage
amount) to buy coverage, capped at however much capital is actually
underwritten so a claim is always fully payable. No LLM on the common
path.

`check_trigger(product_id)` - once the product's underwriting window has
closed - runs the consensus check; a quorum miss or an unmet comparison
reverts cleanly and can be retried. A trigger isn't the same as being
right, so an underwriter (the party who loses capital if it stands) gets a
10-minute window to dispute it with a reason; only a genuine dispute
escalates to `gl.nondet.exec_prompt`, re-fetching all sources and weighing
the objection against them, and only the verdict is consensus-critical.
`resolve_stale_dispute(product_id)` is the backstop for a dispute nobody
resolves: it settles at the *pre-dispute* trigger standing, not a reversion
to "open" - defaulting to "open" would let a disputing underwriter dispute
a correct trigger and win by outlasting adjudication for free, the same
anti-stalling fix applied to this account's Waypoint and Tote after their
own steward review.

Once settled, `claim_coverage(product_id)` pays each policyholder their
own purchased amount, and `withdraw_underwriting(product_id)` pays each
underwriter their stake's pro-rata share of whatever capital wasn't
claimed plus the collected premium pool - at a trigger, or at `expire()`
if the window closed with no trigger ever confirmed.

**Payouts go through `Payee`/`gl.evm.contract_interface`
(`Payee(recipient).emit_transfer(value=amount)`), not
`gl.get_contract_at()`.** `gl.get_contract_at()` is GenVM's internal
Intelligent-Contract-to-Intelligent-Contract dispatch - there's nowhere
for it to land at a plain EOA wallet, which is what every policyholder
and underwriter here is. `gl.evm.contract_interface` is the documented
chain-layer path for moving value to an arbitrary address, confirmed
against GenLayer's own current docs and consistent with this account's
Waypoint/Tote/Salvage Arbiter/AgentEscrow fix.

**Fund-safety fix (2026-10-05).** The `pending_payouts`/`pending_floor`
retry mechanism below had two real bugs, the same ones a steward caught
on Tote and Waypoint's resubmissions: (1) the "already delivered" branch
cleared `pending_payouts` and then raised - raising reverts the *entire*
call, so that clear never actually persisted, leaving the exact same
balance check exploitable forever; fixed by returning normally on that
path instead of raising. (2) the balance check alone has no cap - if the
recipient's balance later drops back below the floor (they spend or
transfer funds), the same "not yet delivered" branch fires again,
unboundedly; fixed with a `retry_count` map and a fixed `MAX_RETRIES = 3`,
checked before any resend. `test_retry_*_clears_cleanly_once_balance_
confirms_delivery` and `test_retry_*_bounded_by_max_retries` cover both
fixes directly. 46 tests pass, lint clean, 19,850 bytes. Redeployed:
`0x34af8351543874Ec973316322556eB6552e63a92`.

**Architecture fix (2026-10-07).** A steward review found the balance-
floor retry above still unsound in both directions: a delayed balance
update can cause a duplicate transfer, and an unrelated balance rise can
wrongly mark a transfer "delivered" that never landed - GenVM exposes no
other signal to confirm delivery. Replaced entirely with a blind,
`MAX_RETRIES`-bounded retry restricted to the actual beneficiary
(`gl.message.sender_address != recipient` reverts), with no balance
inspection at all. Same review flagged the `sources` oracle trust
boundary: a caller could supply every "independent" source from
infrastructure they control, making the N-of-M consensus meaningless.
Fixed with two structural checks in `create_product`: every source must
resolve to a distinct hostname, and `threshold_count` must be a strict
majority (`len(sources)//2 + 1`) rather than any fixed minimum. 50 tests
pass, lint clean, 19,660 bytes. Redeployed:
`0xe39051CACB7BE38f32B1C06e850A65EfDFc4581A`. The demo product was
recreated with sources on two genuinely distinct hosts
(`raw.githubusercontent.com` and `indemnity-frontend.vercel.app`),
live-verified 5/5 AGREE via `get_product`/`get_sources`.

## Live deployment
Deployed on **GenLayer Bradbury Testnet** (chain ID 4221):
- **Contract:** [`0x34af8351543874Ec973316322556eB6552e63a92`](https://explorer-bradbury.genlayer.com/address/0x34af8351543874Ec973316322556eB6552e63a92)
- **Frontend:** https://indemnity-frontend.vercel.app
- Verified via 44 passing direct-mode tests (`python -m pytest tests/direct/`),
  covering product creation and its full validation surface, underwriting
  (accumulation, the target cap, the close-time cutoff), coverage purchases
  (exact-premium enforcement, the can't-oversell-past-underwritten-capital
  guard), the consensus trigger check (quorum, outlier tolerance, the
  comparison itself - including a real double-scaling bug this suite
  caught before deploy), the full dispute lifecycle (challenge, uphold,
  overturn, permissionless resolution, the prompt's untrusted-input
  quarantine, and the stale-dispute anti-stalling fallback), `expire()`,
  both claim paths (coverage and pro-rata underwriting withdrawal,
  including the double-claim and nothing-to-claim guards), and the
  balance-floor-checked retry on both payout sites.
- Payouts go through `Payee`/`gl.evm.contract_interface`, not
  `gl.get_contract_at()` - the latter is an internal GenVM message with
  nowhere valid to land at a plain EOA wallet. Live-verified with a real
  `create_product` write via the bare `genlayer write` CLI (no `value:`
  attached, since that call isn't payable) - read back via `get_product`
  and every field matched exactly.

## What's included
- `contracts/indemnity.py` — the Indemnity Intelligent Contract
- `tests/direct/test_indemnity.py` — direct-mode tests (in-memory, mocked web/LLM)
- Configuration file template and deployment scripts

No frontend yet - a UI mockup exists as a design artifact, not built into code this session.

## Requirements
- Python >= 3.12
- [GenLayer CLI](https://github.com/genlayerlabs/genlayer-cli) globally installed: `npm install -g genlayer`
- GenLayer Studio (for integration tests and deployment): Install from [Docs](https://docs.genlayer.com/developers/intelligent-contracts/tooling-setup#using-the-genlayer-studio) or use the hosted [GenLayer Studio](https://studio.genlayer.com/)

## Project Structure

```
contracts/              # Python intelligent contracts
  indemnity.py             # Indemnity
tests/
  direct/                 # Fast in-memory tests (no Studio required)
    test_indemnity.py
deploy/                 # TypeScript deployment scripts
gltest.config.yaml       # Test runner network configuration
pyproject.toml           # Python/pytest configuration
```

## Quick Start

### 1. Set up Python environment

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Lint the contract

```shell
genvm-lint check contracts/indemnity.py
```

### 3. Run direct mode tests

```shell
python -m pytest tests/direct/ -v
```

Use `python -m pytest`, not bare `pytest` - depending on your installed
pytest version, running the bare command can fail to put the project
root on `sys.path`, breaking test discovery with
`ModuleNotFoundError: No module named 'tests'`.

### 4. Deploy the contract

1. Choose your network: `genlayer network`
2. Deploy: `genlayer deploy` (runs the script in `/deploy/deployScript.ts`)

## How Indemnity Works

1. **`create_product(...)`** — opens a product: 2-5 sources, a JSON path,
   a comparison operator and scaled threshold, a tolerance and agreement
   count for the consensus check, a premium rate, an underwriting target,
   and when underwriting/buying closes and the product expires.
2. **`underwrite(product_id)`** — payable. Anyone can back a product up to
   its target before `close_time`.
3. **`buy_coverage(product_id, amount)`** — payable with the exact premium
   for the requested coverage amount, capped at underwritten capital.
4. **`check_trigger(product_id)`** — permissionless, deterministic once
   `close_time` passes. Quorum-not-reached or comparison-not-met reverts
   cleanly for a retry.
5. **`challenge(product_id, reason)`** — an underwriter in the product,
   within a 10-minute window after a trigger.
6. **`resolve_dispute(product_id)`** — permissionless. Re-fetches every
   source and weighs the objection via `gl.nondet.exec_prompt`; uphold
   keeps the trigger, overturn reverts to `open`.
7. **`resolve_stale_dispute(product_id)`** — permissionless backstop 24
   hours past an unresolved dispute: settles at the pre-dispute trigger.
8. **`expire(product_id)`** — permissionless, once `expiry` passes with no
   trigger ever confirmed.
9. **`claim_coverage(product_id)`** — a policyholder claims their own
   purchased coverage once a trigger has settled past its challenge window.
10. **`withdraw_underwriting(product_id)`** — an underwriter claims their
    stake's pro-rata share of unclaimed capital plus the premium pool,
    once triggered-and-settled or expired.
11. **`get_product`** / **`get_all_product_ids`** / **`get_sources`** /
    **`get_underwriting`** / **`get_coverage`** / **`has_withdrawn`** /
    **`has_claimed_coverage`** / **`get_underwriters`** /
    **`get_policyholders`** — read back a product's full state, its
    sources, and a wallet's position.

## Testing Strategy

| Test Type | Command | Speed | Requires Studio |
|-----------|---------|-------|-----------------|
| **Lint** | `genvm-lint check contracts/indemnity.py` | ~250ms | No |
| **Direct** | `python -m pytest tests/direct/ -v` | ~ms/test | No |

## Community
- **[Discord](https://discord.gg/8Jm4v89VAu)**: Discussions, support, and announcements
- **[Telegram](https://t.me/genlayer)**: Informal chats and quick updates

## Documentation
For detailed information, see our [documentation](https://docs.genlayer.com/).

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
