declare module 'pokersolver' {
  export class Hand {
    rank: number;
    name: string;
    descr: string;
    static solve(cards: string[], game?: string, canDisqualify?: boolean): Hand;
    static winners(hands: Hand[]): Hand[];
  }
}
