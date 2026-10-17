import { gamepadButtonPressed, gamepadFaceMapping } from "../game/GamepadMapping";

type Direction = "previous" | "next";

export class GamepadReleaseGate {
  private waiting = false;

  arm(): void {
    this.waiting = true;
  }

  consume(anyButtonPressed: boolean): boolean {
    if (!this.waiting) return false;
    if (!anyButtonPressed) this.waiting = false;
    return true;
  }
}

export function defaultControlIndex(controls: readonly Pick<HTMLElement, "hasAttribute" | "classList">[]): number {
  const preferred = controls.findIndex((control) => control.hasAttribute("data-gamepad-default"));
  if (preferred >= 0) return preferred;
  const active = controls.findIndex((control) => control.classList.contains("active"));
  return active >= 0 ? active : 0;
}

export function movedControlIndex(
  controlCount: number,
  currentIndex: number,
  preferredIndex: number,
  direction: Direction
): number {
  if (controlCount <= 0) return -1;
  const start = currentIndex < 0 ? preferredIndex : currentIndex;
  const delta = direction === "next" ? 1 : -1;
  return (start + delta + controlCount) % controlCount;
}

export class GamepadUiNavigator {
  private frame: number | null = null;
  private previousPressed = new Set<string>();
  private previousAnyPressed = new Set<string>();
  private readonly releaseGate = new GamepadReleaseGate();

  constructor(
    private readonly root: HTMLElement,
    private readonly isGameplayActive: () => boolean,
    private readonly onBack: () => void,
    private readonly dismissOverlay: () => boolean = () => false
  ) {}

  connect(): void {
    if (this.frame !== null) return;
    const poll = () => {
      this.poll();
      this.frame = window.requestAnimationFrame(poll);
    };
    this.frame = window.requestAnimationFrame(poll);
  }

  dispose(): void {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  focusDefaultControl(): void {
    const controls = this.controls();
    if (!controls.length) return;
    this.focusControl(controls, defaultControlIndex(controls));
  }

  private poll(): void {
    const gamepads = navigator.getGamepads?.() ?? [];
    const anyPressed = new Set<string>();
    for (const pad of gamepads) {
      if (!pad) continue;
      pad.buttons.forEach((button, index) => {
        if (button.pressed) anyPressed.add(`${pad.index}:button:${index}`);
      });
    }
    if (this.releaseGate.consume(anyPressed.size > 0)) {
      this.previousAnyPressed = anyPressed;
      this.previousPressed.clear();
      return;
    }
    if ([...anyPressed].some((key) => !this.previousAnyPressed.has(key)) && this.dismissOverlay()) {
      this.releaseGate.arm();
      this.previousAnyPressed = anyPressed;
      this.previousPressed.clear();
      return;
    }
    this.previousAnyPressed = anyPressed;
    if (this.isGameplayActive()) {
      this.previousPressed.clear();
      return;
    }
    const pressed = new Set<string>();
    for (const pad of gamepads) {
      if (!pad) continue;
      const face = gamepadFaceMapping(pad);
      const left = Boolean(pad.buttons[14]?.pressed) || (pad.axes[0] ?? 0) < -0.6;
      const right = Boolean(pad.buttons[15]?.pressed) || (pad.axes[0] ?? 0) > 0.6;
      const up = Boolean(pad.buttons[12]?.pressed) || (pad.axes[1] ?? 0) < -0.6;
      const down = Boolean(pad.buttons[13]?.pressed) || (pad.axes[1] ?? 0) > 0.6;
      this.edge(pressed, `${pad.index}:move`, left || up ? "previous" : right || down ? "next" : null);
      this.edge(pressed, `${pad.index}:a`, gamepadButtonPressed(pad, face.confirm) ? "confirm" : null);
      this.edge(pressed, `${pad.index}:b`, gamepadButtonPressed(pad, face.back) ? "back" : null);
    }
    this.previousPressed = pressed;
  }

  private edge(pressed: Set<string>, key: string, action: Direction | "confirm" | "back" | null): void {
    if (!action) return;
    pressed.add(key);
    if (this.previousPressed.has(key)) return;
    if (action === "confirm") this.confirm();
    else if (action === "back") this.back();
    else this.move(action);
  }

  private controls(): HTMLElement[] {
    const modeChoices = Array.from(
      this.root.querySelectorAll<HTMLElement>("#view-start.active [data-mode-choice]:not([disabled])")
    ).filter((element) => element.offsetParent !== null && !element.closest("[hidden]"));
    if (modeChoices.length) return modeChoices;
    const selectors = this.root.querySelector<HTMLElement>(".app-menu:not([hidden])")
      ? ".app-menu:not([hidden]) button:not([disabled])"
      : "dialog[open] button:not([disabled]), .view.active button:not([disabled]), .view.active select:not([disabled])";
    return Array.from(this.root.querySelectorAll<HTMLElement>(selectors)).filter(
      (element) => element.offsetParent !== null && !element.closest("[hidden]")
    );
  }

  private move(direction: Direction): void {
    const controls = this.controls();
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const next = movedControlIndex(controls.length, current, defaultControlIndex(controls), direction);
    this.focusControl(controls, next);
  }

  private confirm(): void {
    if (this.dismissOverlay()) return;
    const controls = this.controls();
    if (!controls.length) return;
    const defaultControl = controls[defaultControlIndex(controls)];
    const current = controls.includes(document.activeElement as HTMLElement)
      ? (document.activeElement as HTMLElement)
      : defaultControl ?? controls[0];
    this.focusControl(controls, controls.indexOf(current));
    if (current instanceof HTMLSelectElement) {
      const enabled = Array.from(current.options).filter((option) => !option.disabled);
      const index = Math.max(0, enabled.findIndex((option) => option.value === current.value));
      current.value = enabled[(index + 1) % enabled.length]?.value ?? current.value;
      current.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      current.click();
    }
  }

  private back(): void {
    if (this.dismissOverlay()) return;
    if (this.root.classList.contains("title-view")) {
      this.confirm();
      return;
    }
    this.onBack();
  }

  private focusControl(controls: HTMLElement[], index: number): void {
    this.root.querySelectorAll(".gamepad-selected").forEach((element) => element.classList.remove("gamepad-selected"));
    const control = controls[index];
    control?.classList.add("gamepad-selected");
    control?.focus();
  }
}
