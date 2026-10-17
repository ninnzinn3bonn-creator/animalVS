type Direction = "previous" | "next";

const navigationButtonIndexes = new Set([4, 5, 12, 13, 14, 15]);

export function isGenericConfirmButton(buttonIndex: number): boolean {
  return buttonIndex >= 0 && buttonIndex <= 11 && buttonIndex !== 8 && !navigationButtonIndexes.has(buttonIndex);
}

export function gamepadHatDirection(value: number): Direction | null {
  if (value < -1.05 || value > 1.05) return null;
  const sector = Math.max(0, Math.min(7, Math.round((value + 1) * 3.5)));
  return sector === 0 || sector >= 5 ? "previous" : "next";
}

export function gamepadMenuDirection(
  gamepad: Pick<Gamepad, "axes" | "buttons">,
  neutralAxes: readonly number[] = gamepad.axes.map(() => 0)
): Direction | null {
  const down = (index: number) => Boolean(gamepad.buttons[index]?.pressed || (gamepad.buttons[index]?.value ?? 0) >= 0.5);
  if (down(14) || down(12) || down(4)) return "previous";
  if (down(15) || down(13) || down(5)) return "next";
  for (let index = 0; index < gamepad.axes.length; index += 1) {
    const value = gamepad.axes[index];
    const neutral = neutralAxes[index] ?? 0;
    // Buffalo and similar retro USB pads expose the D-pad as an 8-way POV axis.
    // Chromium reports its neutral position around 3.2857 and directions from -1 to 1.
    if (neutral > 1.5) {
      const direction = gamepadHatDirection(value);
      if (direction) return direction;
      continue;
    }
    const delta = value - neutral;
    if (Math.abs(delta) >= 0.35) return delta < 0 ? "previous" : "next";
  }
  return null;
}

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
  private previousInputs = new Set<string>();
  private readonly releaseGate = new GamepadReleaseGate();
  private readonly neutralAxes = new Map<number, number[]>();
  private visibleControls: HTMLElement[] = [];

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
    const inputs = new Set<string>();
    const directions = new Map<number, Direction>();
    for (const pad of gamepads) {
      if (!pad) continue;
      if (!this.neutralAxes.has(pad.index)) this.neutralAxes.set(pad.index, Array.from(pad.axes));
      const neutral = this.neutralAxes.get(pad.index)!;
      pad.axes.forEach((value, index) => {
        if (value > 1.5) neutral[index] = value;
      });
      pad.buttons.forEach((button, index) => {
        if (button.pressed || button.value >= 0.5) inputs.add(`${pad.index}:button:${index}`);
      });
      const direction = gamepadMenuDirection(pad, neutral);
      if (direction) {
        directions.set(pad.index, direction);
        inputs.add(`${pad.index}:direction:${direction}`);
      }
    }
    if (this.releaseGate.consume(inputs.size > 0)) {
      this.previousInputs = inputs;
      return;
    }
    const newlyPressed = [...inputs].filter((key) => !this.previousInputs.has(key));
    if (newlyPressed.length > 0 && this.dismissOverlay()) {
      this.releaseGate.arm();
      this.previousInputs = inputs;
      return;
    }
    if (this.isGameplayActive()) {
      this.previousInputs = inputs;
      this.visibleControls = [];
      return;
    }
    const controls = this.controls();
    if (this.controlsChanged(controls)) {
      this.visibleControls = controls;
      this.focusControl(controls, defaultControlIndex(controls));
      this.releaseGate.arm();
      this.previousInputs = inputs;
      return;
    }
    for (const pad of gamepads) {
      if (!pad) continue;
      const direction = directions.get(pad.index);
      if (direction && newlyPressed.includes(`${pad.index}:direction:${direction}`)) {
        this.move(direction);
        this.previousInputs = inputs;
        return;
      }
      const genericConfirm = newlyPressed.some((key) => {
        if (!key.startsWith(`${pad.index}:button:`)) return false;
        const index = Number(key.slice(key.lastIndexOf(":") + 1));
        return isGenericConfirmButton(index);
      });
      if (genericConfirm) {
        this.confirm();
        this.releaseGate.arm();
        this.previousInputs = inputs;
        return;
      }
      if (newlyPressed.includes(`${pad.index}:button:8`)) {
        this.back();
        this.releaseGate.arm();
        this.previousInputs = inputs;
        return;
      }
    }
    this.previousInputs = inputs;
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

  private controlsChanged(controls: HTMLElement[]): boolean {
    return controls.length !== this.visibleControls.length || controls.some((control, index) => control !== this.visibleControls[index]);
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
    const nextControls = this.controls();
    if (this.controlsChanged(nextControls)) {
      this.visibleControls = nextControls;
      this.focusControl(nextControls, defaultControlIndex(nextControls));
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
