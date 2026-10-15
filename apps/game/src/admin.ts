import { createIcons, Eye, EyeOff, LogOut, RefreshCw, ShieldCheck, Trash2 } from "lucide";
import { serviceEndpoints } from "./config/services";
import type { CharacterDefinition } from "./character/CharacterTypes";
import "./admin.css";

interface Session { authenticated: boolean; id?: string; csrf?: string }
interface Overview {
  characters: CharacterDefinition[];
  diagnostics: { characterCount: number; enabledCount: number; missingSprites: string[]; processing: Array<{ status: string }> };
}

const root = document.querySelector<HTMLElement>("#admin-app")!;
let csrf = "";

root.innerHTML = `
  <section class="login-shell" data-login>
    <form class="login-panel">
      <div class="mark"><i data-lucide="shield-check"></i></div>
      <h1>管理者ログイン</h1>
      <p>キャラクター正本と接続状態を管理します。</p>
      <label>ID<input name="id" type="email" autocomplete="username" required /></label>
      <label>パスワード<span class="password-wrap"><input name="password" type="password" autocomplete="current-password" required /><button type="button" data-show-password aria-label="パスワードを表示"><i data-lucide="eye"></i></button></span></label>
      <button class="primary" type="submit">ログイン</button>
      <output data-login-status></output>
    </form>
  </section>
  <section class="dashboard" data-dashboard hidden>
    <header><div><span class="eyebrow">ADMIN CONSOLE</span><h1>ともだちたわーばとる</h1></div><div class="header-actions"><button data-refresh><i data-lucide="refresh-cw"></i><span>更新</span></button><button data-logout><i data-lucide="log-out"></i><span>ログアウト</span></button></div></header>
    <div class="status-line" data-status>接続状態を確認しています</div>
    <section class="metrics" data-metrics></section>
    <section class="character-section"><div class="section-heading"><div><h2>キャラクター正本</h2><p>ここでの変更はローカル正本へ反映されます。</p></div></div><div class="character-grid" data-characters></div></section>
  </section>`;

const login = root.querySelector<HTMLElement>("[data-login]")!;
const dashboard = root.querySelector<HTMLElement>("[data-dashboard]")!;
const status = root.querySelector<HTMLElement>("[data-status]")!;
const form = root.querySelector<HTMLFormElement>("form")!;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const output = root.querySelector<HTMLOutputElement>("[data-login-status]")!;
  output.textContent = "確認しています…";
  const values = new FormData(form);
  try {
    const session = await api<Session>("/api/admin/login", { method: "POST", body: JSON.stringify({ id: values.get("id"), password: values.get("password") }) });
    csrf = session.csrf ?? "";
    form.reset();
    await showDashboard();
  } catch (error) { output.textContent = message(error); }
});

root.querySelector("[data-show-password]")?.addEventListener("click", () => {
  const input = form.elements.namedItem("password") as HTMLInputElement;
  input.type = input.type === "password" ? "text" : "password";
  root.querySelector("[data-show-password]")!.innerHTML = `<i data-lucide="${input.type === "password" ? "eye" : "eye-off"}"></i>`;
  icons();
});
root.querySelector("[data-refresh]")?.addEventListener("click", () => void loadOverview());
root.querySelector("[data-logout]")?.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST", headers: { "x-csrf-token": csrf } });
  csrf = ""; dashboard.hidden = true; login.hidden = false;
});
root.addEventListener("change", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-enabled]");
  if (input) void mutateCharacter(input.dataset.enabled!, { method: "PATCH", body: JSON.stringify({ enabled: input.checked }) });
});
root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-delete]");
  if (button && confirm(`${button.dataset.name}を正本から完全に削除しますか？`)) void mutateCharacter(button.dataset.delete!, { method: "DELETE" });
});

async function restore(): Promise<void> {
  try {
    const session = await api<Session>("/api/admin/session");
    csrf = session.csrf ?? "";
    await showDashboard();
  } catch { login.hidden = false; dashboard.hidden = true; }
}
async function showDashboard(): Promise<void> { login.hidden = true; dashboard.hidden = false; await loadOverview(); }
async function loadOverview(): Promise<void> {
  status.textContent = "接続状態を確認しています…";
  try {
    const [data, ranking] = await Promise.all([
      api<Overview>("/api/admin/overview"),
      fetch("/api/leaderboard", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("ランキングD1に接続できません");
        return await response.json() as { entries?: unknown[] };
      })
    ]);
    const processing = data.diagnostics.processing;
    const failed = processing.filter((item) => item.status === "failed").length;
    root.querySelector<HTMLElement>("[data-metrics]")!.innerHTML = [
      ["API", "正常"], ["登録キャラ", `${data.diagnostics.characterCount}体`], ["正本で有効", `${data.diagnostics.enabledCount}体`],
      ["画像欠損", `${data.diagnostics.missingSprites.length}件`], ["ランキング", `${ranking.entries?.length ?? 0}件`], ["処理失敗", `${failed}件`]
    ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");
    root.querySelector<HTMLElement>("[data-characters]")!.innerHTML = data.characters.map((character) => `
      <article class="character-card"><img src="${serviceEndpoints.apiUrl(character.spriteUrl)}" alt="" /><div><strong>${escapeHtml(character.name)}</strong><span>${character.width} × ${character.height}px</span></div><label class="switch"><input type="checkbox" data-enabled="${character.id}" ${character.enabled ? "checked" : ""}/><span>有効</span></label><button class="danger" data-delete="${character.id}" data-name="${escapeAttr(character.name)}" title="完全に削除"><i data-lucide="trash-2"></i></button></article>`).join("");
    status.textContent = `最終確認 ${new Date().toLocaleString("ja-JP")}　すべての接続は正常です`;
    icons();
  } catch (error) { status.textContent = message(error); if (message(error).includes("ログイン")) { dashboard.hidden = true; login.hidden = false; } }
}
async function mutateCharacter(id: string, init: RequestInit): Promise<void> {
  try { await api(`/api/characters/${encodeURIComponent(id)}`, { ...init, headers: { "content-type": "application/json", "x-csrf-token": csrf } }); await loadOverview(); }
  catch (error) { alert(message(error)); await loadOverview(); }
}
async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(serviceEndpoints.apiUrl(path), { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { message?: string }; throw new Error(body.message ?? `通信エラー (${response.status})`); }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
function message(error: unknown): string { return error instanceof Error ? error.message : "通信に失敗しました"; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!)); }
function escapeAttr(value: string): string { return escapeHtml(value); }
function icons(): void { createIcons({ icons: { Eye, EyeOff, LogOut, RefreshCw, ShieldCheck, Trash2 } }); }
icons(); void restore();
