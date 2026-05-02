"use client";

import type { AgentStatus } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EvidenceList } from "@/components/EvidenceList";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";
import { getDomain } from "@/lib/url";

const CATEGORY_LABEL = {
  emerging_direct_threat: "Emerging direct threat",
  adjacent_player: "Adjacent player",
  substitute: "Substitute",
  ecosystem_partner: "Ecosystem partner",
} as const;

const THREAT_TONE = {
  low: "muted",
  medium: "warning",
  high: "danger",
} as const;

interface EmergingPlayersTabProps {
  status: AgentStatus;
  result?: ResearchResult<"emergingPlayers">;
}

export function EmergingPlayersTab({ status, result }: EmergingPlayersTabProps) {
  const players = result?.data?.emergingPlayers ?? [];
  if (players.length === 0) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="No emerging players yet"
        pendingDescription="The Emerging & Adjacent Players agent finds non-obvious startups, adjacent software, substitutes, and ecosystem partners."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {players.map((player) => (
        <Card key={`${player.name}-${player.websiteUrl}`}>
          <CardBody className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="truncate font-semibold">{player.name}</h4>
                <a
                  href={player.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-[var(--info)] hover:underline"
                >
                  {getDomain(player.websiteUrl)}
                </a>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone="info">{CATEGORY_LABEL[player.category]}</Badge>
                <Badge tone={THREAT_TONE[player.threatLevel]}>
                  threat: {player.threatLevel}
                </Badge>
              </div>
            </div>
            <p className="text-sm">{player.whyRelevant}</p>
            <p className="text-xs text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">
                Relationship:
              </span>{" "}
              {player.relationshipToClient}
            </p>
            <EvidenceList urls={player.evidenceUrls} className="pt-1" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
