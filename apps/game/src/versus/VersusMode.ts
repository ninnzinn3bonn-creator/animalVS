import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  createIcons,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Swords
} from "lucide";
import type { GameMusic } from "../audio/GameMusic";
import type { CharacterRepository } from "../character/CharacterRepository";
import type { CharacterDefinition } from "../character/CharacterTypes";
import type { GameHud, GameState, ResultReason } from "../game/GameController";
import type { PlayerId } from "../game/TurnManager";
import {
  VersusCoordinator,
  type VersusCoordinatorEvents,
  type VersusPauseReason,
  type VersusPhase,
  type VersusResult
} from "./VersusCoordinator";
import type { ConnectedGamepad, InputAssignment, VersusAction } from "./VersusInput";
import { validateInputAssignments } from "./VersusInput";
import {
  VERSUS_ATTACK_EARNED_MESSAGE,
  VERSUS_ATTACK_INCOMING_MESSAGE,
  VERSUS_LIVES,
  VERSUS_WORLD_HEIGHT,
  VERSUS_WORLD_WIDTH
} from "./VersusConfig";

export class VersusMode implements VersusCoordinatorEvents {
  private root!: HTMLElement;
  private setupEl!: HTMLElement;
  private arenaEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private timerLabelEl!: HTMLElement;
  private setupStatusEl!: HTMLElement;
  private startButtonEl!: HTMLButtonElement;
  private pauseOverlayEl!: HTMLElement;
  private pauseMessageEl!: HTMLElement;
  private resumeButtonEl!: HTMLButtonElement;
  private resultOverlayEl!: HTMLElement;
  private resultTitleEl!: HTMLElement;
  private resultReasonEl!: HTMLElement;
  private selects!: Record<PlayerId, HTMLSelectElement>;
  private playerPanels!: Record<PlayerId, HTMLElement>;
  private controls!: Record<PlayerId, HTMLElement>;
  private attackNotices!: Record<PlayerId, HTMLElement>;
  private livesEls!: Record<PlayerId, HTMLElement>;
  private startCountdownEls!: Record<PlayerId, HTMLElement>;
  private resultCards!: Record<PlayerId, HTMLElement>;
  private readonly attackNoticeTimers: Partial<Record<PlayerId, number>> = {};
  private coordinator!: VersusCoordinator;
  private gamepads: ConnectedGamepad[] = [];
  private currentPhase: VersusPhase = "setup";

  constructor(
    private readonly repository: CharacterRepository,
    private readonly music: GameMusic
  ) {}

