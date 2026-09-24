import { useAsync } from "./useAsync";
import * as meleeService from "../services/melee";
import * as obsSettingsService from "../services/obsSettings";

export function useMeleeSettings() {
  return useAsync(meleeService.getMeleeSettings, []);
}

export function useMeleeLog() {
  return useAsync(meleeService.getMeleeLog, []);
}

export function useObsSettings() {
  return useAsync(obsSettingsService.getObsSettings, []);
}
