import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); 
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Account created successfully.");
      setTimeout(() => {
        navigate("/");
      }, 500);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 shrink-0 border-b bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold hover:opacity-80">
            RPG Map Tracker
          </Link>
          <div className="text-sm text-gray-500">Sign Up</div>
        </div>

        <button
          onClick={() => navigate("/login")}
          className="text-sm text-blue-600 hover:underline"
        >
          Login
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <form
          onSubmit={handleSignUp}
          className="bg-white p-8 rounded shadow-md w-96"
        >
          <h2 className="text-2xl font-bold mb-6 text-center">Sign Up</h2>

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
          <input
            type="password"
            placeholder="Confirm Password"
            className="w-full mb-4 p-2 border rounded"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            className="w-full bg-green-600 text-white p-2 rounded"
          >
            Create Account
          </button>

          {message && (
            <p className="mt-4 text-center text-sm text-red-600">
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}