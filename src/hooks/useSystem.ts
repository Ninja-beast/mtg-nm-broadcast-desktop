import { useAsync } from "./useAsync";
import * as systemService from "../services/system";

export function useSystemStatus() {
  return useAsync(systemService.getSystemStatus, []);
}

export function useSystemAlerts() {
  return useAsync(systemService.getSystemAlerts, []);
}

export function useAdvancedInfo() {
  return useAsync(systemService.getAdvancedInfo, []);
}
