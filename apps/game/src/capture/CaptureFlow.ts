export type CaptureMode = "standalone" | "solo" | "versus";
export type CapturePlayer = 1 | 2;
export type CaptureDestination = "standalone-complete" | "solo-game" | "versus-player-2" | "versus-settings";

export interface CaptureFlowState {
  mode: CaptureMode;
  player: CapturePlayer;
}

export function captureDestination({ mode, player }: CaptureFlowState): CaptureDestination {
  if (mode === "solo") return "solo-game";
  if (mode === "versus") return player === 1 ? "versus-player-2" : "versus-settings";
  return "standalone-complete";
}