  mount(root: HTMLElement): void {
    this.root = root;
    root.innerHTML = `
      <section class="versus-setup" data-versus-setup>
        <div class="versus-setup-heading">
          <i data-lucide="swords"></i>
          <div><h2>ローカル2人対戦</h2><p>左右の操作方法を選んで対戦を開始</p></div>
        </div>
        <div class="versus-player-settings">
          ${this.setupPlayerMarkup(1, "keyboard:wasd")}
          ${this.setupPlayerMarkup(2, "keyboard:arrows")}
        </div>
        <p class="versus-setup-status" data-versus-setup-status role="status"></p>
        <button class="versus-start" type="button" data-versus-command="start">
          <i data-lucide="play"></i><span>対戦開始</span>
        </button>
      </section>

      <section class="versus-arena" data-versus-arena hidden>
        <div class="versus-common-clock" aria-live="polite">
          <span data-versus-timer-label>残り時間</span>
          <strong data-versus-timer>01:00</strong>
        </div>
        <div class="versus-boards">
          ${this.playerBoardMarkup(1)}
          ${this.playerBoardMarkup(2)}
        </div>
        <div class="versus-modal" data-versus-pause hidden>
          <div class="versus-modal-panel">
            <i data-lucide="pause"></i>
            <h2>対戦を一時停止しました</h2>
            <p data-versus-pause-message></p>
            <div class="versus-modal-actions">
              <button type="button" data-versus-command="resume"><i data-lucide="play"></i><span>再開</span></button>
              <button type="button" data-versus-command="setup"><i data-lucide="settings-2"></i><span>操作設定</span></button>
            </div>
          </div>
        </div>
        <div class="versus-modal versus-result" data-versus-result hidden>
          <div class="versus-modal-panel">
            <i data-lucide="swords"></i>
            <h2 data-versus-result-title>勝敗決定</h2>
            <p data-versus-result-reason></p>
            <div class="versus-result-grid">
              ${this.resultCardMarkup(1)}
              ${this.resultCardMarkup(2)}
            </div>
            <div class="versus-modal-actions">
              <button class="primary" type="button" data-versus-command="rematch"><i data-lucide="play"></i><span>再戦</span></button>
              <button type="button" data-versus-command="setup"><i data-lucide="settings-2"></i><span>操作設定</span></button>
            </div>
          </div>
        </div>
      </section>`;

    this.setupEl = root.querySelector("[data-versus-setup]")!;
    this.arenaEl = root.querySelector("[data-versus-arena]")!;
    this.timerEl = root.querySelector("[data-versus-timer]")!;
    this.timerLabelEl = root.querySelector("[data-versus-timer-label]")!;
    this.setupStatusEl = root.querySelector("[data-versus-setup-status]")!;
    this.startButtonEl = root.querySelector("[data-versus-command='start']")!;
    this.pauseOverlayEl = root.querySelector("[data-versus-pause]")!;
    this.pauseMessageEl = root.querySelector("[data-versus-pause-message]")!;
    this.resumeButtonEl = root.querySelector("[data-versus-command='resume']")!;
    this.resultOverlayEl = root.querySelector("[data-versus-result]")!;
    this.resultTitleEl = root.querySelector("[data-versus-result-title]")!;
    this.resultReasonEl = root.querySelector("[data-versus-result-reason]")!;
    this.selects = {
      1: root.querySelector("[data-versus-input='1']")!,
      2: root.querySelector("[data-versus-input='2']")!
    };
    this.playerPanels = {
      1: root.querySelector("[data-versus-player='1']")!,
      2: root.querySelector("[data-versus-player='2']")!
    };
    this.controls = {
      1: root.querySelector("[data-versus-controls='1']")!,
      2: root.querySelector("[data-versus-controls='2']")!
    };
    this.attackNotices = {
      1: root.querySelector("[data-versus-attack='1']")!,
      2: root.querySelector("[data-versus-attack='2']")!
    };
    this.livesEls = {
      1: root.querySelector("[data-player-lives='1']")!,
      2: root.querySelector("[data-player-lives='2']")!
    };
    this.startCountdownEls = {
      1: root.querySelector("[data-versus-start-countdown='1']")!,
      2: root.querySelector("[data-versus-start-countdown='2']")!
    };
    this.resultCards = {
      1: root.querySelector("[data-versus-result-player='1']")!,
      2: root.querySelector("[data-versus-result-player='2']")!
    };

    const canvases: Record<PlayerId, HTMLCanvasElement> = {
      1: this.createCanvas(),
      2: this.createCanvas()
    };
    this.playerPanels[1].querySelector(".versus-stage")!.prepend(canvases[1]);
    this.playerPanels[2].querySelector(".versus-stage")!.prepend(canvases[2]);
    const huds: Record<PlayerId, PlayerHud> = {
      1: new PlayerHud(this.playerPanels[1]),
      2: new PlayerHud(this.playerPanels[2])
    };
    this.coordinator = new VersusCoordinator(canvases, this.repository, huds, this);
    this.bindEvents();
    this.renderIcons();
    this.syncAssignments();
  }

  refreshCharacters(): void {
    this.coordinator.refreshCharacters();
  }

  returnToPreparation(): void {
    this.coordinator.returnToSetup();
  }

  pauseForNavigation(): void {
    this.coordinator.pauseForNavigation();
  }

  phaseChanged(phase: VersusPhase): void {
    this.currentPhase = phase;
    this.music.setActive("versus", phase === "playing" || phase === "overtime");
    const setup = phase === "setup";
    this.setupEl.hidden = !setup;
    this.arenaEl.hidden = setup;
    this.arenaEl.dataset.phase = phase;
    if (phase === "countdown" || phase === "playing" || phase === "overtime") {
      this.pauseOverlayEl.hidden = true;
      this.resultOverlayEl.hidden = true;
    }
    if (phase === "setup") {
      this.hideAttackNotices();
      this.startCountdownChanged(null);
    }
    if (phase === "measuring") {
      this.timerLabelEl.textContent = "高さを測定中";
      this.timerEl.textContent = "00:00";
    }
    this.applyControlVisibility();
  }

