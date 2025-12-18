export const config: { denyList: string[] } = {
  denyList: ["example.com"],
};

export function isDeniedUrl(url: string): boolean {
  const denyList = config.denyList ?? [];
  return denyList.some((item) => url.includes(item));
}
