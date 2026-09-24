import { useAsync } from "./useAsync";
import * as logsService from "../services/logs";

export function useLogSettings() {
  return useAsync(logsService.getLogSettings, []);
}

export function useLogs(level: string, limit = 200) {
  return useAsync(() => logsService.getLogs(level, limit), [level, limit]);
}
