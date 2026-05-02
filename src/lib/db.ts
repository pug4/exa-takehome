import { Redis } from "@upstash/redis";
import type { AgentEvent, AgentType, Engagement } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { env, hasUpstash } from "./env";

export interface KvAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  zrangeDesc(key: string): Promise<string[]>;
  /**
   * Return up to `limit` members in descending score order (newest first).
   * Useful for paginating high-volume sets like the cross-engagement
   * notifications feed without dragging the entire set into memory.
   */
  zrangeDescLimit(key: string, limit: number): Promise<string[]>;
  rpush(key: string, value: unknown): Promise<void>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
  scan(pattern: string): Promise<string[]>;
}

class UpstashAdapter implements KvAdapter {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get<T>(key);
    return value ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.redis.set(key, value as object);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.redis.zadd(key, { score, member });
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.redis.zrem(key, member);
  }

  async zrangeDesc(key: string): Promise<string[]> {
    const result = await this.redis.zrange<string[]>(key, 0, -1, {
      rev: true,
    });
    return result ?? [];
  }

  async zrangeDescLimit(key: string, limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    const result = await this.redis.zrange<string[]>(key, 0, limit - 1, {
      rev: true,
    });
    return result ?? [];
  }

  async rpush(key: string, value: unknown): Promise<void> {
    await this.redis.rpush(key, JSON.stringify(value));
  }

  async lrange<T = unknown>(
    key: string,
    start: number,
    stop: number,
  ): Promise<T[]> {
    const items = await this.redis.lrange(key, start, stop);
    return items.map((item) => {
      if (typeof item === "string") {
        try {
          return JSON.parse(item) as T;
        } catch {
          return item as T;
        }
      }
      return item as T;
    });
  }

  async scan(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | number = 0;
    do {
      const result: [string | number, string[]] = await this.redis.scan(
        cursor,
        { match: pattern, count: 200 },
      );
      const nextCursor = result[0];
      const batch = result[1];
      keys.push(...batch);
      cursor = nextCursor;
    } while (cursor !== "0" && cursor !== 0);
    return keys;
  }
}

const memoryStore: Map<string, unknown> = (
  globalThis as unknown as {
    __EXA_MEMORY_STORE__?: Map<string, unknown>;
  }
).__EXA_MEMORY_STORE__ ?? new Map<string, unknown>();
(
  globalThis as unknown as {
    __EXA_MEMORY_STORE__?: Map<string, unknown>;
  }
).__EXA_MEMORY_STORE__ = memoryStore;

class MemoryAdapter implements KvAdapter {
  async get<T>(key: string): Promise<T | null> {
    return (memoryStore.get(key) as T | undefined) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    memoryStore.set(key, value);
  }
  async del(key: string): Promise<void> {
    memoryStore.delete(key);
  }
  async zadd(key: string, score: number, member: string): Promise<void> {
    const existing =
      (memoryStore.get(key) as Array<{ score: number; member: string }>) ?? [];
    const filtered = existing.filter((item) => item.member !== member);
    filtered.push({ score, member });
    memoryStore.set(key, filtered);
  }
  async zrem(key: string, member: string): Promise<void> {
    const existing =
      (memoryStore.get(key) as Array<{ score: number; member: string }>) ?? [];
    memoryStore.set(
      key,
      existing.filter((item) => item.member !== member),
    );
  }
  async zrangeDesc(key: string): Promise<string[]> {
    const existing =
      (memoryStore.get(key) as Array<{ score: number; member: string }>) ?? [];
    return [...existing]
      .sort((a, b) => b.score - a.score)
      .map((item) => item.member);
  }
  async zrangeDescLimit(key: string, limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    const all = await this.zrangeDesc(key);
    return all.slice(0, limit);
  }
  async rpush(key: string, value: unknown): Promise<void> {
    const existing = (memoryStore.get(key) as unknown[]) ?? [];
    existing.push(value);
    memoryStore.set(key, existing);
  }
  async lrange<T = unknown>(
    key: string,
    start: number,
    stop: number,
  ): Promise<T[]> {
    const existing = ((memoryStore.get(key) as unknown[]) ?? []) as T[];
    if (stop === -1) return existing.slice(start);
    return existing.slice(start, stop + 1);
  }
  async scan(pattern: string): Promise<string[]> {
    const escapeRegex = (input: string): string =>
      input.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `^${escapeRegex(pattern).replace(/\*/g, ".*")}$`,
    );
    return [...memoryStore.keys()].filter((key) => regex.test(key));
  }
}

let adapter: KvAdapter | null = null;
let warned = false;

/**
 * Return the singleton kv adapter — Upstash when REST creds are configured,
 * otherwise a process-local in-memory `Map`. Exported so that domain stores
 * built on top of the same kv (engagements, monitoring, …) share the
 * adapter selection without each module having to reimplement it.
 */
export function getKvAdapter(): KvAdapter {
  if (adapter) return adapter;
  if (hasUpstash()) {
    adapter = new UpstashAdapter();
  } else {
    if (!warned) {
      console.warn(
        "[db] Upstash credentials not set - using in-memory store. Data will be lost on restart. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in .env.local.",
      );
      warned = true;
    }
    adapter = new MemoryAdapter();
  }
  return adapter;
}

