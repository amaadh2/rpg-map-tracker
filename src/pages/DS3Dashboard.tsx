import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type NodeRow = {
  node_id: number;
  name: string;
  subtype: string | null;
};

type DependencyRow = {
  dependency_id: number;
  game_id: number;
  node_id: number; 
  prerequisite_node_id: number; 
};

type StatusFilter = "all" | "completed" | "not_completed";

export default function DS3Dashboard() {
  const navigate = useNavigate();
  const GAME_ID = 3;

  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [deps, setDeps] = useState<DependencyRow[]>([]);
  const [error, setError] = useState<string>("");

  const [session, setSession] = useState<any>(null);
  const [completedNodes, setCompletedNodes] = useState<number[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedSubtypes, setSelectedSubtypes] = useState<Set<string>>(
    new Set()
  );

  const completedSet = useMemo(() => new Set(completedNodes), [completedNodes]);

  
  const prereqMap = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const d of deps) {
      const nodeId = Number(d.node_id);
      const preId = Number(d.prerequisite_node_id);
      if (!Number.isFinite(nodeId) || !Number.isFinite(preId)) continue;

      const arr = m.get(nodeId) ?? [];
      arr.push(preId);
      m.set(nodeId, arr);
    }
    return m;
  }, [deps]);

  
  const unlockedSet = useMemo(() => {
    const unlocked = new Set<number>();
    for (const n of nodes) {
      const prereqs = prereqMap.get(n.node_id) ?? [];
      if (prereqs.length === 0) {
        unlocked.add(n.node_id);
        continue;
      }
      const ok = prereqs.every((p) => completedSet.has(p));
      if (ok) unlocked.add(n.node_id);
    }
    return unlocked;
  }, [nodes, prereqMap, completedSet]);

  
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
    const loadNodes = async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select("node_id,name,subtype")
        .eq("game_id", GAME_ID)
        .order("node_id", { ascending: true });

      if (error) {
        setError(error.message);
        setNodes([]);
        return;
      }

      setNodes((data as NodeRow[]) || []);
    };

    loadNodes();
  }, []);

  
  useEffect(() => {
    const loadDeps = async () => {
      const { data, error } = await supabase
        .from("dependencies")
        .select("dependency_id,game_id,node_id,prerequisite_node_id")
        .eq("game_id", GAME_ID)
        .order("dependency_id", { ascending: true });

      if (error) {
        
        console.log("Deps load error:", error.message);
        setDeps([]);
        return;
      }

      setDeps(
        (data || []).map((r: any) => ({
          dependency_id: Number(r.dependency_id),
          game_id: Number(r.game_id),
          node_id: Number(r.node_id),
          prerequisite_node_id: Number(r.prerequisite_node_id),
        }))
      );
    };

    loadDeps();
  }, []);

  
  useEffect(() => {
    if (!session) return;

    const loadProgress = async () => {
      const nodeIds = nodes.map((n) => n.node_id);
      if (nodeIds.length === 0) {
        setCompletedNodes([]);
        return;
      }

      const { data, error } = await supabase
        .from("user_progress")
        .select("node_id")
        .eq("user_id", session.user.id)
        .eq("is_completed", true)
        .in("node_id", nodeIds);

      if (error) {
        setError(error.message);
        return;
      }

      setCompletedNodes(
        (data || [])
          .map((r: any) => Number(r.node_id))
          .filter((id: number) => Number.isFinite(id))
      );
    };

    loadProgress();
  }, [session, nodes]);

  const toggleNodeCompletion = async (nodeId: number) => {
    if (!session) {
      setError("You must be logged in to save progress.");
      return;
    }

    
    if (!unlockedSet.has(nodeId)) {
      setError("This quest is locked. Complete prerequisites first.");
      return;
    }

    const isCompleted = completedSet.has(nodeId);

    if (isCompleted) {
      const { error } = await supabase
        .from("user_progress")
        .update({ is_completed: false, completed_at: null })
        .eq("user_id", session.user.id)
        .eq("node_id", nodeId);

      if (error) {
        setError(error.message);
        return;
      }

      setCompletedNodes((prev) => prev.filter((id) => id !== nodeId));
    } else {
      const { error } = await supabase
        .from("user_progress")
        .upsert(
          {
            user_id: session.user.id,
            node_id: nodeId,
            is_completed: true,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,node_id" }
        );

      if (error) {
        setError(error.message);
        return;
      }

      setCompletedNodes((prev) =>
        prev.includes(nodeId) ? prev : [...prev, nodeId]
      );
    }
  };

  const subtypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      const st = (n.subtype ?? "").trim();
      if (st) set.add(st);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const restrictSubtypes = selectedSubtypes.size > 0;

    return nodes.filter((n) => {
      const isCompleted = completedSet.has(n.node_id);

      if (statusFilter === "completed" && !isCompleted) return false;
      if (statusFilter === "not_completed" && isCompleted) return false;

      if (q) {
        const hay = `${n.name} ${n.subtype ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (restrictSubtypes) {
        const st = (n.subtype ?? "").trim();
        if (!selectedSubtypes.has(st)) return false;
      }

      return true;
    });
  }, [nodes, search, statusFilter, selectedSubtypes, completedSet]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSelectedSubtypes(new Set());
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login")
  };

  const completionPct = useMemo(() => {
    if (!nodes.length) return 0;
    return Math.round((completedNodes.length / nodes.length) * 100);
  }, [nodes.length, completedNodes.length]);

  const bigCheckbox = "h-6 w-6 accent-green-600";

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      <header className="h-14 shrink-0 border-b bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold hover:opacity-80">
            RPG Map Tracker
          </Link>
          <div className="text-sm text-gray-500">Dark Souls III</div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/darksouls3"
            className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50"
          >
            Map
          </Link>
          <Link
            to="/darksouls3/statistics"
            className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50"
          >
            Statistics
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

      <div className="flex-1 min-h-0 p-4">
        {error && (
          <div className="mb-3 bg-red-100 text-red-800 px-4 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-lg font-semibold">Dashboard</div>
            <div className="text-sm text-gray-600">
              {completedNodes.length}/{nodes.length} completed ({completionPct}%)
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes..."
              className="text-sm px-3 py-2 border rounded outline-none focus:ring-2 focus:ring-gray-200"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-sm px-3 py-2 border rounded bg-white"
            >
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="not_completed">Not completed</option>
            </select>

            <button
              onClick={clearFilters}
              className="text-sm px-3 py-2 rounded border hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>

        {subtypeOptions.length > 0 && (
          <div className="mb-4 rounded border bg-white">
            <div className="px-3 py-2 border-b text-sm font-medium">
              Subtypes{" "}
              <span className="text-xs text-gray-500">
                {selectedSubtypes.size
                  ? `(${selectedSubtypes.size} selected)`
                  : "(all)"}
              </span>
            </div>

            <div className="max-h-36 overflow-auto p-3 flex flex-wrap gap-3">
              {subtypeOptions.map((st) => {
                const checked = selectedSubtypes.has(st);
                return (
                  <label
                    key={st}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className={bigCheckbox}
                      checked={checked}
                      onChange={() => {
                        setSelectedSubtypes((prev) => {
                          const next = new Set(prev);
                          if (next.has(st)) next.delete(st);
                          else next.add(st);
                          return next;
                        });
                      }}
                    />
                    <span className="max-w-[240px] truncate">{st}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {filteredNodes.length === 0 ? (
          <div className="text-sm text-gray-600">No nodes match.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredNodes.map((n) => {
              const isCompleted = completedSet.has(n.node_id);
              const isUnlocked = unlockedSet.has(n.node_id);

              return (
                <div
                  key={n.node_id}
                  className="bg-white border rounded p-3 flex items-start gap-3"
                >
                  <input
                    type="checkbox"
                    className={`${bigCheckbox} mt-0.5`}
                    checked={isCompleted}
                    disabled={!isUnlocked}
                    onChange={async () => {
                      if (!isUnlocked) {
                        setError(
                          "This quest is locked. Complete prerequisites first."
                        );
                        return;
                      }
                      await toggleNodeCompletion(n.node_id);
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {n.name} {!isUnlocked && " 🔒"}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {n.subtype ?? "—"}
                    </div>
                  </div>

                  {isCompleted && (
                    <div className="text-xs text-green-700 font-medium">✔</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}