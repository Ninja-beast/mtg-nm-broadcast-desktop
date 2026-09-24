import { useAsync } from "./useAsync";
import * as judgeService from "../services/judge";

export function useJudgeEntries(params: { tournamentId?: number; matchId?: number }) {
  return useAsync(() => judgeService.getJudgeEntries(params), [params.tournamentId, params.matchId]);
}
