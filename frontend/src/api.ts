import { invoke, isTauri } from "@tauri-apps/api/core";
export async function request<T>(
  action: string,
  payload: unknown = null,
): Promise<T> {
  if (isTauri()) return invoke<T>("request", { action, payload });
  const response = await fetch("/api/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  if (!response.ok)
    throw new Error(
      "Local backend unavailable. Start with npm run dev:browser or use the desktop app.",
    );
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Local backend unavailable. Start with npm run dev:browser.",
    );
  }
  if (result.error) throw new Error(result.error);
  return result.data as T;
}
export async function openExternal(url: string) {
  if (isTauri()) await invoke("open_url", { url });
  else window.open(url, "_blank", "noopener,noreferrer");
}
