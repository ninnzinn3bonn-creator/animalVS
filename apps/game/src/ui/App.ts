import {
  ArrowDown,
  Camera,
  ChevronLeft,
  ChevronRight,
  createIcons,
  Gamepad2,
  Menu,
  Play,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Save,
  Swords,
  SwitchCamera,
  Trash2,
  Trophy,
  Users,
  Video,
  Volume2,
  VolumeX
} from "lucide";
import type { GameMusic } from "../audio/GameMusic";
import type { CharacterDefinition } from "../character/CharacterTypes";
import { CaptureCooldown } from "../capture/CaptureCooldown";
import { serviceEndpoints } from "../config/services";
import { loadLeaderboard, recordLeaderboardEntry, syncLeaderboard, type LeaderboardEntry } from "../game/Leaderboard";
import type { GameController, GameHud, ResultReason } from "../game/GameController";
import type { VersusMode } from "../versus/VersusMode";
import { initialViewFromSearch } from "./InitialView";

export class AppUi implements GameHud {
  private root!: HTMLElement;
  private statusEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private nextEl!: HTMLElement;
  private dropsEl!: HTMLElement;
  private heightEl!: HTMLElement;
  private rosterEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private videoEl!: HTMLVideoElement;
  private nameInput!: HTMLInputElement;
  private startOverlayEl!: HTMLElement;
  private startButtonEl!: HTMLButtonElement;
  private rankingPanelEl!: HTMLElement;
  private rankingNameInput!: HTMLInputElement;
  private saveScoreButtonEl!: HTMLButtonElement;
  private rankingListEl!: HTMLOListElement;
  private rankingPageListEl!: HTMLOListElement;
  private rankingStatusEl!: HTMLElement;
  private leaderboardEntries: LeaderboardEntry[] = [];
  private resultHeight = 0;
  private resultBoardCharacters = 0;
  private menuEl!: HTMLElement;
  private menuButtonEl!: HTMLButtonElement;
  private musicButtonEl!: HTMLButtonElement;
  private captureStatusEl!: HTMLElement;
  private captureButtonEl!: HTMLButtonElement;
  private cameraStartButtonEl!: HTMLButtonElement;
  private cameraSwitchButtonEl!: HTMLButtonElement;
  private deleteDialogEl!: HTMLDialogElement;
  private deleteDialogMessageEl!: HTMLElement;
  private deleteConfirmButtonEl!: HTMLButtonElement;
  private pendingDelete: { id: string; name: string } | null = null;
  private stream: MediaStream | null = null;
  private cameraFacingMode: "user" | "environment" = "user";
  private captureAvailable = false;
  private captureSubmitting = false;
  private readonly captureCooldown = new CaptureCooldown();
  private captureCooldownTimer: number | null = null;
  private controller: GameController | null = null;
  private versusMode: VersusMode | null = null;
  private currentView = "title";
  private soloMode: "idle" | "playing" | "paused" | "result" = "idle";
  private rosterSignature = "";

  constructor(private readonly music: GameMusic) {}

