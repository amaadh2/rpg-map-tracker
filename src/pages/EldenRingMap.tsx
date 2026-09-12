import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MapContainer,
  ImageOverlay,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L, { type LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../lib/supabaseClient";

const imgUrl = "/maps/er.jpeg";

const bounds: [[number, number], [number, number]] = [
  [0, 0],
  [5000, 5000],
];

type NodeRow = {
  node_id: number;
  name: string;
  subtype: string | null;
  map_x: number | null;
  map_y: number | null;

 
  is_required?: number | null;
  estimated_minutes?: number | null;
};

type DependencyRow = {
  dependency_id: number;
  game_id: number;
  node_id: number; 
  prerequisite_node_id: number; 
};

const initialCenter: [number, number] = [2500, 2500];
const initialZoom = -1;

function MapClickLogger() {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      console.log("Clicked coords [y,x]:", e.latlng);
    },
  });
  return null;
}

type StatusFilter = "all" | "completed" | "not_completed";

type FocusState = {
  y: number;
  x: number;
  zoom: number;
  nodeId: number;
  seq: number;
};

function MapFocusController({
  focus,
  sidebarWidthPx,
}: {
  focus: FocusState | null;
  sidebarWidthPx: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;

    const zoom = focus.zoom;
    const markerLatLng = L.latLng(focus.y, focus.x);

    const size = map.getSize();

    const desiredPoint = L.point(
      sidebarWidthPx + (size.x - sidebarWidthPx) / 2,
      size.y / 2
    );

    const markerPoint = map.project(markerLatLng, zoom);
    const centerPoint = markerPoint
      .subtract(desiredPoint)
      .add(size.divideBy(2));

    const newCenterLatLng = map.unproject(centerPoint, zoom);

    map.flyTo(newCenterLatLng, zoom, {
      animate: true,
      duration: 0.55,
    });
  }, [focus?.seq, map, sidebarWidthPx]);

  return null;
}

function NodeMarker({
  node,
  isCompleted,
  isSelected,
  isUnlocked,
  smallIcon,
  completedIcon,
  onToggle,
  onSelect,
  bigCheckboxClass,
}: {
  node: NodeRow;
  isCompleted: boolean;
  isSelected: boolean;
  isUnlocked: boolean;
  smallIcon: L.Icon;
  completedIcon: L.Icon;
  onToggle: (nodeId: number) => Promise<void>;
  onSelect: (node: NodeRow) => void;
  bigCheckboxClass: string;
}) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!isSelected) return;
    const t = window.setTimeout(() => {
      markerRef.current?.openPopup();
    }, 80);
    return () => window.clearTimeout(t);
  }, [isSelected]);

  const x = Number(node.map_x);
  const y = Number(node.map_y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return (
    <Marker
      position={[y, x]}
      icon={isCompleted ? completedIcon : smallIcon}
      ref={(m) => {
        markerRef.current = (m as any) ?? null;
      }}
      eventHandlers={{
        click: () => onSelect(node),
      }}
    >
      <Popup autoPan={false} closeButton={true}>
        <div className="font-semibold mb-1">{node.name}</div>

        {node.subtype && (
          <div className="text-sm text-gray-600 mb-2">• {node.subtype}</div>
        )}

        {!isUnlocked && (
          <div className="mb-2 text-xs text-gray-600">
            🔒 Locked — complete prerequisites first
          </div>
        )}

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className={bigCheckboxClass}
            checked={isCompleted}
            disabled={!isUnlocked}
            onChange={async () => {
              if (!isUnlocked) return;
              await onToggle(node.node_id);
            }}
          />
          Mark as completed
        </label>

        {isCompleted && (
          <div className="mt-2 text-green-600 text-sm font-medium">
            ✔ Completed
          </div>
        )}
      </Popup>
    </Marker>
  );
}

