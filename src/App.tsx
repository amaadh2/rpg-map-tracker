import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import EldenRingMap from "./pages/EldenRingMap.tsx";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp.tsx";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient.ts";
import DS3Map from "./pages/DS3Map.tsx";
import TW3Map from "./pages/TW3.tsx";
import EldenRingDashboard from "./pages/EldenRingDashboard.tsx";
import EldenRingStatistics from "./pages/EldenRingStatistics.tsx";
import DS3Dashboard from "./pages/DS3Dashboard.tsx";
import DS3Statistics from "./pages/DS3Statistics.tsx";
import TW3Dashboard from "./pages/TW3Dashboard.tsx";
import TW3Statistics from "./pages/TW3Statistics.tsx";
import ComparisonPage from "./pages/ComparisonPage.tsx";

function Home() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  const games = [
    {
      name: "Elden Ring",
      basePath: "/eldenring",
      accent: "#0ea5e9",
      desc: "Interactive map, dashboards and stats for completion tracking.",
    },
    {
      name: "The Witcher 3",
      basePath: "/witcher3",
      accent: "#10b981",
      desc: "Track progress by subtype and estimate what’s left.",
    },
    {
      name: "Dark Souls 3",
      basePath: "/darksouls3",
      accent: "#a855f7",
      desc: "Fast navigation between map, dashboard and statistics.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="h-14 shrink-0 border-b bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold hover:opacity-80">
            RPG Map Tracker
          </Link>
          <div className="text-sm text-gray-500">Home</div>
        </div>

        <div className="flex items-center gap-2">
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
              <Link
                to="/login"
                className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white hover:opacity-90"
              >
                Account
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white hover:opacity-90"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 px-6 py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 rounded-3xl border bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-3">
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-gray-900">
                  RPG Map Tracker
                </h1>
                <p className="text-gray-600 text-base md:text-lg max-w-3xl">
                  Track completion using interactive maps, dashboards and statistics.
                  Then compare progress across games in one place.
                </p>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Link
                    to="/eldenring"
                    className="text-sm px-4 py-2 rounded-xl bg-gray-900 text-white hover:opacity-90"
                  >
                    Open Elden Ring
                  </Link>
                  <Link
                    to="/comparison"
                    className="text-sm px-4 py-2 rounded-xl border hover:bg-gray-50"
                  >
                    Open Comparison
                  </Link>
                  {!session ? (
                    <Link
                      to="/signup"
                      className="text-sm px-4 py-2 rounded-xl border hover:bg-gray-50"
                    >
                      Create Account
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">Maps</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Filter nodes, focus markers, tick completion.
                  </div>
                </div>
                <div className="rounded-2xl border bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">Dashboards</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Macro progress overview and remaining content.
                  </div>
                </div>
                <div className="rounded-2xl border bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">Statistics</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Subtype and collectible breakdowns with charts.
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-4 rounded-3xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Quick access</div>
                <div className="text-xs text-gray-500">Common pages</div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <Link
                  to="/eldenring/dashboard"
                  className="rounded-2xl border p-4 hover:bg-gray-50 transition"
                >
                  <div className="text-sm font-semibold text-gray-900">Elden Ring Dashboard</div>
                  <div className="text-xs text-gray-500 mt-1">Progress overview</div>
                </Link>

                <Link
                  to="/witcher3/dashboard"
                  className="rounded-2xl border p-4 hover:bg-gray-50 transition"
                >
                  <div className="text-sm font-semibold text-gray-900">Witcher 3 Dashboard</div>
                  <div className="text-xs text-gray-500 mt-1">Completion breakdown</div>
                </Link>

                <Link
                  to="/darksouls3/dashboard"
                  className="rounded-2xl border p-4 hover:bg-gray-50 transition"
                >
                  <div className="text-sm font-semibold text-gray-900">Dark Souls 3 Dashboard</div>
                  <div className="text-xs text-gray-500 mt-1">Stats at a glance</div>
                </Link>

                <Link
                  to="/comparison"
                  className="rounded-2xl border p-4 hover:bg-gray-50 transition"
                >
                  <div className="text-sm font-semibold text-gray-900">Comparison</div>
                  <div className="text-xs text-gray-500 mt-1">3-game side-by-side view</div>
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-6">
            <div className="flex items-end justify-between gap-4 mb-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Games</div>
                <div className="text-sm text-gray-600">
                  Open map, dashboard or statistics for each title.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {games.map((g) => (
                <div
                  key={g.name}
                  className="rounded-3xl border bg-white p-6 shadow-sm"
                  style={{ borderTop: `5px solid ${g.accent}` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">{g.name}</div>
                      <div className="text-sm text-gray-600 mt-1">{g.desc}</div>
                    </div>
                    <div
                      className="w-10 h-10 rounded-2xl"
                      style={{ backgroundColor: `${g.accent}22` }}
                      title="Accent"
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <Link
                      to={`${g.basePath}`}
                      className="text-sm px-3 py-2 rounded-xl border text-center hover:bg-gray-50"
                    >
                      Map
                    </Link>
                    <Link
                      to={`${g.basePath}/dashboard`}
                      className="text-sm px-3 py-2 rounded-xl border text-center hover:bg-gray-50"
                    >
                      Dashboard
                    </Link>
                    <Link
                      to={`${g.basePath}/statistics`}
                      className="text-sm px-3 py-2 rounded-xl border text-center hover:bg-gray-50"
                    >
                      Statistics
                    </Link>
                  </div>

                  <div className="mt-4 rounded-2xl border bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Recommended</div>
                    <div className="text-sm text-gray-900 mt-1">
                      Use statistics to spot weaker subtypes quickly.
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 rounded-3xl border bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-gray-900">
                Compare progress across all 3 games
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Side-by-side completion by subtype, plus estimated remaining time.
              </div>
            </div>

            <Link
              to="/comparison"
              className="text-sm px-5 py-2.5 rounded-xl bg-gray-900 text-white hover:opacity-90 w-fit"
            >
              Open Comparison
            </Link>
          </div>

          <div className="py-8 text-center text-xs text-gray-400">
            RPG Map Tracker • Interactive maps • Progress analytics
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/eldenring" element={<EldenRingMap />} />
        <Route path="/darksouls3" element={<DS3Map />} />
        <Route path="/witcher3" element={<TW3Map />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/eldenring/dashboard" element={<EldenRingDashboard />} />
        <Route path="/eldenring/statistics" element={<EldenRingStatistics />} />
        <Route path="/darksouls3/dashboard" element={<DS3Dashboard />} />
        <Route path="/darksouls3/statistics" element={<DS3Statistics />} />
        <Route path="/witcher3/dashboard" element={<TW3Dashboard />} />
        <Route path="/witcher3/statistics" element={<TW3Statistics />} />
        <Route path="/comparison" element={<ComparisonPage />} />
      </Routes>
    </BrowserRouter>
  );
}