import { config, isDeniedUrl } from "./config.js";
import {
  deleteWebhook,
  initWebhookStateIfNeeded,
  setActiveWebhookId,
  upsertWebhook,
  type WebhookState,
} from "./webhookStore.js";

type NotifySlackMessage = { name: "notify_slack"; url: string; message?: string };
type NotifyResponse = { ok: true } | { ok: false; error: string };

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element not found: ${id}`);
  return element;
}

function setStatus(text: string, kind: "info" | "error" = "info"): void {
  const status = $("status");
  status.textContent = text;
  status.classList.toggle("is-error", kind === "error");
}

function setActiveTab(tab: "send" | "settings"): void {
  const tabSend = $("tab-send");
  const tabSettings = $("tab-settings");
  const panelSend = $("panel-send");
  const panelSettings = $("panel-settings");

  const isSend = tab === "send";
  tabSend.classList.toggle("is-active", isSend);
  tabSend.setAttribute("aria-selected", String(isSend));
  panelSend.classList.toggle("is-active", isSend);

  tabSettings.classList.toggle("is-active", !isSend);
  tabSettings.setAttribute("aria-selected", String(!isSend));
  panelSettings.classList.toggle("is-active", !isSend);
}

function runtimeSendMessage<M, R>(message: M): Promise<R> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response as R);
    });
  });
}

function tabsQuery(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

function renderDestination(state: WebhookState): void {
  const destination = $("destination");
  const active = state.webhooks.find((w) => w.id === state.activeWebhookId);
  destination.textContent = active ? active.name : "未設定";
}

function renderWebhookSelect(state: WebhookState): void {
  const select = $("webhook-select") as HTMLSelectElement;
  select.innerHTML = "";

  if (state.webhooks.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "（未設定）";
    select.append(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  for (const w of state.webhooks) {
    const option = document.createElement("option");
    option.value = w.id;
    option.textContent = w.name;
    select.append(option);
  }
  if (state.activeWebhookId) select.value = state.activeWebhookId;
}

function fillWebhookEditor(state: WebhookState, id: string | null): void {
  const nameInput = $("webhook-name") as HTMLInputElement;
  const urlInput = $("webhook-url") as HTMLInputElement;
  const deleteButton = $("delete-webhook") as HTMLButtonElement;

  const active = id ? state.webhooks.find((w) => w.id === id) : undefined;
  nameInput.value = active?.name ?? "";
  urlInput.value = active?.url ?? "";
  deleteButton.disabled = !active;
}

async function loadCurrentTabUrl(): Promise<string | undefined> {
  const [tab] = await tabsQuery({ active: true, currentWindow: true });
  const url = tab?.url;
  if (!url) return undefined;
  return url;
}

async function main(): Promise<void> {
  setActiveTab("send");
  setStatus("");

  $("tab-send").addEventListener("click", () => setActiveTab("send"));
  $("tab-settings").addEventListener("click", () => setActiveTab("settings"));

  const sendButton = $("send") as HTMLButtonElement;
  const messageInput = $("message") as HTMLTextAreaElement;
  const currentUrlEl = $("current-url");

  let editingWebhookId: string | null = null;
  let webhookState = await initWebhookStateIfNeeded(config.webHookUrl);

  const refreshSettingsUi = (state: WebhookState): void => {
    webhookState = state;
    renderWebhookSelect(state);
    renderDestination(state);
    editingWebhookId = state.activeWebhookId;
    fillWebhookEditor(state, editingWebhookId);
  };

  refreshSettingsUi(webhookState);

  const currentUrl = await loadCurrentTabUrl();
  currentUrlEl.textContent = currentUrl ?? "（このタブのURLを取得できません）";

  if (!currentUrl) {
    sendButton.disabled = true;
  } else if (isDeniedUrl(currentUrl)) {
    sendButton.disabled = true;
    setStatus("denyList に該当するため送信できません", "error");
  }

  $("webhook-select").addEventListener("change", async (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const id = select.value;
    if (!id) return;
    await setActiveWebhookId(id);
    webhookState = { ...webhookState, activeWebhookId: id };
    editingWebhookId = id;
    renderDestination(webhookState);
    fillWebhookEditor(webhookState, editingWebhookId);
    setStatus("送信先を切り替えました");
  });

  $("new-webhook").addEventListener("click", () => {
    editingWebhookId = null;
    fillWebhookEditor(webhookState, null);
    setStatus("新規Webhookを入力してください");
  });

  $("save-webhook").addEventListener("click", async () => {
    const nameInput = $("webhook-name") as HTMLInputElement;
    const urlInput = $("webhook-url") as HTMLInputElement;

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    if (!url) {
      setStatus("Webhook URL を入力してください", "error");
      return;
    }

    const next = await upsertWebhook({ id: editingWebhookId ?? undefined, name, url });
    refreshSettingsUi(next);
    setStatus("保存しました");
  });

  $("delete-webhook").addEventListener("click", async () => {
    if (!editingWebhookId) return;
    const active = webhookState.webhooks.find((w) => w.id === editingWebhookId);
    if (!active) return;

    const ok = window.confirm(`Webhook「${active.name}」を削除しますか？`);
    if (!ok) return;

    const next = await deleteWebhook(editingWebhookId);
    refreshSettingsUi(next);
    setStatus("削除しました");
  });

  sendButton.addEventListener("click", async () => {
    if (!currentUrl) return;

    sendButton.disabled = true;
    setStatus("送信中...");

    try {
      const response = await runtimeSendMessage<NotifySlackMessage, NotifyResponse>({
        name: "notify_slack",
        url: currentUrl,
        message: messageInput.value,
      });

      if (!response || typeof response !== "object" || !("ok" in response)) {
        throw new Error("Unexpected response");
      }
      if (!response.ok) {
        throw new Error(response.error);
      }

      setStatus("送信しました");
      messageInput.value = "";
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, "error");
    } finally {
      sendButton.disabled = false;
    }
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  try {
    setStatus(message, "error");
  } catch {
    // ignore
  }
});