  mount(root: HTMLElement, canvas: HTMLCanvasElement): void {
    this.root = root;
    root.classList.add("title-view");
    root.innerHTML = `
      <main class="shell">
        <header class="topbar">
          <h1>ヒューマンタワーバトル</h1>
          <div class="menu-wrap">
            <button
              class="menu-button"
              data-action="menu-toggle"
              type="button"
              aria-label="メニュー"
              aria-expanded="false"
              aria-controls="app-menu"
            >
              <i data-lucide="menu"></i>
            </button>
            <nav id="app-menu" class="app-menu" aria-label="メインメニュー" hidden>
              <button type="button" data-view="game"><i data-lucide="gamepad-2"></i><span>1人用ゲーム</span></button>
              <button type="button" data-view="versus"><i data-lucide="swords"></i><span>2人対戦</span></button>
              <button type="button" data-view="capture"><i data-lucide="camera"></i><span>キャラ撮影</span></button>
              <button type="button" data-view="characters"><i data-lucide="users"></i><span>キャラクター</span></button>
              <button type="button" data-action="music-toggle" aria-pressed="true"><i data-lucide="volume-2"></i><span data-music-label>音楽 オン</span></button>
              <button class="destructive" type="button" data-action="restart"><i data-lucide="refresh-ccw"></i><span>ゲームをリセット</span></button>
              <button type="button" data-view="ranking"><i data-lucide="trophy"></i><span>高さランキング</span></button>
            </nav>
          </div>
        </header>

        <section class="view active" id="view-title">
          <div class="title-screen">
            <button class="title-enter" type="button" data-action="title-enter" aria-label="1人用ゲーム画面へ進む">
              <span class="title-logo-backdrop" aria-hidden="true"></span>
              <img class="title-logo" src="/assets/backgrounds/tomodachi-title-v1.png" alt="ともだちたわーばとる" />
              <span class="title-tap-backdrop" aria-hidden="true"></span>
              <img class="title-tap-prompt" src="/assets/backgrounds/tap-prompt-v1.png" alt="タップしてね" />
            </button>
            <img class="title-menu-callout" src="/assets/backgrounds/menu-callout-v1.png" alt="メニュー" />
          </div>
        </section>

        <section class="view" id="view-game">
          <div class="game-screen">
            <div class="stage">
              <div class="game-hud" aria-label="ゲーム状況">
                <div class="hud-stat"><span>高さ</span><strong id="height">0px</strong></div>
                <div class="hud-timer">
                  <span>残り時間</span>
                  <strong id="timer">01:00</strong>
                  <small id="next">-</small>
                </div>
                <div class="hud-stat"><span>落下数</span><strong id="drops">0</strong></div>
              </div>
              <div id="start-overlay" class="start-overlay">
                <section id="result-ranking" class="result-ranking" hidden>
                  <div class="result-ranking-heading">
                    <i data-lucide="trophy"></i>
                    <h2>高さランキング</h2>
                  </div>
                  <div class="score-entry">
                    <input id="score-name" maxlength="24" placeholder="名前を入力" aria-label="ランキングに表示する名前" />
                    <button type="button" data-action="save-score">
                      <i data-lucide="save"></i><span>高さを記録</span>
                    </button>
                  </div>
                  <p id="ranking-status" class="ranking-status" role="status" aria-live="polite"></p>
                  <ol id="ranking-list" class="ranking-list"></ol>
                </section>
                <p id="status">スタート待ち</p>
                <button class="start-button" type="button" data-action="start">
                  <i data-lucide="play"></i><span>ゲーム開始</span>
                </button>
              </div>
              <div class="controls" aria-label="ゲーム操作">
                <button data-game-control data-action="left" type="button" aria-label="左へ移動" title="左へ移動"><i data-lucide="chevron-left"></i></button>
                <button data-game-control data-action="rotate-left" type="button" aria-label="左へ回転" title="左へ回転"><i data-lucide="rotate-ccw"></i></button>
                <button class="drop-control" data-game-control data-action="drop" type="button"><i data-lucide="arrow-down"></i><span>落とす</span></button>
                <button data-game-control data-action="rotate-right" type="button" aria-label="右へ回転" title="右へ回転"><i data-lucide="rotate-cw"></i></button>
                <button data-game-control data-action="right" type="button" aria-label="右へ移動" title="右へ移動"><i data-lucide="chevron-right"></i></button>
              </div>
            </div>
          </div>
        </section>

        <section class="view" id="view-versus">
          <div id="versus-root"></div>
        </section>

        <section class="view" id="view-capture">
          <div class="capture-grid">
            <div class="camera-box">
              <video id="camera-preview" autoplay playsinline muted></video>
              <button
                class="camera-switch-button"
                type="button"
                data-action="camera-switch"
                aria-label="外カメラに切り替え"
                title="外カメラに切り替え"
              >
                <i data-lucide="switch-camera"></i>
              </button>
              <div class="camera-actions">
                <button type="button" data-action="camera-start"><i data-lucide="video"></i><span>カメラを起動</span></button>
                <button class="primary-action" type="button" data-action="camera-shot"><i data-lucide="camera"></i><span>撮影して登録</span></button>
              </div>
            </div>
            <form class="capture-form">
              <label>キャラクター名
                <input id="participant-name" maxlength="60" placeholder="例：たにぐち" required />
              </label>
              <p id="capture-status" class="capture-status" role="status" aria-live="polite">
                撮影後、キャラクターの作成完了まで10秒ほどかかります。
              </p>
            </form>
          </div>
        </section>

        <section class="view" id="view-ranking">
          <div class="ranking-page">
            <div class="ranking-page-heading">
              <i data-lucide="trophy"></i>
              <h2>高さランキング</h2>
            </div>
            <ol id="ranking-page-list" class="ranking-list ranking-page-list"></ol>
          </div>
        </section>

        <section class="view" id="view-characters">
          <div id="roster" class="roster"></div>
        </section>

        <dialog id="delete-dialog" class="delete-dialog">
          <div class="delete-dialog-content">
            <h2>キャラクターを削除</h2>
            <p id="delete-dialog-message"></p>
            <div class="delete-dialog-actions">
              <button type="button" data-action="character-delete-cancel">キャンセル</button>
              <button class="delete-confirm" type="button" data-action="character-delete-confirm">
                <i data-lucide="trash-2"></i><span>削除</span>
              </button>
            </div>
          </div>
        </dialog>

        <div id="toast" class="toast" role="status" aria-live="polite"></div>
      </main>`;

    root.querySelector(".stage")?.append(canvas);
    this.statusEl = this.byId("status");
    this.timerEl = this.byId("timer");
    this.nextEl = this.byId("next");
    this.dropsEl = this.byId("drops");
    this.heightEl = this.byId("height");
    this.rosterEl = this.byId("roster");
    this.toastEl = this.byId("toast");
    this.videoEl = this.byId("camera-preview") as HTMLVideoElement;
    this.nameInput = this.byId("participant-name") as HTMLInputElement;
    this.startOverlayEl = this.byId("start-overlay");
    this.startButtonEl = root.querySelector<HTMLButtonElement>("[data-action='start']")!;
    this.rankingPanelEl = this.byId("result-ranking");
    this.rankingNameInput = this.byId("score-name") as HTMLInputElement;
    this.saveScoreButtonEl = root.querySelector<HTMLButtonElement>("[data-action='save-score']")!;
    this.rankingListEl = this.byId("ranking-list") as HTMLOListElement;
    this.rankingPageListEl = this.byId("ranking-page-list") as HTMLOListElement;
    this.rankingStatusEl = this.byId("ranking-status");
    this.leaderboardEntries = loadLeaderboard();
    this.menuEl = this.byId("app-menu");
    this.menuButtonEl = root.querySelector<HTMLButtonElement>("[data-action='menu-toggle']")!;
    this.musicButtonEl = root.querySelector<HTMLButtonElement>("[data-action='music-toggle']")!;
    this.captureStatusEl = this.byId("capture-status");
    this.captureButtonEl = root.querySelector<HTMLButtonElement>("[data-action='camera-shot']")!;
    this.cameraStartButtonEl = root.querySelector<HTMLButtonElement>("[data-action='camera-start']")!;
    this.cameraSwitchButtonEl = root.querySelector<HTMLButtonElement>("[data-action='camera-switch']")!;
    this.deleteDialogEl = this.byId("delete-dialog") as HTMLDialogElement;
    this.deleteDialogMessageEl = this.byId("delete-dialog-message");
    this.deleteConfirmButtonEl = root.querySelector<HTMLButtonElement>("[data-action='character-delete-confirm']")!;
    this.updateCameraSwitchButton();
    this.updateMusicButton();
    this.setCaptureAvailability(false);
    this.renderIcons();
    this.bindEvents();
    const initialView = initialViewFromSearch(window.location.search);
    if (initialView !== "title") {
      this.switchView(initialView);
    }
    void this.refreshSharedLeaderboard();
    this.deleteDialogEl.addEventListener("close", () => {
      this.pendingDelete = null;
      this.deleteConfirmButtonEl.disabled = false;
    });
  }

