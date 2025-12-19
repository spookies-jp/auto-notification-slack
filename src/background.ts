import { isDeniedUrl } from "./config.js";
import { getActiveDestination } from "./destinationStore.js";

type NotifySlackMessage = { name: "notify_slack"; url: string; message?: string };
type FetchChannelsMessage = { name: "fetch_channels"; workerUrl: string };
type Message = NotifySlackMessage | FetchChannelsMessage;

type NotifyResponse = { ok: true } | { ok: false; error: string };
type FetchChannelsResponse =
  | { ok: true; channels: Array<{ id: string; name: string }> }
  | { ok: false; error: string };

function buildSlackText(input: { url: string; message?: string }): string {
  const extra = (input.message ?? "").trim();
  if (extra) return `${extra}\n${input.url}`;
  return `閲覧なう\n${input.url}`;
}

async function getCookiesForUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ url }, (cookies) => {
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      resolve(cookieStr);
    });
  });
}

async function fetchWithCookies(
  url: string,
  init: RequestInit
): Promise<Response> {
  const cookies = await getCookiesForUrl(url);
  const headers = new Headers(init.headers);
  if (cookies) {
    headers.set("Cookie", cookies);
  }
  return fetch(url, { ...init, headers });
}

async function fetchChannels(workerUrl: string): Promise<Array<{ id: string; name: string }>> {
  const url = workerUrl.trim().replace(/\/+$/, "");
  if (!url) throw new Error("Worker URL が空です");

  const response = await fetchWithCookies(`${url}/api/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (response.status === 401) {
    throw new Error("Cloudflare Access にログインしてください（ログインボタン）");
  }

  const data = (await response.json()) as
    | { ok: true; channels: Array<{ id: string; name: string }> }
    | { ok: false; error: string };

  if (!response.ok || !data.ok) {
    const message = "error" in data ? data.error : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data.channels;
}

async function notifySlack(input: { url: string; message?: string }): Promise<void> {
  if (!input.url) throw new Error("URL が空です");
  if (isDeniedUrl(input.url)) throw new Error("denyList に該当するため送信できません");

  const destination = await getActiveDestination();
  if (!destination) throw new Error("送信先が未設定です（設定タブで保存してください）");
  if (!destination.workerUrl) throw new Error("Worker URL が未設定です");
  if (!destination.channelId) throw new Error("Channel が未設定です");

  const payload = { url: input.url, message: input.message, text: buildSlackText(input), channel: destination.channelId };
  const response = await fetchWithCookies(`${destination.workerUrl}/api/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  if (message.name === "notify_slack") {
    void notifySlack({ url: message.url, message: message.message })
      .then(() => sendResponse({ ok: true } satisfies NotifyResponse))
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(errorMessage);
        sendResponse({ ok: false, error: errorMessage } satisfies NotifyResponse);
      });
    return true;
  }

  if (message.name === "fetch_channels") {
    void fetchChannels(message.workerUrl)
      .then((channels) => sendResponse({ ok: true, channels } satisfies FetchChannelsResponse))
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(errorMessage);
        sendResponse({ ok: false, error: errorMessage } satisfies FetchChannelsResponse);
      });
    return true;
  }
});
