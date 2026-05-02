import { config as loadEnv } from "dotenv";

// Mirror Next.js env loading order so tests see the same values the app does:
// `.env` first, then `.env.local` overrides if present.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
