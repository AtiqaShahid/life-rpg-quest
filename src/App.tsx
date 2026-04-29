import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/rpg/AppLayout";
import { PlayerProvider } from "@/hooks/usePlayer";
import { SocialProvider } from "@/hooks/useSocial";
// hmr-refresh: social-provider
import { CustomCursor } from "@/components/rpg/CustomCursor";
import { useEffect } from "react";
import { installUiSounds } from "@/lib/uiSound";

import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/app/Dashboard";
import Activities from "./pages/app/Activities";
import Quests from "./pages/app/Quests";
import StatsPage from "./pages/app/Stats";
import Achievements from "./pages/app/Achievements";
import SkillTree from "./pages/app/SkillTree";
import Character from "./pages/app/Character";
import Settings from "./pages/app/Settings";
import Shop from "./pages/app/Shop";
import PartyPage from "./pages/app/Party";
import FriendsPage from "./pages/app/Friends";
import LeaderboardPage from "./pages/app/Leaderboard";
import Analytics from "./pages/app/Analytics";
import Events from "./pages/app/Events";
import Depth from "./pages/app/Depth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => { installUiSounds(); }, []);
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner theme="dark" position="top-center" toastOptions={{ className: "glass-strong" }} />
      <CustomCursor />
      <BrowserRouter>
        <AuthProvider>
          <PlayerProvider>
            <SocialProvider>
            <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="activities" element={<Activities />} />
              <Route path="quests" element={<Quests />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="skills" element={<SkillTree />} />
              <Route path="character" element={<Character />} />
              <Route path="achievements" element={<Achievements />} />
              <Route path="shop" element={<Shop />} />
              <Route path="party" element={<PartyPage />} />
              <Route path="friends" element={<FriendsPage />} />
              <Route path="friends/chat/:friendId" element={<ChatPage />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="events" element={<Events />} />
              <Route path="depth" element={<Depth />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
            </Routes>
            </SocialProvider>
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
