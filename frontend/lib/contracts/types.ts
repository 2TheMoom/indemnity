export type ProductStatus = "open" | "triggered" | "disputed" | "expired";

export interface Product {
  creator: string;
  title: string;
  json_path: string;
  comparison_op: string;
  threshold_scaled: string;
  tolerance_bps: string;
  threshold_count: string;
  source_count: string;
  premium_bps: string;
  target: string;
  underwritten: string;
  coverage_sold: string;
  premium_pool: string;
  close_time: string;
  expiry: string;
  status: ProductStatus;
  triggered_at: string;
  dispute_reason: string;
  resolution_note: string;
  challenge_deadline: string;
}
