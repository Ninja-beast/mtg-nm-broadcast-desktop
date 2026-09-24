export type Tournament = {
  id: number;
  name: string;
  format: string;
  current_round: number;
  total_rounds: number;
  phase: string;
} | null;

export type Player = { id: number; name: string; flag_code: string };

export type Match = {
  id: number;
  player1_id: number;
  player2_id: number;
  player1_life: number;
  player2_life: number;
  player1_game_wins: number;
  player2_game_wins: number;
  table_number: number | null;
  status: string;
  winner_player_id?: number | null;
  melee_player1_game_wins?: number | null;
  melee_match_id?: string;
  melee_player2_game_wins?: number | null;
  melee_result_synced_at?: string;
  conflict_ack_melee_p1?: number | null;
  conflict_ack_melee_p2?: number | null;
  conflict_ack_at?: string;
  conflict_ack_by?: string;
  created_at?: string;
  updated_at?: string;
  is_bo5: number;
  feature_match?: number;
  player1_card_showcase: string;
  player2_card_showcase: string;
  format: string;
  round_label?: string;
  player1_life_override?: number;
  player2_life_override?: number;
};
export type SystemStatus = {
  server: { online: boolean; uptimeSeconds: number; environment: "production" | "test"; version?: string };
  database: { online: boolean };
  obs: { connected: boolean; lastError: string; stream: { active: boolean; kbps: number; droppedFrames: number; totalFrames: number; durationMs: number }; recording: boolean };
  melee: { enabled: boolean; lastSyncOk: boolean | null; lastSyncAt: string | null; lastSyncMessage: string };
  scryfall: { available: boolean; latencyMs: number };
  internet: { online: boolean; latencyMs: number };
  clients: number;
  camera: string;
  showNameTags: boolean;
  cardShowcaseVisible: boolean;
  intermissionEndsAt: number | null;
};

export type SystemAlert = { level: "error" | "warn" | "info"; title: string; message: string };

export type BroadcastStatePayload = {
  scene: string;
  bo3: { id: number; status: string; tableNumber: number | null; format: string; round: string; player1: { name: string; gameWins: number }; player2: { name: string; gameWins: number } } | null;
  bo5: { id: number; status: string; tableNumber: number | null; format: string; round: string; player1: { name: string; gameWins: number }; player2: { name: string; gameWins: number } } | null;
  bo3Timer?: { seconds: number; status: string };
  bo5Timer?: { seconds: number; status: string };
};

export type SharedDashboardData = {
  status: SystemStatus | null;
  alerts: SystemAlert[] | null;
  broadcastState: BroadcastStatePayload | null;
  liveSyncMs: number | null;
  now: number;
  reload: () => void;
};

export type SidebarKey = "dashboard" | "tournament" | "match" | "broadcast" | "melee" | "stream" | "theme" | "access" | "remote" | "system" | "judge" | "configuration" | "companion" | "validation";
export type Role = "ADMINISTRATOR" | "EVENT" | "JUDGE" | "PRODUCER";

