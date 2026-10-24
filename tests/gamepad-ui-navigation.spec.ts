import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultControlIndex,
  gamepadHatDirection,
  gamepadMenuDirection,
  GamepadUiNavigator,
  isGenericConfirmButton,
  movedControlIndex
} from "../apps/game/src/ui/GamepadUiNavigator";

afterEach(() => vi.unstubAllGlobals());

describe("gamepad UI default focus", () => {
  it("prefers the control that continues the game", () => {
    const controls = [false, true, false].map((preferred) => ({
      hasAttribute: (name: string) => name === "data-gamepad-default" && preferred,
      classList: { contains: () => false }
    }));
    expect(defaultControlIndex(controls)).toBe(1);
  });

  it("falls back to the first control when no preferred control exists", () => {
    expect(defaultControlIndex([{ hasAttribute: () => false, classList: { contains: () => false } }])).toBe(0);
  });

  it("keeps the current game selected inside the menu", () => {
    const controls = [false, true].map((active) => ({
      hasAttribute: () => false,
      classList: { contains: (name: string) => name === "active" && active }
    }));
    expect(defaultControlIndex(controls)).toBe(1);
  });
});

describe("gamepad choice navigation", () => {
  it("moves right from the preferred 1P choice to the 2P choice on the first press", () => {
    expect(movedControlIndex(2, -1, 0, "next")).toBe(1);
  });

  it("moves left from the preferred choice and wraps around", () => {
    expect(movedControlIndex(2, -1, 0, "previous")).toBe(1);
  });
});

describe("generic gamepad menu direction", () => {
  const buttons = (pressed: number[] = []) =>
    Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index), touched: false, value: 0 }));

  it("supports standard d-pad buttons and shoulder buttons", () => {
    expect(gamepadMenuDirection({ axes: [], buttons: buttons([14]) })).toBe("previous");
    expect(gamepadMenuDirection({ axes: [], buttons: buttons([15]) })).toBe("next");
    expect(gamepadMenuDirection({ axes: [], buttons: buttons([4]) })).toBe("previous");
    expect(gamepadMenuDirection({ axes: [], buttons: buttons([5]) })).toBe("next");
  });

  it("uses any active controller axis for non-standard retro pads", () => {
    expect(gamepadMenuDirection({ axes: [0, 0, -1], buttons: buttons() })).toBe("previous");
    expect(gamepadMenuDirection({ axes: [0, 0, 0.72], buttons: buttons() })).toBe("next");
  });

  it("measures direction from the controller's real neutral axis values", () => {
    const pad = { axes: [-1, 3.285], buttons: buttons() };
    expect(gamepadMenuDirection(pad, [-1, 3.285])).toBeNull();
    expect(gamepadMenuDirection({ ...pad, axes: [1, 3.285] }, [-1, 3.285])).toBe("next");
    expect(gamepadMenuDirection({ ...pad, axes: [-1, -1] }, [-1, 3.285])).toBe("previous");
  });

  it("decodes the 8-way POV axis used by Buffalo retro controllers", () => {
    const neutral = [-1, 3.285714];
    const pad = (hat: number) => ({ axes: [-1, hat], buttons: buttons() });
    expect(gamepadMenuDirection(pad(3.285714), neutral)).toBeNull();
    expect(gamepadMenuDirection(pad(-1), neutral)).toBe("previous");
    expect(gamepadMenuDirection(pad(-0.428571), neutral)).toBe("next");
    expect(gamepadMenuDirection(pad(0.142857), neutral)).toBe("next");
    expect(gamepadMenuDirection(pad(0.714286), neutral)).toBe("previous");
  });

  it("maps Buffalo POV diagonals consistently for menu navigation", () => {
    expect(gamepadHatDirection(-0.714286)).toBe("next");
    expect(gamepadHatDirection(-0.142857)).toBe("next");
    expect(gamepadHatDirection(0.428571)).toBe("previous");
    expect(gamepadHatDirection(1)).toBe("previous");
  });

  it("treats an updated Buffalo neutral value as no movement", () => {
    expect(gamepadMenuDirection({ axes: [3.285714], buttons: buttons() }, [3.285714])).toBeNull();
  });
});

