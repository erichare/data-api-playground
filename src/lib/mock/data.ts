import type { Collection, CollectionDocument, Conversation, DocumentSource, IngestJob, IngestedDocumentSummary, SearchMode } from "../types";

export const mockCollections: Collection[] = [
  { name: "customers", count: 1247, vectorDim: 768 },
  { name: "products", count: 3891, vectorDim: 768 },
  { name: "conversations", count: 42, vectorDim: null },
  { name: "messages", count: 1205, vectorDim: 768 },
  { name: "documents", count: 189, vectorDim: 768 },
];

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    name: "Customer Revenue Analysis",
    createdAt: new Date("2024-01-15T10:00:00"),
    updatedAt: new Date("2024-01-15T10:01:05"),
    messageCount: 4,
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "Show me the top customers by revenue",
        timestamp: new Date("2024-01-15T10:00:00"),
      },
      {
        id: "msg-2",
        role: "assistant",
        content:
          "I found 5 highly relevant customer records based on your query. These customers represent your highest revenue accounts, identified through vector similarity search across the customers collection.",
        sources: [
          {
            collection: "customers",
            id: "cust_001",
            similarity: 0.97,
            preview: { name: "Acme Corp", revenue: "$2.1M", region: "West" },
          },
          {
            collection: "customers",
            id: "cust_002",
            similarity: 0.94,
            preview: { name: "TechFlow Inc", revenue: "$1.8M", region: "East" },
          },
          {
            collection: "customers",
            id: "cust_003",
            similarity: 0.91,
            preview: {
              name: "DataSystems",
              revenue: "$1.4M",
              region: "Central",
            },
          },
        ],
        searchMode: "hybrid",
        latencyMs: 8,
        timestamp: new Date("2024-01-15T10:00:05"),
      },
      {
        id: "msg-3",
        role: "user",
        content: "Which customers are in the technology sector?",
        timestamp: new Date("2024-01-15T10:01:00"),
      },
      {
        id: "msg-4",
        role: "assistant",
        content:
          "Found 8 customers in the technology sector with high semantic similarity. These organizations were matched using dense vector embeddings that capture industry context beyond simple keyword matching.",
        sources: [
          {
            collection: "customers",
            id: "cust_005",
            similarity: 0.96,
            preview: {
              name: "TechFlow Inc",
              sector: "Technology",
              employees: 450,
            },
          },
          {
            collection: "customers",
            id: "cust_009",
            similarity: 0.93,
            preview: {
              name: "CloudBase",
              sector: "Technology",
              employees: 120,
            },
          },
        ],
        searchMode: "vector",
        latencyMs: 6,
        timestamp: new Date("2024-01-15T10:01:05"),
      },
    ],
  },
  {
    id: "conv-2",
    name: "Product Search Demo",
    createdAt: new Date("2024-01-16T14:00:00"),
    updatedAt: new Date("2024-01-16T14:00:07"),
    messageCount: 2,
    messages: [
      {
        id: "msg-5",
        role: "user",
        content: "Find products suitable for enterprise deployments",
        timestamp: new Date("2024-01-16T14:00:00"),
      },
      {
        id: "msg-6",
        role: "assistant",
        content:
          "Identified 12 enterprise-grade products with strong semantic relevance. Results include products with high-availability configurations, compliance certifications, and dedicated support tiers.",
        sources: [
          {
            collection: "products",
            id: "prod_001",
            similarity: 0.98,
            preview: {
              name: "AstraDB Enterprise",
              tier: "Enterprise",
              price: "$2,500/mo",
            },
          },
          {
            collection: "products",
            id: "prod_002",
            similarity: 0.95,
            preview: {
              name: "Vector Search Pro",
              tier: "Professional",
              price: "$800/mo",
            },
          },
          {
            collection: "products",
            id: "prod_003",
            similarity: 0.88,
            preview: {
              name: "DataAPI Gateway",
              tier: "Enterprise",
              price: "$1,200/mo",
            },
          },
        ],
        searchMode: "hybrid",
        latencyMs: 11,
        timestamp: new Date("2024-01-16T14:00:07"),
      },
    ],
  },
];

export const mockIngestJobs: IngestJob[] = [
  {
    id: "job-1",
    collection: "customers",
    filename: "customers_q4_2023.csv",
    totalRows: 1247,
    processedRows: 1247,
    status: "completed",
    completedAt: new Date("2024-01-15T09:45:00"),
  },
  {
    id: "job-2",
    collection: "products",
    filename: "product_catalog_v2.csv",
    totalRows: 3891,
    processedRows: 3891,
    status: "completed",
    completedAt: new Date("2024-01-14T16:30:00"),
  },
  {
    id: "job-3",
    collection: "documents",
    filename: "knowledge_base_jan.csv",
    totalRows: 189,
    processedRows: 189,
    status: "completed",
    completedAt: new Date("2024-01-13T11:20:00"),
  },
];

