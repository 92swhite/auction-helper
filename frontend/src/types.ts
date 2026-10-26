import type { InventoryItem, LotInput, LotView } from "../../schemas/domain";

export type Modal =
  | { type: "lot"; lot: LotInput }
  | { type: "purchase"; lot: LotView }
  | { type: "sale"; item: InventoryItem }
  | null;
