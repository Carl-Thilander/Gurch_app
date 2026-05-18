import { FormEvent, useEffect, useMemo, useState } from "react";
import { Game, Player, Round } from "./types";

const STORAGE_KEY = "card-game-register:v1";
const MAX_PLAYERS = 8;
const MULTIPLIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type LegacyRound = Omit<Round, "loserIds" | "winnerIds" | "pointsPerMatch" | "totalPoints"> & {
  loserId?: string;
  winnerId?: string;
  loserIds?: string[];
  winnerIds?: string[];
  points?: number;
  pointsPerMatch?: number;
  totalPoints?: number;
};

type SettlementPayment = {
  fromId: string;
  toId: string;
  amount: number;
};

function createEmptyGame(): Game {
  return {
    id: crypto.randomUUID(),
    name: "",
    multiplier: 2,
    status: "setup",
    players: [],
    rounds: [],
  };
}

function loadGame(): Game {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return createEmptyGame();
  }

  try {
    const parsed = { ...createEmptyGame(), ...JSON.parse(stored) } as Omit<Game, "rounds"> & {
      rounds: LegacyRound[];
    };

    return {
      ...parsed,
      rounds: parsed.rounds.map((round) => {
        if (round.loserIds && round.winnerIds && round.pointsPerMatch && round.totalPoints) {
          return {
            ...round,
            loserIds: round.loserIds,
            winnerIds: round.winnerIds,
            pointsPerMatch: round.pointsPerMatch,
            totalPoints: round.totalPoints,
          };
        }

        const points = round.points ?? round.cardValue * round.multiplier;
        return {
          id: round.id,
          loserIds: round.loserId ? [round.loserId] : [],
          winnerIds: round.winnerId ? [round.winnerId] : [],
          cardValue: round.cardValue,
          multiplier: round.multiplier,
          pointsPerMatch: points,
          totalPoints: points,
          createdAt: round.createdAt,
        };
      }),
    };
  } catch {
    return createEmptyGame();
  }
}

function formatScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function getSetupHint(game: Game): string {
  if (game.status !== "setup") {
    return "Player list is locked.";
  }
  if (!game.name.trim()) {
    return "Name the game first.";
  }
  if (game.players.length < 2) {
    return "Add at least 2 players.";
  }
  if (game.players.length >= MAX_PLAYERS) {
    return "Maximum reached.";
  }
  return "Ready when you are.";
}

function getStatusLabel(status: Game["status"]): string {
  if (status === "active") {
    return "Active";
  }
  if (status === "finished") {
    return "Finished";
  }
  return "Setup";
}