function getAdapter(): KvAdapter {
  return getKvAdapter();
}

const ENGAGEMENT_INDEX_KEY = "eng:index";
const engagementKey = (id: string): string => `eng:${id}`;
const resultKey = (id: string, type: AgentType): string =>
  `eng:${id}:result:${type}`;
const eventsKey = (id: string): string => `eng:${id}:events`;

export async function saveEngagement(engagement: Engagement): Promise<void> {
  const kv = getAdapter();
  await kv.set(engagementKey(engagement.id), engagement);
  await kv.zadd(
    ENGAGEMENT_INDEX_KEY,
    new Date(engagement.createdAt).getTime(),
    engagement.id,
  );
}

export async function getEngagement(id: string): Promise<Engagement | null> {
  return getAdapter().get<Engagement>(engagementKey(id));
}

export async function listEngagements(): Promise<Engagement[]> {
  const kv = getAdapter();
  const ids = await kv.zrangeDesc(ENGAGEMENT_INDEX_KEY);
  const engagements = await Promise.all(
    ids.map((id) => kv.get<Engagement>(engagementKey(id))),
  );
  return engagements.filter((e): e is Engagement => Boolean(e));
}

export async function deleteEngagement(id: string): Promise<void> {
  const kv = getAdapter();
  await kv.del(engagementKey(id));
  await kv.zrem(ENGAGEMENT_INDEX_KEY, id);
  await kv.del(eventsKey(id));
  const resultKeys = await kv.scan(`eng:${id}:result:*`);
  await Promise.all(resultKeys.map((key) => kv.del(key)));

  // Sweep custom-tab results too — they live in a sibling keyspace
  // (`eng:<id>:custom-result:*`) so the agent-result scan above misses them.
  const customResultKeys = await kv.scan(`eng:${id}:custom-result:*`);
  await Promise.all(customResultKeys.map((key) => kv.del(key)));

  // Cascade delete any monitoring state attached to the engagement.
  // The monitoring module owns these key patterns
  // (see src/lib/monitoring/store.ts) — we just sweep them here so deletes
  // never leave orphaned monitors or finding indexes behind.
  const monitorKeys = await kv.scan(`monitor:${id}:*`);
  await Promise.all(monitorKeys.map((key) => kv.del(key)));
  await kv.del(`monitor:${id}`);
  await kv.zrem("monitor:index", id);

  // The cross-engagement findings feed stores `<eid>:<fid>` members;
  // remove any whose eid matches us so deleted engagements stop showing
  // up in the front-page activity feed.
  const allFeedMembers = await kv.zrangeDesc("monitor:findings:global");
  await Promise.all(
    allFeedMembers
      .filter((member) => member.startsWith(`${id}:`))
      .map((member) => kv.zrem("monitor:findings:global", member)),
  );
}

export async function saveResult(
  engagementId: string,
  result: ResearchResult,
): Promise<void> {
  await getAdapter().set(resultKey(engagementId, result.type), result);
}

export async function getResult<T extends AgentType>(
  engagementId: string,
  type: T,
): Promise<ResearchResult<T> | null> {
  return getAdapter().get<ResearchResult<T>>(resultKey(engagementId, type));
}

export type ResultsByAgent = Partial<{
  [K in AgentType]: ResearchResult<K>;
}>;

export async function getAllResults(
  engagementId: string,
): Promise<ResultsByAgent> {
  const kv = getAdapter();
  const keys = await kv.scan(`eng:${engagementId}:result:*`);
  const items = await Promise.all(
    keys.map((key) => kv.get<ResearchResult>(key)),
  );
  const out: ResultsByAgent = {};
  for (const item of items) {
    if (item) {
      (out as Record<AgentType, ResearchResult>)[item.type] = item;
    }
  }
  return out;
}

export async function appendEvent(event: AgentEvent): Promise<void> {
  await getAdapter().rpush(eventsKey(event.engagementId), event);
}

export async function getEvents(
  engagementId: string,
  fromIndex = 0,
): Promise<AgentEvent[]> {
  return getAdapter().lrange<AgentEvent>(eventsKey(engagementId), fromIndex, -1);
}

export async function updateAgentStatus(
  engagementId: string,
  agent: AgentType,
  status: Engagement["agents"][AgentType],
): Promise<Engagement | null> {
  const engagement = await getEngagement(engagementId);
  if (!engagement) return null;
  const updated: Engagement = {
    ...engagement,
    agents: { ...engagement.agents, [agent]: status },
    updatedAt: new Date().toISOString(),
  };
  await saveEngagement(updated);
  return updated;
}

export async function updateEngagementStatus(
  engagementId: string,
  status: Engagement["status"],
): Promise<Engagement | null> {
  const engagement = await getEngagement(engagementId);
  if (!engagement) return null;
  const updated: Engagement = {
    ...engagement,
    status,
    updatedAt: new Date().toISOString(),
  };
  await saveEngagement(updated);
  return updated;
}

export async function updateEnabledAgents(
  engagementId: string,
  enabledAgents: AgentType[],
): Promise<Engagement | null> {
  const engagement = await getEngagement(engagementId);
  if (!engagement) return null;
  const updated: Engagement = {
    ...engagement,
    enabledAgents,
    updatedAt: new Date().toISOString(),
  };
  await saveEngagement(updated);
  return updated;
}
