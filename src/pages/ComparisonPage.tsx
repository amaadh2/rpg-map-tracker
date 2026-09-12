import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type NodeRow = {
  node_id: number;
  game_id: number;
  subtype: string | null;
  estimated_minutes: number | null;
};

type ProgressRow = {
  node_id: number;
  is_completed: boolean;
};

type GameKey = 1 | 2 | 3;

const GAMES: Array<{ id: GameKey; name: string; color: string }> = [
  { id: 1, name: "Elden Ring", color: "#0ea5e9" },   
  { id: 2, name: "Witcher 3", color: "#10b981" },    
  { id: 3, name: "Dark Souls 3", color: "#a855f7" }, 
];

function normaliseSubtype(subtype: string | null) {
  const s = (subtype ?? "").trim();
  return s.length ? s : "Uncategorised";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(completed: number, total: number) {
  if (!total) return 0;
  return (completed / total) * 100;
}

function fmtPercent(n: number) {
  if (!isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
}

function fmtMinutes(mins: number) {
  if (!isFinite(mins) || mins <= 0) return "0m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

export default function Comparison() {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [completedSet, setCompletedSet] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>("");

  const [selectedSubtype, setSelectedSubtype] = useState<string>("Main Questline");

  
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

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
          .select("node_id,game_id,subtype,estimated_minutes")
          .in("game_id", [1, 2, 3])
          .order("node_id", { ascending: true });

        if (nodeErr) throw nodeErr;

        const nodesData = (nodeRows as any[] | null)?.map((r) => ({
          node_id: Number(r.node_id),
          game_id: Number(r.game_id) as GameKey,
          subtype: r.subtype ?? null,
          estimated_minutes:
            r.estimated_minutes === null || r.estimated_minutes === undefined
              ? null
              : Number(r.estimated_minutes),
        })) as NodeRow[];

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
          setError(e?.message ?? "Failed to load comparison.");
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const subtypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) set.add(normaliseSubtype(n.subtype));
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));

    if (list.includes("Main Questline")) return ["Main Questline", ...list.filter((s) => s !== "Main Questline")];
    return list;
  }, [nodes]);

  
  useEffect(() => {
    if (subtypeOptions.length === 0) return;
    if (!subtypeOptions.includes(selectedSubtype)) {
      setSelectedSubtype(subtypeOptions[0]);
    }
    
  }, [subtypeOptions.join("|")]);

  /**
   * Aggregation:
   * subtype -> game_id -> { total, completed, remainingMinutes }
   */
  const agg = useMemo(() => {
    const m = new Map<
      string,
      Map<GameKey, { total: number; completed: number; remainingMinutes: number }>
    >();

    for (const st of subtypeOptions) {
      const inner = new Map<GameKey, { total: number; completed: number; remainingMinutes: number }>();
      for (const g of GAMES) inner.set(g.id, { total: 0, completed: 0, remainingMinutes: 0 });
      m.set(st, inner);
    }

    for (const n of nodes) {
      const st = normaliseSubtype(n.subtype);
      const inner = m.get(st);
      if (!inner) continue;

      const rec = inner.get(n.game_id as GameKey)!;
      rec.total += 1;

      const isDone = completedSet.has(n.node_id);
      if (isDone) {
        rec.completed += 1;
      } else {
        const mins = n.estimated_minutes ?? 0;
        if (isFinite(mins) && mins > 0) rec.remainingMinutes += mins;
      }
    }

    return m;
  }, [nodes, completedSet, subtypeOptions]);

  
  const selected = useMemo(() => {
    const inner = agg.get(selectedSubtype);
    const rows = GAMES.map((g) => {
      const rec = inner?.get(g.id) ?? { total: 0, completed: 0, remainingMinutes: 0 };
      return {
        gameId: g.id,
        gameName: g.name,
        color: g.color,
        total: rec.total,
        completed: rec.completed,
        percent: pct(rec.completed, rec.total),
        remainingMinutes: rec.remainingMinutes,
      };
    });
    return rows;
  }, [agg, selectedSubtype]);

  
  const tableRows = useMemo(() => {
    return subtypeOptions.map((st) => {
      const inner = agg.get(st)!;
      const byGame = GAMES.map((g) => {
        const rec = inner.get(g.id)!;
        return {
          gameId: g.id,
          percent: pct(rec.completed, rec.total),
          completed: rec.completed,
          total: rec.total,
          remainingMinutes: rec.remainingMinutes,
        };
      });

      
      const remainingTotal = byGame.reduce((sum, x) => sum + (x.total - x.completed), 0);

      return { st, byGame, remainingTotal };
    }).sort((a, b) => b.remainingTotal - a.remainingTotal || a.st.localeCompare(b.st));
  }, [subtypeOptions, agg]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login")
  };

  
  const chart = useMemo(() => {
    const width = 520;
    const height = 220;
    const padding = 30;
    const barW = 90;
    const gap = 55;

    const maxPct = 100;

    const bars = selected.map((r, i) => {
      const x = padding + i * (barW + gap);
      const h = (clamp(r.percent, 0, 100) / maxPct) * (height - padding * 2);
      const y = height - padding - h;
      return { ...r, x, y, w: barW, h };
    });

    return { width, height, padding, bars };
  }, [selected]);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      <header className="h-14 shrink-0 border-b bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold hover:opacity-80">
            RPG Map Tracker
          </Link>
          <div className="text-sm text-gray-500">Comparison</div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/eldenring" className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">
            Elden Ring
          </Link>
          <Link to="/witcher3" className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">
            Witcher 3
          </Link>
          <Link to="/darksouls3" className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">
            Dark Souls 3
          </Link>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          {session ? (
            <>
              <div className="hidden sm:block text-xs text-gray-500">{session.user?.email}</div>
              <button
                onClick={handleLogout}
                className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white hover:opacity-90"
              >
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white hover:opacity-90">
              Login
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 p-4 overflow-auto">
        {error && (
          <div className="mb-3 bg-red-100 text-red-800 px-4 py-2 rounded">{error}</div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-lg font-semibold">Game comparison</div>
            <div className="text-sm text-gray-600">
              Compare completion across all 3 games by subtype.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedSubtype}
              onChange={(e) => setSelectedSubtype(e.target.value)}
              className="text-sm px-3 py-2 border rounded bg-white"
              disabled={subtypeOptions.length === 0}
              title="Select a subtype to compare across games"
            >
              {subtypeOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {loading ? <div className="text-sm text-gray-500">Loading…</div> : null}
          </div>
        </div>

        {!session ? (
          <div className="text-sm text-gray-600">You need to be logged in to use comparison.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {selected.map((r) => (
                <div
                  key={r.gameId}
                  className="rounded-2xl border bg-white p-4"
                  style={{ borderTop: `4px solid ${r.color}` }}
                >
                  <div className="text-sm text-gray-600">{r.gameName}</div>
                  <div className="text-2xl font-semibold mt-1 text-gray-900">{fmtPercent(r.percent)}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {r.completed}/{r.total} completed
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Est. remaining: {fmtMinutes(r.remainingMinutes)}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border bg-white p-4 mt-6">
              <div className="font-semibold text-gray-900">
                {selectedSubtype} completion (3-game comparison)
              </div>

              <div className="mt-4 overflow-x-auto">
                <svg width={chart.width} height={chart.height} viewBox={`0 0 ${chart.width} ${chart.height}`}>
                
                  <line x1={chart.padding} y1={chart.height - chart.padding} x2={chart.width - chart.padding} y2={chart.height - chart.padding} stroke="#e5e7eb" />
                  <line x1={chart.padding} y1={chart.padding} x2={chart.padding} y2={chart.height - chart.padding} stroke="#e5e7eb" />

                  {[0, 50, 100].map((v) => {
                    const y = chart.height - chart.padding - (v / 100) * (chart.height - chart.padding * 2);
                    return (
                      <g key={v}>
                        <line x1={chart.padding} y1={y} x2={chart.width - chart.padding} y2={y} stroke="#f3f4f6" />
                        <text x={8} y={y + 4} fontSize="10" fill="#6b7280">{v}%</text>
                      </g>
                    );
                  })}

                  {chart.bars.map((b) => (
                    <g key={b.gameId}>
                      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={b.color} opacity={0.9} />
                      <text x={b.x + b.w / 2} y={b.y - 8} textAnchor="middle" fontSize="11" fill="#111827">
                        {fmtPercent(b.percent)}
                      </text>
                      <text
                        x={b.x + b.w / 2}
                        y={chart.height - chart.padding + 18}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#374151"
                      >
                        {b.gameName}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-4 mt-6">
              <div className="font-semibold text-gray-900">All subtypes (3-game comparison)</div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">Subtype</th>
                      {GAMES.map((g) => (
                        <th key={g.id} className="py-2 pr-3">
                          {g.name}
                        </th>
                      ))}
                      
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.st} className="border-t">
                        <td className="py-2 pr-3 text-gray-900">{row.st}</td>

                        {row.byGame.map((gStat) => (
                          <td key={gStat.gameId} className="py-2 pr-3">
                            <div className="tabular-nums text-gray-900">{fmtPercent(gStat.percent)}</div>
                            <div className="text-xs text-gray-500 tabular-nums">
                              {gStat.completed}/{gStat.total} • rem {fmtMinutes(gStat.remainingMinutes)}
                            </div>
                          </td>
                        ))}

                      
                      </tr>
                    ))}

                    {tableRows.length === 0 ? (
                      <tr className="border-t">
                        <td className="py-3 text-gray-500" colSpan={5}>
                          No data found (check node subtypes + game_ids 1/2/3).
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}