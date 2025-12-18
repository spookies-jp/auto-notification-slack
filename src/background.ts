import { config, isDeniedUrl } from "./config.js";
import { getActiveWebhookUrl } from "./webhookStore.js";

type NotifySlackMessage = { name: "notify_slack"; url: string; message?: string };
type Message = NotifySlackMessage;

type NotifyResponse = { ok: true } | { ok: false; error: string };

function buildSlackText(input: { url: string; message?: string }): string {
  const extra = (input.message ?? "").trim();
  if (extra) return `${extra}\n${input.url}`;
  return `閲覧なう\n${input.url}`;
}

async function notifySlack(input: { url: string; message?: string }): Promise<void> {
  if (!input.url) throw new Error("URL が空です");
  if (isDeniedUrl(input.url)) throw new Error("denyList に該当するため送信できません");

  const webHookUrl = await getActiveWebhookUrl(config.webHookUrl);
  if (!webHookUrl) throw new Error("Webhook URL が未設定です（設定タブで保存してください）");

  const payload = { text: buildSlackText(input) };
  const response = await fetch(webHookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Slack webhook request failed: ${response.status}`);
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse): true | void => {
  if (message.name !== "notify_slack") return;

  void notifySlack({ url: message.url, message: message.message })
    .then(() => sendResponse({ ok: true } satisfies NotifyResponse))
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(errorMessage);
      sendResponse({ ok: false, error: errorMessage } satisfies NotifyResponse);
    });
  return true;
});
