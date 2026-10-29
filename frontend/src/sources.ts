// Documentation records, not account grants or switches that enable adapters.
// Changes to provider access must be reviewed with the integration itself.
type Reference = { title: string; url: string };
type Source = {
  id: string;
  name: string;
  auctionLabel?: string;
  workflow: string;
  accessReview: string;
  checkedOn: string | null;
  references: Reference[];
};

export const sources: readonly Source[] = [
  {
    id: "manual",
    name: "Manual / other auctions",
    auctionLabel: "Manual",
    workflow: "Enter a source link, observed bid, deadline and costs yourself.",
    accessReview:
      "Check the original source and your right to use its information. No provider access has been verified by this app.",
    checkedOn: null,
    references: [],
  },
  {
    id: "dickensheet",
    name: "Dickensheet",
    auctionLabel: "Dickensheet",
    workflow:
      "Enter auction details manually and review the individual sale terms.",
    accessReview:
      "The public auction terms were reviewed. They do not establish an automated-data grant for this app; provider permission and account access remain unverified.",
    checkedOn: "2026-10-28",
    references: [
      {
        title: "Dickensheet auction terms",
        url: "https://www.dickensheet.com/terms-and-conditions",
      },
    ],
  },
  {
    id: "public-surplus",
    name: "PublicSurplus",
    auctionLabel: "PublicSurplus",
    workflow: "Enter auction details manually from information you may use.",
    accessReview:
      "Buyer registration links to a buyer agreement. The full agreement and any automated-data permission have not been verified for this app.",
    checkedOn: "2026-10-28",
    references: [
      {
        title: "Public Surplus buyer registration and agreement",
        url: "https://www.publicsurplus.com/sms/register/user",
      },
    ],
  },
  {
    id: "govdeals",
    name: "GovDeals",
    auctionLabel: "GovDeals",
    workflow: "Enter auction details manually from information you may use.",
    accessReview:
      "The terms page could not be fully read during the documentation check. Provider permission and account access remain unverified.",
    checkedOn: "2026-10-28",
    references: [
      {
        title: "GovDeals site terms",
        url: "https://www.govdeals.com/content/site-terms",
      },
    ],
  },
  {
    id: "hibid",
    name: "HiBid",
    auctionLabel: "HiBid",
    workflow: "Enter auction details manually from information you may use.",
    accessReview:
      "Provider documentation, permission and account access have not been reviewed for this app.",
    checkedOn: null,
    references: [],
  },
  {
    id: "other",
    name: "Other auction source",
    auctionLabel: "Other",
    workflow: "Keep your own source label and original evidence link.",
    accessReview:
      "Review the source's terms and access conditions before using its information.",
    checkedOn: null,
    references: [],
  },
  {
    id: "ebay-evidence",
    name: "eBay comparable evidence",
    workflow:
      "Enter comparable prices with evidence links. Choose Sold only for a verified completed sale; asking prices remain Asking.",
    accessReview:
      "eBay documents item browsing separately from Marketplace Insights sold history, which it lists as a limited release. Documentation does not verify this app's production access. Browse results must not be treated as completed sales.",
    checkedOn: "2026-10-28",
    references: [
      {
        title: "eBay buying APIs and sold-history availability",
        url: "https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application",
      },
      {
        title: "eBay Browse API",
        url: "https://developer.ebay.com/api-docs/buy/static/api-browse.html",
      },
      {
        title: "eBay production access requirements",
        url: "https://developer.ebay.com/api-docs/buy/static/buy-requirements.html",
      },
    ],
  },
  {
    id: "other-evidence",
    name: "Other resale evidence",
    workflow:
      "Enter the observed price, condition, date, evidence link and whether it is Sold or Asking.",
    accessReview:
      "No source-specific access has been verified. Check the evidence and the original source's conditions yourself.",
    checkedOn: null,
    references: [],
  },
];

export const auctionSources = sources.flatMap((source) =>
  source.auctionLabel ? [source.auctionLabel] : [],
);

export function auctionSourceOptions(current: string): string[] {
  // Imported/custom labels are valid domain data; never silently replace one.
  return auctionSources.includes(current)
    ? auctionSources
    : [...auctionSources, current];
}
