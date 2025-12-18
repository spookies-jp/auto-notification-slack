import { config } from "./config.js";

type ConfirmMessage = { name: "confirm"; url: string };
type NotifySlackMessage = { name: "notify_slack"; url: string };
type Message = ConfirmMessage | NotifySlackMessage;

type ConfirmResponse = { url: string } | undefined;
type NotifyResponse = { ok: true } | { ok: false; error: string };

function isNotInDenyList(url: string): boolean {
  const denyList = config.denyList ?? [];
  return !denyList.some((item) => url.includes(item));
}

async function notifySlack(url: string): Promise<void> {
  const webHookUrl = config.webHookUrl;
  if (!webHookUrl) return;

  const payload = { text: `閲覧なう\n${url}` };
  const response = await fetch(webHookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Slack webhook request failed: ${response.status}`);
  }
}

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse): true | void => {
    if (message.name === "confirm") {
      if (!message.url || !isNotInDenyList(message.url)) {
        sendResponse(undefined satisfies ConfirmResponse);
        return;
      }
      sendResponse({ url: message.url } satisfies ConfirmResponse);
      return;
    }

    if (message.name === "notify_slack") {
      void notifySlack(message.url)
        .then(() => sendResponse({ ok: true } satisfies NotifyResponse))
        .catch((error: unknown) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(errorMessage);
          sendResponse({ ok: false, error: errorMessage } satisfies NotifyResponse);
        });
      return true;
    }
  },
);

