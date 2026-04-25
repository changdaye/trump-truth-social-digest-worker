import type { BriefConfig } from "../types";

export async function pushToFeishu(config: BriefConfig, text: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body: Record<string, unknown> = {
    msg_type: "text",
    content: { text }
  };

  if (config.feishuSecret) {
    body.timestamp = timestamp;
    body.sign = await buildFeishuSign(timestamp, config.feishuSecret);
  }

  const response = await fetch(config.feishuWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Feishu push HTTP ${response.status}: ${errorText.slice(0, 300)}`);
  }
}

async function buildFeishuSign(timestamp: string, secret: string): Promise<string> {
  const message = `${timestamp}\n${secret}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(message),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(""));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
