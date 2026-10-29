// IPC contract: Rust backend/core/src/model.rs is authoritative. Money = cents; rates = basis points.
export interface Settings {
  capitalCents: number;
  lotCapCents: number;
  minProfitCents: number;
  minRoiBps: number;
}
export interface Costs {
  premiumBps: number;
  taxBps: number;
  paymentBps: number;
  inboundCents: number;
  travelCents: number;
  prepCents: number;
  sellingFeeBps: number;
  reserveBps: number;
  outboundCents: number;
  fixedSellingCents: number;
}
export interface Comparable {
  title: string;
  url: string;
  soldOn: string;
  priceCents: number;
  shippingCents: number;
  condition: string;
  sold: boolean;
  included: boolean;
}
export interface LotInput {
  id: string | null;
  title: string;
  url: string;
  source: string;
  category: string;
  location: string;
  endsAt: string;
  condition: string;
  notes: string;
  bidCents: number;
  estimateCents: number;
  costs: Costs;
  comparables: Comparable[];
}
export interface Breakdown {
  bidCents: number;
  premiumCents: number;
  taxCents: number;
  paymentCents: number;
  acquisitionCents: number;
  sellingFeeCents: number;
  reserveCents: number;
  totalCostCents: number;
  profitCents: number;
  roiBps: number | null;
}
export interface Analysis {
  saleCents: number;
  lowSaleCents: number;
  highSaleCents: number;
  soldCount: number;
  evidence: string;
  maxBidCents: number | null;
  meetsTargets: boolean;
  breakdown: Breakdown;
  lowProfitCents: number;
  highProfitCents: number;
  reasons: string[];
}
export interface LotView {
  input: LotInput;
  watched: boolean;
  updatedAt: string;
  acquired: boolean;
  analysis: Analysis;
}
export interface InventoryItem {
  id: string;
  lotId: string;
  title: string;
  acquisitionCents: number;
  purchasedAt: string;
  saleNetCents: number | null;
  soldAt: string | null;
}
export interface Snapshot {
  settings: Settings;
  lots: LotView[];
  inventory: InventoryItem[];
  availableCents: number;
  investedCents: number;
  realizedProfitCents: number;
  lifecycle: LifecycleState[];
  stageHistory: StageHistoryEntry[];
  revision: number;
  upgradeRecoveryPath: string | null;
}

export type InventoryStage =
  "unreviewed" | "needs_pickup" | "testing" | "ready_to_list" | "listed";
export interface LifecycleState {
  inventoryId: string;
  stage: InventoryStage;
}
export interface StageHistoryEntry {
  auditId: number;
  inventoryId: string;
  fromStage: InventoryStage;
  toStage: InventoryStage;
  createdAt: string;
}

export interface BackupPreview {
  lotCount: number;
  inventoryCount: number;
  soldCount: number;
  auditCount: number;
  availableCents: number;
  currentRevision: number;
  sourceFormatVersion: number;
  stagesResetToUnreviewed: boolean;
}

export interface RestoreResult {
  snapshot: Snapshot;
  recoveryPath: string;
}
