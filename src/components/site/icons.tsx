import {
  Brain,
  Code,
  Cpu,
  Database,
  Globe,
  LayoutTemplate,
  Link as LinkIcon,
  Mail,
  Palette,
  Server,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { SVGProps } from "react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  code: Code,
  layout: LayoutTemplate,
  server: Server,
  brain: Brain,
  wrench: Wrench,
  sparkles: Sparkles,
  palette: Palette,
  database: Database,
  cpu: Cpu,
  globe: Globe,
};
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}

// Simple original glyphs for social platforms (lucide no longer ships brand logos)
type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

const GLYPHS: Record<string, (p: P) => React.ReactElement> = {
  github: (p) => (
    <svg {...base(p)}>
      <path d="M5 9.5 4.5 4l4 2.2a9 9 0 0 1 7 0L19.5 4 19 9.5a7 7 0 0 1 1 3.6C20 17.5 16.4 20 12 20s-8-2.5-8-6.9a7 7 0 0 1 1-3.6Z" />
      <circle cx="9" cy="13" r=".9" fill="currentColor" />
      <circle cx="15" cy="13" r=".9" fill="currentColor" />
    </svg>
  ),
  linkedin: (p) => (
    <svg {...base(p)}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 10.5V16M8 7.6v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1 1 2.1 2.6V16" />
    </svg>
  ),
  x: (p) => (
    <svg {...base(p)}>
      <path d="M4 4l16 16M20 4 4 20" />
    </svg>
  ),
  twitter: (p) => GLYPHS.x(p),
  dribbble: (p) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 3.7c3.5 4.4 5.8 10.3 6.6 16.6M3.2 10.6c5.6.4 10.9-.9 15.3-4.6M5.4 18.3c3.5-4.3 8.6-5.7 15.4-3.8" />
    </svg>
  ),
  instagram: (p) => (
    <svg {...base(p)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r=".6" fill="currentColor" />
    </svg>
  ),
  youtube: (p) => (
    <svg {...base(p)}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="m10.5 9.5 4 2.5-4 2.5Z" fill="currentColor" />
    </svg>
  ),
  email: (p) => <Mail {...(p as object)} aria-hidden />,
  website: (p) => <Globe {...(p as object)} aria-hidden />,
};

export const SOCIAL_PLATFORMS = ["github", "linkedin", "x", "dribbble", "instagram", "youtube", "website", "other"];

export function SocialIcon({ platform, className }: { platform: string; className?: string }) {
  const Glyph = GLYPHS[platform.toLowerCase()];
  if (Glyph) return <Glyph className={className} />;
  return <LinkIcon className={className} aria-hidden />;
}
