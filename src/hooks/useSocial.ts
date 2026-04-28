import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export type LeaderboardScope = "global" | "weekly" | "friends" | "study" | "fitness" | "discipline";

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  total_xp: number;
  weekly_xp: number;
  weekly_quests: number;
  study_xp: number;
  fitness_xp: number;
  discipline_score: number;
  current_streak: number;
}

export interface PartyMember {
  id: string;
  user_id: string;
  role: "leader" | "member";
  joined_at: string;
  last_active_date: string | null;
  username?: string;
}

export interface Party {
  id: string;
  name: string;
  invite_code: string;
  leader_id: string;
  xp_pool: number;
  level: number;
  shared_streak: number;
  longest_shared_streak: number;
  accountability_mode: boolean;
}

export interface PartyGoal {
  id: string;
  title: string;
  metric: string;
  target: number;
  current: number;
  completed: boolean;
  expires_at: string | null;
}

export interface FriendRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  other_user_id: string;
  other_username: string;
  direction: "incoming" | "outgoing" | "friend";
}

export function useSocial() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [party, setParty] = useState<Party | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [goal, setGoal] = useState<PartyGoal | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scope, setScope] = useState<LeaderboardScope>("weekly");

  // ---------- LOADERS ----------
  const loadParty = useCallback(async () => {
    if (!user) return;
    const { data: pm } = await supabase
      .from("party_members").select("party_id").eq("user_id", user.id).maybeSingle();
    if (!pm?.party_id) { setParty(null); setMembers([]); setGoal(null); return; }
    const [{ data: p }, { data: ms }, { data: g }] = await Promise.all([
      supabase.from("parties").select("*").eq("id", pm.party_id).maybeSingle(),
      supabase.from("party_members").select("*").eq("party_id", pm.party_id),
      supabase.from("party_goals").select("*").eq("party_id", pm.party_id).eq("completed", false)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setParty(p as Party | null);
    const memberRows = (ms ?? []) as PartyMember[];
    if (memberRows.length) {
      const ids = memberRows.map((m) => m.user_id);
      const { data: profs } = await supabase.from("profiles").select("user_id, username").in("user_id", ids);
      const map = new Map((profs ?? []).map((x) => [x.user_id as string, x.username as string]));
      memberRows.forEach((m) => { m.username = map.get(m.user_id) ?? "Player"; });
    }
    setMembers(memberRows);
    setGoal(g as PartyGoal | null);
  }, [user]);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friendships").select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const rows = (data ?? []) as Array<{ id: string; requester_id: string; addressee_id: string; status: "pending" | "accepted" | "blocked" }>;
    const otherIds = Array.from(new Set(rows.map((r) => r.requester_id === user.id ? r.addressee_id : r.requester_id)));
    const { data: profs } = otherIds.length
      ? await supabase.from("profiles").select("user_id, username").in("user_id", otherIds)
      : { data: [] as Array<{ user_id: string; username: string }> };
    const nameMap = new Map((profs ?? []).map((p) => [p.user_id, p.username]));
    setFriends(rows.map((r) => {
      const otherId = r.requester_id === user.id ? r.addressee_id : r.requester_id;
      const direction: FriendRow["direction"] = r.status === "accepted"
        ? "friend"
        : (r.requester_id === user.id ? "outgoing" : "incoming");
      return { ...r, other_user_id: otherId, other_username: nameMap.get(otherId) ?? "Player", direction };
    }));
  }, [user]);

  const loadLeaderboard = useCallback(async (s: LeaderboardScope) => {
    if (!user) return;
    let q = supabase.from("leaderboard_entries").select("*").limit(50);
    if (s === "weekly")     q = q.order("weekly_xp", { ascending: false });
    else if (s === "study") q = q.order("study_xp", { ascending: false });
    else if (s === "fitness") q = q.order("fitness_xp", { ascending: false });
    else if (s === "discipline") q = q.order("discipline_score", { ascending: false });
    else                     q = q.order("total_xp", { ascending: false });

    if (s === "friends") {
      const { data: fr } = await supabase
        .from("friendships").select("requester_id, addressee_id, status")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq("status", "accepted");
      const friendIds = (fr ?? []).map((f) => f.requester_id === user.id ? f.addressee_id : f.requester_id);
      const { data: pm } = await supabase
        .from("party_members").select("party_id").eq("user_id", user.id).maybeSingle();
      let partyMemberIds: string[] = [];
      if (pm?.party_id) {
        const { data: ms } = await supabase.from("party_members").select("user_id").eq("party_id", pm.party_id);
        partyMemberIds = (ms ?? []).map((m) => m.user_id);
      }
      const ids = Array.from(new Set([...friendIds, ...partyMemberIds, user.id]));
      q = supabase.from("leaderboard_entries").select("*").in("user_id", ids).order("total_xp", { ascending: false });
    }
    const { data } = await q;
    setLeaderboard((data ?? []) as LeaderboardEntry[]);
  }, [user]);

  // ---------- BOOTSTRAP ----------
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([loadParty(), loadFriends(), loadLeaderboard(scope)]).finally(() => setLoading(false));
  }, [user, loadParty, loadFriends, loadLeaderboard, scope]);

  // ---------- REALTIME ----------
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`social-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_members" }, () => loadParty())
      .on("postgres_changes", { event: "*", schema: "public", table: "parties" }, () => loadParty())
      .on("postgres_changes", { event: "*", schema: "public", table: "party_goals" }, () => loadParty())
      .on("postgres_changes", { event: "*", schema: "public", table: "party_activity_log" }, () => loadParty())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadFriends())
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard_entries" }, () => loadLeaderboard(scope))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, scope, loadParty, loadFriends, loadLeaderboard]);

  // ---------- ACTIONS ----------
  const createParty = useCallback(async (name: string) => {
    const { data, error } = await supabase.rpc("create_party", { p_name: name });
    if (error) return toast.error(error.message);
    const r = data as { ok: boolean; reason?: string; invite_code?: string };
    if (!r?.ok) return toast.error(r?.reason ?? "Could not create party");
    toast.success(`Party created — code ${r.invite_code}`);
    await loadParty();
  }, [loadParty]);

  const joinParty = useCallback(async (code: string) => {
    const { data, error } = await supabase.rpc("join_party", { p_invite_code: code });
    if (error) return toast.error(error.message);
    const r = data as { ok: boolean; reason?: string };
    if (!r?.ok) return toast.error(r?.reason ?? "Could not join party");
    toast.success("Joined party!");
    await loadParty();
  }, [loadParty]);

  const leaveParty = useCallback(async () => {
    const { error } = await supabase.rpc("leave_party");
    if (error) return toast.error(error.message);
    toast.success("Left party");
    await loadParty();
  }, [loadParty]);

  const kickMember = useCallback(async (userId: string) => {
    const { error } = await supabase.rpc("kick_party_member", { p_target: userId });
    if (error) return toast.error(error.message);
    await loadParty();
  }, [loadParty]);

  const updatePartySettings = useCallback(async (name: string | null, accountability: boolean | null) => {
    const { error } = await supabase.rpc("set_party_settings", { p_name: name, p_accountability: accountability });
    if (error) return toast.error(error.message);
    toast.success("Party updated");
    await loadParty();
  }, [loadParty]);

  const setPartyGoal = useCallback(async (title: string, target: number) => {
    const { error } = await supabase.rpc("set_party_goal", { p_title: title, p_metric: "quests", p_target: target });
    if (error) return toast.error(error.message);
    toast.success("Goal set");
    await loadParty();
  }, [loadParty]);

  const sendFriendRequest = useCallback(async (username: string) => {
    const { data, error } = await supabase.rpc("send_friend_request", { p_username: username });
    if (error) return toast.error(error.message);
    const r = data as { ok: boolean; reason?: string };
    if (!r?.ok) return toast.error(r?.reason ?? "Could not send request");
    toast.success("Request sent");
    await loadFriends();
  }, [loadFriends]);

  const respondFriend = useCallback(async (id: string, accept: boolean) => {
    const { error } = await supabase.rpc("respond_friend_request", { p_id: id, p_accept: accept });
    if (error) return toast.error(error.message);
    await loadFriends();
  }, [loadFriends]);

  const removeFriend = useCallback(async (friendUserId: string) => {
    const { error } = await supabase.rpc("remove_friend", { p_friend_id: friendUserId });
    if (error) return toast.error(error.message);
    await loadFriends();
  }, [loadFriends]);

  return {
    loading, party, members, goal, friends, leaderboard, scope, setScope,
    createParty, joinParty, leaveParty, kickMember, updatePartySettings, setPartyGoal,
    sendFriendRequest, respondFriend, removeFriend, refreshLeaderboard: () => loadLeaderboard(scope),
  };
}