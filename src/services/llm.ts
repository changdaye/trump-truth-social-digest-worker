import type { BriefConfig, LLMAnalysisResult } from "../types";

const SYSTEM_PROMPT = `你是一名中文资讯摘要编辑。请把特朗普帖文整理成简明中文。必须只输出 JSON 对象，不要输出任何 JSON 以外的文字。顶层字段必须包含 summary、hotTerms、items。summary 用 2 句以内概括这批帖子主要在说什么。hotTerms 输出 3 到 6 个高频词或高频主题短语。items 中每一项必须包含 translatedText、topicTags、interpretation。translatedText 必须尽量贴近原意，像“他说了什么”的中文转述，而不是空泛总结；不要输出英文原文。topicTags 是 1 到 3 个短标签。interpretation 只允许一句中文，说明这条帖的关注点。`;
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const OPENAI_COMPAT_REASONING_EFFORT = "xhigh";

export interface LlmDigestItem {
  translatedText: string;
  topicTags: string[];
  interpretation: string;
}

export interface LlmDigestResult {
  summary: string;
  hotTerms: string[];
  items: LlmDigestItem[];
}

interface OpenAICompatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function buildResponseFormat() {
  return {
    type: "json_schema" as const,
    json_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        hotTerms: {
          type: "array",
          items: { type: "string" }
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              translatedText: { type: "string" },
              topicTags: {
                type: "array",
                items: { type: "string" }
              },
              interpretation: { type: "string" }
            },
            required: ["translatedText", "topicTags", "interpretation"]
          }
        }
      },
      required: ["summary", "hotTerms", "items"]
    }
  };
}

export async function analyzePostsWithLLM(config: BriefConfig, ai: Ai, sourceText: string): Promise<LLMAnalysisResult> {
  if (config.llmBaseUrl && config.llmApiKey) {
    try {
      return await analyzeWithOpenAICompatible(config, sourceText);
    } catch (error) {
      console.error("OpenAI-compatible LLM failed", error instanceof Error ? error.message : String(error));
    }
  }

  return analyzeWithWorkersAI(
    ai,
    config.llmModel.startsWith("@cf/") ? config.llmModel : DEFAULT_WORKERS_AI_MODEL,
    sourceText,
  );
}

async function analyzeWithOpenAICompatible(config: BriefConfig, sourceText: string): Promise<LLMAnalysisResult> {
  const response = await fetch(`${config.llmBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llmApiKey}`,
    },
    body: JSON.stringify({
      model: config.llmModel,
      reasoning_effort: OPENAI_COMPAT_REASONING_EFFORT,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: sourceText }
      ],
      max_tokens: 1600,
      temperature: 0.2,
      response_format: buildResponseFormat(),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI-compatible HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const result = (await response.json()) as OpenAICompatResponse;
  const rawContent = result.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string"
    ? rawContent.trim()
    : rawContent?.map((part) => part.text ?? "").join("").trim();
  if (!content) throw new Error("OpenAI-compatible response returned empty content");
  return {
    content,
    modelLabel: `${formatModelLabel(config.llmModel)} (${OPENAI_COMPAT_REASONING_EFFORT})`,
  };
}

async function analyzeWithWorkersAI(ai: Ai, model: string, sourceText: string): Promise<LLMAnalysisResult> {
  const result = await ai.run(model, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: sourceText }
    ],
    max_tokens: 1600,
    temperature: 0.2,
    response_format: buildResponseFormat(),
  }) as { response?: unknown } | unknown;

  const content = typeof result === "object" && result !== null && "response" in result
    ? (result as { response?: unknown }).response ?? result
    : result;
  return {
    content,
    modelLabel: formatModelLabel(model),
  };
}

export function parseLlmDigestResponse(content: unknown): LlmDigestResult {
  const parsed = normalizeUnknownJson(content);
  if (!parsed || typeof parsed !== "object" || !("summary" in parsed) || !("items" in parsed)) {
    throw new Error("Workers AI returned invalid digest JSON");
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const hotTerms = Array.isArray((parsed as Record<string, unknown>).hotTerms)
    ? ((parsed as Record<string, unknown>).hotTerms as unknown[]).map((term) => String(term).trim()).filter(Boolean)
    : [];

  if (!summary || items.length === 0) {
    throw new Error("Workers AI returned incomplete digest JSON");
  }

  return {
    summary,
    hotTerms,
    items: items.map((item: unknown) => {
      const obj = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
      return {
        translatedText: typeof obj.translatedText === "string" && obj.translatedText.trim() ? obj.translatedText.trim() : "内容待补充",
        topicTags: Array.isArray(obj.topicTags) ? obj.topicTags.map((tag) => String(tag)).filter(Boolean) : [],
        interpretation: typeof obj.interpretation === "string" && obj.interpretation.trim() ? obj.interpretation.trim() : "解读待补充"
      } satisfies LlmDigestItem;
    })
  };
}

function normalizeUnknownJson(content: unknown): any {
  if (typeof content === "string") {
    return JSON.parse(content);
  }
  return content;
}

function formatModelLabel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return "Unknown";
  const slug = trimmed.replace(/^@cf\//, "").split("/").pop() ?? trimmed;
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "gpt") return "GPT";
      if (lower === "llama") return "Llama";
      if (lower === "qwen") return "Qwen";
      if (lower === "gemma") return "Gemma";
      if (lower === "glm") return "GLM";
      if (lower === "mistral") return "Mistral";
      if (lower === "kimi") return "Kimi";
      if (lower === "deepseek") return "DeepSeek";
      if (lower === "fp8") return "FP8";
      if (lower === "awq") return "AWQ";
      if (lower === "it") return "IT";
      if (/^\d+(\.\d+)?b$/i.test(part)) return part.toUpperCase();
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
