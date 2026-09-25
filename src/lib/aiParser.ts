export interface AIParsedQuery {
  country: string;
  hsCode?: string;
  productCategory?: string;
  tradeFlow: "exports" | "imports";
  explanation: string;
}

// Built-in trade knowledge base for HS Code mapping
const COMMODITY_MAP: Record<string, { hs: string; category: string }> = {
  coffee: { hs: "0901", category: "Coffee, tea, maté and spices" },
  tea: { hs: "0902", category: "Tea whether or not flavored" },
  chai: { hs: "0902", category: "Tea whether or not flavored" },
  spices: { hs: "0901", category: "Spices and aromatics" },
  masala: { hs: "0901", category: "Spices and aromatics" },
  masale: { hs: "0901", category: "Spices and aromatics" },
  pepper: { hs: "0904", category: "Pepper and dried capsicum" },
  rice: { hs: "1006", category: "Rice and grain products" },
  chawal: { hs: "1006", category: "Rice and grain products" },
  wheat: { hs: "1001", category: "Wheat and meslin" },
  gehu: { hs: "1001", category: "Wheat and meslin" },
  sugar: { hs: "1701", category: "Cane or beet sugar and chemically pure sucrose" },
  chini: { hs: "1701", category: "Cane or beet sugar" },
  cotton: { hs: "5208", category: "Woven fabrics of cotton" },
  kapas: { hs: "5208", category: "Woven fabrics of cotton" },
  yarn: { hs: "5205", category: "Cotton yarn" },
  tshirt: { hs: "6109", category: "T-shirts, singlets and vests" },
  apparel: { hs: "6203", category: "Garments and apparel" },
  textile: { hs: "5208", category: "Textiles and fabrics" },
  garment: { hs: "6203", category: "Articles of apparel and clothing accessories" },
  kapda: { hs: "5208", category: "Textiles and fabrics" },
  leather: { hs: "4107", category: "Leather further prepared after tanning" },
  chamda: { hs: "4107", category: "Leather further prepared after tanning" },
  footwear: { hs: "6403", category: "Footwear with outer soles of rubber, plastics, leather" },
  shoes: { hs: "6403", category: "Footwear and shoes" },
  bedsheet: { hs: "6302", category: "Bed linen, table linen, towels" },
  linen: { hs: "6302", category: "Linen and furnishings" },
  steel: { hs: "7208", category: "Flat-rolled products of iron or steel" },
  iron: { hs: "7208", category: "Iron and steel items" },
  loha: { hs: "7208", category: "Iron and steel items" },
  aluminium: { hs: "7601", category: "Unwrought aluminium" },
  copper: { hs: "7403", category: "Refined copper and alloys" },
  tamba: { hs: "7403", category: "Refined copper and alloys" },
  electronics: { hs: "8542", category: "Electronic integrated circuits" },
  computer: { hs: "8471", category: "Computers and processing units" },
  mobile: { hs: "8517", category: "Smartphones and telephone sets" },
  phone: { hs: "8517", category: "Telephone apparatus and parts" },
  medicine: { hs: "3004", category: "Medicaments formulated for therapeutic use" },
  pharma: { hs: "3004", category: "Pharmaceutical products" },
  dawa: { hs: "3004", category: "Pharmaceutical medicaments" },
  chemical: { hs: "2905", category: "Organic and industrial chemicals" },
  fertilizer: { hs: "3102", category: "Mineral or chemical fertilizers, nitrogenous" },
  urea: { hs: "310210", category: "Urea & mineral fertilizers" },
  plastic: { hs: "3901", category: "Polymers of ethylene, in primary forms" },
  ceramic: { hs: "6907", category: "Ceramic flags and paving, hearth or wall tiles" },
  tiles: { hs: "6907", category: "Ceramic flags and paving, hearth or wall tiles" },
  dairy: { hs: "0401", category: "Milk and dairy products" },
  milk: { hs: "0401", category: "Milk and cream" },
  doodh: { hs: "0401", category: "Milk and cream" },
  meat: { hs: "0201", category: "Meat of bovine animals" },
  beef: { hs: "0201", category: "Fresh or chilled meat" },
  oil: { hs: "2710", category: "Petroleum oils and bituminous minerals" },
  petroleum: { hs: "2710", category: "Refined petroleum fuels" },
  jewellery: { hs: "7113", category: "Articles of jewellery and parts" },
  jewelry: { hs: "7113", category: "Articles of jewellery and parts" },
  gold: { hs: "7108", category: "Gold including gold plated with platinum" },
  sona: { hs: "7108", category: "Gold including gold plated with platinum" },
  diamond: { hs: "7102", category: "Diamonds, whether or not worked" },
  heera: { hs: "7102", category: "Diamonds, whether or not worked" },
};

