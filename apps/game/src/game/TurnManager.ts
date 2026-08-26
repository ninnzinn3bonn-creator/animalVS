export type PlayerId = 1 | 2;

export class TurnManager {
  private currentPlayer: PlayerId = 1;
  private turnCount = 0;

  get player(): PlayerId {
    return this.currentPlayer;
  }

  get count(): number {
    return this.turnCount;
  }

  next(): PlayerId {
    this.turnCount += 1;
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    return this.currentPlayer;
  }

  reset(): void {
    this.currentPlayer = 1;
    this.turnCount = 0;
  }
}
