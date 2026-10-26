import type { LotInput } from "../../schemas/domain";
export function emptyLot(): LotInput {
  return {
    id: null,
    title: "",
    url: "",
    source: "Manual",
    category: "Electronics",
    location: "Commerce City, CO",
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    condition: "Unverified",
    notes: "",
    bidCents: 0,
    estimateCents: 0,
    costs: {
      premiumBps: 0,
      taxBps: 0,
      paymentBps: 0,
      inboundCents: 0,
      travelCents: 0,
      prepCents: 0,
      sellingFeeBps: 0,
      reserveBps: 500,
      outboundCents: 0,
      fixedSellingCents: 0,
    },
    comparables: [],
  };
}
export function samples(): LotInput[] {
  return [
    ["Sony WH-1000XM4 headphones", "Electronics", 4500, 18000, 3],
    ["DeWalt 20V drill & driver kit", "Tools", 6000, 21000, 18],
    ["Nintendo Switch OLED bundle", "Gaming", 16000, 28000, 28],
  ].map(([title, category, bid, resale, hours], i) => ({
    ...emptyLot(),
    title: `DEMO · ${title}`,
    category: String(category),
    source: "Demo / fictional",
    url: "https://example.com/auction-demo",
    bidCents: Number(bid),
    estimateCents: Number(resale),
    location: ["Denver, CO", "Aurora, CO", "Commerce City, CO"][i],
    endsAt: new Date(Date.now() + Number(hours) * 3600000).toISOString(),
    notes:
      "Fictional example for exploring the app. Prices and fees are illustrative, not live auction data.",
    costs: {
      ...emptyLot().costs,
      premiumBps: 1300,
      taxBps: 900,
      sellingFeeBps: 1300,
      travelCents: 800,
      prepCents: 500,
      outboundCents: 1200,
    },
  }));
}