describe("generic gamepad confirmation", () => {
  it("accepts unknown face-button positions on every UI screen", () => {
    expect(isGenericConfirmButton(0)).toBe(true);
    expect(isGenericConfirmButton(1)).toBe(true);
    expect(isGenericConfirmButton(2)).toBe(true);
    expect(isGenericConfirmButton(3)).toBe(true);
    expect(isGenericConfirmButton(6)).toBe(true);
  });

  it("does not turn the dedicated back or navigation buttons into confirmation", () => {
    expect(isGenericConfirmButton(4)).toBe(false);
    expect(isGenericConfirmButton(5)).toBe(false);
    expect(isGenericConfirmButton(8)).toBe(false);
    expect(isGenericConfirmButton(12)).toBe(false);
    expect(isGenericConfirmButton(15)).toBe(false);
  });

  it("does not carry a held Buffalo A button into the next screen", () => {
    const pressed = { value: false };
    const pad = {
      axes: [-1, 3.285714],
      buttons: Array.from({ length: 16 }, (_, index) => ({
        get pressed() { return index === 0 && pressed.value; },
        touched: false,
        value: 0
      })),
      index: 0,
      mapping: ""
    } as unknown as Gamepad;
    const first = fakeControl();
    const second = fakeControl();
    let controls = [first];
    first.click = vi.fn(() => { controls = [second]; });
    second.click = vi.fn();
    const root = fakeRoot(() => controls);
    vi.stubGlobal("navigator", { getGamepads: () => [pad] });
    vi.stubGlobal("document", { activeElement: null });
    vi.stubGlobal("HTMLSelectElement", class {});
    const navigator = new GamepadUiNavigator(root as unknown as HTMLElement, () => false, vi.fn());
    const poll = () => (navigator as unknown as { poll: () => void }).poll();

    poll();
    poll();
    poll();
    pressed.value = true;
    poll();
    poll();
    expect(first.click).toHaveBeenCalledTimes(1);
    expect(second.click).not.toHaveBeenCalled();
    pressed.value = false;
    poll();
    pressed.value = true;
    poll();
    expect(second.click).toHaveBeenCalledTimes(1);
  });

  it("dismisses an explanation overlay with a Buffalo direction input", () => {
    let hat = 3.285714;
    const pad = {
      get axes() { return [-1, hat]; },
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      index: 0,
      mapping: ""
    } as unknown as Gamepad;
    const control = fakeControl();
    const dismiss = vi.fn(() => true);
    vi.stubGlobal("navigator", { getGamepads: () => [pad] });
    vi.stubGlobal("document", { activeElement: null });
    vi.stubGlobal("HTMLSelectElement", class {});
    const navigator = new GamepadUiNavigator(fakeRoot(() => [control]) as unknown as HTMLElement, () => false, vi.fn(), dismiss);
    const poll = () => (navigator as unknown as { poll: () => void }).poll();

    poll();
    poll();
    poll();
    hat = -0.428571;
    poll();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(control.click).not.toHaveBeenCalled();
  });

  it("advances the title with a Buffalo direction input", () => {
    let hat = 3.285714;
    const pad = {
      get axes() { return [-1, hat]; },
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      index: 0,
      mapping: ""
    } as unknown as Gamepad;
    const control = fakeControl();
    vi.stubGlobal("navigator", { getGamepads: () => [pad] });
    vi.stubGlobal("document", { activeElement: null });
    vi.stubGlobal("HTMLSelectElement", class {});
    const navigator = new GamepadUiNavigator(fakeRoot(() => [control], true) as unknown as HTMLElement, () => false, vi.fn());
    const poll = () => (navigator as unknown as { poll: () => void }).poll();

    poll();
    poll();
    hat = -0.428571;
    poll();
    expect(control.click).toHaveBeenCalledTimes(1);
  });

  it("does not lock the UI when a cheap controller reports an unrelated button as always active", () => {
    const confirm = { value: false };
    const pad = {
      axes: [-1, 3.285714],
      buttons: Array.from({ length: 16 }, (_, index) => ({
        get pressed() { return index === 7 || (index === 0 && confirm.value); },
        touched: false,
        get value() { return this.pressed ? 1 : 0; }
      })),
      index: 0,
      mapping: ""
    } as unknown as Gamepad;
    const control = fakeControl();
    vi.stubGlobal("navigator", { getGamepads: () => [pad] });
    vi.stubGlobal("document", { activeElement: null });
    vi.stubGlobal("HTMLSelectElement", class {});
    const navigator = new GamepadUiNavigator(fakeRoot(() => [control]) as unknown as HTMLElement, () => false, vi.fn());
    const poll = () => (navigator as unknown as { poll: () => void }).poll();

    poll();
    poll();
    confirm.value = true;
    poll();
    expect(control.click).toHaveBeenCalledTimes(1);
  });
});

function fakeControl() {
  const classes = new Set<string>();
  return {
    offsetParent: {},
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name)
    },
    hasAttribute: (name: string) => name === "data-gamepad-default",
    closest: () => null,
    focus: vi.fn(),
    click: vi.fn()
  };
}

function fakeRoot(controls: () => ReturnType<typeof fakeControl>[], titleView = false) {
  return {
    classList: { contains: (name: string) => name === "title-view" && titleView },
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector === ".gamepad-selected" ? controls() : controls()
  };
}
