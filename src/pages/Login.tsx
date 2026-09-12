import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Logged in successfully!");
      navigate("/");
    }
   };

  return (
    <div className="min-h-screen flex flex-col">
    
      <header className="h-14 shrink-0 border-b bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold hover:opacity-80">
            RPG Map Tracker
          </Link>
          <div className="text-sm text-gray-500">Login</div>
        </div>
      </header>

 
      {session ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <h2 className="text-2xl mb-4">
            Logged in as: {session.user.email}
          </h2>

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/");
            }}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-100">
          <form
            onSubmit={handleLogin}
            className="bg-white p-8 rounded shadow-md w-96"
          >
            <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>

            <input
              type="email"
              placeholder="Email"
              className="w-full mb-4 p-2 border rounded"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full mb-4 p-2 border rounded"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button
              type="submit"
              className="w-full bg-blue-600 text-white p-2 rounded mb-2"
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="w-full bg-gray-600 text-white p-2 rounded"
            >
              Sign Up
            </button>

            {message && (
              <p className="mt-4 text-center text-sm text-red-600">
                {message}
              </p>
              )}
            </form>
          </div>
        )}
      </div>
    );
  }