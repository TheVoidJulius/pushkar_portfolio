import { AssistantEditor } from "@/components/admin/editors/AssistantEditor";
import { getPortfolioContent } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const { content } = await getPortfolioContent({ includeDrafts: true });
  return (
    <AssistantEditor
      initial={content.assistant}
      ownerName={content.profile.name}
      // Booleans only — the keys themselves never leave the server
      integrations={{
        claude: Boolean(process.env.ANTHROPIC_API_KEY),
        elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
        envVoice: Boolean(process.env.ELEVENLABS_VOICE_ID),
      }}
    />
  );
}
