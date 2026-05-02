import type { AgentType } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.join("; ")
        : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>()),
  );
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

export function competitorsToCsv(result: ResearchResult<"competitors">): string {
  const rows = (result.data?.competitors ?? []).map((c) => ({
    name: c.name,
    type: c.competitorType,
    url: c.websiteUrl,
    description: c.shortDescription,
    why_competes: c.whyTheyCompete,
    overlapping_segments: c.overlappingCustomerSegments?.join("; "),
    confidence: c.confidenceLevel,
    evidence_urls: c.evidenceUrls?.join("; "),
  }));
  return toCsv(rows);
}

export function emergingPlayersToCsv(
  result: ResearchResult<"emergingPlayers">,
): string {
  const rows = (result.data?.emergingPlayers ?? []).map((p) => ({
    name: p.name,
    category: p.category,
    url: p.websiteUrl,
    why_relevant: p.whyRelevant,
    relationship_to_client: p.relationshipToClient,
    threat_level: p.threatLevel,
    confidence: p.confidenceLevel,
    evidence_urls: p.evidenceUrls?.join("; "),
  }));
  return toCsv(rows);
}

export function marketSignalsToCsv(
  result: ResearchResult<"marketSignals">,
): string {
  const rows = (result.data?.marketSignals ?? []).map((s) => ({
    signal: s.signal,
    type: s.signalType,
    why_it_matters: s.whyItMatters,
    affected_players: s.affectedPlayers?.join("; "),
    implication_for_client: s.implicationForClient,
    date: s.date ?? "",
    confidence: s.confidenceLevel,
    evidence_urls: s.evidenceUrls?.join("; "),
  }));
  return toCsv(rows);
}

export function customerSegmentsToCsv(
  result: ResearchResult<"customerSegments">,
): string {
  const rows = (result.data?.customerSegments ?? []).map((s) => ({
    segment: s.segment,
    buyer_type: s.buyerType,
    pain_points: s.likelyPainPoints?.join("; "),
    buying_triggers: s.buyingTriggers?.join("; "),
    objections: s.objections?.join("; "),
    verticals: s.verticals?.join("; "),
  }));
  return toCsv(rows);
}

export function expertCallsToCsv(
  result: ResearchResult<"expertCalls">,
): string {
  const rows = (result.data?.expertCallTargets ?? []).map((t) => ({
    target_profile: t.targetProfile,
    why_useful: t.whyUseful,
    ideal_background: t.idealBackground,
    sample_questions: t.sampleQuestions?.join("; "),
    priority: t.priority,
  }));
  return toCsv(rows);
}

export function discoveryQuestionsToCsv(
  result: ResearchResult<"discoveryQuestions">,
): string {
  const rows = (result.data?.recommendedQuestions ?? []).map((q) => ({
    theme: q.theme,
    question: q.question,
    why_it_matters: q.whyItMatters,
    who_to_ask: q.whoToAsk,
  }));
  return toCsv(rows);
}

export const CSV_EXPORTS: Partial<
  Record<AgentType, (r: ResearchResult) => string>
> = {
  competitors: (r) => competitorsToCsv(r as ResearchResult<"competitors">),
  emergingPlayers: (r) =>
    emergingPlayersToCsv(r as ResearchResult<"emergingPlayers">),
  marketSignals: (r) =>
    marketSignalsToCsv(r as ResearchResult<"marketSignals">),
  customerSegments: (r) =>
    customerSegmentsToCsv(r as ResearchResult<"customerSegments">),
  expertCalls: (r) => expertCallsToCsv(r as ResearchResult<"expertCalls">),
  discoveryQuestions: (r) =>
    discoveryQuestionsToCsv(r as ResearchResult<"discoveryQuestions">),
};
