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

export interface GamepadDirections {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export function gamepadDirections(axes: readonly number[], neutralAxes: readonly number[]): GamepadDirections {
  const directions: GamepadDirections = { left: false, right: false, up: false, down: false };
  for (let index = 0; index < axes.length; index += 1) {
    const value = axes[index];
    const neutral = neutralAxes[index] ?? 0;
    if (neutral > 1.5 && value >= -1.05 && value <= 1.05) {
      const sector = Math.max(0, Math.min(7, Math.round((value + 1) * 3.5)));
      directions.up ||= sector === 0 || sector === 1 || sector === 7;
      directions.right ||= sector >= 1 && sector <= 3;
      directions.down ||= sector >= 3 && sector <= 5;
      directions.left ||= sector >= 5 && sector <= 7;
      continue;
    }
    const delta = value - neutral;
    if (index % 2 === 0) {
      directions.left ||= delta < -0.5;
      directions.right ||= delta > 0.5;
    } else {
      directions.up ||= delta < -0.5;
      directions.down ||= delta > 0.5;
    }
  }
  return directions;
}
