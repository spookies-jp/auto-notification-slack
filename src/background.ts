import { isDeniedUrl } from "./config.js";
import { getActiveDestination } from "./destinationStore.js";

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

  const destination = await getActiveDestination();
  if (!destination) throw new Error("送信先が未設定です（設定タブで保存してください）");
  if (!destination.workerUrl) throw new Error("Worker URL が未設定です");
  if (!destination.channelId) throw new Error("Channel が未設定です");

  const payload = { url: input.url, message: input.message, text: buildSlackText(input), channel: destination.channelId };
  const response = await fetch(`${destination.workerUrl}/api/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("Cloudflare Access にログインしてください（設定タブのログインボタン）");
    }
    throw new Error(`Worker request failed: ${response.status}${text ? ` (${text})` : ""}`);
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
