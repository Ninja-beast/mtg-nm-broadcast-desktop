import React, { useState, useEffect } from "react";
import {
  API_BASE,
  CURRENT_REMOTE_ADDRESS,
  CURRENT_AUTH_TOKEN,
  resolveApiBase,
  resolveAdminWsUrl,
  setApiBase,
  setRemoteAddress,
  setAccessToken,
  setAuthToken
} from "./lib/apiClient";
import type { SidebarKey, Role, SystemStatus, SystemAlert, BroadcastStatePayload, SharedDashboardData } from "./types";
import { Sidebar, ROLE_ACCESS } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { LoginScreen } from "./components/LoginScreen";
import { DashboardTab } from "./pages/DashboardTab";
import { SystemStatusTab } from "./pages/SystemStatusTab";
import { JudgeWorkspaceTab } from "./pages/JudgeWorkspaceTab";
import { TournamentTab } from "./pages/TournamentTab";
import { TournamentValidationTab } from "./pages/TournamentValidationTab";
import { MatchControlTab } from "./pages/MatchControlTab";
import { BroadcastControlPage } from "./pages/BroadcastControlPage";
import { SettingsTab } from "./pages/SettingsTab";
import { ConfigurationTab } from "./pages/ConfigurationTab";
import { StreamContentTab } from "./pages/StreamContentTab";
import { GraphicsControlTab } from "./pages/GraphicsControlTab";
import { AccessTab } from "./pages/AccessTab";
import { CompanionTab } from "./pages/CompanionTab";
import { RemoteAccessTab } from "./pages/RemoteAccessTab";

export default function App() {
  const [tab, setTab] = useState<SidebarKey>("dashboard");
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ username: string; roles: Role[] } | null>(null);
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[] | null>(null);
  const [broadcastState, setBroadcastState] = useState<BroadcastStatePayload | null>(null);
  const [liveSyncMs, setLiveSyncMs] = useState<number | null>(null);
  // En delt 1-sekunds klokke - brukes til bade et synlig ur og
  // dagens dato pa Dashboard/Broadcast, OG intermission-nedtellingen
  // som fantes fra for. Ett sted, ikke en egen timer per fane.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    window.electronAPI.getConnectionConfig().then((config) => {
      setRemoteAddress(config.remoteAddress);
      setAccessToken(config.accessToken);
      setApiBase(resolveApiBase(config.remoteAddress));
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetch(`${API_BASE}/auth/bootstrap-status`)
      .then((res) => res.json())
      .then((data) => setHasUsers(!!data.hasUsers))
      .catch(() => setHasUsers(true));
  }, [ready]);

  function handleLoggedIn(session: { token: string; username: string; roles: Role[] }) {
    setAuthToken(session.token);
    setUser({ username: session.username, roles: session.roles });
  }

  function handleLogout() {
    fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: CURRENT_AUTH_TOKEN })
    }).catch(() => {});
    setAuthToken("");
    setUser(null);
  }

  // Ett sted som poller status/alerts/broadcast-state og sender dem
  // ned som props - se kommentaren ovenfor DashboardTab for hvorfor.
  function reloadShared() {
    const started = performance.now();
    fetch(`${API_BASE}/system/status`)
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        setLiveSyncMs(Math.round(performance.now() - started));
      })
      .catch(() => setStatus(null));

    fetch(`${API_BASE}/system/alerts`).then((res) => res.json()).then(setAlerts).catch(() => setAlerts(null));
    fetch(`${API_BASE}/broadcast/state`).then((res) => res.json()).then(setBroadcastState).catch(() => setBroadcastState(null));
  }

  useEffect(() => {
    if (!ready || !user) return;
    reloadShared();
    const interval = setInterval(reloadShared, 4000);
    return () => clearInterval(interval);
  }, [ready, user]);

  // Holder appen selv talt som en "ekte klient" (CLIENTS i toppbaren)
  // - en enkel WebSocket-tilkobling til /ws-admin, kun for a bli
  // talt av serveren sa lenge appen kjorer og er logget inn. Trenger
  // ikke sende/motta noe, siden all data uansett hentes via de
  // vanlige fetch-kallene over. Kobler til pa nytt automatisk hvis
  // forbindelsen mistes (samme prinsipp som overlayene bruker).
  useEffect(() => {
    if (!ready || !user) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      socket = new WebSocket(resolveAdminWsUrl(API_BASE));
      socket.onclose = () => {
        if (!stopped) reconnectTimer = setTimeout(connect, 2000);
      };
      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [ready, user]);

  if (!ready || hasUsers === null) {
    return (
      <div style={{ padding: 24, color: "var(--text-heading)" }}>
        <p>Kobler til...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen hasUsers={hasUsers} onLoggedIn={handleLoggedIn} />;
  }

  const shared: SharedDashboardData = { status, alerts, broadcastState, liveSyncMs, now, reload: reloadShared };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <Sidebar active={tab} onSelect={setTab} user={user} onLogout={handleLogout} status={status} liveSyncMs={liveSyncMs} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar broadcastState={broadcastState} status={status} liveSyncMs={liveSyncMs} roles={user.roles} />
        <div style={{ padding: 24, overflow: "auto" }}>
          {CURRENT_REMOTE_ADDRESS && (
            <div style={{ marginBottom: 16, fontSize: 13, color: "var(--primary)" }}>
              Klient-modus - fjernstyrer {CURRENT_REMOTE_ADDRESS}
            </div>
          )}

          {/* Ekte tilgangsstyring: uavhengig av hva Sidebar sin
              admin-forhandsvisning viser, rendres selve sideinnholdet
              KUN hvis brukerens FAKTISKE rolle har tilgang - Sidebar
              filtrerer allerede menyen, dette er kun et ekstra
              sikkerhetslag. */}
          {ROLE_ACCESS[tab]?.some((r) => user.roles.includes(r)) && (
            <>
              {tab === "dashboard" && <DashboardTab shared={shared} />}
              {tab === "system" && <SystemStatusTab shared={shared} />}
              {tab === "judge" && <JudgeWorkspaceTab />}
              {tab === "tournament" && <TournamentTab />}
              {tab === "validation" && <TournamentValidationTab />}
              {tab === "match" && <MatchControlTab />}
              {tab === "broadcast" && <BroadcastControlPage />}
              {tab === "melee" && <SettingsTab shared={shared} />}
              {tab === "configuration" && <ConfigurationTab />}
              {tab === "stream" && <StreamContentTab />}
              {tab === "theme" && <GraphicsControlTab />}
              {tab === "access" && <AccessTab shared={shared} />}
              {tab === "companion" && <CompanionTab shared={shared} />}
              {tab === "remote" && <RemoteAccessTab />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
