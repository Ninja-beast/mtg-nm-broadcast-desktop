import React, { useEffect, useState, useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase, getServerAddress, setServerAddress, getAccessToken, setAccessToken, installAccessTokenFetch } from "./config";

installAccessTokenFetch();

const SELECTED_MATCH_KEY = "mtg_player_selected_match_id";

function BigBtn({ onPress, children, style, textStyle }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.bigBtn, style]}>
      <Text style={[styles.bigBtnText, textStyle]}>{children}</Text>
    </TouchableOpacity>
  );
}

function ServerSetup({ onConnected }) {
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    (async () => {
      const stored = await getServerAddress();
      setAddress(stored);
      const storedToken = await getAccessToken();
      setToken(storedToken);
    })();
  }, []);

  async function connect() {
    setStatus("connecting");
    await setServerAddress(address);
    await setAccessToken(token);
    const apiBase = await getApiBase();
    try {
      const res = await fetch(`${apiBase}/tournament`);
      if (!res.ok) throw new Error();
      setStatus("idle");
      onConnected();
    } catch (err) {
      setStatus("error");
    }
  }

  return (
    <View style={styles.centerFill}>
      <Text style={styles.title}>MTG NM</Text>
      <Text style={styles.subtitle}>Spillerapp</Text>

      <Text style={[styles.label, { marginTop: 40 }]}>
        Server-adresse (lokal IP eller ekstern lenke fra arrangoren)
      </Text>
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder="f.eks. 192.168.1.42 eller xxx.trycloudflare.com"
        placeholderTextColor="#5a6478"
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Tilgangskode (kun nodvendig utenfor lokalt WiFi)</Text>
      <TextInput
        value={token}
        onChangeText={setToken}
        placeholder="Fyll inn hvis arrangoren har gitt deg en"
        placeholderTextColor="#5a6478"
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <BigBtn onPress={connect}>{status === "connecting" ? "Kobler..." : "Koble til"}</BigBtn>
      {status === "error" && (
        <Text style={styles.errorText}>Fikk ikke kontakt. Sjekk adressen (og tilgangskoden hvis du bruker en) og at dere er pa samme WiFi, eller at tunnelen kjorer.</Text>
      )}
    </View>
  );
}

