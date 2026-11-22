// Shapes of the portfolio content. These mirror the Supabase tables 1:1
// (see supabase/migrations) so the same objects flow through the public
// site, the AI assistant, the admin dashboard and JSON import/export.

export type Stat = { value: string; label: string; /** Set server-side when fetched live. */ live?: boolean };
export type Highlight = { title: string; description: string };
export type Social = { platform: string; label: string; url: string };

export type SiteSettings = {
  site_title: string;
  meta_description: string;
  footer_note: string;
  show_assistant: boolean;
  updated_at?: string;
};

export type Profile = {
  name: string;
  designation: string;
  introduction: string;
  description: string;
  location: string;
  availability: string;
  profile_image_url: string | null;
  cta_primary_label: string;
  cta_primary_href: string;
  cta_secondary_label: string;
  cta_secondary_href: string;
  stats: Stat[];
  updated_at?: string;
};

export type Project = {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  year: string;
  highlight: string;
  image_url: string | null;
  technologies: string[];
  github_url: string | null;
  demo_url: string | null;
  featured: boolean;
  published: boolean;
  sort_order: number;
  updated_at?: string;
};

export type SkillLevel = "expert" | "proficient" | "familiar";

export type Skill = {
  id: string;
  category_id: string;
  name: string;
  level: SkillLevel;
  sort_order: number;
  updated_at?: string;
};

export type SkillCategory = {
  id: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  updated_at?: string;
};

export type SkillCategoryWithSkills = SkillCategory & { skills: Skill[] };

export type Experience = {
  id: string;
  company: string;
  role: string;
  location: string;
  company_url: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  is_current: boolean;
  description: string;
  achievements: string[];
  technologies: string[];
  logo_url: string | null;
  published: boolean;
  sort_order: number;
  updated_at?: string;
};

export type AboutContent = {
  headline: string;
  introduction: string;
  biography: string;
  background: string;
  interests: string[];
  highlights: Highlight[];
  image_url: string | null;
  updated_at?: string;
};

export type ContactDetails = {
  email: string;
  phone: string;
  location: string;
  availability_note: string;
  socials: Social[];
  form_enabled: boolean;
  updated_at?: string;
};

export type VoiceProvider = "auto" | "elevenlabs" | "browser";

export type AssistantSettings = {
  name: string;
  greeting: string;
  personality: string;
  default_language: string;
  greeting_enabled: boolean;
  /** Momo's auto-starting guided tour for first-time visitors. */
  tour_enabled: boolean;
  voice_enabled: boolean;
  voice_provider: VoiceProvider;
  voice_id: string;
  voice_model: string;
  voice_stability: number;
  voice_style: number;
  voice_speed: number;
  browser_pitch: number;
  browser_rate: number;
  /** Browser fallback: read English with a Japanese voice (accent) or an English one. */
  browser_accent: "japanese" | "english";
  suggested_questions: string[];
  updated_at?: string;
};

export type PortfolioContent = {
  site: SiteSettings;
  profile: Profile;
  projects: Project[];
  skillCategories: SkillCategoryWithSkills[];
  experiences: Experience[];
  about: AboutContent;
  contact: ContactDetails;
  assistant: AssistantSettings;
};

/** Where the content came from — shown in admin so nobody is confused. */
export type ContentSource = "supabase" | "demo";
