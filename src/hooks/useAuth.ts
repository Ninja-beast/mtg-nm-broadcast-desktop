import { useAsync } from "./useAsync";
import * as authService from "../services/auth";

export function useUsers() {
  return useAsync(authService.listUsers, []);
}

export function useAccessTokens() {
  return useAsync(authService.listAccessTokens, []);
}

export function useCurrentSession() {
  return useAsync(authService.getCurrentSession, []);
}

export function useBootstrapStatus() {
  return useAsync(authService.getBootstrapStatus, []);
}