export default function EldenRingMap() {
  const navigate = useNavigate();
  const GAME_ID = 1;

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

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [focus, setFocus] = useState<FocusState | null>(null);

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

  // recommendations
  const recommendedNode = useMemo(() => {
    const candidates = nodes
      .filter((n) => !completedSet.has(n.node_id))
      .filter((n) => unlockedSet.has(n.node_id));

    if (candidates.length === 0) return null;

    const prereqCount = (nodeId: number) =>
      (prereqMap.get(nodeId) ?? []).length;

    const normReq = (v: any) => (Number(v) === 1 ? 1 : 0);
    const normMin = (v: any) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 999999;
    };

    candidates.sort((a, b) => {
      const req = normReq(b.is_required) - normReq(a.is_required);
      if (req !== 0) return req;

      const dep = prereqCount(a.node_id) - prereqCount(b.node_id);
      if (dep !== 0) return dep;

      const mins = normMin(a.estimated_minutes) - normMin(b.estimated_minutes);
      if (mins !== 0) return mins;

      return a.name.localeCompare(b.name);
    });

    return candidates[0];
  }, [nodes, completedSet, unlockedSet, prereqMap]);

  const smallIcon = useMemo(
    () =>
      L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [28, 40],
        iconAnchor: [9, 30],
        popupAnchor: [0, -28],
        shadowSize: [30, 30],
      }),
    []
  );

  const completedIcon = useMemo(
    () =>
      L.icon({
        iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -28],
      }),
    []
  );

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
    const load = async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select(
          "node_id,name,subtype,map_x,map_y,is_required,estimated_minutes"
        )
        .eq("game_id", GAME_ID)
        .not("map_x", "is", null)
        .not("map_y", "is", null)
        .order("node_id", { ascending: true });

      if (error) {
        setError(error.message);
        setNodes([]);
        return;
      }

      setNodes((data as NodeRow[]) || []);
    };

    load();
  }, []);

 
  useEffect(() => {
    const loadDeps = async () => {
      const { data, error } = await supabase
        .from("dependencies")
        .select("dependency_id,game_id,node_id,prerequisite_node_id")
        .eq("game_id", GAME_ID)
        .order("dependency_id", { ascending: true });

      if (error) {
        setError(error.message);
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

  // user progress
  useEffect(() => {
    if (!session) return;

    const loadProgress = async () => {
      const { data, error } = await supabase
        .from("user_progress")
        .select("node_id")
        .eq("user_id", session.user.id)
        .eq("is_completed", true);

      if (error) {
        console.log("Progress load error:", error.message);
        return;
      }

      setCompletedNodes(
        (data || [])
          .map((row: any) => Number(row.node_id))
          .filter((id: number) => Number.isFinite(id))
      );
    };

    loadProgress();
  }, [session]);

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
      if (n.subtype && n.subtype.trim()) set.add(n.subtype.trim());
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

  const focusOnNode = (n: NodeRow) => {
    const x = Number(n.map_x);
    const y = Number(n.map_y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    setSelectedNodeId(n.node_id);

    setFocus((prev) => ({
      x,
      y,
      zoom: 0.5,
      nodeId: n.node_id,
      seq: (prev?.seq ?? 0) + 1,
    }));
  };

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
  const SIDEBAR_WIDTH_PX = 340;

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      <header className="h-14 shrink-0 border-b bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold hover:opacity-80">
            RPG Map Tracker
          </Link>
          <div className="text-sm text-gray-500">Elden Ring</div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/eldenring/dashboard"
            className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50"
          >
            Dashboard
          </Link>
          <Link
            to="/eldenring/statistics"
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

      <div className="flex flex-1 min-h-0">
        <aside className="w-[340px] max-w-[90vw] border-r bg-white flex flex-col min-h-0">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Nodes</div>
              <div className="text-xs text-gray-500">
                {completedNodes.length}/{nodes.length} ({completionPct}%)
              </div>
            </div>

            {recommendedNode && (
              <div className="mt-2 p-2 rounded border bg-gray-50">
                <div className="text-xs text-gray-500">Recommended next</div>
                <button
                  className="text-sm font-medium hover:underline"
                  onClick={() => focusOnNode(recommendedNode)}
                  title="Focus on recommended quest"
                >
                  {recommendedNode.name}
                </button>
                <div className="text-xs text-gray-500">
                  {Number(recommendedNode.is_required) === 1
                    ? "Required"
                    : "Optional"}
                  {" • "}
                  {Number.isFinite(Number(recommendedNode.estimated_minutes))
                    ? `${Number(recommendedNode.estimated_minutes)} min`
                    : "—"}
                </div>
              </div>
            )}

            <div className="mt-3 space-y-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search nodes..."
                className="w-full text-sm px-3 py-2 border rounded outline-none focus:ring-2 focus:ring-gray-200"
              />

              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                  className="w-full text-sm px-3 py-2 border rounded bg-white"
                >
                  <option value="all">All</option>
                  <option value="completed">Completed</option>
                  <option value="not_completed">Not completed</option>
                </select>

                <button
                  onClick={clearFilters}
                  className="text-sm px-3 py-2 rounded border hover:bg-gray-50"
                  title="Clear filters"
                >
                  Reset
                </button>
              </div>

              {subtypeOptions.length > 0 && (
                <details className="rounded border">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm">
                    Subtypes{" "}
                    <span className="text-xs text-gray-500">
                      {selectedSubtypes.size
                        ? `(${selectedSubtypes.size} selected)`
                        : "(all)"}
                    </span>
                  </summary>
                  <div className="max-h-40 overflow-auto px-3 pb-2">
                    {subtypeOptions.map((st) => {
                      const checked = selectedSubtypes.has(st);
                      return (
                        <label
                          key={st}
                          className="flex items-center gap-2 py-1 text-sm cursor-pointer"
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
                          <span className="truncate">{st}</span>
                        </label>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {filteredNodes.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No nodes match.</div>
            ) : (
              <ul className="divide-y">
                {filteredNodes.map((n) => {
                  const isCompleted = completedSet.has(n.node_id);
                  const isSelected = selectedNodeId === n.node_id;
                  const isUnlocked = unlockedSet.has(n.node_id);

                  return (
                    <li
                      key={n.node_id}
                      className={`px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                        isSelected ? "bg-gray-100" : ""
                      }`}
                      onClick={() => focusOnNode(n)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className={`${bigCheckbox} mt-0.5`}
                          checked={isCompleted}
                          disabled={!isUnlocked}
                          onClick={(e) => e.stopPropagation()}
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
                          <div className="text-sm font-medium truncate">
                            {n.name} {!isUnlocked && " 🔒"}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {n.subtype ?? "—"}
                          </div>
                        </div>

                        {isCompleted && (
                          <div className="text-xs text-green-700 font-medium">
                            ✔
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 relative">
          {error && (
            <div className="absolute z-[999] top-4 left-4 bg-red-100 text-red-800 px-4 py-2 rounded">
              {error}
            </div>
          )}

          <MapContainer
            crs={L.CRS.Simple}
            bounds={bounds}
            center={initialCenter}
            zoom={initialZoom}
            minZoom={-3}
            maxZoom={1}
            zoomControl={true}
            className="h-full w-full"
            style={{ height: "100%", width: "100%" }}
          >
            <MapClickLogger />
            <ImageOverlay url={imgUrl} bounds={bounds} />

            <MapFocusController focus={focus} sidebarWidthPx={SIDEBAR_WIDTH_PX} />

            {filteredNodes.map((n) => {
              const isCompleted = completedSet.has(n.node_id);
              const isSelected = selectedNodeId === n.node_id;
              const isUnlocked = unlockedSet.has(n.node_id);

              return (
                <NodeMarker
                  key={n.node_id}
                  node={n}
                  isCompleted={isCompleted}
                  isSelected={isSelected}
                  isUnlocked={isUnlocked}
                  smallIcon={smallIcon}
                  completedIcon={completedIcon}
                  onToggle={toggleNodeCompletion}
                  onSelect={(node) => focusOnNode(node)}
                  bigCheckboxClass={bigCheckbox}
                />
              );
            })}
          </MapContainer>
        </main>
      </div>
    </div>
  );
}