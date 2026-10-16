export interface CaptureFrameSize {
  width: number;
  height: number;
}

export function captureFrameSize(sourceWidth: number, sourceHeight: number, desktop: boolean): CaptureFrameSize {
  if (!desktop) return { width: 675, height: 1200 };
  const scale = Math.min(1, 1600 / sourceWidth, 900 / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}
