import type { Engagement } from "@/types/engagement";
import type {
  ClientProfile,
  Competitor,
  CompetitorList,
} from "@/types/research";
import {
  dedupeCitations,
  exaSearchStructured,
  type ExaCitation,
  type ExaSearchType,
  type StructuredSearchResponse,
} from "../exa";
import {
  COMPETITORS_DISCOVERY_SYSTEM_PROMPT,
  COMPETITORS_VALIDATION_SYSTEM_PROMPT,
} from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import { getDomain, normalizeUrl } from "../url";
import type { AgentDefinition } from "./base";

const competitorListSchema = {
  type: "object",
  description: "A list of companies that compete with the client.",
  properties: {
    competitors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          websiteUrl: { type: "string" },
          competitorType: {
            type: "string",
            enum: ["direct", "partial", "low_confidence"],
          },
          shortDescription: { type: "string" },
          whyTheyCompete: {
            type: "string",
            description:
              "Why they compete with the client. Include the company's headquarters country / region (e.g. 'HQ: Berlin, Germany').",
          },
          overlappingCustomerSegments: {
            type: "array",
            items: { type: "string" },
          },
          evidenceUrls: { type: "array", items: { type: "string" } },
          confidenceLevel: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
        required: [
          "name",
          "websiteUrl",
          "competitorType",
          "shortDescription",
          "whyTheyCompete",
          "evidenceUrls",
          "confidenceLevel",
        ],
      },
    },
  },
  required: ["competitors"],
  additionalProperties: false,
} as const;

// System prompts live in `lib/prompts/defaults.ts` so they can be customized
// from the Settings page. We re-export the constants under the names the
// rest of this file already used to keep the diff small.
const SYSTEM_PROMPT_DISCOVERY = COMPETITORS_DISCOVERY_SYSTEM_PROMPT;
const SYSTEM_PROMPT_VALIDATION = COMPETITORS_VALIDATION_SYSTEM_PROMPT;

const REGIONAL_PASSES: Array<{
  label: string;
  systemNudge: string;
  prompt: string;
}> = [
  {
    label: "APAC",
    systemNudge:
      "Focus on Asia-Pacific competitors. Include leading Chinese, Japanese, Korean, Indian, Southeast Asian (Singapore/Indonesia/Vietnam/Thailand/Philippines/Malaysia), Australian, and New Zealand companies — including non-English-named companies. Provide their official websites.",
    prompt:
      "Find Asia-Pacific based companies that compete with the client. Cover China, Japan, South Korea, India, Southeast Asia (Singapore, Indonesia, Vietnam, Thailand, Philippines, Malaysia), Australia, and New Zealand. Include both global leaders and strong regional incumbents that may not appear in English-first market maps.",
  },
  {
    label: "EMEA",
    systemNudge:
      "Focus on competitors headquartered in Europe, the Middle East, and Africa. Include UK, Germany, France, Netherlands, Nordics, Spain, Italy, Poland, Israel, UAE, Saudi Arabia, South Africa, Nigeria, Kenya, and Egypt.",
    prompt:
      "Find Europe / Middle East / Africa headquartered companies that compete with the client. Cover UK, Germany, France, Netherlands, the Nordics, Spain, Italy, Poland, Israel, UAE, Saudi Arabia, Egypt, South Africa, Nigeria, and Kenya. Include strong regional players that may not appear in US-centric market maps.",
  },
  {
    label: "LATAM",
    systemNudge:
      "Focus on competitors headquartered in Latin America. Include Brazil, Mexico, Argentina, Chile, Colombia, Peru, and Uruguay.",
    prompt:
      "Find Latin America headquartered companies that compete with the client. Cover Brazil, Mexico, Argentina, Chile, Colombia, Peru, and Uruguay. Include strong regional incumbents and venture-backed challengers.",
  },
];

const MAX_CANDIDATES_FOR_VALIDATION = 60;

interface DiscoveryPass {
  label: string;
  request: () => Promise<StructuredSearchResponse<CompetitorList>>;
}

