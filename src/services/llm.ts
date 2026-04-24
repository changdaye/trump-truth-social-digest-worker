import type { BriefConfig } from "../types";

const SYSTEM_PROMPT = `你是一名中文资讯摘要编辑。请把特朗普帖文整理成简明中文。必须只输出 JSON 对象，不要输出任何 JSON 以外的文字。顶层字段必须包含 summary、hotTerms、items。summary 用 2 句以内概括这批帖子主要在说什么。hotTerms 输出 3 到 6 个高频词或高频主题短语。items 中每一项必须包含 translatedText、topicTags、interpretation。translatedText 必须尽量贴近原意，像“他说了什么”的中文转述，而不是空泛总结；不要输出英文原文。topicTags 是 1 到 3 个短标签。interpretation 只允许一句中文，说明这条帖的关注点。`;

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

export async function analyzePostsWithLLM(config: BriefConfig, ai: Ai, sourceText: string): Promise<unknown> {
  const result = await ai.run(config.llmModel, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: sourceText }
    ],
    max_tokens: 1600,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
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
    }
  }) as { response?: unknown } | unknown;

  if (typeof result === "object" && result !== null && "response" in result) {
    return (result as { response?: unknown }).response ?? result;
  }

  return result;
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
