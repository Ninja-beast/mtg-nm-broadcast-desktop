import { useAsync } from "./useAsync";
import * as broadcastService from "../services/broadcast";

export function useBroadcastState() {
  return useAsync(broadcastService.getBroadcastState, []);
}

export function usePhases() {
  return useAsync(broadcastService.getPhases, []);
}

export function useObsStudioState() {
  return useAsync(broadcastService.getObsStudioState, []);
}
