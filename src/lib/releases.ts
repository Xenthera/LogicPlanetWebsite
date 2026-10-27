const repo = "Xenthera/LogicPlanetReleases";

export const platforms = [
  { id: "windows", name: "Windows", file: "logicplanet-windows.zip" },
  { id: "linux", name: "Linux", file: "logicplanet-linux.zip" },
  { id: "mac", name: "Mac", file: "logicplanet-macos.zip" },
] as const;

export const channels = [
  { id: "canary", label: "Canary" },
  { id: "stable", label: "Stable" },
] as const;

export type ChannelId = (typeof channels)[number]["id"];

export function downloadUrl(channel: ChannelId, file: string) {
  return `https://github.com/${repo}/releases/download/${channel}/${file}`;
}

export type ReleaseInfo = {
  name?: string;
  sizes: Record<string, number>;
};

export async function loadRelease(tag: ChannelId): Promise<ReleaseInfo> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "LogicPlanetWebsite" },
    });
    if (!response.ok) return { sizes: {} };
    const data = await response.json();
    const sizes: Record<string, number> = {};
    for (const asset of data.assets ?? []) {
      if (typeof asset?.name === "string" && typeof asset.size === "number") sizes[asset.name] = asset.size;
    }
    return { name: typeof data.name === "string" ? data.name : undefined, sizes };
  } catch {
    return { sizes: {} };
  }
}

export function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}
