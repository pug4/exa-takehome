import type { AgentContext } from "./base";

function bullet(items: string[] | undefined, max = 8): string {
  if (!items?.length) return "  (none)";
  return items
    .slice(0, max)
    .map((item) => `  - ${item}`)
    .join("\n");
}

export function buildResearchContext(ctx: AgentContext): string {
  const sections: string[] = [];
  const profile = ctx.results.clientProfile;
  const competitors = ctx.results.competitors;
  const emerging = ctx.results.emergingPlayers;
  const signals = ctx.results.marketSignals;
  const segments = ctx.results.customerSegments;

  sections.push(
    `Engagement: ${ctx.engagement.projectName ?? ctx.engagement.clientUrl}`,
  );
  sections.push(`Client URL: ${ctx.engagement.clientUrl}`);
  if (ctx.engagement.industry) {
    sections.push(`Industry hint: ${ctx.engagement.industry}`);
  }
  if (ctx.engagement.geography) {
    sections.push(`Geography hint: ${ctx.engagement.geography}`);
  }
  if (ctx.engagement.notes) {
    sections.push(`Notes: ${ctx.engagement.notes}`);
  }

  if (profile) {
    sections.push("\nClient profile:");
    sections.push(`  Name: ${profile.companyName}`);
    sections.push(`  Category: ${profile.category}`);
    sections.push(`  Positioning: ${profile.positioningSummary}`);
    sections.push(`  Products/services:\n${bullet(profile.productsOrServices)}`);
    sections.push(`  Target customers:\n${bullet(profile.targetCustomers)}`);
    sections.push(`  Claims:\n${bullet(profile.claims)}`);
    if (profile.assumptions?.length) {
      sections.push(`  Assumptions:\n${bullet(profile.assumptions)}`);
    }
  }

  if (competitors?.competitors?.length) {
    sections.push("\nCompetitors:");
    for (const c of competitors.competitors.slice(0, 12)) {
      sections.push(
        `  - ${c.name} (${c.competitorType}) — ${c.shortDescription} | ${c.websiteUrl}`,
      );
    }
  }

  if (emerging?.emergingPlayers?.length) {
    sections.push("\nEmerging / adjacent players:");
    for (const p of emerging.emergingPlayers.slice(0, 12)) {
      sections.push(
        `  - ${p.name} (${p.category}, ${p.threatLevel} threat) — ${p.whyRelevant} | ${p.websiteUrl}`,
      );
    }
  }

  if (signals?.marketSignals?.length) {
    sections.push("\nMarket signals:");
    for (const s of signals.marketSignals.slice(0, 12)) {
      sections.push(
        `  - [${s.signalType}] ${s.signal} → ${s.implicationForClient}`,
      );
    }
  }

  if (segments?.customerSegments?.length) {
    sections.push("\nCustomer segments:");
    for (const s of segments.customerSegments.slice(0, 8)) {
      sections.push(
        `  - ${s.segment} (${s.buyerType}) — pains: ${s.likelyPainPoints.slice(0, 3).join("; ")}`,
      );
    }
  }

  return sections.join("\n");
}