  timerChanged(remainingMs: number, overtime: boolean): void {
    this.timerLabelEl.textContent = overtime ? "同点" : "残り時間";
    this.timerEl.textContent = overtime ? "延長戦" : formatTime(remainingMs);
    this.timerEl.classList.toggle("overtime", overtime);
  }

  gamepadsChanged(gamepads: ConnectedGamepad[]): void {
    this.gamepads = gamepads;
    if (this.selects) {
      this.renderInputOptions();
      this.syncAssignments();
    }
    if (this.currentPhase === "paused") {
      this.resumeButtonEl.disabled = false;
    }
  }

  paused(reason: VersusPauseReason, disconnectedPlayer?: PlayerId): void {
    this.pauseOverlayEl.hidden = false;
    this.pauseMessageEl.textContent =
      reason === "controller"
        ? `Player ${disconnectedPlayer ?? ""} のコントローラーが切断されました。再接続してから再開してください。`
        : "両方の盤面を停止しています。";
    this.resumeButtonEl.disabled = reason === "controller";
  }

  resumed(): void {
    this.pauseOverlayEl.hidden = true;
  }

  startCountdownChanged(value: 3 | 2 | 1 | null): void {
    if (!this.startCountdownEls) return;
    for (const player of [1, 2] as const) {
      const countdown = this.startCountdownEls[player];
      countdown.hidden = value === null;
      countdown.textContent = value === null ? "" : String(value);
    }
  }

  livesChanged(player: PlayerId, remainingLives: number): void {
    if (!this.livesEls) return;
    const lives = this.livesEls[player];
    lives.setAttribute("aria-label", `残り体力 ${remainingLives}`);
    lives.querySelectorAll<HTMLImageElement>(".versus-heart").forEach((heart, index) => {
      heart.classList.toggle("lost", index >= remainingLives);
    });
  }

  attackTriggered(attacker: PlayerId, target: PlayerId): void {
    this.showAttackNotice(attacker, VERSUS_ATTACK_EARNED_MESSAGE, "earned");
    this.showAttackNotice(target, VERSUS_ATTACK_INCOMING_MESSAGE, "incoming");
  }