function calculateSettlement(players: Player[]): SettlementPayment[] {
  const debtors = players
    .filter((player) => player.score < 0)
    .map((player) => ({ id: player.id, amount: Math.abs(player.score) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = players
    .filter((player) => player.score > 0)
    .map((player) => ({ id: player.id, amount: player.score }))
    .sort((a, b) => b.amount - a.amount);

  const payments: SettlementPayment[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      payments.push({
        fromId: debtor.id,
        toId: creditor.id,
        amount,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) {
      debtorIndex += 1;
    }

    if (creditor.amount === 0) {
      creditorIndex += 1;
    }
  }

  return payments;
}

export default function App() {
  const [game, setGame] = useState<Game>(loadGame);
  const [playerName, setPlayerName] = useState("");
  const [loserIds, setLoserIds] = useState<string[]>([]);
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [cardValue, setCardValue] = useState("");
  const [roundMultiplier, setRoundMultiplier] = useState(game.multiplier);
  const [playerError, setPlayerError] = useState("");
  const [roundError, setRoundError] = useState("");

  const isSetup = game.status === "setup";
  const isActive = game.status === "active";
  const isFinished = game.status === "finished";
  const canBegin = isSetup && game.name.trim().length > 0 && game.players.length >= 2;
  const canAddPlayers = isSetup && game.players.length < MAX_PLAYERS;

  const sortedPlayers = useMemo(
    () => [...game.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    [game.players],
  );
  const settlementPayments = useMemo(() => calculateSettlement(game.players), [game.players]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game]);

  useEffect(() => {
    const playerIds = new Set(game.players.map((player) => player.id));
    const nextLoserIds = loserIds.filter((playerId) => playerIds.has(playerId));
    const nextWinnerIds = winnerIds.filter((playerId) => playerIds.has(playerId));

    if (nextLoserIds.length !== loserIds.length) {
      setLoserIds(nextLoserIds);
    }

    if (nextWinnerIds.length !== winnerIds.length) {
      setWinnerIds(nextWinnerIds);
    }
  }, [game.players, loserIds, winnerIds]);

  function updateGameDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = playerName.trim();
    if (!trimmedName || !canAddPlayers) {
      return;
    }

    const duplicate = game.players.some((player) => player.name.toLowerCase() === trimmedName.toLowerCase());
    if (duplicate) {
      setPlayerError("Player names must be unique.");
      return;
    }

    const player: Player = {
      id: crypto.randomUUID(),
      name: trimmedName,
      score: 0,
    };

    setGame((current) => ({
      ...current,
      players: [...current.players, player],
    }));
    setPlayerName("");
    setPlayerError("");
  }

  function removePlayer(playerId: string) {
    if (!isSetup) {
      return;
    }

    setGame((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== playerId),
    }));
  }

  function beginGame() {
    if (!canBegin) {
      return;
    }

    setGame((current) => ({
      ...current,
      status: "active",
    }));
    setRoundMultiplier(game.multiplier);
    setLoserIds([game.players[0]?.id ?? ""]);
    setWinnerIds([game.players[1]?.id ?? ""]);
  }

  function toggleRoundPlayer(playerId: string, side: "loser" | "winner") {
    setRoundError("");

    if (side === "loser") {
      setLoserIds((current) =>
        current.includes(playerId) ? current.filter((selectedId) => selectedId !== playerId) : [...current, playerId],
      );
      return;
    }

    setWinnerIds((current) =>
      current.includes(playerId) ? current.filter((selectedId) => selectedId !== playerId) : [...current, playerId],
    );
  }

  function addRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isActive) {
      return;
    }

    const numericCardValue = Number(cardValue);
    const pointsPerMatch = numericCardValue * roundMultiplier;
    const loserSet = new Set(loserIds);
    const winnerSet = new Set(winnerIds);
    const hasOverlap = loserIds.some((playerId) => winnerSet.has(playerId));

    if (loserIds.length === 0 || winnerIds.length === 0) {
      setRoundError("Select at least one loser and one winner.");
      return;
    }

    if (hasOverlap) {
      setRoundError("A player cannot be both a winner and a loser in the same round.");
      return;
    }

    if (!Number.isFinite(pointsPerMatch) || pointsPerMatch <= 0) {
      setRoundError("Enter a valid card value.");
      return;
    }

    setGame((current) => {
      const playerIds = new Set(current.players.map((player) => player.id));
      const validLoserIds = loserIds.filter((playerId) => playerIds.has(playerId));
      const validWinnerIds = winnerIds.filter((playerId) => playerIds.has(playerId));

      if (validLoserIds.length === 0 || validWinnerIds.length === 0) {
        return current;
      }

      const loserPayment = pointsPerMatch * validWinnerIds.length;
      const winnerGain = pointsPerMatch * validLoserIds.length;
      const totalPoints = pointsPerMatch * validLoserIds.length * validWinnerIds.length;

      const round: Round = {
        id: crypto.randomUUID(),
        loserIds: validLoserIds,
        winnerIds: validWinnerIds,
        cardValue: numericCardValue,
        multiplier: roundMultiplier,
        pointsPerMatch,
        totalPoints,
        createdAt: new Date().toISOString(),
      };

      return {
        ...current,
        players: current.players.map((player) => {
          if (loserSet.has(player.id)) {
            return { ...player, score: player.score - loserPayment };
          }
          if (winnerSet.has(player.id)) {
            return { ...player, score: player.score + winnerGain };
          }
          return player;
        }),
        rounds: [...current.rounds, round],
      };
    });

    setCardValue("");
    setLoserIds([]);
    setWinnerIds([]);
    setRoundError("");
  }

  function undoLastRound() {
    if (!isActive) {
      return;
    }

    setGame((current) => {
      const round = current.rounds.at(-1);
      if (!round) {
        return current;
      }

      const loserSet = new Set(round.loserIds);
      const winnerSet = new Set(round.winnerIds);
      const loserPayment = round.pointsPerMatch * round.winnerIds.length;
      const winnerGain = round.pointsPerMatch * round.loserIds.length;

      return {
        ...current,
        players: current.players.map((player) => {
          if (loserSet.has(player.id)) {
            return { ...player, score: player.score + loserPayment };
          }
          if (winnerSet.has(player.id)) {
            return { ...player, score: player.score - winnerGain };
          }
          return player;
        }),
        rounds: current.rounds.slice(0, -1),
      };
    });
  }

  function newGame() {
    const hasProgress = game.name || game.players.length > 0 || game.rounds.length > 0;

    if (hasProgress && !window.confirm("Start a new game and clear the current one?")) {
      return;
    }

    const freshGame = createEmptyGame();
    setGame(freshGame);
    setPlayerName("");
    setCardValue("");
    setRoundMultiplier(freshGame.multiplier);
    setLoserIds([]);
    setWinnerIds([]);
    setPlayerError("");
    setRoundError("");
  }

  function endGame() {
    if (!isActive || game.rounds.length === 0) {
      return;
    }

    setGame((current) => ({
      ...current,
      status: "finished",
    }));
    setRoundError("");
  }

  function resumeGame() {
    if (!isFinished) {
      return;
    }

    setGame((current) => ({
      ...current,
      status: "active",
    }));
  }

  function playerById(playerId: string) {
    return game.players.find((player) => player.id === playerId);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Card Game Register</p>
          <h1>Game setup and scorekeeping</h1>
        </div>
        <button className="ghost-button" type="button" onClick={newGame}>
          New game
        </button>
      </section>

      <section className="layout">
        <aside className="panel setup-panel" aria-labelledby="setupTitle">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Setup</p>
              <h2 id="setupTitle">Create game</h2>
            </div>
            <span className="status-pill">{getStatusLabel(game.status)}</span>
          </div>

          <form className="stack" onSubmit={updateGameDetails}>
            <label>
              Game name
              <input
                value={game.name}
                onChange={(event) => setGame((current) => ({ ...current, name: event.target.value }))}
                disabled={!isSetup}
                maxLength={48}
                required
                placeholder="Friday table"
              />
            </label>

            <label>
              Multiplier
              <select
                value={game.multiplier}
                onChange={(event) => {
                  const multiplier = Number(event.target.value);
                  setGame((current) => ({ ...current, multiplier }));
                  setRoundMultiplier(multiplier);
                }}
                disabled={!isSetup}
              >
                {MULTIPLIERS.map((multiplier) => (
                  <option key={multiplier} value={multiplier}>
                    x{multiplier}
                  </option>
                ))}
              </select>
            </label>

            <button className="primary-button" type="submit" disabled={!isSetup}>
              Save game
            </button>
          </form>

          <hr />

          <form className="inline-form" onSubmit={addPlayer}>
            <label>
              Player name
              <input
                value={playerName}
                onChange={(event) => {
                  setPlayerName(event.target.value);
                  setPlayerError("");
                }}
                disabled={!canAddPlayers}
                maxLength={32}
                placeholder="Jane"
              />
            </label>
            <button className="secondary-button" type="submit" disabled={!canAddPlayers}>
              Add
            </button>
          </form>

          {playerError ? <p className="form-error">{playerError}</p> : null}

          <div className="player-meta">
            <span>
              {game.players.length} / {MAX_PLAYERS} players
            </span>
            <span>{getSetupHint(game)}</span>
          </div>

          <ul className="player-list" aria-label="Players">
            {game.players.length === 0 ? (
              <li className="empty-state">No players added yet.</li>
            ) : (
              game.players.map((player) => (
                <li className="player-row" key={player.id}>
                  <span>{player.name}</span>
                  <button
                    className="remove-button"
                    type="button"
                    aria-label={`Remove ${player.name}`}
                    disabled={!isSetup}
                    onClick={() => removePlayer(player.id)}
                  >
                    X
                  </button>
                </li>
              ))
            )}
          </ul>

          <button className="primary-button full-width" type="button" disabled={!canBegin} onClick={beginGame}>
            Begin game
          </button>
        </aside>

        <section className="panel score-panel" aria-labelledby="scoreTitle">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{game.name.trim() ? game.name : "No game yet"}</p>
              <h2 id="scoreTitle">Scoreboard</h2>
            </div>
            <span className="multiplier-badge">x{game.multiplier}</span>
          </div>

          <div className="scoreboard" aria-live="polite">
            {sortedPlayers.length === 0 ? (
              <div className="empty-state">Create a game and add players to see the scoreboard.</div>
            ) : (
              sortedPlayers.map((player) => (
                <article className="score-row" key={player.id}>
                  <div className="score-name">{player.name}</div>
                  <div className={`score-value ${player.score > 0 ? "positive" : ""} ${player.score < 0 ? "negative" : ""}`}>
                    {formatScore(player.score)}
                  </div>
                </article>
              ))
            )}
          </div>

          {isActive ? (
            <form className="round-form" onSubmit={addRound}>
              <div className="form-grid">
                <fieldset className="player-picker">
                  <legend>Losing players</legend>
                  {game.players.map((player) => (
                    <label className="check-row" key={player.id}>
                      <input
                        type="checkbox"
                        checked={loserIds.includes(player.id)}
                        onChange={() => toggleRoundPlayer(player.id, "loser")}
                      />
                      <span>{player.name}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="player-picker">
                  <legend>Winning players</legend>
                  {game.players.map((player) => (
                    <label className="check-row" key={player.id}>
                      <input
                        type="checkbox"
                        checked={winnerIds.includes(player.id)}
                        onChange={() => toggleRoundPlayer(player.id, "winner")}
                      />
                      <span>{player.name}</span>
                    </label>
                  ))}
                </fieldset>
                <label>
                  Losing card value
                  <input
                    value={cardValue}
                    onChange={(event) => {
                      setCardValue(event.target.value);
                      setRoundError("");
                    }}
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    required
                    placeholder="9"
                  />
                </label>
                <label>
                  Round multiplier
                  <select value={roundMultiplier} onChange={(event) => setRoundMultiplier(Number(event.target.value))}>
                    {MULTIPLIERS.map((multiplier) => (
                      <option key={multiplier} value={multiplier}>
                        x{multiplier}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {roundError ? <p className="form-error">{roundError}</p> : null}
              <button className="primary-button" type="submit">
                Add round
              </button>
            </form>
          ) : null}

          {isActive ? (
            <div className="game-actions">
              <button className="primary-button" type="button" disabled={game.rounds.length === 0} onClick={endGame}>
                End game
              </button>
            </div>
          ) : null}

          {isFinished ? (
            <section className="settlement-panel" aria-labelledby="settlementTitle">
              <div className="panel-header compact-header">
                <div>
                  <p className="eyebrow">Final settlement</p>
                  <h2 id="settlementTitle">Who owes who</h2>
                </div>
                <button className="ghost-button" type="button" onClick={resumeGame}>
                  Resume
                </button>
              </div>

              {settlementPayments.length === 0 ? (
                <div className="empty-state">No payments needed. The game is balanced.</div>
              ) : (
                <ul className="settlement-list">
                  {settlementPayments.map((payment) => {
                    const from = playerById(payment.fromId)?.name ?? "Unknown";
                    const to = playerById(payment.toId)?.name ?? "Unknown";

                    return (
                      <li className="settlement-row" key={`${payment.fromId}-${payment.toId}`}>
                        <span>
                          {from} owes {to}
                        </span>
                        <strong>{payment.amount}</strong>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </section>

        <section className="panel history-panel" aria-labelledby="historyTitle">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Rounds</p>
              <h2 id="historyTitle">History</h2>
            </div>
            <button className="ghost-button" type="button" disabled={!isActive || game.rounds.length === 0} onClick={undoLastRound}>
              Undo last
            </button>
          </div>

          <ol className="round-list">
            {game.rounds.length === 0 ? (
              <li className="empty-state">Round results will appear here.</li>
            ) : (
              [...game.rounds].reverse().map((round, index) => {
                const losers = round.loserIds.map((playerId) => playerById(playerId)?.name ?? "Unknown");
                const winners = round.winnerIds.map((playerId) => playerById(playerId)?.name ?? "Unknown");

                return (
                  <li className="round-row" key={round.id}>
                    <div>
                      <div className="round-title">
                        {winners.join(", ")} won from {losers.join(", ")}
                      </div>
                      <div className="round-detail">
                        Round {game.rounds.length - index}: {round.cardValue} x {round.multiplier} per matchup
                      </div>
                    </div>
                    <div className="round-points">+{round.totalPoints}</div>
                  </li>
                );
              })
            )}
          </ol>
        </section>
      </section>
    </main>
  );
}
