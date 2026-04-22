import { useEffect, useState } from "react";

export interface RiviScene {
  id: string;
  title: string;
  description: string;
  badge?: string;
}

export interface UseRiviScenesResult {
  scenes: RiviScene[];
  loading: boolean;
  error: Error | null;
}

// TODO: Wire to timetable / homework / presence APIs when available (host-owned endpoints).

const MOCK_SCENES: RiviScene[] = [
  {
    id: "deep-focus",
    title: "Deep focus",
    description: "No-notification lane for long stretches of work.",
  },
  {
    id: "planning-board",
    title: "Planning board",
    description: "Timelines, milestones, and backlog in one place.",
  },
  {
    id: "team-presence",
    title: "Team presence",
    description: "Who is online, in a call, or in a focus block.",
    badge: "Live",
  },
];

export function useRiviScenes(): UseRiviScenesResult {
  const [scenes, setScenes] = useState<RiviScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = window.setTimeout(() => {
      if (!cancelled) {
        setScenes(MOCK_SCENES);
        setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  return { scenes, loading, error };
}
