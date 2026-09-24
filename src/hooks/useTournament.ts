import { useAsync } from "./useAsync";
import * as tournamentService from "../services/tournament";
import * as playersService from "../services/players";

export function useTournament() {
  return useAsync(tournamentService.getTournament, []);
}

export function useStandings(tournamentId?: number) {
  return useAsync(() => tournamentService.getStandings(tournamentId), [tournamentId]);
}

export function useRoundOptions() {
  return useAsync(tournamentService.getRoundOptions, []);
}

export function usePlayers(tournamentId?: number) {
  return useAsync(() => playersService.listPlayers(tournamentId), [tournamentId]);
}
