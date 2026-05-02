function readEnv(key: string): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  EXA_API_KEY: readEnv("EXA_API_KEY"),
  UPSTASH_REDIS_REST_URL: readEnv("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: readEnv("UPSTASH_REDIS_REST_TOKEN"),
};

export function requireExaApiKey(): string {
  if (!env.EXA_API_KEY) {
    throw new Error(
      "EXA_API_KEY is not set. Add it to .env.local. Get one at https://dashboard.exa.ai",
    );
  }
  return env.EXA_API_KEY;
}

export function hasUpstash(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}