// Shared mock vector (single reference, not duplicated per row)
const MOCK_VECTOR = Array.from({ length: 768 }, () =>
  parseFloat((Math.random() * 2 - 1).toFixed(6))
);

// --- Generators ---

const CUSTOMER_NAMES = ["Acme Corp","TechFlow Inc","DataSystems","Global Retail Co","CloudBase","Nexus Energy","MedSupply Ltd","Apex Logistics","BrightMedia","IronBridge LLC","Quantum Labs","SkyNet Solutions","PeakPerform","Vertex Analytics","BlueStar Corp","RedShift Inc","Cascade Tech","Frontier Systems","Summit Data","Horizon AI","Pulsar Networks","DeltaForce Ltd","Omni Retail","Crest Financial","Vantage Health","Sterling Logistics","Nova Media","Titan Construction","Apex Capital","Meridian Tech"];
const SECTORS = ["Technology","Retail","Healthcare","Manufacturing","Energy","Logistics","Media","Construction","Finance","Education"];
const REGIONS = ["West","East","Central","South"];

function generateCustomers(count: number): CollectionDocument[] {
  return Array.from({ length: count }, (_, i) => {
    const base = Math.max(50, 2100 - i * 38);
    const revenue = base >= 1000 ? `$${(base / 1000).toFixed(1)}M` : `$${base}K`;
    return {
      _id: `cust_${String(i + 1).padStart(3, "0")}`,
      name: CUSTOMER_NAMES[i % CUSTOMER_NAMES.length] + (i >= CUSTOMER_NAMES.length ? ` ${Math.floor(i / CUSTOMER_NAMES.length) + 1}` : ""),
      revenue,
      region: REGIONS[i % REGIONS.length],
      sector: SECTORS[i % SECTORS.length],
      employees: Math.max(20, 1200 - i * 22),
      status: i % 7 === 5 ? "inactive" : "active",
      $vector: MOCK_VECTOR,
    };
  });
}

const PRODUCT_NAMES = ["Astra DB Enterprise","Vector Search Pro","DataAPI Gateway","Streaming Ingest","Analytics Suite","Developer Plan","Hybrid Search Add-on","Backup & Restore","Multi-Region HA","Compliance Pack","Edge Cache","Query Optimizer","Schema Manager","Event Stream","Data Replicator","Access Control","Audit Logger","Cost Explorer","Throughput Booster","Geo-Routing"];
const CATEGORIES = ["Database","Search","API","Pipeline","Analytics","Operations","Infrastructure","Security","Monitoring","Networking"];
const TIERS = ["Starter","Professional","Enterprise"];
const PRICES = ["$0/mo","$250/mo","$400/mo","$600/mo","$800/mo","$900/mo","$1,200/mo","$1,800/mo","$2,500/mo","$3,200/mo"];

function generateProducts(count: number): CollectionDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    _id: `prod_${String(i + 1).padStart(3, "0")}`,
    name: PRODUCT_NAMES[i % PRODUCT_NAMES.length] + (i >= PRODUCT_NAMES.length ? ` v${Math.floor(i / PRODUCT_NAMES.length) + 2}` : ""),
    category: CATEGORIES[i % CATEGORIES.length],
    tier: TIERS[i % TIERS.length],
    price: PRICES[i % PRICES.length],
    rating: parseFloat((4.2 + (i % 8) * 0.1).toFixed(1)),
    inStock: i % 5 !== 4,
    $vector: MOCK_VECTOR,
  }));
}

const CONV_TITLES = ["Customer Revenue Analysis","Product Search Demo","Q4 Inventory Review","Enterprise Prospects","Support Ticket Analysis","Sector Breakdown","West Region Leads","Tech Sector Filter","High-Value Accounts","Inactive Customers","New Product Launches","Pricing Analysis","Compliance Review","Infrastructure Audit","Media Accounts","Logistics Partners","Healthcare Pipeline","Energy Sector Q1","Finance Verticals","Education Outreach"];

function generateConversations(count: number): CollectionDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    _id: `conv_${String(i + 1).padStart(3, "0")}`,
    title: CONV_TITLES[i % CONV_TITLES.length],
    createdAt: new Date(Date.now() - (count - i) * 86400000 * 2).toISOString(),
    messageCount: (i % 12) + 1,
    status: i % 6 === 5 ? "archived" : "active",
  }));
}

const MSG_CONTENTS = [
  "Show me the top customers by revenue","Find products suitable for enterprise deployments","Which customers are in the technology sector?","List all inactive accounts","What are the highest-rated products?","Show customers in the West region","Find healthcare sector companies","Which products are out of stock?","Show messages from conversation 001","List documents from knowledge_base_jan.csv",
];

function generateMessages(count: number): CollectionDocument[] {
  const roles = ["user", "assistant"];
  return Array.from({ length: count }, (_, i) => ({
    _id: `msg_${String(i + 1).padStart(3, "0")}`,
    conversationId: `conv_${String(Math.floor(i / 4) + 1).padStart(3, "0")}`,
    role: roles[i % 2],
    content: MSG_CONTENTS[i % MSG_CONTENTS.length],
    timestamp: new Date(Date.now() - (count - i) * 60000 * 3).toISOString(),
    $vector: MOCK_VECTOR,
  }));
}

