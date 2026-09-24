import { useAsync } from "./useAsync";
import * as backupService from "../services/backup";

export function useBackupStatus() {
  return useAsync(backupService.getBackupStatus, []);
}
