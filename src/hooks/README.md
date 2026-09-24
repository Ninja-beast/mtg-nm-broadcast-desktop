# src/hooks/

Trinn 2 av komponent-/prosjektstruktur-refaktoreringen (se `refactor/services-layer`-branchen). Ferdig, men **ikke tatt i bruk noe sted ennå** - ingen side under `src/pages/` er migrert bort fra sine egne `useJson(...)`-kall til disse. Det er neste, egne steg.

Alle hooks her bruker samme `[data, reload]`-mønster som `useJson` (`src/lib/apiClient.ts`) allerede har hatt overalt i appen, bygget oppå den ferdige tjeneste-funksjonen i `src/services/` for samme domene - så en migrering blir en ren erstatning av importen og kallet i hver side, ikke en omskriving av hvordan siden bruker dataen.

- `useAsync.ts` - den generiske kjernen alle andre hooks her er bygget på
- `useAuth.ts` - `useUsers`, `useAccessTokens`, `useCurrentSession`, `useBootstrapStatus`
- `useTournament.ts` - `useTournament`, `useStandings`, `useRoundOptions`, `usePlayers`
- `useMatches.ts` - `useMatches`
- `useBroadcast.ts` - `useBroadcastState`, `usePhases`, `useObsStudioState`
- `useMelee.ts` - `useMeleeSettings`, `useMeleeLog`, `useObsSettings`
- `useJudge.ts` - `useJudgeEntries`
- `useBackup.ts` - `useBackupStatus`
- `useLogs.ts` - `useLogSettings`, `useLogs`
- `useSystem.ts` - `useSystemStatus`, `useSystemAlerts`, `useAdvancedInfo`
- `useTheme.ts` - `useThemesList`, `useActiveTheme`
- `useContent.ts` - `useMetaScene`, `useCasterdeskScene`, `useStreamWidgetScene`, `useMetaKeycards`, `useStreamContentSettings`
