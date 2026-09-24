import { useAsync } from "./useAsync";
import * as themeService from "../services/theme";

export function useThemesList() {
  return useAsync(themeService.getThemesList, []);
}

export function useActiveTheme() {
  return useAsync(themeService.getActiveTheme, []);
}