export const competitorsAgent: AgentDefinition<"competitors"> = {
  type: "competitors",
  label: "Competitor Discovery",
  description:
    "Globally-comprehensive competitor discovery with multi-region passes and a validation reasoning step.",
  run: async (ctx) => {
    const profile = ctx.results.clientProfile;
    // Resolve user-customized prompts once and reuse across every pass so
    // discovery and validation stay consistent within a single run.
    const [discoverySystemPrompt, validationSystemPrompt] = await Promise.all([
      resolveSystemPrompt(
        PROMPT_SLOT_IDS.competitorsDiscovery,
        SYSTEM_PROMPT_DISCOVERY,
      ),
      resolveSystemPrompt(
        PROMPT_SLOT_IDS.competitorsValidation,
        SYSTEM_PROMPT_VALIDATION,
      ),
    ]);
    const passes = buildDiscoveryPasses(
      ctx.engagement,
      profile,
      discoverySystemPrompt,
    );

    const settled = await Promise.allSettled(passes.map((p) => p.request()));

    const candidatesByDomain = new Map<string, Competitor>();
    let citations: ExaCitation[] = [];
    const clientDomain = getDomain(ctx.engagement.clientUrl);
    const clientName = (
      profile?.companyName ?? ctx.engagement.clientName ?? ""
    ).toLowerCase();

    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const { data, citations: passCitations } = result.value;
      citations = citations.concat(passCitations);
      for (const competitor of data?.competitors ?? []) {
        addCandidate(candidatesByDomain, competitor, clientDomain, clientName);
      }
    }

    if (candidatesByDomain.size === 0) {
      return {
        data: { competitors: [] },
        citations: dedupeCitations(citations),
      };
    }

    const candidateList = Array.from(candidatesByDomain.values()).slice(
      0,
      MAX_CANDIDATES_FOR_VALIDATION,
    );

    const validated = await runValidationPass({
      engagement: ctx.engagement,
      profile,
      candidates: candidateList,
      systemPrompt: validationSystemPrompt,
    }).catch(() => null);

    let finalList: Competitor[];
    let finalCitations = citations;

    if (validated && validated.data?.competitors?.length) {
      finalCitations = finalCitations.concat(validated.citations);
      const validatedByDomain = new Map<string, Competitor>();
      for (const competitor of validated.data.competitors) {
        addCandidate(
          validatedByDomain,
          competitor,
          clientDomain,
          clientName,
        );
      }
      finalList = Array.from(validatedByDomain.values());
    } else {
      finalList = Array.from(candidatesByDomain.values());
    }

    return {
      data: { competitors: sortCompetitors(finalList) },
      citations: dedupeCitations(finalCitations),
    };
  },
};

