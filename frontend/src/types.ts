import type {
  InventoryItem,
  InventoryStage,
  LotInput,
  LotView,
} from "../../schemas/domain";

export type Modal =
  | { type: "lot"; lot: LotInput }
  | { type: "purchase"; lot: LotView }
  | { type: "sale"; item: InventoryItem }
  | { type: "inventory-notes"; item: InventoryItem; lot: LotView }
  | {
      type: "inventory-stage";
      item: InventoryItem;
      stage: InventoryStage;
      revision: number;
    }
  | null;