function MatchPicker({ onSelect }) {
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const apiBase = await getApiBase();
    if (!apiBase) return;
    try {
      const tRes = await fetch(`${apiBase}/tournament`);
      const t = await tRes.json();
      if (!t) {
        setMatches([]);
        setLoading(false);
        return;
      }
      const [mRes, pRes] = await Promise.all([
        fetch(`${apiBase}/matches?tournamentId=${t.id}`),
        fetch(`${apiBase}/players?tournamentId=${t.id}`)
      ]);
      setMatches(await mRes.json());
      setPlayers(await pRes.json());
    } catch (err) {
      // Stille - proves igjen ved neste last.
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  function playerName(id) {
    return players.find((p) => p.id === id)?.name ?? "?";
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>Velg kampen din</Text>
        {loading && <Text style={styles.dim}>Laster...</Text>}
        {!loading && matches.length === 0 && <Text style={styles.dim}>Ingen kamper enna.</Text>}
        {matches.map((m) => (
          <TouchableOpacity key={m.id} onPress={() => onSelect(m.id)} style={styles.matchPickerRow}>
            <Text style={styles.matchPickerText}>
              {playerName(m.player1_id)} vs {playerName(m.player2_id)}
            </Text>
            <Text style={styles.dim}>{m.is_bo5 ? "BO5" : "BO3"}{m.table_number != null ? ` - bord ${m.table_number}` : ""}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function LifeCounter({ matchId, onChangeMatch }) {
  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [notFoundCount, setNotFoundCount] = useState(0);

  const load = useCallback(async () => {
    const apiBase = await getApiBase();
    if (!apiBase) return;
    try {
      const allRes = await fetch(`${apiBase}/matches`);
      const all = await allRes.json();
      const found = all.find((m) => m.id === matchId);
      if (found) {
        setMatch(found);
        setNotFoundCount(0);
        const pRes = await fetch(`${apiBase}/players?tournamentId=${found.tournament_id}`);
        setPlayers(await pRes.json());
      } else {
        setNotFoundCount((n) => n + 1);
      }
    } catch (err) {
      // Stille - proves igjen ved neste poll.
    }
  }, [matchId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 1500);
    return () => clearInterval(interval);
  }, [load]);

  async function patchMatch(fields) {
    const apiBase = await getApiBase();
    if (!apiBase || !match) return;
    await fetch(`${apiBase}/matches/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    });
    load();
  }

  async function winGame(player) {
    const apiBase = await getApiBase();
    if (!apiBase || !match) return;
    await fetch(`${apiBase}/matches/${match.id}/win-game`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player })
    });
    load();
  }

  function playerName(id) {
    return players.find((p) => p.id === id)?.name ?? "SPILLER";
  }

  if (!match) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.dim}>{notFoundCount < 3 ? "Laster kamp..." : "Fant ikke kampen lenger."}</Text>
        {notFoundCount >= 3 && (
          <BigBtn onPress={onChangeMatch} style={{ marginTop: 20 }}>Velg kamp pa nytt</BigBtn>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={styles.lifeScreen}>
        <View style={[styles.playerHalf, styles.playerHalfRotated]}>
          <Text style={styles.playerNameBig}>{playerName(match.player1_id)}</Text>
          <Text style={styles.lifeNumber}>{match.player1_life}</Text>
          <View style={styles.lifeBtnRow}>
            <BigBtn onPress={() => patchMatch({ player1Life: match.player1_life - 1 })} style={styles.lifeBtnHalf}>-1</BigBtn>
            <BigBtn onPress={() => patchMatch({ player1Life: match.player1_life + 1 })} style={styles.lifeBtnHalf}>+1</BigBtn>
          </View>
          <BigBtn onPress={() => winGame(1)} style={styles.winBtn}>Jeg vant spillet</BigBtn>
        </View>

        <View style={styles.divider} />

        <View style={styles.playerHalf}>
          <Text style={styles.playerNameBig}>{playerName(match.player2_id)}</Text>
          <Text style={styles.lifeNumber}>{match.player2_life}</Text>
          <View style={styles.lifeBtnRow}>
            <BigBtn onPress={() => patchMatch({ player2Life: match.player2_life - 1 })} style={styles.lifeBtnHalf}>-1</BigBtn>
            <BigBtn onPress={() => patchMatch({ player2Life: match.player2_life + 1 })} style={styles.lifeBtnHalf}>+1</BigBtn>
          </View>
          <BigBtn onPress={() => winGame(2)} style={styles.winBtn}>Jeg vant spillet</BigBtn>
        </View>
      </View>

      <View style={styles.bottomBar}>
        <Text style={styles.dim}>Score: {match.player1_game_wins}-{match.player2_game_wins}</Text>
        <TouchableOpacity onPress={onChangeMatch}>
          <Text style={styles.changeMatchLink}>Bytt kamp</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [connected, setConnected] = useState(null);
  const [matchId, setMatchId] = useState(null);

  useEffect(() => {
    (async () => {
      const address = await getServerAddress();
      setConnected(!!address);

      const storedMatchId = await AsyncStorage.getItem(SELECTED_MATCH_KEY);
      if (storedMatchId) setMatchId(Number(storedMatchId));
    })();
  }, []);

  async function selectMatch(id) {
    setMatchId(id);
    await AsyncStorage.setItem(SELECTED_MATCH_KEY, String(id));
  }

  async function changeMatch() {
    setMatchId(null);
    await AsyncStorage.removeItem(SELECTED_MATCH_KEY);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1220" }}>
      <StatusBar style="light" />
      {connected === null ? null : !connected ? (
        <ServerSetup onConnected={() => setConnected(true)} />
      ) : matchId == null ? (
        <MatchPicker onSelect={selectMatch} />
      ) : (
        <LifeCounter matchId={matchId} onChangeMatch={changeMatch} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#fff", fontSize: 32, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#8892a6", fontSize: 16, textAlign: "center", marginTop: 4 },
  label: { color: "#c7cede", fontSize: 14, marginBottom: 8, textAlign: "center" },
  dim: { color: "#8892a6", fontSize: 14, textAlign: "center" },
  errorText: { color: "#ff8080", fontSize: 13, textAlign: "center", marginTop: 12 },
  input: {
    backgroundColor: "#111a2e",
    borderColor: "#1c2740",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    color: "#fff",
    fontSize: 16,
    marginBottom: 16,
    textAlign: "center"
  },
  bigBtn: {
    backgroundColor: "#e11d48",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center"
  },
  bigBtnText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  matchPickerRow: {
    backgroundColor: "#111a2e",
    borderRadius: 12,
    padding: 18,
    marginBottom: 12
  },
  matchPickerText: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  lifeScreen: { flex: 1, flexDirection: "column" },
  playerHalf: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  playerHalfRotated: { transform: [{ rotate: "180deg" }] },
  divider: { height: 1, width: "100%", backgroundColor: "#1c2740" },
  playerNameBig: { color: "#c7cede", fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  lifeNumber: { color: "#fff", fontSize: 96, fontWeight: "900", marginBottom: 24 },
  lifeBtnRow: { flexDirection: "row", gap: 12, marginBottom: 20, width: "100%" },
  lifeBtnHalf: { flex: 1 },
  winBtn: { backgroundColor: "#1c2740", width: "100%" },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1c2740"
  },
  changeMatchLink: { color: "#8ab4ff", fontSize: 14, fontWeight: "600" }
});