function buildDiscoveryPasses(
  engagement: Engagement,
  profile: ClientProfile | undefined,
  discoverySystemPrompt: string,
): DiscoveryPass[] {
  const companyName = profile?.companyName ?? engagement.clientName;
  const companyLabel = companyName
    ? `${companyName} (${engagement.clientUrl})`
    : engagement.clientUrl;
  const category =
    profile?.category ?? engagement.industry ?? "the company's category";
  const products = (profile?.productsOrServices ?? []).slice(0, 3);
  const customers = (profile?.targetCustomers ?? []).slice(0, 3);
  const productsClause = products.length
    ? ` and offers ${products.join(", ")}`
    : "";
  const customersClause = customers.length
    ? `, serving ${customers.join(", ")}`
    : "";
  const knownClause = engagement.knownCompetitors?.length
    ? ` The user has already identified these as competitors: ${engagement.knownCompetitors.join(", ")}.`
    : "";
  const baseContext = `The client operates in ${category}${productsClause}${customersClause}.${knownClause}`;

  const passes: DiscoveryPass[] = [];

  passes.push({
    label: "global",
    request: () =>
      exaSearchStructured<CompetitorList>(
        `Find companies anywhere in the world that directly or partially compete with ${companyLabel}. ${baseContext} Identify direct competitors, partial competitors, and lower-confidence possibilities. For each competitor, give the official website URL, a one-sentence description, the headquarters country/region, and explain why they compete with the client. Cover global leaders across North America, Europe, Asia-Pacific, Latin America, the Middle East, and Africa. Do NOT include the client itself.`,
        competitorListSchema as never,
        {
          type: "deep",
          numResults: 25,
          category: "company",
          contents: { text: { maxCharacters: 2000 } },
          systemPrompt: discoverySystemPrompt,
        },
      ),
  });

  for (const region of REGIONAL_PASSES) {
    passes.push({
      label: `region:${region.label}`,
      request: () =>
        exaSearchStructured<CompetitorList>(
          `${region.prompt} Client: ${companyLabel}. ${baseContext} Do NOT include the client itself.`,
          competitorListSchema as never,
          {
            type: "deep-lite",
            numResults: 12,
            category: "company",
            contents: { text: { maxCharacters: 1500 } },
            systemPrompt: `${discoverySystemPrompt} ${region.systemNudge}`,
          },
        ),
    });
  }

  for (const product of products.slice(0, 2)) {
    passes.push({
      label: `product:${product}`,
      request: () =>
        exaSearchStructured<CompetitorList>(
          `Find companies anywhere in the world that offer ${product}${customers.length ? ` to ${customers.join(", ")}` : ""}. They are potential competitors of ${companyLabel} in ${category}. Include both global leaders and strong regional players outside North America. Do NOT include the client itself.`,
          competitorListSchema as never,
          {
            type: "deep-lite",
            numResults: 10,
            category: "company",
            contents: { text: { maxCharacters: 1500 } },
            systemPrompt: discoverySystemPrompt,
          },
        ),
    });
  }

  if (engagement.geography && engagement.geography.trim().length > 0) {
    const geo = engagement.geography.trim();
    passes.push({
      label: `geo:${geo}`,
      request: () =>
        exaSearchStructured<CompetitorList>(
          `Find companies headquartered in or primarily serving ${geo} that compete with ${companyLabel}. ${baseContext} Include local incumbents, regional leaders, and venture-backed challengers based in ${geo}. Do NOT include the client itself.`,
          competitorListSchema as never,
          {
            type: "deep-lite",
            numResults: 12,
            category: "company",
            contents: { text: { maxCharacters: 1500 } },
            systemPrompt: `${discoverySystemPrompt} Focus on companies based in or primarily serving ${geo}.`,
          },
        ),
    });
  }

  return passes;
}

interface ValidationInput {
  engagement: Engagement;
  profile: ClientProfile | undefined;
  candidates: Competitor[];
  systemPrompt: string;
}

async function runValidationPass(
  input: ValidationInput,
): Promise<StructuredSearchResponse<CompetitorList>> {
  const { engagement, profile, candidates, systemPrompt } = input;
  const companyLabel =
    (profile?.companyName ?? engagement.clientName ?? engagement.clientUrl) +
    ` (${engagement.clientUrl})`;
  const category =
    profile?.category ?? engagement.industry ?? "the company's category";
  const products = (profile?.productsOrServices ?? []).slice(0, 5).join(", ");
  const customers = (profile?.targetCustomers ?? []).slice(0, 5).join(", ");

  const candidateLines = candidates
    .map((c, idx) => {
      const segments = c.overlappingCustomerSegments?.length
        ? ` | overlap: ${c.overlappingCustomerSegments.slice(0, 3).join(", ")}`
        : "";
      return `${idx + 1}. ${c.name} — ${c.websiteUrl} — ${c.competitorType}/${c.confidenceLevel} — ${c.shortDescription}${segments}`;
    })
    .join("\n");

  const validationType: ExaSearchType = "deep-reasoning";

  const query = `Validate and refine the following globally-sourced competitor list for the client.\n\nCLIENT: ${companyLabel}\nCATEGORY: ${category}\nPRODUCTS/SERVICES: ${products || "(unknown)"}\nTARGET CUSTOMERS: ${customers || "(unknown)"}\n\nCANDIDATE COMPETITORS:\n${candidateLines}\n\nFor every entry: confirm the company is currently operating, has a real reachable website, and competes with the client on products and/or customers. Reclassify direct/partial/low_confidence and confidenceLevel honestly. Drop entries you cannot verify or that are not actual competitors. Drop the client itself if it slipped in. Add up to 10 globally important competitors that are clearly missing — especially leading regional players outside North America. For every entry, prepend the headquarters country/region to whyTheyCompete (e.g. 'HQ: Tokyo, Japan — ...') and include the official root-domain website URL.`;

  return exaSearchStructured<CompetitorList>(
    query,
    competitorListSchema as never,
    {
      type: validationType,
      numResults: 25,
      category: "company",
      contents: { text: { maxCharacters: 1500 } },
      systemPrompt,
    },
  );
}

