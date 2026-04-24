import type { BriefConfig } from "../types";

const SYSTEM_PROMPT = `你是一名中文资讯摘要编辑。请把特朗普 Truth Social 原帖整理成简明中文。输出 JSON，必须包含 summary 和 items 两个字段。items 内每条必须包含 translatedText、topicTags、interpretation。translatedText 必须尽量贴近原意，且不要输出英文原文。`;

export async function analyzePostsWithLLM(config: BriefConfig, ai: Ai, sourceText: string): Promise<string> {
  const result = await ai.run(config.llmModel, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: sourceText }
    ],
    max_tokens: 1200,
    temperature: 0.2
  }) as { response?: string };

  const content = result.response?.trim();
  if (!content) {
    throw new Error("Workers AI returned empty response");
  }

  return content;
}
