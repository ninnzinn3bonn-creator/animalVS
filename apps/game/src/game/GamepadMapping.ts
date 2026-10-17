type MappableGamepad = Pick<Gamepad, "buttons"> & Partial<Pick<Gamepad, "mapping">>;

export interface GamepadFaceMapping {
  confirm: number;
  back: number;
}

export function gamepadFaceMapping(gamepad: MappableGamepad): GamepadFaceMapping {
  return gamepad.mapping === "standard" ? { confirm: 0, back: 1 } : { confirm: 1, back: 0 };
}

export function gamepadButtonPressed(gamepad: MappableGamepad, index: number): boolean {
  return Boolean(gamepad.buttons[index]?.pressed);
}
