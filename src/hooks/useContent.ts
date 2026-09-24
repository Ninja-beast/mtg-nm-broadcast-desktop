import { useAsync } from "./useAsync";
import * as contentService from "../services/content";

export function useMetaScene() {
  return useAsync(contentService.getMetaScene, []);
}

export function useCasterdeskScene() {
  return useAsync(contentService.getCasterdeskScene, []);
}

export function useStreamWidgetScene() {
  return useAsync(contentService.getStreamWidgetScene, []);
}

export function useMetaKeycards() {
  return useAsync(contentService.getMetaKeycards, []);
}

export function useStreamContentSettings() {
  return useAsync(contentService.getStreamContentSettings, []);
}