const COUNTRIES = [
  "India",
  "Germany",
  "Vietnam",
  "China",
  "United States",
  "USA",
  "Brazil",
  "Saudi Arabia",
  "Singapore",
  "France",
  "Italy",
  "Japan",
  "United Kingdom",
  "UK",
  "Canada",
  "Australia",
  "Turkey",
  "Indonesia",
  "Malaysia",
  "South Korea",
  "Thailand",
  "Spain",
  "Netherlands",
];

export function parsePromptWithAI(prompt: string): AIParsedQuery {
  const lower = prompt.toLowerCase();

  // 1. Detect Country
  let matchedCountry = "India"; // default
  for (const c of COUNTRIES) {
    if (lower.includes(c.toLowerCase())) {
      matchedCountry = c === "USA" ? "United States" : c === "UK" ? "United Kingdom" : c;
      break;
    }
  }

  // 2. Detect Trade Flow (Import / Export)
  let tradeFlow: "exports" | "imports" = "exports";
  if (
    lower.includes("import") ||
    lower.includes("buyer") ||
    lower.includes("purchase") ||
    lower.includes("purchaser")
  ) {
    tradeFlow = "imports";
  }

  // 3. Detect Commodity & HS Code
  let matchedHs: string | undefined;
  let matchedCategory: string | undefined;

  // Check if user directly provided 2-6 digit HS code
  const directHsMatch = lower.match(/\b([0-9]{2,6})\b/);
  if (directHsMatch) {
    matchedHs = directHsMatch[1];
    matchedCategory = `HS ${matchedHs} Commodity Group`;
  } else {
    // Match commodity keywords
    for (const [keyword, data] of Object.entries(COMMODITY_MAP)) {
      if (lower.includes(keyword)) {
        matchedHs = data.hs;
        matchedCategory = data.category;
        break;
      }
    }
  }

  const roleText = tradeFlow === "imports" ? "Importers/Buyers" : "Exporters/Suppliers";
  const commodityText = matchedHs ? `HS ${matchedHs} (${matchedCategory})` : "All Commodities";

  return {
    country: matchedCountry,
    hsCode: matchedHs,
    productCategory: matchedCategory,
    tradeFlow,
    explanation: `AI Agent identified: Target Market: ${matchedCountry} • Sector: ${commodityText} • Flow: ${roleText}. Routing direct extraction request to TradeMap.org engine.`,
  };
}

export function resolveCommodity(input?: string): { hsCode?: string; category?: string } {
  if (!input || !input.trim()) return {};
  const trimmed = input.trim().toLowerCase();

  // If already numeric (2 to 6 digits)
  if (/^[0-9]{2,6}$/.test(trimmed)) {
    return { hsCode: trimmed, category: `HS ${trimmed} Commodity Group` };
  }

  // Look up in COMMODITY_MAP
  for (const [key, val] of Object.entries(COMMODITY_MAP)) {
    if (trimmed.includes(key) || key.includes(trimmed)) {
      return { hsCode: val.hs, category: val.category };
    }
  }

  return { category: input.trim() };
}

export { COMMODITY_MAP };
