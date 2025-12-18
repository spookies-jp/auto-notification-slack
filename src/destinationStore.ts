export type Destination = {
  id: string;
  name: string;
  workerUrl: string;
  channelId: string;
};

export type DestinationState = {
  destinations: Destination[];
  activeDestinationId: string | null;
};

const STORAGE_KEYS = ["destinations", "activeDestinationId"] as const;

type StorageShape = Partial<{
  destinations: Array<Partial<Destination> & { id?: unknown }>;
  activeDestinationId: string;
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

function normalizeWorkerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function getDestinationState(): Promise<DestinationState> {
  const items = await storageGet<StorageShape>(STORAGE_KEYS);
  const raw = Array.isArray(items.destinations) ? items.destinations : [];
  const destinations: Destination[] = [];

  for (const entry of raw) {
    const id = typeof entry.id === "string" ? entry.id : "";
    const name = typeof entry.name === "string" ? entry.name : "";
    const workerUrl = typeof entry.workerUrl === "string" ? entry.workerUrl : "";
    const channelId = typeof entry.channelId === "string" ? entry.channelId : "";
    if (!id) continue;
    destinations.push({
      id,
      name,
      workerUrl,
      channelId,
    });
  }

  return {
    destinations,
    activeDestinationId:
      typeof items.activeDestinationId === "string" ? items.activeDestinationId : null,
  };
}

export async function initDestinationStateIfNeeded(): Promise<DestinationState> {
  const state = await getDestinationState();
  let activeDestinationId = state.activeDestinationId;
  if (state.destinations.length > 0 && !activeDestinationId) {
    activeDestinationId = state.destinations[0]?.id ?? null;
  }
  if (activeDestinationId !== state.activeDestinationId) {
    await storageSet({ activeDestinationId });
  }
  return { destinations: state.destinations, activeDestinationId };
}

export async function setActiveDestinationId(id: string): Promise<void> {
  await storageSet({ activeDestinationId: id });
}

export async function upsertDestination(input: {
  id?: string;
  name: string;
  workerUrl: string;
  channelId: string;
}): Promise<DestinationState> {
  const state = await getDestinationState();
  const id = input.id ?? createId();

  const destination: Destination = {
    id,
    name: input.name.trim() || "Unnamed",
    workerUrl: normalizeWorkerUrl(input.workerUrl),
    channelId: input.channelId.trim(),
  };

  const destinations = [...state.destinations];
  const index = destinations.findIndex((d) => d.id === id);
  if (index >= 0) destinations[index] = destination;
  else destinations.push(destination);

  const activeDestinationId = id;
  await storageSet({ destinations, activeDestinationId });
  return { destinations, activeDestinationId };
}

export async function deleteDestination(id: string): Promise<DestinationState> {
  const state = await getDestinationState();
  const destinations = state.destinations.filter((d) => d.id !== id);
  const activeDestinationId =
    state.activeDestinationId === id ? (destinations[0]?.id ?? null) : state.activeDestinationId;
  await storageSet({ destinations, activeDestinationId });
  return { destinations, activeDestinationId };
}

export async function getActiveDestination(): Promise<Destination | undefined> {
  const state = await initDestinationStateIfNeeded();
  if (!state.activeDestinationId) return undefined;
  return state.destinations.find((d) => d.id === state.activeDestinationId);
}
