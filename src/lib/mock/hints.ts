import { mockDocuments } from "./data";

// Generate a large pool of contextual query hints from actual collection data
function buildHintPool(): string[] {
  const hints: string[] = [];

  // --- customers ---
  const customers = mockDocuments.customers;
  const regions = [...new Set(customers.map((c) => c.region as string))];
  const sectors = [...new Set(customers.map((c) => c.sector as string))];
  const statuses = [...new Set(customers.map((c) => c.status as string))];
  const topCustomer = customers[0]?.name as string;

  hints.push(
    "Show me the top customers by revenue",
    "Which customers have the most employees?",
    `Find all ${statuses[1] ?? "inactive"} customers`,
    `Show customers in the ${regions[0]} region`,
    `Show customers in the ${regions[1]} region`,
    `Which customers are in the ${sectors[0]} sector?`,
    `Which customers are in the ${sectors[1]} sector?`,
    `Which customers are in the ${sectors[2]} sector?`,
    `Find customers similar to ${topCustomer}`,
    "List customers with over 500 employees",
    "Which customers have the lowest revenue?",
    "Show me enterprise-scale customers",
    "Find customers across all regions",
    "Which sectors have the most customers?"
  );

  // --- products ---
  const products = mockDocuments.products;
  const categories = [...new Set(products.map((p) => p.category as string))];
  const tiers = [...new Set(products.map((p) => p.tier as string))];

  hints.push(
    "Find products suitable for enterprise deployments",
    "What are the highest-rated products?",
    `Show all ${tiers[2] ?? "Enterprise"} tier products`,
    `Show all ${tiers[0] ?? "Starter"} tier products`,
    `List products in the ${categories[0]} category`,
    `List products in the ${categories[1]} category`,
    "Which products are currently out of stock?",
    "Find the most affordable products",
    "Show products with a rating above 4.8",
    "What products include search capabilities?",
    "Find products for compliance and security",
    "Show infrastructure products"
  );

  // --- messages ---
  hints.push(
    "Show recent messages from conversations",
    "Find user messages asking about revenue",
    "Which assistant responses mention technology?",
    "Show messages from the most active conversation",
    "Find questions about enterprise products",
    "List all user queries from today"
  );

  // --- documents ---
  const docs = mockDocuments.documents;
  const filenames = [...new Set(docs.map((d) => d.filename as string))];

  hints.push(
    `Find documents from ${filenames[0] ?? "customers_q4_2023.csv"}`,
    `Show all rows from ${filenames[1] ?? "product_catalog_v2.csv"}`,
    "Which documents were ingested most recently?",
    "Find documents related to knowledge base articles",
    "Show documents with the highest similarity to 'pricing'"
  );

  // --- cross-collection ---
  hints.push(
    "Which collections have vector embeddings?",
    "Find records mentioning 'enterprise' across all collections",
    "Show the most recently updated documents",
    "Find anything related to the West region",
    "What data do we have about the Technology sector?"
  );

  return hints;
}

export const HINT_POOL = buildHintPool();

export function pickRandomHints(count = 3): string[] {
  const pool = [...HINT_POOL];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}
