"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Save, TestTube2, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { useSettings, mutateSettings } from "@/hooks/use-settings";
import { patchSetting, testLlm } from "@/lib/api";
import { t } from "@/lib/i18n/en";
import type { AppSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

const LANGUAGES = ["English", "Hebrew", "Spanish", "French", "German", "Japanese"];

export default function SettingsPage() {
  const { settings, isLoading, error } = useSettings();

  if (isLoading) {
    return (
      <div className="page-enter flex items-center justify-center py-16 gap-2 text-xs text-slate-500">
        <Loader2 size={16} className="animate-spin" />
        {t.loading}
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="page-enter rounded-[10px] border border-red-400/20 bg-red-500/[0.05] px-4 py-3 text-xs text-red-400 max-w-lg">
        {t.backendError}
      </div>
    );
  }

  return <SettingsForm settings={settings} />;
}

function SettingsForm({ settings }: { settings: AppSettings }) {
  const [deepThinkLlm, setDeepThinkLlm] = useState(settings.deep_think_llm ?? "");
  const [quickThinkLlm, setQuickThinkLlm] = useState(settings.quick_think_llm ?? "");
  const [llmProvider, setLlmProvider] = useState(settings.llm_provider ?? "ollama");
  const [outputLanguage, setOutputLanguage] = useState(settings.output_language ?? "English");
  const [maxDebateRounds, setMaxDebateRounds] = useState(settings.max_debate_rounds ?? "1");
  const [codexPlannerEnabled, setCodexPlannerEnabled] = useState(
    settings.codex_planner_enabled ?? false,
  );
  const [autoSave, setAutoSave] = useState(settings.auto_save ?? true);

  const [secrets, setSecrets] = useState({
    openai_api_key: "",
    anthropic_api_key: "",
    google_api_key: "",
    moonshot_api_key: "",
  });

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showGoogle, setShowGoogle] = useState(false);
  const [showMoonshot, setShowMoonshot] = useState(false);

  /**
   * PATCH /api/settings takes a single {key, value} pair.
   * We send each changed field as a separate request.
   */
  async function handleSave() {
    setSaving(true);
    try {
      const updates: [string, string][] = [
        ["llm_provider", llmProvider],
        ["deep_think_llm", deepThinkLlm],
        ["quick_think_llm", quickThinkLlm],
        ["output_language", outputLanguage],
        ["max_debate_rounds", maxDebateRounds],
        ["codex_planner_enabled", String(codexPlannerEnabled)],
        ["auto_save", String(autoSave)],
      ];

      // Only send secret fields if the user typed a value
      if (secrets.openai_api_key) updates.push(["openai_api_key", secrets.openai_api_key]);
      if (secrets.anthropic_api_key) updates.push(["anthropic_api_key", secrets.anthropic_api_key]);
      if (secrets.google_api_key) updates.push(["google_api_key", secrets.google_api_key]);
      if (secrets.moonshot_api_key) updates.push(["moonshot_api_key", secrets.moonshot_api_key]);

      // Fire all patches sequentially (backend takes one at a time)
      for (const [key, value] of updates) {
        await patchSetting({ key, value });
      }

      mutateSettings();
      toast.success(t.settings.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestLlm() {
    if (!llmProvider || !deepThinkLlm) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testLlm({
        provider: llmProvider,
        model: deepThinkLlm,
      });
      setTestResult({ ok: result.ok, message: result.message });
      if (result.ok) {
        toast.success(t.settings.testLlmSuccess);
      } else {
        toast.error(result.message ?? t.settings.testLlmFail);
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Failed" });
      toast.error(t.settings.testLlmFail);
    } finally {
      setTesting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-base md:text-sm text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-colors";
  const selectClass = inputClass;
  const labelClass = "block mb-1.5 text-[10px] uppercase tracking-[1px] text-white/35";

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">{t.settings.title}</h1>
        <p className="mt-1 text-xs text-slate-500">{t.settings.subtitle}</p>
      </div>

      <div className="max-w-2xl space-y-5">
        {/* LLM Configuration */}
        <GlassCard>
          <h2 className="text-sm font-semibold text-slate-300 mb-4 pb-2 border-b border-white/[0.05]">
            {t.settings.llmConfig}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.settings.deepThinkProvider}</label>
              <select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value)}
                className={selectClass}
              >
                {[
                  "ollama",
                  "openai",
                  "anthropic",
                  "google",
                  "moonshot",
                  "kimi-cli",
                  "codex",
                  "codex-cli",
                  "xai",
                  "deepseek",
                ].map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t.settings.deepThinkModel}</label>
              <input
                type="text"
                value={deepThinkLlm}
                onChange={(e) => setDeepThinkLlm(e.target.value)}
                placeholder="e.g. gemma4:latest"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.settings.quickThinkProvider}</label>
              <input
                type="text"
                value={quickThinkLlm}
                onChange={(e) => setQuickThinkLlm(e.target.value)}
                placeholder="e.g. llama3.1:8b"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max Debate Rounds</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxDebateRounds}
                onChange={(e) => setMaxDebateRounds(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Test LLM button */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestLlm}
              disabled={testing}
              className="flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-xs text-indigo-300 hover:bg-indigo-500/15 transition-colors disabled:opacity-50"
            >
              {testing ? (
                <><Loader2 size={13} className="animate-spin" /> {t.settings.testLlmTesting}</>
              ) : (
                <><TestTube2 size={13} /> {t.settings.testLlm}</>
              )}
            </button>
            {testResult && (
              <span className={cn("flex items-center gap-1 text-xs", testResult.ok ? "text-emerald-400" : "text-red-400")}>
                {testResult.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {testResult.ok ? t.settings.testLlmSuccess : testResult.message ?? t.settings.testLlmFail}
              </span>
            )}
          </div>
        </GlassCard>

        {/* API Keys */}
        <GlassCard>
          <h2 className="text-sm font-semibold text-slate-300 mb-4 pb-2 border-b border-white/[0.05]">
            {t.settings.apiKeys}
          </h2>
          <div className="space-y-4">
            <SecretField
              label={t.settings.openaiKey}
              placeholder={settings.has_openai_key ? "••••••••••••••••••••" : t.settings.notConfigured}
              isConfigured={settings.has_openai_key}
              show={showOpenai}
              onToggleShow={() => setShowOpenai((v) => !v)}
              value={secrets.openai_api_key}
              onChange={(v) => setSecrets({ ...secrets, openai_api_key: v })}
              inputClass={inputClass}
            />
            <SecretField
              label={t.settings.anthropicKey}
              placeholder={settings.has_anthropic_key ? "••••••••••••••••••••" : t.settings.notConfigured}
              isConfigured={settings.has_anthropic_key}
              show={showAnthropic}
              onToggleShow={() => setShowAnthropic((v) => !v)}
              value={secrets.anthropic_api_key}
              onChange={(v) => setSecrets({ ...secrets, anthropic_api_key: v })}
              inputClass={inputClass}
            />
            <SecretField
              label="Google API Key"
              placeholder={settings.has_google_key ? "••••••••••••••••••••" : t.settings.notConfigured}
              isConfigured={settings.has_google_key}
              show={showGoogle}
              onToggleShow={() => setShowGoogle((v) => !v)}
              value={secrets.google_api_key}
              onChange={(v) => setSecrets({ ...secrets, google_api_key: v })}
              inputClass={inputClass}
            />
            <SecretField
              label="Moonshot API Key (Kimi K2)"
              placeholder={
                settings.has_moonshot_key
                  ? "••••••••••••••••••••"
                  : "sk-... — from https://platform.moonshot.ai/console/api-keys"
              }
              isConfigured={Boolean(settings.has_moonshot_key)}
              show={showMoonshot}
              onToggleShow={() => setShowMoonshot((v) => !v)}
              value={secrets.moonshot_api_key}
              onChange={(v) => setSecrets({ ...secrets, moonshot_api_key: v })}
              inputClass={inputClass}
            />
          </div>
        </GlassCard>

        {/* Behaviour */}
        <GlassCard>
          <h2 className="text-sm font-semibold text-slate-300 mb-4 pb-2 border-b border-white/[0.05]">
            {t.settings.behaviour}
          </h2>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-3 border-b border-white/[0.03]">
              <div>
                <p className="text-sm text-slate-200">{t.settings.outputLanguage}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{t.settings.outputLanguageDesc}</p>
              </div>
              <select
                value={outputLanguage}
                onChange={(e) => setOutputLanguage(e.target.value)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                style={{ minWidth: 120 }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Auto-save toggle */}
            <ToggleRow
              label="Auto-save results"
              description="Write each run's full markdown reports to ./results/"
              value={autoSave}
              onChange={setAutoSave}
            />

            {/* Codex Coding Planner — wired to backend `codex_planner_enabled` */}
            <ToggleRow
              label="Codex Coding Planner"
              description="Adds a code-generation agent to the run pipeline. Uses Codex API or Codex CLI (configure provider+model in LLM Configuration above)."
              value={codexPlannerEnabled}
              onChange={setCodexPlannerEnabled}
              accent="indigo"
            />
          </div>
        </GlassCard>

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-[10px] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
        >
          {saving ? (
            <><Loader2 size={15} className="animate-spin" /> Saving…</>
          ) : (
            <><Save size={15} /> {t.settings.saveSettings}</>
          )}
        </button>
      </div>
    </div>
  );
}

function SecretField({
  label,
  placeholder,
  isConfigured,
  show,
  onToggleShow,
  value,
  onChange,
  inputClass,
}: {
  label: string;
  placeholder: string;
  isConfigured: boolean;
  show: boolean;
  onToggleShow: () => void;
  value: string;
  onChange: (v: string) => void;
  inputClass: string;
}) {
  const labelClass = "block mb-1.5 text-[10px] uppercase tracking-[1px] text-white/35";
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative flex items-center gap-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputClass, "flex-1 pr-10")}
          aria-label={label}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Hide key" : "Show key"}
          className="absolute right-3 text-slate-500 hover:text-slate-300 transition-colors"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {isConfigured && !value && (
        <p className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
          <CheckCircle2 size={11} /> {t.settings.configured}
        </p>
      )}
    </div>
  );
}

/**
 * Glass-styled toggle row used in the Behaviour card.
 * Uses an accessible <button role="switch" aria-checked> rather than the
 * native checkbox so the visual matches the rest of the design system.
 */
function ToggleRow({
  label,
  description,
  value,
  onChange,
  accent = "default",
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: "default" | "indigo";
}) {
  const onBg = accent === "indigo" ? "bg-indigo-500" : "bg-emerald-500";
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/[0.03]">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200">{label}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          value ? onBg : "bg-white/[0.08]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            value ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
