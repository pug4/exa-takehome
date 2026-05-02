import Link from "next/link";
import { IntegrationsSection } from "@/components/settings/IntegrationsSection";
import { PromptSettings } from "@/components/settings/PromptSettings";
import { listResolvedPromptSlots } from "@/lib/prompts";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const slots = await listResolvedPromptSlots();

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-12">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          Settings
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Workspace settings
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Tune integrations and customize how Market Map&rsquo;s agents reason
          about your engagements.
        </p>
        <p className="mt-3 max-w-2xl text-xs text-[var(--muted)]">
          <Link
            className="text-[var(--accent)] underline underline-offset-2"
            href="/engagements"
          >
            Back to engagements
          </Link>
        </p>
      </header>

      <IntegrationsSection />

      <section>
        <header className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Prompt customization
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
            Each research agent ships with a default system prompt. Add your
            own twist, strategy, or interview style here and we&rsquo;ll layer
            it into every Exa call that agent makes. Customizations apply to{" "}
            <strong>all engagements</strong> — past and future.
          </p>
        </header>

        <PromptSettings initialSlots={slots} />
      </section>
    </div>
  );
}