  setController(controller: GameController): void {
    this.controller = controller;
  }

  setVersusMode(versusMode: VersusMode): void {
    this.versusMode = versusMode;
  }

  setCaptureAvailability(available: boolean): void {
    this.captureAvailable = available;
    this.cameraStartButtonEl.disabled = !available;
    this.cameraSwitchButtonEl.disabled = !available;
    this.nameInput.disabled = !available;
    this.updateCaptureButton();
    if (!available) {
      this.stopCamera();
      this.setCaptureStatus("info", "PC側の画像処理は現在停止中です。ゲームはそのまま遊べます。");
    } else if (this.captureStatusEl.textContent?.includes("停止中")) {
      this.setCaptureStatus("info", "撮影後、キャラクターの作成完了まで10秒ほどかかります。");
    }
  }

  setState(state: {
    nextName: string;
    drops: number;
    height: number | null;
    boardCharacters: number;
    remainingMs: number;
    status: string;
    mode: "idle" | "playing" | "paused" | "result";
    canControl: boolean;
    characters: CharacterDefinition[];
    resultReason?: ResultReason;
  }): void {
    this.soloMode = state.mode;
    this.music.setActive("solo", this.currentView === "game" && state.mode === "playing");
    this.timerEl.textContent = this.formatTime(state.remainingMs);
    this.nextEl.textContent = state.nextName;
    this.dropsEl.textContent = String(state.drops);
    this.resultHeight = state.height ?? 0;
    this.resultBoardCharacters = state.boardCharacters;
    this.heightEl.textContent = state.height === null ? "測定待ち" : `${state.height}px`;
    this.statusEl.textContent = state.status;
    this.root.classList.toggle("result", Boolean(state.resultReason));
    this.startOverlayEl.hidden = state.mode === "playing";
    if (state.mode === "result" && state.height !== null) {
      this.rankingPanelEl.hidden = false;
      this.renderLeaderboard();
      this.renderRankingPage();
      if (!this.rankingStatusEl.textContent) {
        this.rankingStatusEl.textContent = `今回の記録: ${state.height}px / ${state.boardCharacters}体`;
      }
    } else {
      this.rankingPanelEl.hidden = true;
    }
    if (state.mode !== "result") {
      this.rankingNameInput.value = "";
      this.rankingNameInput.disabled = false;
      this.rankingStatusEl.textContent = "";
      this.saveScoreButtonEl.disabled = false;
    }
    this.startButtonEl.innerHTML =
      state.mode === "result"
        ? '<i data-lucide="play"></i><span>もう一度遊ぶ</span>'
        : state.mode === "paused"
          ? '<i data-lucide="play"></i><span>ゲームを再開</span>'
          : '<i data-lucide="play"></i><span>ゲーム開始</span>';
    this.renderIcons();
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-game-control]")
      .forEach((button) => (button.disabled = !state.canControl));
    this.renderRoster(state.characters);
    this.renderRankingPage();
  }

  notify(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("show");
    window.setTimeout(() => this.toastEl.classList.remove("show"), 2800);
  }

  characterProcessing(): void {
    this.setCaptureStatus("processing", "写真からキャラクターを作成中です。作成完了まで10秒ほどお待ちください。");
    this.notify("キャラクターを作成しています");
  }

  characterCreated(): void {
    this.setCaptureStatus("success", "キャラクターが完成し、ゲームに追加されました。");
    this.notify("新しいキャラクターをゲームに追加しました");
  }

  characterCreationFailed(): void {
    this.setCaptureStatus("error", "キャラクターの作成に失敗しました。もう一度撮影してください。");
    this.notify("キャラクターを作成できませんでした");
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const tab = target.closest<HTMLButtonElement>("[data-view]");
      if (tab) {
        this.switchView(tab.dataset.view ?? "game");
        this.closeMenu();
        return;
      }
      const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
      if (!action) {
        if (!target.closest(".menu-wrap")) {
          this.closeMenu();
        }
        return;
      }
      if (action === "menu-toggle") {
        this.toggleMenu();
        return;
      }
      if (action === "title-enter") {
        this.switchView("game");
        this.closeMenu();
        return;
      }
      if (action === "music-toggle") {
        this.music.toggle();
        this.updateMusicButton();
        return;
      }
      if (action === "start") this.controller?.startGame();
      if (action === "save-score") void this.saveScore();
      if (action === "left") this.controller?.move(-1);
      if (action === "right") this.controller?.move(1);
      if (action === "rotate-left") this.controller?.rotate(-1);
      if (action === "rotate-right") this.controller?.rotate(1);
      if (action === "drop") this.controller?.drop();
      if (action === "restart") {
        if (this.currentView === "versus") {
          this.versusMode?.returnToPreparation();
        } else {
          this.controller?.restart();
          this.switchView("game");
        }
        this.closeMenu();
      }
      if (action === "character-delete") {
        const button = target.closest<HTMLButtonElement>("[data-character-delete]");
        const id = button?.dataset.characterDelete ?? "";
        const name = button?.dataset.characterName ?? "このキャラクター";
        if (button && this.controller) {
          this.pendingDelete = { id, name };
          this.deleteDialogMessageEl.textContent = `${name}を削除します。この操作は取り消せません。`;
          this.deleteDialogEl.showModal();
        }
      }
      if (action === "character-delete-cancel") {
        this.closeDeleteDialog();
      }
      if (action === "character-delete-confirm" && this.pendingDelete && this.controller) {
        this.deleteConfirmButtonEl.disabled = true;
        void this.controller.deleteCharacter(this.pendingDelete.id).then((removed) => {
          this.deleteConfirmButtonEl.disabled = false;
          if (removed) {
            this.versusMode?.refreshCharacters();
            this.closeDeleteDialog();
          }
        });
      }
      if (action === "camera-start") {
        void this.startCamera()
          .then(() => this.setCaptureStatus("info", "カメラを起動しました。撮影の準備ができています。"))
          .catch(() => {
            this.setCaptureStatus("error", "カメラを起動できませんでした。ブラウザのカメラ権限を確認してください。");
            this.notify("カメラを起動できませんでした");
          });
      }
      if (action === "camera-switch") void this.switchCamera();
      if (action === "camera-shot") void this.capture();
    });
    this.root.addEventListener("change", (event) => {
      const toggle = (event.target as HTMLElement).closest<HTMLInputElement>("[data-character-enabled]");
      if (toggle && this.controller) {
        const enabled = toggle.checked;
        void this.controller
          .setCharacterEnabled(toggle.dataset.characterEnabled ?? "", enabled)
          .then((updated) => {
            if (!updated) {
              toggle.checked = !enabled;
            } else {
              this.versusMode?.refreshCharacters();
            }
          });
      }
    });
  }

  private switchView(view: string): void {
    if (this.currentView === "versus" && view !== "versus") {
      this.versusMode?.pauseForNavigation();
    }
    this.currentView = view;
    this.music.setActive("solo", view === "game" && this.soloMode === "playing");
    this.root.classList.toggle("title-view", view === "title");
    this.root.classList.toggle("game-view", view === "game");
    this.root.classList.toggle("versus-view", view === "versus");
    this.root.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${view}`));
    this.root
      .querySelectorAll("[data-view]")
      .forEach((el) => el.classList.toggle("active", el.getAttribute("data-view") === view));
    if (view !== "capture") {
      this.stopCamera();
    }
  }

  private toggleMenu(): void {
    const open = this.menuEl.hidden;
    this.menuEl.hidden = !open;
    this.menuButtonEl.setAttribute("aria-expanded", String(open));
    this.root.classList.toggle("menu-open", open);
  }

  private closeMenu(): void {
    this.menuEl.hidden = true;
    this.menuButtonEl.setAttribute("aria-expanded", "false");
    this.root.classList.remove("menu-open");
  }

  private updateMusicButton(): void {
    const enabled = this.music.isEnabled();
    this.musicButtonEl.setAttribute("aria-pressed", String(enabled));
    this.musicButtonEl.setAttribute("aria-label", enabled ? "音楽をオフにする" : "音楽をオンにする");
    this.musicButtonEl.innerHTML = `<i data-lucide="${enabled ? "volume-2" : "volume-x"}"></i><span data-music-label>音楽 ${enabled ? "オン" : "オフ"}</span>`;
    this.renderIcons();
  }

  private renderRoster(characters: CharacterDefinition[]): void {
    const signature = characters.map((character) => `${character.id}:${character.enabled}:${character.name}`).join("|");
    if (signature === this.rosterSignature) {
      return;
    }
    this.rosterSignature = signature;
    this.rosterEl.innerHTML = characters
      .map(
        (character) => `
        <article class="character-card${character.enabled ? "" : " disabled"}">
          <img src="${this.escapeAttribute(character.spriteUrl)}" alt="${this.escapeAttribute(character.name)}" />
          <div class="character-details">
            <div class="character-heading">
              <strong>${this.escapeHtml(character.name)}</strong>
              <button
                class="character-delete"
                type="button"
                data-action="character-delete"
                data-character-delete="${this.escapeAttribute(character.id)}"
                data-character-name="${this.escapeAttribute(character.name)}"
                aria-label="${this.escapeAttribute(character.name)}を削除"
                title="削除"
              ><i data-lucide="trash-2"></i></button>
            </div>
            <span>${this.collisionModeLabel(character.collisionMode)}・当たり判定 ${character.vertices.length}点</span>
            <label class="character-toggle">
              <input
                type="checkbox"
                data-character-enabled="${this.escapeAttribute(character.id)}"
                ${character.enabled ? "checked" : ""}
              />
              <span>${character.enabled ? "有効" : "無効"}</span>
            </label>
          </div>
        </article>`
      )
      .join("");
    this.renderIcons();
  }

  private renderLeaderboard(): void {
    const entries = this.leaderboardEntries;
    this.rankingListEl.innerHTML = entries.length
      ? entries
          .map(
            (entry, index) =>
              `<li><span class="ranking-rank">${index + 1}</span><span class="ranking-name">${this.escapeHtml(entry.name)}</span><strong>${entry.height}px</strong></li>`
          )
          .join("")
      : '<li class="ranking-empty">まだ記録がありません</li>';
  }

  private renderRankingPage(): void {
    const entries = this.leaderboardEntries;
    this.rankingPageListEl.innerHTML = entries.length
      ? entries
          .map(
            (entry, index) =>
              `<li><span class="ranking-rank">${index + 1}</span><span class="ranking-name">${this.escapeHtml(entry.name)}</span><span>${entry.height}px / ${entry.characters}体</span></li>`
          )
          .join("")
      : '<li class="ranking-empty">まだ記録がありません</li>';
    this.rankingListEl.innerHTML = this.rankingPageListEl.innerHTML;
  }

  private async saveScore(): Promise<void> {
    const height = this.resultHeight;
    if (!Number.isFinite(height)) {
      this.rankingStatusEl.textContent = "高さが確定してから記録できます";
      return;
    }
    this.leaderboardEntries = recordLeaderboardEntry(this.rankingNameInput.value, height, this.resultBoardCharacters);
    this.saveScoreButtonEl.disabled = true;
    this.rankingNameInput.disabled = true;
    this.rankingStatusEl.textContent = "高さをランキングに記録しました";
    this.renderLeaderboard();
    this.renderRankingPage();
    const synced = await this.refreshSharedLeaderboard();
    this.rankingStatusEl.textContent = synced
      ? "高さを全体ランキングに記録しました"
      : "この端末には保存しました。共有ランキングへの同期は再試行されます";
  }

  private async refreshSharedLeaderboard(): Promise<boolean> {
    try {
      this.leaderboardEntries = await syncLeaderboard();
      this.renderLeaderboard();
      this.renderRankingPage();
      return true;
    } catch {
      this.leaderboardEntries = loadLeaderboard();
      this.renderLeaderboard();
      this.renderRankingPage();
      return false;
    }
  }

  private closeDeleteDialog(): void {
    this.pendingDelete = null;
    this.deleteConfirmButtonEl.disabled = false;
    this.deleteDialogEl.close();
  }

  private async startCamera(facingMode = this.cameraFacingMode): Promise<void> {
    this.stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false
    });
    this.stream = stream;
    this.cameraFacingMode = facingMode;
    this.videoEl.dataset.facingMode = facingMode;
    this.videoEl.srcObject = stream;
    this.updateCameraSwitchButton();

    try {
      await this.waitForVideoFrame();
    } catch (error) {
      this.stopCamera();
      throw error;
    }
  }

  private async switchCamera(): Promise<void> {
    const previousFacingMode = this.cameraFacingMode;
    const nextFacingMode = previousFacingMode === "user" ? "environment" : "user";
    this.cameraSwitchButtonEl.disabled = true;

    try {
      await this.startCamera(nextFacingMode);
      this.setCaptureStatus(
        "info",
        nextFacingMode === "environment" ? "外カメラに切り替えました。" : "内カメラに切り替えました。"
      );
    } catch {
      this.cameraFacingMode = previousFacingMode;
      try {
        await this.startCamera(previousFacingMode);
      } catch {
        this.stopCamera();
      }
      this.setCaptureStatus("error", "カメラを切り替えられませんでした。端末のカメラ設定を確認してください。");
      this.notify("カメラを切り替えられませんでした");
    } finally {
      this.cameraSwitchButtonEl.disabled = false;
      this.updateCameraSwitchButton();
    }
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.videoEl.srcObject = null;
  }

  private updateCameraSwitchButton(): void {
    const label = this.cameraFacingMode === "user" ? "外カメラに切り替え" : "内カメラに切り替え";
    this.cameraSwitchButtonEl.setAttribute("aria-label", label);
    this.cameraSwitchButtonEl.title = label;
  }

  private async capture(): Promise<void> {
    if (!this.captureAvailable) {
      this.setCaptureStatus("info", "PC側の画像処理は現在停止中です。ゲームはそのまま遊べます。");
      return;
    }
    if (this.captureSubmitting || this.captureCooldown.isActive()) {
      return;
    }
    this.captureSubmitting = true;
    this.updateCaptureButton();
    this.setCaptureStatus("processing", "写真を送信しています。そのままお待ちください。");
    try {
      if (!this.stream) {
        await this.startCamera();
      }
      const width = this.videoEl.videoWidth || 960;
      const height = this.videoEl.videoHeight || 720;
      const canvas = document.createElement("canvas");
      this.drawPortraitFrame(canvas, width, height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("撮影に失敗しました"))), "image/jpeg", 0.92)
      );
      const form = new FormData();
      const name = this.nameInput.value.trim() || `キャラクター-${Date.now()}`;
      form.append("name", name);
      form.append("photo", blob, `${name}.jpg`);
      const response = await fetch(serviceEndpoints.apiUrl("/api/photos"), { method: "POST", body: form });
      if (!response.ok) {
        throw new Error(`写真の送信に失敗しました: ${response.status}`);
      }
      this.startCaptureCooldown();
      this.setCaptureStatus(
        "processing",
        "写真を受け付けました。次の撮影は5秒後にできます。キャラクターの作成完了まで10秒ほどお待ちください。"
      );
      this.notify("写真を受け付けました。作成完了まで10秒ほどお待ちください");
    } catch {
      this.setCaptureStatus("error", "写真を送信できませんでした。通信状況やカメラ権限を確認して、もう一度お試しください。");
      this.notify("写真を送信できませんでした");
    } finally {
      this.captureSubmitting = false;
      this.updateCaptureButton();
    }
  }

  private startCaptureCooldown(): void {
    this.captureCooldown.start();
    if (this.captureCooldownTimer !== null) {
      window.clearInterval(this.captureCooldownTimer);
    }
    this.updateCaptureButton();
    this.captureCooldownTimer = window.setInterval(() => {
      this.updateCaptureButton();
      if (!this.captureCooldown.isActive() && this.captureCooldownTimer !== null) {
        window.clearInterval(this.captureCooldownTimer);
        this.captureCooldownTimer = null;
      }
    }, 250);
  }

  private updateCaptureButton(): void {
    const cooldownSeconds = this.captureCooldown.remainingSeconds();
    this.captureButtonEl.disabled = !this.captureAvailable || this.captureSubmitting || cooldownSeconds > 0;
    const label = this.captureButtonEl.querySelector("span");
    if (label) {
      label.textContent = this.captureSubmitting
        ? "送信中"
        : cooldownSeconds > 0
          ? `再撮影まで${cooldownSeconds}秒`
          : "撮影して登録";
    }
  }

  private setCaptureStatus(state: "info" | "processing" | "success" | "error", message: string): void {
    this.captureStatusEl.className = `capture-status ${state}`;
    this.captureStatusEl.textContent = message;
  }

  private drawPortraitFrame(canvas: HTMLCanvasElement, sourceWidth: number, sourceHeight: number): void {
    canvas.width = 675;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("撮影画像を作成できませんでした");
    }

    const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (canvas.width - drawWidth) / 2;
    const drawY = (canvas.height - drawHeight) / 2;
    context.fillStyle = "#111318";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      this.videoEl,
      0,
      0,
      sourceWidth,
      sourceHeight,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
  }

  private waitForVideoFrame(): Promise<void> {
    if (
      this.videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      this.videoEl.videoWidth > 0 &&
      this.videoEl.videoHeight > 0
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        this.videoEl.removeEventListener("loadeddata", handleReady);
        this.videoEl.removeEventListener("error", handleError);
      };
      const handleReady = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("カメラ映像を取得できませんでした"));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("カメラ映像の準備がタイムアウトしました"));
      }, 5000);

      this.videoEl.addEventListener("loadeddata", handleReady, { once: true });
      this.videoEl.addEventListener("error", handleError, { once: true });
    });
  }

  private collisionModeLabel(mode: CharacterDefinition["collisionMode"]): string {
    if (mode === "convexHull") return "シルエット";
    if (mode === "capsule") return "カプセル";
    if (mode === "box") return "四角形";
    return "輪郭";
  }

  private renderIcons(): void {
    createIcons({
      icons: {
        ArrowDown,
        Camera,
        ChevronLeft,
        ChevronRight,
        Gamepad2,
        Menu,
        Play,
        RefreshCcw,
        RotateCcw,
        RotateCw,
        SwitchCamera,
        Swords,
        Trash2,
        Trophy,
        Users,
        Video,
        Volume2,
        VolumeX,
        Save
      },
      attrs: {
        "aria-hidden": "true",
        "stroke-width": "2"
      }
    });
  }

  private formatTime(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return entities[character] ?? character;
    });
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value);
  }

  private byId(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing #${id}`);
    }
    return element;
  }
}
