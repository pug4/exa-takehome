"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentType, Engagement } from "@/types/engagement";
import type { CustomTab } from "@/types/customTab";
import { useEngagementStream } from "@/lib/useEngagementStream";
import { getEnabledAgents } from "@/lib/engagements";
import { EngagementHeader } from "@/components/EngagementHeader";
import {
  EngagementTabs,
  TAB_KEYS,
  customTabKey,
  parseCustomTabKey,
  type TabKey,
} from "@/components/EngagementTabs";
import { CustomTabModal } from "@/components/CustomTabModal";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { MonitoringTab } from "@/components/tabs/MonitoringTab";
import { ClientProfileTab } from "@/components/tabs/ClientProfileTab";
import { CompetitorsTab } from "@/components/tabs/CompetitorsTab";
import { DeepAnalysisTab } from "@/components/tabs/DeepAnalysisTab";
import { EmergingPlayersTab } from "@/components/tabs/EmergingPlayersTab";
import { MarketSignalsTab } from "@/components/tabs/MarketSignalsTab";
import { CustomerSegmentsTab } from "@/components/tabs/CustomerSegmentsTab";
import { DiscoveryQuestionsTab } from "@/components/tabs/DiscoveryQuestionsTab";
import { ExpertCallsTab } from "@/components/tabs/ExpertCallsTab";
import { MemoTab } from "@/components/tabs/MemoTab";
import { OneSlideTab } from "@/components/tabs/OneSlideTab";
import { ExportsTab } from "@/components/tabs/ExportsTab";
import { CustomTabView } from "@/components/tabs/CustomTabView";

export default function EngagementDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const autoRanRef = useRef<string | null>(null);
  const [updatingTabs, setUpdatingTabs] = useState(false);
  const [tabsError, setTabsError] = useState<string | null>(null);
  const [showCustomTabModal, setShowCustomTabModal] = useState(false);

  const {
    engagement,
    results,
    customResults,
    events,
    isRunning,
    error,
    run,
    stop,
    refresh,
  } = useEngagementStream(id);

  const enabledAgents = engagement ? getEnabledAgents(engagement) : [];
  const customTabs = engagement?.customTabs ?? [];
  const requestedTab = resolveActiveTab(search.get("tab"), customTabs);
  const activeTab = isTabVisible(requestedTab, enabledAgents, customTabs)
    ? requestedTab
    : "overview";

  useEffect(() => {
    if (
      search.get("run") !== "1" ||
      !engagement ||
      autoRanRef.current === id
    ) {
      return;
    }
    autoRanRef.current = id;
    const next = new URLSearchParams(search.toString());
    next.delete("run");
    router.replace(
      `/engagements/${id}${next.toString() ? `?${next.toString()}` : ""}`,
    );
    run();
  }, [search, engagement, run, router, id]);

  const setActiveTabInUrl = useCallback(
    (tab: TabKey): void => {
      const next = new URLSearchParams(search.toString());
      if (tab === "overview") next.delete("tab");
      else next.set("tab", tab);
      router.replace(
        `/engagements/${id}${next.toString() ? `?${next.toString()}` : ""}`,
        { scroll: false },
      );
    },
    [id, router, search],
  );

  // If the user removed the tab they were viewing, fall back to overview in
  // the URL so reloads land somewhere valid.
  useEffect(() => {
    if (!engagement) return;
    if (requestedTab === activeTab) return;
    setActiveTabInUrl("overview");
  }, [engagement, requestedTab, activeTab, setActiveTabInUrl]);

  const handleTabChange = (tab: TabKey): void => {
    setActiveTabInUrl(tab);
  };

  const handleEnabledAgentsChange = useCallback(
    async (next: AgentType[]): Promise<void> => {
      setTabsError(null);
      setUpdatingTabs(true);
      try {
        const response = await fetch(`/api/engagements/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabledAgents: next }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            payload.error ?? `Failed to update tabs: ${response.status}`,
          );
        }
        await refresh();
      } catch (err) {
        setTabsError(
          err instanceof Error ? err.message : "Failed to update tabs",
        );
      } finally {
        setUpdatingTabs(false);
      }
    },
    [id, refresh],
  );

  const handleRemoveCustomTab = useCallback(
    async (tabId: string): Promise<void> => {
      if (
        !confirm(
          "Remove this custom tab? Its prompt and result will be deleted too.",
        )
      ) {
        return;
      }
      setTabsError(null);
      setUpdatingTabs(true);
      try {
        const response = await fetch(
          `/api/engagements/${id}/custom-tabs/${tabId}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            payload.error ?? `Failed to remove tab: ${response.status}`,
          );
        }
        // If we're currently viewing the deleted tab, route home before the
        // refresh runs so the user doesn't see a flash of a missing tab.
        if (activeTab === customTabKey(tabId)) {
          setActiveTabInUrl("overview");
        }
        await refresh();
      } catch (err) {
        setTabsError(
          err instanceof Error ? err.message : "Failed to remove tab",
        );
      } finally {
        setUpdatingTabs(false);
      }
    },
    [id, refresh, activeTab, setActiveTabInUrl],
  );

  const handleCustomTabCreated = useCallback(
    async (
      _engagement: Engagement,
      tab: CustomTab,
    ): Promise<void> => {
      setShowCustomTabModal(false);
      setActiveTabInUrl(customTabKey(tab.id));
      await refresh();
    },
    [refresh, setActiveTabInUrl],
  );

  if (!engagement) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
        {error ? error : "Loading engagement…"}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <EngagementHeader
        engagement={engagement}
        isRunning={isRunning}
        onRun={run}
        onStop={stop}
      />

      <EngagementTabs
        active={activeTab}
        onChange={handleTabChange}
        engagement={engagement}
        onEnabledAgentsChange={handleEnabledAgentsChange}
        onRemoveCustomTab={(tabId) => {
          void handleRemoveCustomTab(tabId);
        }}
        onAddCustomTab={() => setShowCustomTabModal(true)}
        isUpdating={updatingTabs}
      />

      {tabsError && (
        <div className="border-b border-[var(--danger)]/40 bg-[var(--danger)]/10 px-8 py-2 text-xs text-[var(--danger)]">
          {tabsError}
        </div>
      )}

      {error && !isRunning && (
        <div className="border-b border-[var(--danger)]/40 bg-[var(--danger)]/10 px-8 py-2 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex-1 px-8 py-6">
        {renderTab(
          activeTab,
          engagement,
          results,
          customResults,
          events,
          isRunning,
          refresh,
          handleRemoveCustomTab,
        )}
      </div>

      <CustomTabModal
        open={showCustomTabModal}
        engagementId={id}
        onClose={() => setShowCustomTabModal(false)}
        onCreated={handleCustomTabCreated}
      />
    </div>
  );
}

