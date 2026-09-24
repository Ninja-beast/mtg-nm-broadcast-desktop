import React, { useState, useEffect } from "react";
import { API_BASE, fetchScryfallImageByName } from "../lib/apiClient";
import { useSystemStatus } from "../hooks/useSystem";
import { useBroadcastState } from "../hooks/useBroadcast";
import { useMatches } from "../hooks/useMatches";
import type { SystemStatus, Match } from "../types";
import { Panel, InfoRow, QuickActionButton } from "../components/shared";

type GraphicRow = { key: string; title: string; subtitle: string; wired: boolean };

function GraphicVisibilityRow({
  row,
  visible,
  onShow,
  onHide,
  onPreview
}: {
  row: GraphicRow;
  visible: boolean;
  onShow?: () => void;
  onHide?: () => void;
  onPreview?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${visible ? "var(--primary)" : "var(--border)"}`,
        background: visible ? "var(--popover)" : "var(--bg)",
        marginBottom: 8
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: visible ? "var(--primary)" : "var(--text-faint)", flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{row.title}</div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>{row.subtitle}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {(["SHOW", "HIDE", "PREVIEW"] as const).map((label) => {
          const handler = label === "SHOW" ? onShow : label === "HIDE" ? onHide : onPreview;
          return (
            <button
              key={label}
              onClick={handler}
              style={{
                padding: "6px 12px",
                borderRadius: 5,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-heading)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GraphicsControlTab() {
  const [status, reloadStatus] = useSystemStatus();
  const [broadcastState, reloadBroadcastState] = useBroadcastState();
  const [matches, reloadMatches] = useMatches();

  const activeBoard: "bo3" | "bo5" = broadcastState?.scene === "bo5" ? "bo5" : "bo3";
  const activeBoardData = broadcastState?.[activeBoard];
  const match = (matches || []).find((m) => m.id === activeBoardData?.id);
  const cardShowcaseName = match?.player1_card_showcase || match?.player2_card_showcase || "";
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!cardShowcaseName) {
      setCardImageUrl(null);
      return;
    }
    let cancelled = false;
    fetchScryfallImageByName(cardShowcaseName).then((url) => {
      if (!cancelled) setCardImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [cardShowcaseName]);

  function reloadAll() {
    reloadStatus();
    reloadBroadcastState();
    reloadMatches();
  }

  async function setNameTags(show: boolean) {
    await fetch(`${API_BASE}/broadcast/name-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show })
    });
    reloadAll();
  }

  async function setCardShowcaseVisible(show: boolean) {
    await fetch(`${API_BASE}/broadcast/card-showcase-visibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show })
    });
    reloadAll();
  }

  async function hideAll() {
    await setNameTags(false);
    await setCardShowcaseVisible(false);
  }

  const rows: GraphicRow[] = [
    { key: "nametags", title: "Player Name Tags", subtitle: "Both players - from Match Control", wired: true },
    { key: "matchinfo", title: "Match Information", subtitle: match ? `${match.round_label || "Round ?"} - ${match.is_bo5 ? "BO5" : "BO3"} - Game ${match.player1_game_wins + match.player2_game_wins + 1}` : "Ingen aktiv kamp", wired: false },
    { key: "cardshowcase", title: "Card Showcase", subtitle: match?.player1_card_showcase || match?.player2_card_showcase || "Ingen kort valgt", wired: true },
    { key: "meta", title: "Meta Breakdown", subtitle: "Styres fra Meta-scenen", wired: false },
    { key: "tourney", title: "Tournament Information", subtitle: "Swiss standings", wired: false },
    { key: "brackets", title: "Brackets", subtitle: "Top 8", wired: false },
    { key: "alert", title: "Alert Banner", subtitle: "Ingen varsel i kø", wired: false },
    { key: "custom", title: "Custom Event Graphic", subtitle: "-", wired: false }
  ];

  const visibleCount = rows.filter((r) => (r.key === "nametags" ? status?.showNameTags : r.key === "cardshowcase" ? !!((match?.player1_card_showcase || match?.player2_card_showcase) && status?.cardShowcaseVisible) : false)).length;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Graphics Control</h2>
      <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 20 }}>
        {visibleCount} graphics currently visible on program
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Panel title="GRAPHIC VISIBILITY">
          {rows.map((row) => {
            if (row.key === "nametags") {
              return (
                <GraphicVisibilityRow
                  key={row.key}
                  row={row}
                  visible={!!status?.showNameTags}
                  onShow={() => setNameTags(true)}
                  onHide={() => setNameTags(false)}
                />
              );
            }
            if (row.key === "cardshowcase") {
              return (
                <GraphicVisibilityRow
                  key={row.key}
                  row={row}
                  visible={!!((match?.player1_card_showcase || match?.player2_card_showcase) && status?.cardShowcaseVisible)}
                  onShow={() => setCardShowcaseVisible(true)}
                  onHide={() => setCardShowcaseVisible(false)}
                />
              );
            }
            return <GraphicVisibilityRow key={row.key} row={row} visible={false} />;
          })}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={hideAll} style={{ padding: "8px 16px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12, fontWeight: 700 }}>
              HIDE ALL
            </button>
            <button onClick={reloadAll} style={{ padding: "8px 16px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12, fontWeight: 700 }}>
              REFRESH DATA
            </button>
            <button onClick={hideAll} style={{ padding: "8px 16px", borderRadius: 5, border: "1px solid var(--warn)", background: "var(--popover)", color: "var(--warn)", fontSize: 12, fontWeight: 700 }}>
              CLEAR PROGRAM GRAPHICS
            </button>
          </div>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="PLAYER NAME TAGS">
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <span style={{ padding: "3px 10px", borderRadius: 20, border: `1px solid ${status?.showNameTags ? "var(--primary)" : "var(--border)"}`, color: status?.showNameTags ? "var(--primary)" : "var(--text-muted)", fontSize: 11, fontWeight: 700 }}>
                {status?.showNameTags ? "VISIBLE" : "HIDDEN"}
              </span>
            </div>
            {match ? (
              <>
                <InfoRow label="P1" value={`${activeBoardData?.player1?.name || "-"}`} />
                <InfoRow label="P2" value={`${activeBoardData?.player2?.name || "-"}`} />
              </>
            ) : (
              <div style={{ opacity: 0.5, fontSize: 13 }}>Ingen aktiv kamp</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
              <QuickActionButton compact label="SHOW BOTH" onClick={() => setNameTags(true)} />
              <QuickActionButton compact label="HIDE" onClick={() => setNameTags(false)} />
            </div>
          </Panel>

          <Panel title="CARD SHOWCASE">
            <div style={{ border: "1px dashed var(--border)", borderRadius: 10, height: 220, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, overflow: "hidden" }}>
              {cardImageUrl ? (
                <img src={cardImageUrl} alt={cardShowcaseName} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ opacity: 0.4, fontSize: 11, letterSpacing: 1 }}>PREVIEW</span>
              )}
            </div>
            <InfoRow label="CARD" value={match?.player1_card_showcase || match?.player2_card_showcase || "-"} />
            <InfoRow label="SET" value="-" />
            <InfoRow
              label="STATE"
              value={!(match?.player1_card_showcase || match?.player2_card_showcase) ? "-" : status?.cardShowcaseVisible ? "LIVE" : "HIDDEN"}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
              <QuickActionButton compact label="SHOW" onClick={() => setCardShowcaseVisible(true)} />
              <QuickActionButton compact label="HIDE" onClick={() => setCardShowcaseVisible(false)} />
            </div>
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6 }}>Hvilket kort som vises settes i Match Control - her styrer du kun om det er synlig. SET (utgave) er ikke lagret noe sted enna.</div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

