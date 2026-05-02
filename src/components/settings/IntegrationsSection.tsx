import type { ComponentType, SVGProps } from "react";
import { Card, CardBody } from "@/components/ui/Card";

interface Integration {
  id: string;
  name: string;
  description: string;
  brandColor: string;
  category: string;
  Mark: ComponentType<SVGProps<SVGSVGElement>>;
}

const INTEGRATIONS: readonly Integration[] = [
  {
    id: "hubspot",
    name: "HubSpot",
    description:
      "Push memos to deal records, sync engagements to companies, and pull contacts into discovery questions.",
    brandColor: "#FF7A59",
    category: "CRM",
    Mark: HubSpotMark,
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description:
      "Two-way sync with Accounts and Opportunities so memos and competitor lists flow back into your CRM.",
    brandColor: "#00A1E0",
    category: "CRM",
    Mark: SalesforceMark,
  },
  {
    id: "zapier",
    name: "Zapier",
    description:
      "Trigger Zaps when engagements complete and route memos, signals, or competitor changes into thousands of downstream apps.",
    brandColor: "#FF4A00",
    category: "Automation",
    Mark: ZapierMark,
  },
];

export function IntegrationsSection() {
  return (
    <section className="mb-10">
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
          Connect Market Map to the tools you already run engagements in.
          We&rsquo;re starting with CRM — let us know which integration is
          highest priority for your team.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {INTEGRATIONS.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} />
        ))}
      </div>
    </section>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const { name, description, brandColor, category, Mark } = integration;
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 border-b border-[var(--border)] bg-[var(--surface-alt)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: brandColor }}
        />
        Coming soon
      </div>
      <CardBody className="pt-12 opacity-90">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${brandColor}1a` }}
          >
            <Mark width={28} height={28} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold tracking-tight">{name}</h3>
              <span
                className="text-[10px] font-medium uppercase tracking-[0.12em]"
                style={{ color: brandColor }}
              >
                {category}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
              {description}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Generic 5-node sprocket mark in the HubSpot brand color. Not the official
 * HubSpot logo — just a placeholder mark for the "Coming soon" card.
 */
function HubSpotMark(props: SVGProps<SVGSVGElement>) {
  const fill = "#FF7A59";
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <g stroke={fill} strokeWidth={2.2} strokeLinecap="round">
        <line x1="16" y1="16" x2="16" y2="6" />
        <line x1="16" y1="16" x2="25" y2="11" />
        <line x1="16" y1="16" x2="22" y2="26" />
        <line x1="16" y1="16" x2="10" y2="26" />
        <line x1="16" y1="16" x2="7" y2="11" />
      </g>
      <g fill={fill}>
        <circle cx="16" cy="6" r="3" />
        <circle cx="25" cy="11" r="3" />
        <circle cx="22" cy="26" r="3" />
        <circle cx="10" cy="26" r="3" />
        <circle cx="7" cy="11" r="3" />
        <circle cx="16" cy="16" r="4" />
      </g>
    </svg>
  );
}

/**
 * Generic cloud silhouette in the Salesforce brand color. Not the official
 * Salesforce logo — just a placeholder mark for the "Coming soon" card.
 */
function SalesforceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 28" fill="none" {...props}>
      <path
        d="M32 17c0-4.4-3.6-8-8-8-1.3 0-2.6.3-3.7.9C18.9 7.5 16.6 6 14 6c-3.9 0-7 3.1-7 7 0 .5 0 1 .1 1.4-.5-.2-1-.3-1.6-.3C2.5 14.1 0 16.6 0 19.6 0 22.6 2.5 25 5.5 25h25.7c2.7 0 4.8-2.2 4.8-4.8 0-2.4-1.7-4.4-4-4.8z"
        fill="#00A1E0"
      />
    </svg>
  );
}

/**
 * Generic lightning-bolt mark in the Zapier brand color. Not the official
 * Zapier logo — just a placeholder mark for the "Coming soon" card.
 */
function ZapierMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path
        d="M18 3 6 18h7l-3 11 12-15h-7l3-11z"
        fill="#FF4A00"
      />
    </svg>
  );
}