  finished(result: VersusResult): void {
    this.resultOverlayEl.hidden = false;
    this.resultTitleEl.textContent = `Player ${result.winner} の勝利`;
    this.resultReasonEl.textContent =
      result.reason === "drop"
        ? `Player ${result.loser} の2体目のキャラクターが落下しました`
        : result.reason === "characters"
          ? `高さが同じため、接地キャラ数で Player ${result.winner} が上回りました`
          : `制限時間終了時の高さで Player ${result.winner} が上回りました`;
    for (const player of [1, 2] as const) {
      const card = this.resultCards[player];
      const measurement = result.measurements[player];
      card.dataset.outcome = player === result.winner ? "winner" : "loser";
      card.querySelector("[data-result-outcome]")!.textContent = player === result.winner ? "勝者" : "敗者";
      card.querySelector("[data-result-height]")!.textContent = `${measurement.height}px`;
      card.querySelector("[data-result-characters]")!.textContent = `${measurement.boardCharacters}体`;
    }
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const command = target.closest<HTMLButtonElement>("[data-versus-command]")?.dataset.versusCommand;
      if (command === "start") this.startMatch();
      if (command === "rematch") this.startRematch();
      if (command === "setup") this.coordinator.returnToSetup();
      if (command === "resume") {
        if (!this.coordinator.resume()) {
          this.pauseMessageEl.textContent = "割り当てたコントローラーを接続してから再開してください。";
        }
      }
      const actionButton = target.closest<HTMLButtonElement>("[data-versus-action]");
      if (actionButton) {
        const player = Number(actionButton.dataset.player) as PlayerId;
        this.coordinator.screenAction(player, actionButton.dataset.versusAction as VersusAction);
      }
    });
    this.root.addEventListener("change", (event) => {
      if ((event.target as HTMLElement).matches("[data-versus-input]")) {
        this.syncAssignments();
      }
    });
  }

  private startMatch(): void {
    const assignments = this.readAssignments();
    const error = this.coordinator.startMatch(assignments);
    if (error) {
      this.setupStatusEl.textContent = error;
      return;
    }
    this.setupStatusEl.textContent = "";
    this.applyControlVisibility();
  }

  private startRematch(): void {
    const error = this.coordinator.rematch();
    if (error) {
      this.coordinator.returnToSetup();
      this.setupStatusEl.textContent = error;
    }
  }

  private syncAssignments(): void {
    const assignments = this.readAssignments();
    for (const player of [1, 2] as const) {
      const other = player === 1 ? assignments[2] : assignments[1];
      for (const option of Array.from(this.selects[player].options)) {
        option.disabled = option.value === other && option.value !== assignments[player];
      }
    }
    const error = validateInputAssignments(assignments[1], assignments[2], this.gamepads);
    this.startButtonEl.disabled = Boolean(error);
    this.setupStatusEl.textContent = error ?? "";
    this.applyControlVisibility();
  }

  private renderInputOptions(): void {
    const current = this.readAssignments();
    for (const player of [1, 2] as const) {
      const selected = current[player];
      const staticOptions = [
        ["keyboard:wasd", "キーボード: WASD + Space"],
        ["keyboard:arrows", "キーボード: 矢印キー + Enter"],
        ["screen", "画面コントロール"]
      ] as const;
      const options: Array<readonly [string, string]> = [
        ...staticOptions,
        ...this.gamepads.map(
          (gamepad) => [`gamepad:${gamepad.index}`, `コントローラー ${gamepad.index + 1}: ${shortLabel(gamepad.label)}`] as const
        )
      ];
      if (selected.startsWith("gamepad:") && !options.some(([value]) => value === selected)) {
        options.push([selected, `${selected.replace("gamepad:", "コントローラー ")}（未接続）`]);
      }
      this.selects[player].innerHTML = options
        .map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
        .join("");
    }
  }

  private applyControlVisibility(): void {
    if (!this.selects) return;
    const assignments = this.readAssignments();
    for (const player of [1, 2] as const) {
      this.controls[player].hidden = assignments[player] !== "screen";
      this.playerPanels[player].classList.toggle("screen-controlled", assignments[player] === "screen");
    }
  }

  private readAssignments(): Record<PlayerId, InputAssignment> {
    return {
      1: (this.selects?.[1]?.value || "keyboard:wasd") as InputAssignment,
      2: (this.selects?.[2]?.value || "keyboard:arrows") as InputAssignment
    };
  }

  private setupPlayerMarkup(player: PlayerId, selected: InputAssignment): string {
    return `<article class="versus-player-setting player-${player}">
      <div class="versus-player-label"><span>P${player}</span><strong>Player ${player}</strong></div>
      <label for="versus-input-${player}">操作方法</label>
      <select id="versus-input-${player}" data-versus-input="${player}">
        <option value="keyboard:wasd"${selected === "keyboard:wasd" ? " selected" : ""}>キーボード: WASD + Space</option>
        <option value="keyboard:arrows"${selected === "keyboard:arrows" ? " selected" : ""}>キーボード: 矢印キー + Enter</option>
        <option value="screen">画面コントロール</option>
      </select>
      <div class="versus-device-state"><i data-lucide="gamepad-2"></i><span>入力を個別に割り当て</span></div>
    </article>`;
  }

  private playerBoardMarkup(player: PlayerId): string {
    return `<article class="versus-player-board player-${player}" data-versus-player="${player}">
      <header class="versus-player-hud">
        <div><span class="versus-player-number">P${player}</span><strong>Player ${player}</strong>${this.livesMarkup(player)}</div>
        <dl><div><dt>次</dt><dd data-player-next>-</dd></div><div><dt>落下数</dt><dd data-player-drops>0</dd></div></dl>
      </header>
      <div class="versus-stage">
        <div class="versus-attack-notice" data-versus-attack="${player}" hidden></div>
        <div class="versus-start-countdown" data-versus-start-countdown="${player}" hidden></div>
        <div class="versus-turn-countdown" data-player-countdown hidden></div>
        <div class="versus-player-status" data-player-status>スタート待ち</div>
        <div class="versus-controls" data-versus-controls="${player}" hidden>
          ${this.controlButton(player, "left", "chevron-left", "左へ移動")}
          ${this.controlButton(player, "rotate-left", "rotate-ccw", "左へ回転")}
          ${this.controlButton(player, "drop", "arrow-down", "落とす", true)}
          ${this.controlButton(player, "rotate-right", "rotate-cw", "右へ回転")}
          ${this.controlButton(player, "right", "chevron-right", "右へ移動")}
        </div>
      </div>
    </article>`;
  }

  private livesMarkup(player: PlayerId): string {
    const hearts = Array.from(
      { length: VERSUS_LIVES },
      () => '<img class="versus-heart" src="/assets/ui/versus-heart-v1.png" alt="" />'
    ).join("");
    return `<span class="versus-lives" data-player-lives="${player}" role="img" aria-label="残り体力 ${VERSUS_LIVES}">${hearts}</span>`;
  }

  private controlButton(player: PlayerId, action: VersusAction, icon: string, label: string, primary = false): string {
    return `<button class="${primary ? "drop" : ""}" type="button" data-player="${player}" data-versus-action="${action}" aria-label="${label}" title="${label}"><i data-lucide="${icon}"></i>${primary ? "<span>落とす</span>" : ""}</button>`;
  }

  private resultCardMarkup(player: PlayerId): string {
    return `<article class="versus-result-card" data-versus-result-player="${player}">
      <span>Player ${player}</span><strong data-result-outcome></strong>
      <dl><div><dt>高さ</dt><dd data-result-height>0px</dd></div><div><dt>接地</dt><dd data-result-characters>0体</dd></div></dl>
    </article>`;
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = VERSUS_WORLD_WIDTH;
    canvas.height = VERSUS_WORLD_HEIGHT;
    return canvas;
  }

  private renderIcons(): void {
    createIcons({
      icons: { ArrowDown, ChevronLeft, ChevronRight, Gamepad2, Pause, Play, RotateCcw, RotateCw, Settings2, Swords },
      attrs: { "aria-hidden": "true", "stroke-width": "2" }
    });
  }

  private showAttackNotice(player: PlayerId, message: string, state: "earned" | "incoming"): void {
    const notice = this.attackNotices[player];
    const existingTimer = this.attackNoticeTimers[player];
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }
    notice.textContent = message;
    notice.dataset.state = state;
    notice.hidden = false;
    this.attackNoticeTimers[player] = window.setTimeout(() => {
      notice.hidden = true;
      delete this.attackNoticeTimers[player];
    }, 2_400);
  }

  private hideAttackNotices(): void {
    for (const player of [1, 2] as const) {
      const timer = this.attackNoticeTimers[player];
      if (timer !== undefined) {
        window.clearTimeout(timer);
        delete this.attackNoticeTimers[player];
      }
      this.attackNotices[player].hidden = true;
    }
  }
}