function addCandidate(
  bucket: Map<string, Competitor>,
  raw: Competitor,
  clientDomain: string,
  clientName: string,
): void {
  if (!raw?.websiteUrl || typeof raw.websiteUrl !== "string") return;
  const websiteUrl = normalizeUrl(raw.websiteUrl);
  if (!websiteUrl) return;
  const domain = getDomain(websiteUrl);
  if (!domain) return;
  if (isClientDomain(domain, clientDomain)) return;
  if (raw.name && clientName && raw.name.trim().toLowerCase() === clientName) {
    return;
  }

  const competitorType = normalizeCompetitorType(raw.competitorType);
  const confidenceLevel = normalizeConfidence(raw.confidenceLevel);

  const incoming: Competitor = {
    name: (raw.name ?? "").trim() || domain,
    websiteUrl,
    competitorType,
    shortDescription: (raw.shortDescription ?? "").trim(),
    whyTheyCompete: (raw.whyTheyCompete ?? "").trim(),
    overlappingCustomerSegments: dedupeStrings(
      raw.overlappingCustomerSegments,
    ),
    evidenceUrls: dedupeStrings(raw.evidenceUrls),
    confidenceLevel,
  };

  const existing = bucket.get(domain);
  if (!existing) {
    bucket.set(domain, incoming);
    return;
  }

  bucket.set(domain, mergeCompetitor(existing, incoming));
}

function mergeCompetitor(a: Competitor, b: Competitor): Competitor {
  return {
    name: preferLonger(a.name, b.name),
    websiteUrl: preferShorter(a.websiteUrl, b.websiteUrl),
    competitorType: strongerType(a.competitorType, b.competitorType),
    shortDescription: preferLonger(a.shortDescription, b.shortDescription),
    whyTheyCompete: preferLonger(a.whyTheyCompete, b.whyTheyCompete),
    overlappingCustomerSegments: dedupeStrings([
      ...(a.overlappingCustomerSegments ?? []),
      ...(b.overlappingCustomerSegments ?? []),
    ]),
    evidenceUrls: dedupeStrings([
      ...(a.evidenceUrls ?? []),
      ...(b.evidenceUrls ?? []),
    ]),
    confidenceLevel: strongerConfidence(a.confidenceLevel, b.confidenceLevel),
  };
}

function isClientDomain(domain: string, clientDomain: string): boolean {
  if (!domain || !clientDomain) return false;
  if (domain === clientDomain) return true;
  return (
    domain.endsWith(`.${clientDomain}`) || clientDomain.endsWith(`.${domain}`)
  );
}

function normalizeCompetitorType(
  value: Competitor["competitorType"] | string | undefined,
): Competitor["competitorType"] {
  if (value === "direct" || value === "partial" || value === "low_confidence") {
    return value;
  }
  return "low_confidence";
}

function normalizeConfidence(
  value: Competitor["confidenceLevel"] | string | undefined,
): Competitor["confidenceLevel"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

const TYPE_RANK: Record<Competitor["competitorType"], number> = {
  direct: 3,
  partial: 2,
  low_confidence: 1,
};

const CONFIDENCE_RANK: Record<Competitor["confidenceLevel"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function strongerType(
  a: Competitor["competitorType"],
  b: Competitor["competitorType"],
): Competitor["competitorType"] {
  return TYPE_RANK[a] >= TYPE_RANK[b] ? a : b;
}

function strongerConfidence(
  a: Competitor["confidenceLevel"],
  b: Competitor["confidenceLevel"],
): Competitor["confidenceLevel"] {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

function preferLonger(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function preferShorter(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return b.length < a.length ? b : a;
}

function dedupeStrings(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function sortCompetitors(list: Competitor[]): Competitor[] {
  return [...list].sort((a, b) => {
    const typeDelta = TYPE_RANK[b.competitorType] - TYPE_RANK[a.competitorType];
    if (typeDelta !== 0) return typeDelta;
    const confDelta =
      CONFIDENCE_RANK[b.confidenceLevel] - CONFIDENCE_RANK[a.confidenceLevel];
    if (confDelta !== 0) return confDelta;
    return a.name.localeCompare(b.name);
  });
}
