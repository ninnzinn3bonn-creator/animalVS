const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const defaultOrigin = typeof location === "undefined" ? "http://127.0.0.1:5173" : location.origin;
const apiBaseUrl = configuredApiBaseUrl || defaultOrigin;

export interface ServiceEndpoints {
  apiUrl(path: string): string;
  websocketUrl(path: string): string;
  staticCharactersUrl: string;
}

export function createServiceEndpoints(baseUrl: string): ServiceEndpoints {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const resolve = (path: string): URL => new URL(path.replace(/^\/+/, ""), `${normalizedBaseUrl}/`);

  return {
    apiUrl(path: string): string {
      return resolve(path).toString();
    },
    websocketUrl(path: string): string {
      const url = resolve(path);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.toString();
    },
    staticCharactersUrl: "/data/characters.json"
  };
}

export const serviceEndpoints = createServiceEndpoints(apiBaseUrl);
