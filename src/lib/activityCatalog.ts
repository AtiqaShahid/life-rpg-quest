// Client-side mirror of the server-side XP table in `compute_activity_xp`.
// Keep these in sync. The server is the source of truth for XP awarded.

export type DurationOption = { minutes: number; label: string; xp: number };
export type Subtype = { id: string; label: string; description?: string };
export type ActivityCategory = {
  id: string;            // matches activity_types.id
  durations: DurationOption[];
  subtypes: Subtype[];
};

export const ACTIVITY_CATALOG: Record<string, ActivityCategory> = {
  workout: {
    id: "workout",
    subtypes: [
      { id: "gym",           label: "Gym",           description: "Weights & resistance training" },
      { id: "yoga",          label: "Yoga",          description: "Flexibility & balance" },
      { id: "home_training", label: "Home Training", description: "Bodyweight at home" },
    ],
    durations: [
      { minutes: 10, label: "10 min", xp: 10 },
      { minutes: 30, label: "30 min", xp: 25 },
      { minutes: 45, label: "45 min", xp: 40 },
      { minutes: 60, label: "60+ min", xp: 50 },
    ],
  },
  study: {
    id: "study",
    subtypes: [
      { id: "deep_work",       label: "Deep Work",       description: "Focused, distraction-free" },
      { id: "general_session", label: "General Session", description: "Regular study time" },
    ],
    durations: [
      { minutes: 10, label: "10 min", xp: 10 },
      { minutes: 30, label: "30 min", xp: 25 },
      { minutes: 60, label: "60+ min", xp: 50 },
    ],
  },
  public_speaking: {
    id: "public_speaking",
    subtypes: [
      { id: "practice_alone", label: "Practice Alone", description: "Rehearse solo" },
      { id: "live_group",     label: "Live / Group",   description: "Speak in front of people" },
    ],
    durations: [
      { minutes: 10, label: "10 min", xp: 15 },
      { minutes: 30, label: "30 min", xp: 30 },
      { minutes: 60, label: "60+ min", xp: 50 },
    ],
  },
  cardio: {
    id: "cardio",
    subtypes: [
      { id: "light_jog", label: "Light Jog",  description: "Easy pace" },
      { id: "running",   label: "Running",    description: "Steady run" },
      { id: "hiit",      label: "HIIT Cardio", description: "High intensity intervals" },
    ],
    durations: [
      { minutes: 10, label: "10 min", xp: 10 },
      { minutes: 30, label: "30 min", xp: 30 },
      { minutes: 45, label: "45+ min", xp: 50 },
    ],
  },
  socializing: {
    id: "socializing",
    subtypes: [
      { id: "casual",     label: "Casual",     description: "Light interaction" },
      { id: "deep_convo", label: "Deep Talk",  description: "Meaningful conversation" },
      { id: "networking", label: "Networking", description: "Building connections" },
    ],
    durations: [
      { minutes: 10, label: "10 min", xp: 8 },
      { minutes: 30, label: "30 min", xp: 20 },
      { minutes: 60, label: "60+ min", xp: 35 },
    ],
  },
  meditation: {
    id: "meditation",
    subtypes: [
      { id: "session", label: "Session", description: "Quiet your mind" },
    ],
    durations: [
      { minutes: 10, label: "10 min", xp: 10 },
      { minutes: 20, label: "20 min", xp: 20 },
      { minutes: 30, label: "30+ min", xp: 30 },
    ],
  },
};

export const getCategory = (typeId: string) => ACTIVITY_CATALOG[typeId];

export const subtypeLabel = (typeId: string, subtypeId: string | null | undefined) => {
  if (!subtypeId) return null;
  const cat = ACTIVITY_CATALOG[typeId];
  return cat?.subtypes.find((s) => s.id === subtypeId)?.label ?? subtypeId;
};