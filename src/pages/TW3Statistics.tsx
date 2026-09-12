import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type NodeRow = {
  node_id: number;
  game_id: number;
  name: string;
  subtype: string | null;
};

type ProgressRow = {
  node_id: number;
  is_completed: boolean;
};

type StatRow = {
  label: string;
  total: number;
  completed: number;
  percent: number; 
};

const GAME_ID = 2; 

const PALETTE = [
  "#60a5fa", 
  "#34d399", 
  "#fbbf24", 
  "#f472b6", 
  "#a78bfa", 
  "#22d3ee", 
  "#fb7185", 
  "#4ade80", 
  "#f97316", 
  "#e879f9", 
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtPercent(n: number) {
  if (!isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function normaliseSubtype(subtype: string | null) {
  const s = (subtype ?? "Uncategorised").trim();
  return s.length ? s : "Uncategorised";
}

function isCollectibleSubtype(subtype: string | null) {
  const s = (subtype ?? "").trim().toLowerCase();
  return s === "collectible" || s === "collectibles";
}

/**
 * Witcher 3 collectible “type” derived from name patterns:
 * - Place of Power
 * - Witcher Gear Diagram
 * - Gwent Card
 *
 * This assumes the names begin with those phrases (case-insensitive),
 * e.g. "Place of Power - ...", "Gwent Card: ...", "Witcher Gear Diagram (Cat School)..."
 */
function deriveWitcher3CollectibleType(name: string) {
  const n = (name ?? "").trim().toLowerCase();

  if (n.startsWith("place of power")) return "Place of Power";
  if (n.startsWith("witcher gear diagram")) return "Witcher Gear Diagram";
  if (n.startsWith("gwent card")) return "Gwent Card";

  return "Other";
}

function makeStatsFromNodes(
  nodes: NodeRow[],
  completedSet: Set<number>,
  keyFn: (n: NodeRow) => string
): StatRow[] {
  const map = new Map<string, { total: number; completed: number }>();

  for (const n of nodes) {
    const key = keyFn(n);
    if (!map.has(key)) map.set(key, { total: 0, completed: 0 });
    const entry = map.get(key)!;
    entry.total += 1;
    if (completedSet.has(n.node_id)) entry.completed += 1;
  }

  const out: StatRow[] = Array.from(map.entries()).map(([label, v]) => ({
    label,
    total: v.total,
    completed: v.completed,
    percent: v.total === 0 ? 0 : (v.completed / v.total) * 100,
  }));

  out.sort(
    (a, b) =>
      (b.total - b.completed) - (a.total - a.completed) || a.label.localeCompare(b.label)
  );

  return out;
}

function buildDonut(stats: StatRow[]) {
  const slices = stats.filter((s) => s.total > 0);
  const total = slices.reduce((sum, s) => sum + s.total, 0);
  if (total === 0) return { slices: [] as any[], total: 0 };

  let start = 0;
  const built = slices.map((s, idx) => {
    const portion = s.total / total;
    const sweep = portion * 360;
    const end = start + sweep;
    const path = describeArc(60, 60, 44, start, end);
    const color = PALETTE[idx % PALETTE.length];
    const slice = { ...s, start, end, path, idx, color };
    start = end;
    return slice;
  });

  return { slices: built, total };
}

export default function TW3Statistics() {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [completedSet, setCompletedSet] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>("");

  
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  
  useEffect(() => {
    if (!session) {
      setNodes([]);
      setCompletedSet(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const { data: nodeRows, error: nodeErr } = await supabase
          .from("nodes")
          .select("node_id,game_id,name,subtype")
          .eq("game_id", GAME_ID)
          .order("node_id", { ascending: true });

        if (nodeErr) throw nodeErr;

        const nodesData = (nodeRows as NodeRow[]) || [];
        const nodeIds = nodesData.map((n) => n.node_id);

        if (nodeIds.length === 0) {
          if (!cancelled) {
            setNodes([]);
            setCompletedSet(new Set());
            setLoading(false);
          }
          return;
        }

        const { data: progRows, error: progErr } = await supabase
          .from("user_progress")
          .select("node_id,is_completed")
          .eq("user_id", session.user.id)
          .eq("is_completed", true)
          .in("node_id", nodeIds);

        if (progErr) throw progErr;

        const completed = new Set<number>();
        (progRows as ProgressRow[] | null)?.forEach((p) => {
          if (p.is_completed) completed.add(Number(p.node_id));
        });

        if (!cancelled) {
          setNodes(nodesData);
          setCompletedSet(completed);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load statistics.");
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const totals = useMemo(() => {
    const total = nodes.length;
    let completed = 0;
    for (const n of nodes) if (completedSet.has(n.node_id)) completed++;
    const percent = total === 0 ? 0 : (completed / total) * 100;
    return { total, completed, remaining: total - completed, percent };
  }, [nodes, completedSet]);

  const completionPct = useMemo(() => {
    if (!nodes.length) return 0;
    return Math.round((totals.completed / nodes.length) * 100);
  }, [nodes.length, totals.completed]);

  const ring = useMemo(() => {
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const pct = clamp(totals.percent, 0, 100);
    const dashOffset = circumference * (1 - pct / 100);
    return { radius, circumference, dashOffset, pct };
  }, [totals.percent]);

  const subtypeStats = useMemo<StatRow[]>(() => {
    return makeStatsFromNodes(nodes, completedSet, (n) => normaliseSubtype(n.subtype));
  }, [nodes, completedSet]);

  const subtypeDonut = useMemo(() => buildDonut(subtypeStats), [subtypeStats]);

  
  const collectibleNodes = useMemo(
    () => nodes.filter((n) => isCollectibleSubtype(n.subtype)),
    [nodes]
  );

  const collectibleTypeStats = useMemo<StatRow[]>(() => {
    return makeStatsFromNodes(collectibleNodes, completedSet, (n) =>
      deriveWitcher3CollectibleType(n.name)
    );
  }, [collectibleNodes, completedSet]);

  const collectibleDonut = useMemo(() => buildDonut(collectibleTypeStats), [collectibleTypeStats]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login")
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      <header className="h-14 shrink-0 border-b bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold hover:opacity-80">
            RPG Map Tracker
          </Link>
          <div className="text-sm text-gray-500">Witcher 3</div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/witcher3"
            className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50"
          >
            Map
          </Link>
          <Link
            to="/witcher3/dashboard"
            className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50"
          >
            Dashboard
          </Link>
          <Link
            to="/comparison"
            className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50"
          >
            Comparison
          </Link>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          {session ? (
            <>
              <div className="hidden sm:block text-xs text-gray-500">
                {session.user?.email}
              </div>
              <button
                onClick={handleLogout}
                className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white hover:opacity-90"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white hover:opacity-90"
            >
              Login
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 p-4 overflow-auto">
        {error && (
          <div className="mb-3 bg-red-100 text-red-800 px-4 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-lg font-semibold">Statistics</div>
            <div className="text-sm text-gray-600">
              {totals.completed}/{totals.total} completed ({completionPct}%)
            </div>
          </div>

          {loading ? <div className="text-sm text-gray-500">Loading…</div> : null}
        </div>

        {!session ? (
          <div className="text-sm text-gray-600">You need to be logged in to view statistics.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border bg-gradient-to-br from-sky-50 to-white p-4">
                <div className="text-sm text-gray-600">Total nodes</div>
                <div className="text-2xl font-semibold mt-1 text-gray-900">{totals.total}</div>
              </div>
              <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-white p-4">
                <div className="text-sm text-gray-600">Completed</div>
                <div className="text-2xl font-semibold mt-1 text-gray-900">{totals.completed}</div>
              </div>
              <div className="rounded-2xl border bg-gradient-to-br from-amber-50 to-white p-4">
                <div className="text-sm text-gray-600">Remaining</div>
                <div className="text-2xl font-semibold mt-1 text-gray-900">{totals.remaining}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="rounded-2xl border bg-white p-4">
                <div className="font-semibold text-gray-900">Overall completion</div>
                <div className="flex items-center gap-4 mt-4">
                  <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
                    <circle cx="60" cy="60" r={ring.radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
                    <circle
                      cx="60"
                      cy="60"
                      r={ring.radius}
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={ring.circumference}
                      strokeDashoffset={ring.dashOffset}
                      transform="rotate(-90 60 60)"
                    />
                    <text x="60" y="64" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f172a">
                      {fmtPercent(ring.pct)}
                    </text>
                  </svg>

                  <div className="text-sm leading-6 text-gray-700">
                    <div>
                      <span className="text-gray-500">Completed:</span> {totals.completed}
                    </div>
                    <div>
                      <span className="text-gray-500">Total:</span> {totals.total}
                    </div>
                    <div>
                      <span className="text-gray-500">Remaining:</span> {totals.remaining}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4">
                <div className="font-semibold text-gray-900">By subtype</div>
                <div className="flex items-center gap-4 mt-4">
                  <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
                    {subtypeDonut.slices.map((s) => (
                      <path
                        key={s.label}
                        d={s.path}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="14"
                        strokeLinecap="butt"
                      />
                    ))}
                    <circle cx="60" cy="60" r="28" fill="white" opacity="0.95" />
                    <text x="60" y="62" textAnchor="middle" fontSize="12" fill="#334155">
                      {subtypeDonut.total ? "All nodes" : "No data"}
                    </text>
                  </svg>

                  <div className="text-sm text-gray-700">
                    {subtypeStats.slice(0, 6).map((s) => (
                      <div key={s.label} className="flex justify-between gap-4">
                        <span className="truncate max-w-[200px]">{s.label}</span>
                        <span className="tabular-nums text-gray-600">
                          {s.completed}/{s.total}
                        </span>
                      </div>
                    ))}
                    {subtypeStats.length > 6 ? (
                      <div className="mt-2 text-xs text-gray-500">
                        +{subtypeStats.length - 6} more in table below
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-4 mt-6">
              <div className="font-semibold text-gray-900">Breakdown by subtype</div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">Subtype</th>
                      <th className="py-2 pr-3">Completed</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2 pr-3">%</th>
                      <th className="py-2 pr-3">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subtypeStats.map((s) => (
                      <tr key={s.label} className="border-t">
                        <td className="py-2 pr-3 text-gray-900">{s.label}</td>
                        <td className="py-2 pr-3 tabular-nums text-gray-700">{s.completed}</td>
                        <td className="py-2 pr-3 tabular-nums text-gray-700">{s.total}</td>
                        <td className="py-2 pr-3 tabular-nums text-gray-700">{fmtPercent(s.percent)}</td>
                        <td className="py-2 pr-3">
                          <div className="w-full h-2 rounded bg-gray-200">
                            <div
                              className="h-2 rounded bg-sky-500"
                              style={{ width: `${clamp(s.percent, 0, 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {subtypeStats.length === 0 ? (
                      <tr className="border-t">
                        <td className="py-3 text-gray-500" colSpan={5}>
                          No nodes found for Witcher 3.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-4 mt-6">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">Collectibles breakdown</div>
                  <div className="text-sm text-gray-600 mt-1">
                 
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  Total collectibles:{" "}
                  <span className="font-semibold text-gray-900">{collectibleNodes.length}</span>
                </div>
              </div>

              {collectibleNodes.length === 0 ? (
                <div className="mt-4 text-sm text-gray-600">
                  No collectibles found (ensure subtype is “Collectible”).
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                    <div className="rounded-2xl border bg-gradient-to-br from-violet-50 to-white p-4">
                      <div className="font-semibold text-gray-900">Collectible types</div>
                      <div className="flex items-center gap-4 mt-4">
                        <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
                          {collectibleDonut.slices.map((s) => (
                            <path
                              key={s.label}
                              d={s.path}
                              fill="none"
                              stroke={s.color}
                              strokeWidth="14"
                              strokeLinecap="butt"
                            />
                          ))}
                          <circle cx="60" cy="60" r="28" fill="white" opacity="0.95" />
                          <text x="60" y="62" textAnchor="middle" fontSize="12" fill="#334155">
                            Collectibles
                          </text>
                        </svg>

                        <div className="text-sm text-gray-700">
                          {collectibleTypeStats.map((s) => (
                            <div key={s.label} className="flex justify-between gap-4">
                              <span className="truncate max-w-[220px]">{s.label}</span>
                              <span className="tabular-nums text-gray-600">
                                {s.completed}/{s.total}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-white p-4">
                      <div className="font-semibold text-gray-900">Remaining by type</div>
                      <div className="mt-3 space-y-2">
                        {collectibleTypeStats.map((s, idx) => {
                          const remaining = s.total - s.completed;
                          const barColor = PALETTE[idx % PALETTE.length];
                          return (
                            <div key={s.label}>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-900 truncate max-w-[280px]">{s.label}</span>
                                <span className="text-gray-600 tabular-nums">remaining {remaining}</span>
                              </div>
                              <div className="w-full h-2 rounded bg-gray-200 mt-1">
                                <div
                                  className="h-2 rounded"
                                  style={{ width: `${clamp(s.percent, 0, 100)}%`, backgroundColor: barColor }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-gray-500">
                        <tr>
                          <th className="py-2 pr-3">Collectible type</th>
                          <th className="py-2 pr-3">Completed</th>
                          <th className="py-2 pr-3">Total</th>
                          <th className="py-2 pr-3">%</th>
                          <th className="py-2 pr-3">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collectibleTypeStats.map((s, idx) => (
                          <tr key={s.label} className="border-t">
                            <td className="py-2 pr-3 text-gray-900">{s.label}</td>
                            <td className="py-2 pr-3 tabular-nums text-gray-700">{s.completed}</td>
                            <td className="py-2 pr-3 tabular-nums text-gray-700">{s.total}</td>
                            <td className="py-2 pr-3 tabular-nums text-gray-700">{fmtPercent(s.percent)}</td>
                            <td className="py-2 pr-3">
                              <div className="w-full h-2 rounded bg-gray-200">
                                <div
                                  className="h-2 rounded"
                                  style={{
                                    width: `${clamp(s.percent, 0, 100)}%`,
                                    backgroundColor: PALETTE[idx % PALETTE.length],
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}