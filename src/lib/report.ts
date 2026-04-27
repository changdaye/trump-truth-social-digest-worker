export interface DetailedReportItem {
  id: string;
  originalText: string;
  translatedText: string;
  topicTags: string[];
  interpretation: string;
  publishedAt: string;
  canonicalUrl: string;
}

const PROJECT_PREFIX = "trump-truth-social-digest-worker";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMultilineText(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

export function buildDetailedReport(summary: string, items: DetailedReportItem[], now = new Date()): string {
  const itemCards = items.map((item, index) => `
      <article class="item-card">
        <h3>${index + 1}. 帖文 ${escapeHtml(item.id)}</h3>
        <dl>
          <div><dt>英文原文</dt><dd>${formatMultilineText(item.originalText || "[无可用原文文本]")}</dd></div>
          <div><dt>中文直译/转述</dt><dd>${formatMultilineText(item.translatedText)}</dd></div>
          <div><dt>主题标签</dt><dd>${escapeHtml(item.topicTags.join(" / "))}</dd></div>
          <div><dt>一句话解读</dt><dd>${formatMultilineText(item.interpretation)}</dd></div>
          <div><dt>发布时间</dt><dd>${escapeHtml(item.publishedAt)}</dd></div>
          <div><dt>原帖链接</dt><dd><a href="${escapeHtml(item.canonicalUrl)}">${escapeHtml(item.canonicalUrl)}</a></dd></div>
        </dl>
      </article>`).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>特朗普 Truth Social 汇总详细版</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; margin: 0; background: #f5f7fb; color: #111827; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 48px; }
    .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); margin-bottom: 20px; }
    h1, h2, h3 { margin-top: 0; }
    .meta { color: #64748b; line-height: 1.9; }
    .summary { line-height: 1.85; font-size: 16px; }
    .item-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; margin-top: 16px; }
    dl { margin: 0; display: grid; gap: 10px; }
    dt { font-weight: 700; }
    dd { margin: 4px 0 0; color: #334155; line-height: 1.8; }
    a { color: #2563eb; word-break: break-all; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>特朗普 Truth Social 汇总详细版</h1>
      <div class="meta">
        <div><strong>生成时间：</strong>${escapeHtml(now.toISOString())}</div>
        <div><strong>条目数量：</strong>${items.length}</div>
        <div><strong>数据来源：</strong>Truth Social 公开网页 / 第三方公开归档源</div>
        <div><strong>AI 说明：</strong>中文翻译/标签/一句话解读由 Workers AI 生成</div>
      </div>
    </section>

    <section class="card">
      <h2>本时段摘要</h2>
      <div class="summary">${formatMultilineText(summary)}</div>
    </section>

    <section class="card">
      <h2>帖文明细</h2>
      ${itemCards || "<p>本轮没有可展示的帖子。</p>"}
    </section>
  </div>
</body>
</html>
`;
}

function buildUtcStamp(now = new Date()): string {
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0")
  ].join("");
}

export function buildDetailedReportObjectKey(now = new Date()): string {
  return `${PROJECT_PREFIX}/${buildUtcStamp(now)}.html`;
}

export function buildFeishuMessageObjectKey(now = new Date()): string {
  return `${PROJECT_PREFIX}/feishu-messages/${buildUtcStamp(now)}.txt`;
}