class PlayerHud implements GameHud {
  private readonly nextEl: HTMLElement;
  private readonly dropsEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly countdownEl: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.nextEl = root.querySelector("[data-player-next]")!;
    this.dropsEl = root.querySelector("[data-player-drops]")!;
    this.statusEl = root.querySelector("[data-player-status]")!;
    this.countdownEl = root.querySelector("[data-player-countdown]")!;
  }

  setState(state: {
    nextName: string;
    drops: number;
    height: number | null;
    boardCharacters: number;
    remainingMs: number;
    status: string;
    mode: GameState;
    canControl: boolean;
    turnCountdown?: number | null;
    characters: CharacterDefinition[];
    resultReason?: ResultReason;
  }): void {
    this.nextEl.textContent = state.nextName;
    this.dropsEl.textContent = String(state.drops);
    this.statusEl.textContent = state.status;
    this.countdownEl.hidden = state.turnCountdown == null;
    this.countdownEl.textContent = state.turnCountdown == null ? "" : String(state.turnCountdown);
    this.root.querySelectorAll<HTMLButtonElement>("[data-versus-action]").forEach((button) => {
      button.disabled = !state.canControl;
    });
  }

  notify(): void {}
}

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shortLabel(value: string): string {
  return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character] ?? character;
  });
}