const DOC_FILES = ["customers_q4_2023.csv","product_catalog_v2.csv","knowledge_base_jan.csv","sales_leads_2024.csv","support_tickets_q1.csv"];

function generateDocuments(count: number): CollectionDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    _id: `doc_${String(i + 1).padStart(3, "0")}`,
    filename: DOC_FILES[i % DOC_FILES.length],
    rowIndex: (i % 50) + 1,
    content: `Row ${(i % 50) + 1} from ${DOC_FILES[i % DOC_FILES.length]}`,
    ingestedAt: new Date(Date.now() - (count - i) * 30000).toISOString(),
    $vector: MOCK_VECTOR,
  }));
}

export const mockDocuments: Record<string, CollectionDocument[]> = {
  customers:     generateCustomers(50),
  products:      generateProducts(50),
  conversations: generateConversations(42),
  messages:      generateMessages(50),
  documents:     generateDocuments(50),
};

export const mockIngestedDocuments: IngestedDocumentSummary[] = [
  {
    source_doc_id: "demo-doc-1",
    source_filename: "product-handbook.pdf",
    file_type: "pdf",
    file_size: 251904,
    content_hash: "a3f4b2c1d5e6f7a8",
    chunk_total: 12,
    ingested_at: "2026-03-20T14:23:00Z",
    collection: "dap_documents",
  },
  {
    source_doc_id: "demo-doc-2",
    source_filename: "architecture-notes.md",
    file_type: "md",
    file_size: 18432,
    content_hash: "b5e6d7a8c9f0e1b2",
    chunk_total: 4,
    ingested_at: "2026-03-21T09:15:00Z",
    collection: "dap_documents",
  },
  {
    source_doc_id: "demo-doc-3",
    source_filename: "requirements.txt",
    file_type: "txt",
    file_size: 4096,
    content_hash: "c9f0e1b2d3a4b5c6",
    chunk_total: 2,
    ingested_at: "2026-03-22T16:45:00Z",
    collection: "dap_documents",
  },
  {
    source_doc_id: "demo-doc-4",
    source_filename: "api-specification.docx",
    file_type: "docx",
    file_size: 91136,
    content_hash: "d1a2b3c4e5f6a7b8",
    chunk_total: 8,
    ingested_at: "2026-03-24T11:00:00Z",
    collection: "dap_documents",
  },
  {
    source_doc_id: "demo-doc-5",
    source_filename: "sample-data.csv",
    file_type: "csv",
    file_size: 32768,
    content_hash: "e9f0a1b2c3d4e5f6",
    chunk_total: 3,
    ingested_at: "2026-03-25T08:30:00Z",
    collection: "dap_documents",
  },
];

export const PAGE_SIZE = 10;

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const mockResponses: Array<{
  content: string;
  sources: DocumentSource[];
  searchMode: SearchMode;
  latencyMs: number;
}> = [
  {
    content:
      "I found {count} highly relevant documents matching your query. The results were retrieved using dense vector embeddings with sub-10ms latency from the {collection} collection.",
    sources: [
      {
        collection: "customers",
        id: "cust_001",
        similarity: 0.97,
        preview: { name: "Acme Corp", revenue: "$2.1M", region: "West" },
      },
      {
        collection: "customers",
        id: "cust_002",
        similarity: 0.94,
        preview: { name: "TechFlow Inc", revenue: "$1.8M", region: "East" },
      },
    ],
    searchMode: "vector" as const,
    latencyMs: 7,
  },
  {
    content:
      "Hybrid search returned {count} results combining vector similarity with keyword matching. This approach achieves higher precision for structured queries while maintaining semantic understanding.",
    sources: [
      {
        collection: "products",
        id: "prod_001",
        similarity: 0.95,
        preview: {
          name: "AstraDB Enterprise",
          tier: "Enterprise",
          price: "$2,500/mo",
        },
      },
      {
        collection: "products",
        id: "prod_002",
        similarity: 0.87,
        preview: {
          name: "Vector Search Pro",
          tier: "Professional",
          price: "$800/mo",
        },
      },
      {
        collection: "documents",
        id: "doc_003",
        similarity: 0.82,
        preview: { title: "API Reference Guide", pages: 142, version: "v2.1" },
      },
    ],
    searchMode: "hybrid" as const,
    latencyMs: 12,
  },
  {
    content:
      "Lexical search found {count} exact matches across indexed fields. BM25 ranking applied to surface the most relevant documents based on term frequency and document length normalization.",
    sources: [
      {
        collection: "messages",
        id: "msg_004",
        similarity: 0.91,
        preview: {
          subject: "Q4 Planning",
          from: "sales@acme.com",
          date: "2024-01-10",
        },
      },
    ],
    searchMode: "lexical" as const,
    latencyMs: 4,
  },
];
