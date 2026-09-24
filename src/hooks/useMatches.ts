import { useAsync } from "./useAsync";
import * as matchesService from "../services/matches";

export function useMatches(tournamentId?: number) {
  return useAsync(() => matchesService.listMatches(tournamentId), [tournamentId]);
}
