import type { AgentEvent, Engagement } from "@/types/engagement";
import type {
  CustomTab,
  CustomTabResult,
  CustomTabResultData,
} from "@/types/customTab";
import {
  dedupeCitations,
  streamExaSearch,
  type ExaCitation,
} from "../exa";
import { newResultId } from "../ids";
import {
  saveCustomTabResult,
  updateCustomTabStatus,
} from "../customTabs";
import { citationsToEvidence } from "./base";
import { buildResearchContext } from "./context";
import type { AgentContext } from "./base";

const PROGRESS_THROTTLE_MS = 750;

type EmitFn = AgentContext["emit"];
type CustomEvent = Omit<AgentEvent, "engagementId" | "timestamp">;

/**
 * Bridge a custom-tab event into the existing pipeline event stream.
 *
 * Pipeline events are typed against the {@link AgentType} union, but
 * custom tabs aren't part of that union. We tag every event with the
 * `orchestrator` agent and stash the original `tabId` in `data` so the
 * UI can route the event to the correct tab without us having to widen
 * the {@link AgentEvent} type.
 */
function customEvent(
  tabId: string,
  type: AgentEvent["type"],
  message?: string,
  extra?: Record<string, unknown>,
): CustomEvent {
  return {
    agent: "orchestrator",
    type,
    message,
    data: { customTabId: tabId, ...extra },
  };
}

interface RunCustomTabInput {
  engagement: Engagement;
  tab: CustomTab;
  emit: EmitFn;
  /**
   * Pre-computed context block from {@link buildResearchContext}. Passed
   * in so the orchestrator can build it once and share it across many
   * custom tabs in a single pipeline run.
   */
  contextBlock?: string;
}

/**
 * Run a single user-defined custom tab end-to-end: mark it `running`,
 * stream an Exa answer, persist the result, and mark `complete` /
 * `failed`. Errors are caught and stored as a `failed` result rather
 * than rethrown so a single broken prompt doesn't take down the whole
 * pipeline.
 */
export async function runCustomTab({
  engagement,
  tab,
  emit,
  contextBlock,
}: RunCustomTabInput): Promise<CustomTabResult> {
  const start = Date.now();
  await updateCustomTabStatus(engagement.id, tab.id, "running");
  await emit(
    customEvent(
      tab.id,
      "agent_started",
      `Custom tab "${tab.label}" started`,
      { customTabLabel: tab.label },
    ),
  );

  try {
    const context = contextBlock ?? buildResearchContextForCustom(engagement);
    const query = buildCustomQuery(tab, context);

    let markdown = "";
    let citations: ExaCitation[] = [];
    let lastEmit = 0;

    for await (const chunk of streamExaSearch({
      query,
      type: "deep",
      // Plain Markdown deltas — same as the memo agent — so there's no
      // partial-JSON parsing to deal with mid-stream.
      outputSchema: { type: "text", description: "Markdown research answer" },
      systemPrompt: CUSTOM_TAB_SYSTEM_PROMPT,
      contents: { highlights: true },
    })) {
      markdown = chunk.partialAnswer;
      citations = chunk.citations;

      const now = Date.now();
      if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
        lastEmit = now;
        await emit(
          customEvent(
            tab.id,
            "agent_progress",
            `Drafting "${tab.label}" (${markdown.length} chars)…`,
            { length: markdown.length },
          ),
        );
      }
    }

    const data: CustomTabResultData = { markdown };
    const result: CustomTabResult = {
      id: newResultId(),
      engagementId: engagement.id,
      tabId: tab.id,
      status: "complete",
      data,
      citations: citationsToEvidence(dedupeCitations(citations)),
      createdAt: new Date(start).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveCustomTabResult(result);
    await updateCustomTabStatus(engagement.id, tab.id, "complete");
    await emit(
      customEvent(
        tab.id,
        "agent_completed",
        `Custom tab "${tab.label}" complete`,
        { citations: result.citations?.length ?? 0 },
      ),
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed: CustomTabResult = {
      id: newResultId(),
      engagementId: engagement.id,
      tabId: tab.id,
      status: "failed",
      error: message,
      createdAt: new Date(start).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveCustomTabResult(failed);
    await updateCustomTabStatus(engagement.id, tab.id, "failed");
    await emit(
      customEvent(
        tab.id,
        "agent_failed",
        `Custom tab "${tab.label}" failed: ${message}`,
      ),
    );
    return failed;
  }
}

const CUSTOM_TAB_SYSTEM_PROMPT =
  "You are a strategy consultant answering a research question for a client engagement. " +
  "Use only what the live web evidence supports — do not invent facts. " +
  "Format your answer in clean Markdown with descriptive headings, short paragraphs, " +
  "and bulleted lists where appropriate. When you make a specific claim, link the " +
  "supporting source inline. End with a `## Sources` section that lists every URL " +
  "you cited. Label assumptions explicitly when evidence is thin and never overstate certainty.";

function buildCustomQuery(tab: CustomTab, context: string): string {
  return [
    "Answer the following user research question about the engagement below.",
    "",
    "## User research question",
    `Title: ${tab.label}`,
    "Question / instructions:",
    tab.prompt,
    "",
    "## Engagement context",
    context,
    "",
    "Return a thorough, well-structured Markdown answer with citations.",
  ].join("\n");
}

/**
 * The custom-tab agent is invoked through the per-tab POST endpoint as well
 * as the main pipeline. The per-tab endpoint won't have an existing
 * {@link AgentContext}, so we provide a thin convenience wrapper here that
 * builds context straight off the engagement (without other agent results).
 */
export function buildResearchContextForCustom(
  engagement: Engagement,
): string {
  return buildResearchContext({
    engagement,
    results: {},
    emit: noopEmit,
  });
}

const noopEmit: EmitFn = async () => {
  /* no-op — only needed to satisfy AgentContext.emit's signature */
};
