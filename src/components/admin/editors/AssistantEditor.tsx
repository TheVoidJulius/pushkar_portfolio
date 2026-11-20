"use client";

import { CheckCircle2, CircleAlert, Loader2, Play, RefreshCw, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { saveSingleton } from "@/lib/admin/api";
import { AssistantSchema, fieldErrors } from "@/lib/admin/schemas";
import type { AssistantSettings } from "@/lib/types";
import { MomoHead } from "../../momo/MomoHead";
import { MomoGallery } from "../../momo/MomoGallery";
import { VoiceEngine, type VoiceStatus } from "../../momo/voice";
import { Button, Field, Input, PageHeader, Panel, SaveBar, Select, Slider, TagInput, Textarea, Toggle, useFormState } from "../ui";

const LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-CA", label: "English (Canada)" },
];

type Voice = { id: string; name: string; category: string; labels: Record<string, string>; preview: string | null };

export function AssistantEditor({
  initial,
  ownerName,
  integrations,
}: {
  initial: AssistantSettings;
  ownerName: string;
  integrations: { claude: boolean; elevenlabs: boolean; envVoice: boolean };
}) {
  const f = useFormState(initial);
  const v = f.values;
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<VoiceStatus>("idle");
  const [testEngine, setTestEngine] = useState<string | null>(null);
  const previewAudio = useRef<HTMLAudioElement | null>(null);

  // Test voice with the *current* (possibly unsaved) browser-voice settings
  const [engine] = useState(() => new VoiceEngine(initial));
  useEffect(() => {
    engine.configure(v);
  }, [engine, v]);
  useEffect(() => {
    const off = engine.on((s, info) => {
      setTestStatus(s);
      if (info?.engine) setTestEngine(info.engine);
    });
    return () => {
      off();
      engine.stop();
    };
  }, [engine]);

  const save = async () => {
    const parsed = AssistantSchema.safeParse(v);
    if (!parsed.success) {
      f.setErrors(fieldErrors(parsed.error));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      await saveSingleton("assistant_settings", parsed.data);
      f.setSaved(v);
      toast.success(`${v.name}'s settings saved!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const loadVoices = async () => {
    setLoadingVoices(true);
    setVoiceError(null);
    try {
      const res = await fetch("/api/admin/voices", { cache: "no-store" });
      const data = await res.json();
      if (data.error) setVoiceError(data.error);
      setVoices(data.voices ?? []);
      setModels(data.models ?? []);
    } catch {
      setVoiceError("Couldn't load voices.");
    } finally {
      setLoadingVoices(false);
    }
  };

  const test = () => {
    if (testStatus === "speaking" || testStatus === "loading") return engine.stop();
    if (f.dirty && v.voice_provider !== "browser" && integrations.elevenlabs) {
      toast.info("Save first to hear your new ElevenLabs settings — the test uses the saved voice.");
    }
    engine.unlock();
    void engine.speak(v.greeting || `Hi! I'm ${v.name}. Want me to show you around?`, "excited");
  };

  const playPreview = (url: string | null) => {
    previewAudio.current?.pause();
    if (!url) return;
    previewAudio.current = new Audio(url);
    void previewAudio.current.play();
  };

  const selectedVoice = voices?.find((x) => x.id === v.voice_id);

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description={`${v.name} greets visitors and answers questions using only the content you publish on this site — update a project and ${v.name} knows about it straight away.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Panel title="Personality">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" htmlFor="a-name" error={f.errors.name}>
                <Input id="a-name" value={v.name} onChange={(e) => f.set("name", e.target.value)} maxLength={40} invalid={!!f.errors.name} />
              </Field>
              <Field label="Language" htmlFor="a-lang" hint="Used for replies, speech and the microphone">
                <Select id="a-lang" value={v.default_language} onChange={(x) => f.set("default_language", x)} options={LANGUAGES} />
              </Field>
            </div>
            <Field label="Greeting" htmlFor="a-greet" hint="The first thing visitors see (and hear)." count={v.greeting.length} max={400}>
              <Textarea id="a-greet" rows={2} value={v.greeting} onChange={(e) => f.set("greeting", e.target.value)} />
            </Field>
            <Field
              label="Personality instructions"
              htmlFor="a-pers"
              hint={`How ${v.name} should talk. Facts about you come from your portfolio automatically — don't put them here.`}
              count={v.personality.length}
              max={3000}
            >
              <Textarea id="a-pers" rows={6} value={v.personality} onChange={(e) => f.set("personality", e.target.value)} />
            </Field>
            <Field label="Suggested questions" htmlFor="a-sugg" hint="Shown as quick buttons when the chat opens (max 6).">
              <TagInput id="a-sugg" value={v.suggested_questions} onChange={(x) => f.set("suggested_questions", x)} max={6} placeholder="e.g. What's the best project?" />
            </Field>
            <Toggle
              checked={v.tour_enabled}
              onChange={(x) => f.set("tour_enabled", x)}
              label="Narrate the page"
              description={`${v.name} introduces herself when the site opens, then flies beside each section and talks about it as visitors scroll. Built automatically from your content.`}
            />
            <Toggle checked={v.greeting_enabled} onChange={(x) => f.set("greeting_enabled", x)} label="Greet visitors" description="Show the welcome bubble (and say the greeting when the chat opens)." />
          </Panel>

          <Panel title="Voice" description="An expressive, anime-style English voice. Without ElevenLabs, the visitor's browser voice is used (free, more robotic).">
            <Toggle checked={v.voice_enabled} onChange={(x) => f.set("voice_enabled", x)} label="Speak replies out loud" description="Visitors can still mute it." />
            <Field label="Voice provider" htmlFor="a-prov">
              <Select
                id="a-prov"
                value={v.voice_provider}
                onChange={(x) => f.set("voice_provider", x as AssistantSettings["voice_provider"])}
                options={[
                  { value: "auto", label: "Automatic — ElevenLabs if set up, otherwise browser" },
                  { value: "elevenlabs", label: "ElevenLabs (premium voice)" },
                  { value: "browser", label: "Browser voice only (free)" },
                ]}
              />
            </Field>

            {v.voice_provider !== "browser" && (
              <div className="rounded-2xl border border-line p-4">
                <p className="flex items-center gap-2 text-[14.5px] font-medium">
                  {integrations.elevenlabs ? <CheckCircle2 className="size-4 text-mint" /> : <CircleAlert className="size-4 text-amber" />}
                  {integrations.elevenlabs ? "ElevenLabs is connected" : "ElevenLabs isn't connected yet"}
                </p>
                {!integrations.elevenlabs ? (
                  <p className="mt-1.5 text-[13.5px] text-ink-3">
                    Add <code className="rounded bg-surface-2 px-1">ELEVENLABS_API_KEY</code> in your hosting settings (see the README). Until then the browser voice is used.
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={loadVoices} loading={loadingVoices} icon={<RefreshCw className="size-4" />} className="!h-9">
                        {voices ? "Reload voices" : "Load my ElevenLabs voices"}
                      </Button>
                      <span className="text-[13px] text-ink-3">
                        Tip: in ElevenLabs’ Voice Library, search “Japanese accent English female” and add a warm, mature voice to your account first. Japanese-accent voices are marked ★.
                      </span>
                    </div>
                    {voiceError && <p className="text-[13.5px] text-accent-text">{voiceError}</p>}
                    {voices && (
                      <Field label="Voice" htmlFor="a-voice">
                        <div className="flex gap-2">
                          <Select
                            id="a-voice"
                            value={v.voice_id}
                            onChange={(x) => f.set("voice_id", x)}
                            options={[
                              { value: "", label: integrations.envVoice ? "Use ELEVENLABS_VOICE_ID from settings" : "— Pick a voice —" },
                              ...voices.map((x) => ({
                                value: x.id,
                                label: `${/japan/i.test(x.labels.accent ?? "") ? "★ " : ""}${x.name}${x.labels.gender ? ` · ${x.labels.gender}` : ""}${x.labels.age ? ` · ${x.labels.age}` : ""}${x.labels.accent ? ` · ${x.labels.accent}` : ""}`,
                              })),
                            ]}
                          />
                          <Button className="shrink-0" disabled={!selectedVoice?.preview} onClick={() => playPreview(selectedVoice?.preview ?? null)} aria-label="Play voice sample" icon={<Play className="size-4" />}>
                            Sample
                          </Button>
                        </div>
                      </Field>
                    )}
                    {!voices && (
                      <Field label="Voice ID" htmlFor="a-voiceid" hint="Or paste a voice ID from ElevenLabs.">
                        <Input id="a-voiceid" value={v.voice_id} onChange={(e) => f.set("voice_id", e.target.value.trim())} placeholder="e.g. 21m00Tcm4TlvDq8ikWAM" />
                      </Field>
                    )}
                    <Field label="Voice model" htmlFor="a-model" hint="Eleven v3 (or newer) understands emotion tags, so the voice sounds excited, curious or gentle to match each reply.">
                      {models.length > 0 ? (
                        <Select id="a-model" value={v.voice_model} onChange={(x) => f.set("voice_model", x)} options={models.map((m) => ({ value: m.id, label: `${m.name} (${m.id})` }))} />
                      ) : (
                        <Input id="a-model" value={v.voice_model} onChange={(e) => f.set("voice_model", e.target.value.trim())} />
                      )}
                    </Field>
                    <Slider label="Expressiveness" value={v.voice_style} onChange={(x) => f.set("voice_style", x)} min={0} max={1} step={0.05} hint="Higher = more emotional and animated." />
                    <Slider label="Stability" value={v.voice_stability} onChange={(x) => f.set("voice_stability", x)} min={0} max={1} step={0.05} hint="Lower = more varied delivery, higher = more consistent." />
                    <Slider label="Speed" value={v.voice_speed} onChange={(x) => f.set("voice_speed", x)} min={0.7} max={1.2} step={0.05} format={(x) => `${x.toFixed(2)}×`} />
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-line p-4">
              <p className="text-[14.5px] font-medium">Browser voice (fallback)</p>
              <p className="mt-1 mb-4 text-[13px] text-ink-3">Free voice built into the visitor&apos;s browser. Voices differ between browsers; Microsoft Edge has the most natural ones.</p>
              <div className="space-y-4">
                <Field label="Accent" htmlFor="a-accent" hint="Japanese accent uses a Japanese female voice to read English (e.g. Edge's “Nanami”). Falls back to English if none is installed.">
                  <Select
                    id="a-accent"
                    value={v.browser_accent}
                    onChange={(x) => f.set("browser_accent", x as AssistantSettings["browser_accent"])}
                    options={[
                      { value: "japanese", label: "Japanese accent (recommended)" },
                      { value: "english", label: "Neutral English" },
                    ]}
                  />
                </Field>
                <Slider label="Pitch" value={v.browser_pitch} onChange={(x) => f.set("browser_pitch", x)} min={0.5} max={2} step={0.05} />
                <Slider label="Speed" value={v.browser_rate} onChange={(x) => f.set("browser_rate", x)} min={0.5} max={1.5} step={0.02} format={(x) => `${x.toFixed(2)}×`} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={test}
                icon={
                  testStatus === "loading" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : testStatus === "speaking" ? (
                    <Square className="size-4" />
                  ) : (
                    <Volume2 className="size-4" />
                  )
                }
              >
                {testStatus === "speaking" ? "Stop" : `Hear ${v.name}`}
              </Button>
              <span className="text-[13px] text-ink-3" aria-live="polite">
                {testStatus === "speaking" && testEngine ? `Playing with ${testEngine === "elevenlabs" ? "ElevenLabs" : "the browser voice"}` : ""}
                {testStatus === "error" ? "This browser can't speak. Try Chrome or Edge." : ""}
              </span>
            </div>
          </Panel>

          <Panel title="Expressions" description={`${v.name} switches between these automatically. Click one to see it talk.`}>
            <MomoGallery />
          </Panel>
        </div>

        <div className="space-y-6">
          <div className="sticky top-6 space-y-6">
            <Panel title="Preview">
              <div className="relative flex flex-col items-center rounded-2xl bg-gradient-to-b from-lavender-soft to-transparent p-4">
                {v.greeting_enabled && v.greeting && (
                  <p className="mb-2 rounded-2xl rounded-bl-md border border-line bg-bg-elevated px-3.5 py-2.5 text-[13.5px] shadow-soft">{v.greeting}</p>
                )}
                <MomoHead expression={testStatus === "speaking" ? "excited" : "happy"} talking={testStatus === "speaking"} levelRef={engine.levelRef} className="size-44" />
                <p className="font-display text-[22px]">{v.name}</p>
              </div>
            </Panel>
            <Panel title="Brain">
              <p className="flex items-start gap-2 text-[14px]">
                {integrations.claude ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-mint" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber" />}
                <span>
                  {integrations.claude
                    ? "Natural conversation powered by Claude."
                    : "Using built-in answers about your projects, skills, experience and contact info."}
                  {!integrations.claude && (
                    <span className="mt-1 block text-[13px] text-ink-3">For free-flowing conversation, add ANTHROPIC_API_KEY (see README).</span>
                  )}
                </span>
              </p>
              <p className="text-[13px] text-ink-3">
                {v.name} only talks about what&apos;s published on {ownerName}&apos;s site and says so when it doesn&apos;t know something.
              </p>
            </Panel>
          </div>
        </div>
      </div>
      <SaveBar dirty={f.dirty} saving={saving} onSave={save} onReset={f.reset} />
    </>
  );
}
