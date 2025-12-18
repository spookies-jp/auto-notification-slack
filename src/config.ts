export const config: { webHookUrl?: string; denyList: string[] } = {
  // Backward-compatible fallback (can be overridden via the popup Settings tab)
  webHookUrl: "your_webhook_url",
  denyList: ["example.com"],
};

export function isDeniedUrl(url: string): boolean {
  const denyList = config.denyList ?? [];
  return denyList.some((item) => url.includes(item));
}
