// Getting in: start a household, join one with its invite code, or sign in
// on another device with a one-time code.
import { useState } from "react";
import { api, setToken } from "./api.js";
import { PetPicker } from "./components.jsx";

export default function Welcome({ atlas, onIn }) {
  const fromLink = new URLSearchParams(location.search).get("join") || "";
  const [mode, setMode] = useState(fromLink ? "join" : "start");
  const [f, setF] = useState({ householdName: "", code: fromLink, name: "", petName: "", species: "cat", color: "cream", device: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const pet = { name: f.name, petName: f.petName, species: f.species, color: f.color };
      const { token } =
        mode === "start"
          ? await api("POST", "/api/households", { ...pet, householdName: f.householdName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
          : mode === "join"
            ? await api("POST", "/api/households/join", { ...pet, code: f.code })
            : await api("POST", "/api/device", { code: f.device });
      setToken(token);
      history.replaceState(null, "", "/");
      onIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="welcome">
      <h1>🏠 RoomiePet</h1>
      <p className="lede">Share the chores, and each of you raises a little pet that thrives when you get yours done.</p>
      <div className="tabs" role="tablist">
        {[["start", "Start a household"], ["join", "Join with a code"], ["device", "I'm already in"]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>
            {label}
          </button>
        ))}
      </div>
      <form className="card form" onSubmit={submit}>
        {mode === "device" ? (
          <>
            <p>On the phone you already use, go to <b>House → Add another device</b> and enter the code it shows.</p>
            <label>
              Device code
              <input value={f.device} onChange={set("device")} placeholder="ABCD2345" autoCapitalize="characters" required />
            </label>
          </>
        ) : (
          <>
            {mode === "start" ? (
              <label>
                Household name
                <input value={f.householdName} onChange={set("householdName")} maxLength={40} placeholder="Flat 4B" required />
              </label>
            ) : (
              <label>
                Invite code
                <input value={f.code} onChange={set("code")} placeholder="K7PQ2M" autoCapitalize="characters" required />
              </label>
            )}
            <label>
              Your name
              <input value={f.name} onChange={set("name")} maxLength={30} placeholder="Sam" required />
            </label>
            <fieldset>
              <legend>Your pet</legend>
              <PetPicker atlas={atlas} value={{ species: f.species, color: f.color }} onChange={(v) => setF({ ...f, ...v })} />
            </fieldset>
            <label>
              Its name
              <input value={f.petName} onChange={set("petName")} maxLength={24} placeholder="Mochi" required />
            </label>
            <p className="hint">It starts as an egg. Your first chore hatches it.</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {mode === "start" ? "Start" : mode === "join" ? "Move in" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
