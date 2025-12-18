export type Webhook = {
  id: string;
  name: string;
  url: string;
};

export type WebhookState = {
  webhooks: Webhook[];
  activeWebhookId: string | null;
};

const STORAGE_KEYS = ["webhooks", "activeWebhookId"] as const;

type StorageShape = Partial<{
  webhooks: Webhook[];
  activeWebhookId: string;
}>;

const storage = chrome.storage.local;

function storageGet<T extends object>(keys: readonly string[]): Promise<T> {
  return new Promise((resolve) => {
    storage.get(keys, (items) => resolve(items as T));
  });
}

function storageSet(items: object): Promise<void> {
  return new Promise((resolve) => {
    storage.set(items, () => resolve());
  });
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUrl(url: string): string {
  return url.trim();
}

function isPlaceholder(url: string): boolean {
  const normalized = normalizeUrl(url);
  return (
    normalized === "" ||
    normalized === "your_webhook_url" ||
    normalized === "https://hooks.slack.com/services/XXX/YYY/ZZZ"
  );
}

export async function getWebhookState(): Promise<WebhookState> {
  const items = await storageGet<StorageShape>(STORAGE_KEYS);
  return {
    webhooks: Array.isArray(items.webhooks) ? items.webhooks : [],
    activeWebhookId:
      typeof items.activeWebhookId === "string" ? items.activeWebhookId : null,
  };
}

export async function initWebhookStateIfNeeded(
  fallbackWebhookUrl?: string,
): Promise<WebhookState> {
  const state = await getWebhookState();
  const webhooks = [...state.webhooks];
  let activeWebhookId = state.activeWebhookId;

  if (webhooks.length === 0 && fallbackWebhookUrl && !isPlaceholder(fallbackWebhookUrl)) {
    const id = createId();
    webhooks.push({ id, name: "Default", url: normalizeUrl(fallbackWebhookUrl) });
    activeWebhookId = id;
  }

  if (webhooks.length > 0 && !activeWebhookId) {
    activeWebhookId = webhooks[0]?.id ?? null;
  }

  const changed =
    webhooks.length !== state.webhooks.length ||
    activeWebhookId !== state.activeWebhookId;
  if (changed) {
    await storageSet({ webhooks, activeWebhookId });
  }

  return { webhooks, activeWebhookId };
}

export async function setActiveWebhookId(id: string): Promise<void> {
  await storageSet({ activeWebhookId: id });
}

export async function upsertWebhook(input: {
  id?: string;
  name: string;
  url: string;
}): Promise<WebhookState> {
  const state = await getWebhookState();
  const id = input.id ?? createId();
  const webhook: Webhook = { id, name: input.name.trim() || "Unnamed", url: normalizeUrl(input.url) };

  const webhooks = [...state.webhooks];
  const index = webhooks.findIndex((w) => w.id === id);
  if (index >= 0) webhooks[index] = webhook;
  else webhooks.push(webhook);

  const activeWebhookId = id;
  await storageSet({ webhooks, activeWebhookId });
  return { webhooks, activeWebhookId };
}

export async function deleteWebhook(id: string): Promise<WebhookState> {
  const state = await getWebhookState();
  const webhooks = state.webhooks.filter((w) => w.id !== id);
  const activeWebhookId =
    state.activeWebhookId === id ? (webhooks[0]?.id ?? null) : state.activeWebhookId;
  await storageSet({ webhooks, activeWebhookId });
  return { webhooks, activeWebhookId };
}

export async function getActiveWebhookUrl(
  fallbackWebhookUrl?: string,
): Promise<string | undefined> {
  const state = await initWebhookStateIfNeeded(fallbackWebhookUrl);
  const active = state.webhooks.find((w) => w.id === state.activeWebhookId);
  if (active?.url && !isPlaceholder(active.url)) return active.url;

  if (fallbackWebhookUrl && !isPlaceholder(fallbackWebhookUrl)) {
    return normalizeUrl(fallbackWebhookUrl);
  }
  return undefined;
}

