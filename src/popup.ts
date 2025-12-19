import { isDeniedUrl } from "./config.js";
import {
  deleteDestination,
  initDestinationStateIfNeeded,
  setActiveDestinationId,
  upsertDestination,
  type DestinationState,
} from "./destinationStore.js";

type NotifySlackMessage = { name: "notify_slack"; url: string; message?: string };
type FetchChannelsMessage = { name: "fetch_channels"; workerUrl: string };
type NotifyResponse = { ok: true } | { ok: false; error: string };
type FetchChannelsResponse =
  | { ok: true; channels: Array<{ id: string; name: string }> }
  | { ok: false; error: string };

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

function renderDestination(state: DestinationState): void {
  const destination = $("destination");
  const active = state.destinations.find((d) => d.id === state.activeDestinationId);
  destination.textContent = active ? active.name : "未設定";
}

function renderDestinationSelect(state: DestinationState): void {
  const select = $("destination-select") as HTMLSelectElement;
  select.innerHTML = "";

  if (state.destinations.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "（未設定）";
    select.append(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  for (const d of state.destinations) {
    const option = document.createElement("option");
    option.value = d.id;
    option.textContent = d.name;
    select.append(option);
  }
  if (state.activeDestinationId) select.value = state.activeDestinationId;
}

function fillDestinationEditor(state: DestinationState, id: string | null): void {
  const nameInput = $("destination-name") as HTMLInputElement;
  const workerUrlInput = $("worker-url") as HTMLInputElement;
  const channelSelect = $("channel-select") as HTMLSelectElement;
  const deleteButton = $("delete-destination") as HTMLButtonElement;

  const active = id ? state.destinations.find((d) => d.id === id) : undefined;
  nameInput.value = active?.name ?? "";
  workerUrlInput.value = active?.workerUrl ?? "";

  channelSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "（未選択）";
  channelSelect.append(placeholder);

  if (active?.channelId) {
    const opt = document.createElement("option");
    opt.value = active.channelId;
    opt.textContent = `現在の設定: ${active.channelId}`;
    channelSelect.append(opt);
    channelSelect.value = active.channelId;
  } else {
    channelSelect.value = "";
  }

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

  let editingDestinationId: string | null = null;
  let destinationState = await initDestinationStateIfNeeded();

  const refreshSettingsUi = (state: DestinationState): void => {
    destinationState = state;
    renderDestinationSelect(state);
    renderDestination(state);
    editingDestinationId = state.activeDestinationId;
    fillDestinationEditor(state, editingDestinationId);
  };

  refreshSettingsUi(destinationState);

  const currentUrl = await loadCurrentTabUrl();
  currentUrlEl.textContent = currentUrl ?? "（このタブのURLを取得できません）";

  if (!currentUrl) {
    sendButton.disabled = true;
  } else if (isDeniedUrl(currentUrl)) {
    sendButton.disabled = true;
    setStatus("denyList に該当するため送信できません", "error");
  }

  $("destination-select").addEventListener("change", async (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const id = select.value;
    if (!id) return;
    await setActiveDestinationId(id);
    destinationState = { ...destinationState, activeDestinationId: id };
    editingDestinationId = id;
    renderDestination(destinationState);
    fillDestinationEditor(destinationState, editingDestinationId);
    setStatus("送信先を切り替えました");
  });

  $("new-destination").addEventListener("click", () => {
    editingDestinationId = null;
    fillDestinationEditor(destinationState, null);
    setStatus("新規送信先を入力してください");
  });

  $("open-access-login").addEventListener("click", async () => {
    const workerUrlInput = $("worker-url") as HTMLInputElement;
    const workerUrl = workerUrlInput.value.trim().replace(/\/+$/, "");
    if (!workerUrl) {
      setStatus("Worker URL を入力してください", "error");
      return;
    }
    // 新しいウィンドウで開く（popupが閉じないようにするため）
    chrome.windows.create({ url: workerUrl, type: "popup", width: 500, height: 600 });
  });

  $("load-channels").addEventListener("click", async () => {
    const workerUrlInput = $("worker-url") as HTMLInputElement;
    const channelSelect = $("channel-select") as HTMLSelectElement;

    const workerUrl = workerUrlInput.value.trim().replace(/\/+$/, "");
    if (!workerUrl) {
      setStatus("Worker URL を入力してください", "error");
      return;
    }

    setStatus("Channel 読み込み中...");
    channelSelect.disabled = true;

    try {
      const response = await runtimeSendMessage<FetchChannelsMessage, FetchChannelsResponse>({
        name: "fetch_channels",
        workerUrl,
      });

      if (!response || typeof response !== "object" || !("ok" in response)) {
        throw new Error("Unexpected response");
      }
      if (!response.ok) {
        throw new Error(response.error);
      }

      channelSelect.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "（未選択）";
      channelSelect.append(placeholder);

      for (const c of response.channels) {
        const option = document.createElement("option");
        option.value = c.id;
        option.textContent = `#${c.name}`;
        channelSelect.append(option);
      }

      setStatus("Channel を読み込みました");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, "error");
    } finally {
      channelSelect.disabled = false;
    }
  });

  $("save-destination").addEventListener("click", async () => {
    const nameInput = $("destination-name") as HTMLInputElement;
    const workerUrlInput = $("worker-url") as HTMLInputElement;
    const channelSelect = $("channel-select") as HTMLSelectElement;

    const name = nameInput.value.trim();
    const workerUrl = workerUrlInput.value.trim();
    const channelId = channelSelect.value.trim();

    if (!workerUrl) {
      setStatus("Worker URL を入力してください", "error");
      return;
    }
    if (!channelId) {
      setStatus("Channel を選択してください（再読込で一覧取得）", "error");
      return;
    }

    const next = await upsertDestination({
      id: editingDestinationId ?? undefined,
      name,
      workerUrl,
      channelId,
    });
    refreshSettingsUi(next);
    setStatus("保存しました");
  });

  $("delete-destination").addEventListener("click", async () => {
    if (!editingDestinationId) return;
    const active = destinationState.destinations.find((d) => d.id === editingDestinationId);
    if (!active) return;

    const ok = window.confirm(`送信先「${active.name}」を削除しますか？`);
    if (!ok) return;

    const next = await deleteDestination(editingDestinationId);
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
