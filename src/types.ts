export type GameStatus = "setup" | "active" | "finished";

export type Player = {
  id: string;
  name: string;
  score: number;
};

export type Round = {
  id: string;
  loserIds: string[];
  winnerIds: string[];
  cardValue: number;
  multiplier: number;
  pointsPerMatch: number;
  totalPoints: number;
  createdAt: string;
};

export type Game = {
  id: string;
  name: string;
  multiplier: number;
  status: GameStatus;
  players: Player[];
  rounds: Round[];
};