function resolveActiveTab(
  raw: string | null,
  customTabs: CustomTab[],
): TabKey {
  if (!raw) return "overview";
  if ((TAB_KEYS as string[]).includes(raw)) {
    return raw as TabKey;
  }
  const customId = parseCustomTabKey(raw as TabKey);
  if (customId && customTabs.some((tab) => tab.id === customId)) {
    return raw as TabKey;
  }
  return "overview";
}

function isTabVisible(
  tab: TabKey,
  enabledAgents: AgentType[],
  customTabs: CustomTab[],
): boolean {
  if (tab === "overview" || tab === "monitoring" || tab === "exports") {
    return true;
  }
  const customId = parseCustomTabKey(tab);
  if (customId !== null) {
    return customTabs.some((t) => t.id === customId);
  }
  return (enabledAgents as TabKey[]).includes(tab);
}

function renderTab(
  tab: TabKey,
  engagement: NonNullable<ReturnType<typeof useEngagementStream>["engagement"]>,
  results: ReturnType<typeof useEngagementStream>["results"],
  customResults: ReturnType<typeof useEngagementStream>["customResults"],
  events: ReturnType<typeof useEngagementStream>["events"],
  isRunning: boolean,
  refresh: () => Promise<void>,
  removeCustomTab: (tabId: string) => Promise<void>,
) {
  const customId = parseCustomTabKey(tab);
  if (customId !== null) {
    const customTab = (engagement.customTabs ?? []).find(
      (t) => t.id === customId,
    );
    if (!customTab) return null;
    return (
      <CustomTabView
        // Force a fresh mount per tab so each tab keeps its own local
        // stream state (running/partial markdown/error) without an
        // effect-driven reset inside the view.
        key={customId}
        engagementId={engagement.id}
        tab={customTab}
        result={customResults[customId]}
        onAfterRun={() => refresh()}
        onDelete={() => {
          void removeCustomTab(customId);
        }}
      />
    );
  }

  switch (tab) {
    case "overview":
      return (
        <OverviewTab
          engagement={engagement}
          events={events}
          isRunning={isRunning}
        />
      );
    case "monitoring":
      return <MonitoringTab engagementId={engagement.id} />;
    case "clientProfile":
      return (
        <ClientProfileTab
          status={engagement.agents.clientProfile}
          result={results.clientProfile}
        />
      );
    case "competitors":
      return (
        <CompetitorsTab
          status={engagement.agents.competitors}
          result={results.competitors}
        />
      );
    case "deepCompetitiveAnalysis":
      return (
        <DeepAnalysisTab
          engagement={engagement}
          status={engagement.agents.deepCompetitiveAnalysis}
          result={results.deepCompetitiveAnalysis}
          onAnalysisComplete={() => {
            refresh();
          }}
        />
      );
    case "emergingPlayers":
      return (
        <EmergingPlayersTab
          status={engagement.agents.emergingPlayers}
          result={results.emergingPlayers}
        />
      );
    case "marketSignals":
      return (
        <MarketSignalsTab
          status={engagement.agents.marketSignals}
          result={results.marketSignals}
        />
      );
    case "customerSegments":
      return (
        <CustomerSegmentsTab
          status={engagement.agents.customerSegments}
          result={results.customerSegments}
        />
      );
    case "discoveryQuestions":
      return (
        <DiscoveryQuestionsTab
          status={engagement.agents.discoveryQuestions}
          result={results.discoveryQuestions}
        />
      );
    case "expertCalls":
      return (
        <ExpertCallsTab
          status={engagement.agents.expertCalls}
          result={results.expertCalls}
        />
      );
    case "memo":
      return <MemoTab status={engagement.agents.memo} result={results.memo} />;
    case "oneSlideSummary":
      return (
        <OneSlideTab
          status={engagement.agents.oneSlideSummary}
          result={results.oneSlideSummary}
        />
      );
    case "exports":
      return <ExportsTab engagement={engagement} results={results} />;
    default:
      return null;
  }
}
