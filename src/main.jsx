import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter, Link, Navigate, NavLink, Route, Routes,
  useLocation, useNavigate, useParams
} from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase, hiddenEmail, authPassword } from "./supabase";
import "./styles.css";

const TALKS = [
  {
    number: 1,
    title: "God's Love",
    prompt: "How did this talk change or deepen your understanding of God's love for you?",
    verse: "1 John 4:19",
    verseText: "We love because He first loved us."
  },
  {
    number: 2,
    title: "Who Is Jesus Christ?",
    prompt: "Who is Jesus to you now, and how do you want to respond to Him?",
    verse: "John 14:6",
    verseText: "Jesus is the way, the truth, and the life."
  },
  {
    number: 3,
    title: "Repentance and Faith",
    prompt: "What area of your life do you feel called to surrender or change?",
    verse: "1 John 1:9",
    verseText: "When we confess, God is faithful to forgive and cleanse us."
  },
  {
    number: 4,
    title: "Loving God and Neighbor",
    prompt: "How can you show love to God and the people around you this week?",
    verse: "Mark 12:30–31",
    verseText: "Love God fully, and love your neighbor as yourself."
  },
  {
    number: 5,
    title: "The Christian Family",
    prompt: "What can you do to help build a more Christ-centered family or relationship?",
    verse: "Joshua 24:15",
    verseText: "As for me and my household, we will serve the Lord."
  },
  {
    number: 6,
    title: "Empowered by the Holy Spirit",
    prompt: "In what part of your life do you need the guidance or strength of the Holy Spirit?",
    verse: "Acts 1:8",
    verseText: "You will receive power when the Holy Spirit comes upon you."
  },
  {
    number: 7,
    title: "Growing in the Spirit",
    prompt: "What spiritual habit do you want to begin or strengthen?",
    verse: "Philippians 1:6",
    verseText: "God will carry His good work in you to completion."
  },
  {
    number: 8,
    title: "Transformation in Christ",
    prompt: "How has the CLP changed you, and how will you continue your journey with Christ?",
    verse: "Romans 12:2",
    verseText: "Be transformed by the renewing of your mind."
  }
];

const AuthContext = createContext(null);
const DataContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function useData() {
  return useContext(DataContext);
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(user) {
    if (!user) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    setProfile(data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        try {
          await loadProfile(data.session.user);
        } catch (error) {
          console.error(error);
        }
      }
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        try {
          await loadProfile(nextSession.user);
        } catch (error) {
          console.error(error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function login(username, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email: hiddenEmail(username),
      password: authPassword(password)
    });
    if (error) throw error;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user);
  }

  return (
    <AuthContext.Provider value={{
      user: session?.user ?? null,
      session,
      profile,
      loading,
      login,
      logout,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

function DataProvider({ children }) {
  const { user, profile, session } = useAuth();
  const [entries, setEntries] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!user) {
      setEntries([]);
      setQrCodes([]);
      setProfiles([]);
      return;
    }

    setLoading(true);

    const entriesQuery = profile?.role === "admin"
      ? supabase.from("journey_entries").select("*").order("completed_at", { ascending: false })
      : supabase.from("journey_entries").select("*").eq("user_id", user.id).order("talk_number");

    const promises = [entriesQuery];

    if (profile?.role === "admin") {
      promises.push(
        supabase.from("qr_codes").select("*").order("talk_number"),
        supabase.from("profiles").select("*").order("full_name")
      );
    }

    const results = await Promise.all(promises);
    setEntries(results[0].data ?? []);

    if (profile?.role === "admin") {
      setQrCodes(results[1].data ?? []);
      setProfiles(results[2].data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, [user?.id, profile?.role]);

  async function validateQr(token) {
    const { data, error } = await supabase
      .from("qr_codes")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !data) throw new Error("This QR code is invalid.");
    if (!data.is_active) throw new Error("This QR code is not active.");

    const now = new Date();

    if (data.opens_at && now < new Date(data.opens_at)) {
      throw new Error("This QR code is not open yet.");
    }

    if (data.closes_at && now > new Date(data.closes_at)) {
      throw new Error("The scanning period has ended.");
    }

    return data;
  }

  async function saveReflection(talk, reflection, response, token) {
    const { data: existing } = await supabase
      .from("journey_entries")
      .select("talk_number")
      .eq("user_id", user.id);

    const completed = existing ?? [];

    if (completed.some((entry) => Number(entry.talk_number) === talk.number)) {
      throw new Error("You already completed this talk.");
    }

    if (
      talk.number > 1 &&
      !completed.some((entry) => Number(entry.talk_number) === talk.number - 1)
    ) {
      throw new Error("Please complete the previous talk first.");
    }

    const { error } = await supabase.from("journey_entries").insert({
      user_id: user.id,
      talk_number: talk.number,
      reflection,
      encouragement_message: response.message,
      encouragement_verse: talk.verse,
      encouragement_verse_text: talk.verseText,
      qr_token: token
    });

    if (error) throw error;
    await refresh();
  }

  async function updateProfile(values) {
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: values.full_name.trim(),
        bio: values.bio.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id);

    if (error) throw error;
  }

  async function createParticipant(values) {
    const response = await fetch("/api/admin-create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`
      },
      body: JSON.stringify(values)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to create participant.");
    await refresh();
  }


  async function adminParticipantAction(action, participantId) {
    if (profile?.role !== "admin") {
      throw new Error("Only Admins can manage Participant accounts.");
    }

    const response = await fetch("/api/admin-manage-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`
      },
      body: JSON.stringify({ action, participant_id: participantId })
    });

    const responseText = await response.text();
    let result = {};

    if (responseText) {
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`The server returned an invalid response (${response.status}).`);
      }
    }

    if (!response.ok) {
      throw new Error(result.error || `Unable to ${action} participant (${response.status}).`);
    }

    await refresh();
    return result;
  }

  async function resetParticipantJourney(participantId) {
    return adminParticipantAction("reset_journey", participantId);
  }

  async function deleteParticipant(participantId) {
    return adminParticipantAction("delete_participant", participantId);
  }

  async function generateQr(talkNumber, opensAt, closesAt) {
    if (profile?.role !== "admin") throw new Error("Only Admins can generate QR codes.");

    await supabase
      .from("qr_codes")
      .update({ is_active: false })
      .eq("talk_number", talkNumber);

    const token = `EMBER-${talkNumber}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;

    const { error } = await supabase.from("qr_codes").insert({
      talk_number: talkNumber,
      token,
      is_active: true,
      opens_at: opensAt || null,
      closes_at: closesAt || null,
      created_by: user.id
    });

    if (error) throw error;
    await refresh();
  }

  async function toggleQr(qr) {
    if (profile?.role !== "admin") throw new Error("Only Admins can manage QR codes.");

    const { error } = await supabase
      .from("qr_codes")
      .update({ is_active: !qr.is_active })
      .eq("id", qr.id);

    if (error) throw error;
    await refresh();
  }

  const myEntries = entries
    .filter((entry) => entry.user_id === user?.id)
    .sort((a, b) => Number(a.talk_number) - Number(b.talk_number));

  return (
    <DataContext.Provider value={{
      entries,
      myEntries,
      qrCodes,
      profiles,
      loading,
      refresh,
      validateQr,
      saveReflection,
      updateProfile,
      createParticipant,
      resetParticipantJourney,
      deleteParticipant,
      generateQr,
      toggleQr
    }}>
      {children}
    </DataContext.Provider>
  );
}

function Protected({ children, admin = false }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && profile?.role !== "admin") return <Navigate to="/journey" replace />;

  return children;
}

function Loading() {
  return (
    <div className="center-screen">
      <div className="spinner" />
      <p>Preparing your journey…</p>
    </div>
  );
}

function Layout({ children }) {
  const { profile, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/journey" className="brand">
          <img src="/flame-no-cross.png" alt="" />
          <span>EMBER <b>Journey</b></span>
        </Link>

        <nav>
          <NavLink to="/journey">Journey</NavLink>
          <NavLink to="/reflections">Reflections</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          {profile?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
        </nav>

        <button className="text-button" onClick={logout}>Sign out</button>
      </header>

      <main>{children}</main>

      <div className="mobile-nav">
        <NavLink to="/journey">Journey</NavLink>
        <NavLink to="/reflections">Reflections</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        {profile?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
      </div>
    </div>
  );
}

function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const destination = location.state?.from ?? "/journey";

  if (user) return <Navigate to={destination} replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");

    try {
      await login(form.username, form.password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="embers" />
        <img src="/flame-no-cross.png" alt="EMBER flame" />
        <p>Eight talks. Eight reflections. One transformed journey.</p>
      </section>

      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">Welcome to</span>
        <h1>EMBER Journey</h1>
        <p>Sign in using the username and password provided by your Team Leader.</p>

        <label>
          Username
          <input
            required
            autoComplete="username"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
          />
        </label>

        <label>
          Password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>

        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit">Continue your journey</button>
      </form>
    </div>
  );
}

function Journey() {
  const { profile } = useAuth();
  const { myEntries } = useData();
  const completed = myEntries.length;
  const nextTalk = TALKS[Math.min(completed, 7)];

  return (
    <Layout>
      <section className="hero">
        <div>
          <span className="eyebrow">Your spiritual journey</span>
          <h1>Keep the ember alive, {profile?.full_name?.split(" ")[0] ?? "friend"}.</h1>
          <p>Each meaningful reflection reveals another part of the flame. The cross appears after your eighth talk.</p>
        </div>
        <div className="progress-pill">{completed} / 8 completed</div>
      </section>

      <section className="journey-grid">
        <FlameProgress completed={completed} />

        <div className="journey-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Current step</span>
              <h2>{completed === 8 ? "Journey completed" : `Talk ${nextTalk.number}: ${nextTalk.title}`}</h2>
            </div>
          </div>

          {completed === 8 ? (
            <div className="completion-copy">
              <h3>Your Ember is fully ignited.</h3>
              <p>You completed all eight talks. Continue allowing Christ to transform your daily choices, relationships, and service.</p>
              <Link className="primary link-button" to="/reflections">Review your reflections</Link>
            </div>
          ) : (
            <>
              <p>Scan the QR code presented after the talk using your phone camera. The QR link will return you here for your reflection.</p>
              <div className="hint-card">
                <b>Scan-first flow</b>
                <span>Camera → QR link → Sign in → Reflection → Unlock</span>
              </div>
            </>
          )}

          <div className="talk-dots">
            {TALKS.map((talk) => (
              <div className={talk.number <= completed ? "done" : ""} key={talk.number}>
                <span>{talk.number <= completed ? "✓" : talk.number}</span>
                <small>{talk.title}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}

function FlameProgress({ completed, compact = false }) {
  const percent = Math.min(completed, 7) / 7 * 100;

  return (
    <div className={`flame-stage ${compact ? "compact" : ""} ${completed === 8 ? "finale" : ""}`}>
      <div className="flame-art">
        <img className="flame-ghost" src="/flame-no-cross.png" alt="" />
        <div className="flame-reveal" style={{ "--progress": `${percent}%` }}>
          <img src="/flame-no-cross.png" alt="Journey flame" />
        </div>
        <div className={`final-cross ${completed === 8 ? "visible" : ""}`} aria-hidden="true">
          <i />
          <b />
        </div>
      </div>

      {completed === 8 && (
        <div className="final-message">
          <b>EMBER FULLY IGNITED</b>
          <span>The cross completes your journey.</span>
        </div>
      )}

      <div className="ember-particles">
        {Array.from({ length: 12 }).map((_, index) => <i key={index} />)}
      </div>
    </div>
  );
}

function ScanPage() {
  const { token } = useParams();
  const { user } = useAuth();
  const { myEntries, validateQr, saveReflection } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const [qr, setQr] = useState(null);
  const [talk, setTalk] = useState(null);
  const [reflection, setReflection] = useState("");
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!user) {
      setStatus("login");
      return;
    }

    validateQr(token)
      .then((record) => {
        setQr(record);
        setTalk(TALKS.find((item) => item.number === Number(record.talk_number)));
        setStatus("reflection");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, [user, token]);

  if (!user) {
    return (
      <div className="scan-landing">
        <img src="/flame-no-cross.png" alt="" />
        <span className="eyebrow">QR detected</span>
        <h1>Your next Ember is waiting.</h1>
        <p>Sign in to validate this talk and continue to your reflection. You will not need to scan the QR code again.</p>
        <Link className="primary link-button" to="/login" state={{ from: location.pathname }}>
          Sign in to continue
        </Link>
      </div>
    );
  }

  if (status === "checking") return <Loading />;

  if (status === "error") {
    return (
      <Layout>
        <section className="narrow-card">
          <span className="eyebrow">Unable to continue</span>
          <h1>QR validation failed</h1>
          <div className="error">{error}</div>
          <Link to="/journey" className="secondary link-button">Return to Journey</Link>
        </section>
      </Layout>
    );
  }

  if (result) {
    const after = myEntries.length + 1;
    return (
      <Layout>
        <section className="unlock-page">
          <FlameProgress completed={after} compact />
          <span className="eyebrow">Talk {talk.number} completed</span>
          <h1>{talk.title}</h1>
          <div className="encouragement">
            <p>{result.message}</p>
            <blockquote>“{talk.verseText}”</blockquote>
            <b>{talk.verse}</b>
          </div>
          <Link className="primary link-button" to="/journey">View updated journey</Link>
        </section>
      </Layout>
    );
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    const words = reflection.trim().split(/\s+/).filter(Boolean).length;

    if (words < 20) {
      setError("Please write at least 20 meaningful words.");
      return;
    }

    try {
      const response = createEncouragement(reflection);
      await saveReflection(talk, reflection.trim(), response, qr.token);
      setResult(response);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout>
      <section className="reflection-page">
        <div className="talk-header">
          <span>Talk {talk.number}</span>
          <h1>{talk.title}</h1>
          <p>{talk.prompt}</p>
        </div>

        <form className="reflection-card" onSubmit={submit}>
          <label>
            What's your reflection?
            <textarea
              rows="10"
              maxLength="3000"
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              placeholder="Write honestly about what touched you, challenged you, or inspired you…"
            />
          </label>

          <div className="form-meta">
            <span>{reflection.trim().split(/\s+/).filter(Boolean).length} words</span>
            <span>Minimum 20 words</span>
          </div>

          {error && <div className="error">{error}</div>}
          <button className="primary" type="submit">Save reflection and ignite</button>
        </form>
      </section>
    </Layout>
  );
}

function createEncouragement(text) {
  const reflection = text.toLowerCase();

  if (/thank|grateful|bless|appreciate/.test(reflection)) {
    return {
      message: "Your gratitude shows a heart learning to notice God's goodness. Keep naming His blessings, especially in ordinary moments."
    };
  }

  if (/fear|afraid|hard|struggle|pain|worry|anxious/.test(reflection)) {
    return {
      message: "Your honesty is courageous. God does not ask you to hide weakness; He invites you to bring it into His presence and receive strength."
    };
  }

  if (/forgiv|sorry|repent|surrender/.test(reflection)) {
    return {
      message: "Your desire to surrender reflects a heart open to grace. Receive God's mercy and allow it to shape how you treat yourself and others."
    };
  }

  if (/grow|change|habit|prayer|scripture|bible/.test(reflection)) {
    return {
      message: "Your reflection shows a sincere desire to grow. Small spiritual habits, practiced faithfully, can shape a transformed life."
    };
  }

  if (/family|mother|father|parent|brother|sister|home/.test(reflection)) {
    return {
      message: "Your care for your family matters. Ask God for the patience, humility, and courage to make your home a place where love can grow."
    };
  }

  if (/serve|help|neighbor|community/.test(reflection)) {
    return {
      message: "Your willingness to serve reflects Christ's love. Continue using your gifts to make another person's burden lighter."
    };
  }

  return {
    message: "Thank you for reflecting honestly. Hold on to what spoke to you and bring it into the choices, relationships, and actions of the coming week."
  };
}

function Reflections() {
  const { myEntries } = useData();

  return (
    <Layout>
      <section className="page-heading">
        <span className="eyebrow">Your story</span>
        <h1>My Reflection Journey</h1>
        <p>Look back on what God has been revealing throughout the eight talks.</p>
      </section>

      <section className="timeline">
        {TALKS.map((talk) => {
          const entry = myEntries.find((item) => Number(item.talk_number) === talk.number);

          return (
            <article className={entry ? "complete" : "locked"} key={talk.number}>
              <div className="timeline-number">{entry ? "✓" : talk.number}</div>
              <div>
                <span>Talk {talk.number}</span>
                <h2>{talk.title}</h2>
                {entry ? (
                  <>
                    <p className="reflection-text">{entry.reflection}</p>
                    <div className="mini-encouragement">
                      <p>{entry.encouragement_message}</p>
                      <b>{entry.encouragement_verse}</b>
                    </div>
                  </>
                ) : (
                  <p>This reflection will appear after you complete the talk.</p>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </Layout>
  );
}

function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { updateProfile } = useData();
  const [form, setForm] = useState({ full_name: "", bio: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm({
      full_name: profile?.full_name ?? "",
      bio: profile?.bio ?? ""
    });
  }, [profile]);

  async function submit(event) {
    event.preventDefault();
    setMessage("");

    try {
      await updateProfile(form);
      await refreshProfile();
      setMessage("Profile updated successfully.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <Layout>
      <section className="profile-layout">
        <aside className="profile-card">
          <div className="avatar">{profile?.full_name?.slice(0, 1).toUpperCase()}</div>
          <h1>{profile?.full_name}</h1>
          <span className={`role-badge ${profile?.role}`}>{profile?.role}</span>
          <p>@{profile?.username}</p>
        </aside>

        <form className="edit-card" onSubmit={submit}>
          <span className="eyebrow">Account settings</span>
          <h2>Edit your profile</h2>

          <label>
            Username
            <input value={profile?.username ?? ""} disabled />
            <small>Usernames are assigned by an Admin.</small>
          </label>

          <label>
            Full name
            <input
              required
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
            />
          </label>

          <label>
            About me
            <textarea
              rows="5"
              maxLength="400"
              value={form.bio}
              onChange={(event) => setForm({ ...form, bio: event.target.value })}
              placeholder="Share a short introduction or what you hope to receive from the CLP."
            />
          </label>

          {message && <div className="notice">{message}</div>}
          <button className="primary" type="submit">Save profile</button>
        </form>
      </section>
    </Layout>
  );
}

function AdminPage() {
  const { session } = useAuth();
  const {
    profiles, entries, qrCodes, createParticipant,
    resetParticipantJourney, deleteParticipant,
    generateQr, toggleQr
  } = useData();

  const [tab, setTab] = useState("participants");
  const [participant, setParticipant] = useState({
    username: "",
    password: "",
    full_name: ""
  });
  const [qrForm, setQrForm] = useState({
    talk_number: 1,
    opens_at: "",
    closes_at: ""
  });
  const [message, setMessage] = useState("");

  async function addParticipant(event) {
    event.preventDefault();
    setMessage("");

    try {
      await createParticipant(participant);
      setParticipant({ username: "", password: "", full_name: "" });
      setMessage("Participant account created.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function makeQr(event) {
    event.preventDefault();
    setMessage("");

    try {
      await generateQr(
        Number(qrForm.talk_number),
        qrForm.opens_at ? new Date(qrForm.opens_at).toISOString() : null,
        qrForm.closes_at ? new Date(qrForm.closes_at).toISOString() : null
      );
      setMessage("A new QR code was generated. Previous codes for this talk were deactivated.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function resetJourney(person) {
    const confirmed = window.confirm(
      `Reset ${person.full_name}'s journey?\n\nThis removes all reflections and progress but keeps the Participant account.`
    );

    if (!confirmed) return;
    setMessage("");

    try {
      await resetParticipantJourney(person.id);
      setMessage(`${person.full_name}'s journey was reset.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function removeParticipant(person) {
    const typed = window.prompt(
      `Delete ${person.full_name}?\n\nThis permanently removes the login account, profile, reflections, and progress.\n\nType DELETE to confirm.`
    );

    if (typed !== "DELETE") return;
    setMessage("");

    try {
      await deleteParticipant(person.id);
      setMessage(`${person.full_name} was permanently deleted.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  const participantProfiles = profiles.filter((item) => item.role === "participant");

  return (
    <Layout>
      <section className="admin-hero">
        <div>
          <span className="eyebrow">Team Leader controls</span>
          <h1>Admin Dashboard</h1>
          <p>Only Admin accounts can create participants or generate official talk QR codes.</p>
        </div>
        <div className="admin-stats">
          <div><b>{participantProfiles.length}</b><span>Participants</span></div>
          <div><b>{entries.length}</b><span>Reflections</span></div>
          <div><b>{qrCodes.filter((item) => item.is_active).length}</b><span>Active QR codes</span></div>
        </div>
      </section>

      <div className="tabs">
        <button className={tab === "participants" ? "active" : ""} onClick={() => setTab("participants")}>Participants</button>
        <button className={tab === "qr" ? "active" : ""} onClick={() => setTab("qr")}>QR Codes</button>
        <button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>Progress</button>
      </div>

      {message && <div className="notice admin-notice">{message}</div>}

      {tab === "participants" && (
        <section className="admin-grid">
          <form className="admin-card" onSubmit={addParticipant}>
            <span className="eyebrow">New account</span>
            <h2>Create Participant</h2>

            <label>
              Full name
              <input required value={participant.full_name} onChange={(e) => setParticipant({ ...participant, full_name: e.target.value })} />
            </label>

            <label>
              Username
              <input required pattern="[A-Za-z0-9._-]+" value={participant.username} onChange={(e) => setParticipant({ ...participant, username: e.target.value.toLowerCase() })} />
            </label>

            <label>
              Temporary password
              <input required type="password" minLength="4" value={participant.password} onChange={(e) => setParticipant({ ...participant, password: e.target.value })} />
            </label>

            <button className="primary" type="submit">Create account</button>
          </form>

          <div className="admin-card">
            <span className="eyebrow">Account directory</span>
            <h2>Participants</h2>
            <div className="people-list">
              {participantProfiles.length === 0 && <p>No participants yet.</p>}
              {participantProfiles.map((person) => (
                <div className="person-row" key={person.id}>
                  <span className="mini-avatar">{person.full_name?.slice(0, 1).toUpperCase()}</span>
                  <div className="person-main">
                    <b>{person.full_name}</b>
                    <small>@{person.username}</small>
                  </div>
                  <span className="person-progress">{entries.filter((entry) => entry.user_id === person.id).length}/8</span>
                  <div className="person-actions">
                    <button type="button" className="small-action" onClick={() => resetJourney(person)}>Reset</button>
                    <button type="button" className="small-action danger" onClick={() => removeParticipant(person)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "qr" && (
        <section className="admin-grid">
          <form className="admin-card" onSubmit={makeQr}>
            <span className="eyebrow">Official access</span>
            <h2>Generate Talk QR</h2>

            <label>
              Talk
              <select value={qrForm.talk_number} onChange={(e) => setQrForm({ ...qrForm, talk_number: e.target.value })}>
                {TALKS.map((talk) => <option key={talk.number} value={talk.number}>Talk {talk.number}: {talk.title}</option>)}
              </select>
            </label>

            <label>
              Opens at (optional)
              <input type="datetime-local" value={qrForm.opens_at} onChange={(e) => setQrForm({ ...qrForm, opens_at: e.target.value })} />
            </label>

            <label>
              Closes at (optional)
              <input type="datetime-local" value={qrForm.closes_at} onChange={(e) => setQrForm({ ...qrForm, closes_at: e.target.value })} />
            </label>

            <button className="primary" type="submit">Generate secure QR</button>
          </form>

          <div className="qr-list">
            {qrCodes.length === 0 && <div className="admin-card"><p>No QR codes generated yet.</p></div>}
            {qrCodes.map((qr) => {
              const talk = TALKS.find((item) => item.number === Number(qr.talk_number));
              const scanUrl = `${window.location.origin}/scan/${qr.token}`;

              return (
                <article className={`qr-card ${qr.is_active ? "active" : ""}`} key={qr.id}>
                  <div>
                    <span className="eyebrow">Talk {qr.talk_number}</span>
                    <h3>{talk?.title}</h3>
                    <p>{qr.is_active ? "Active" : "Inactive"}</p>
                  </div>

                  <QRCodeSVG
                    value={scanUrl}
                    size={150}
                    bgColor="#ffffff"
                    fgColor="#160b06"
                    level="H"
                    imageSettings={{
                      src: "/flame-no-cross.png",
                      height: 30,
                      width: 30,
                      excavate: true
                    }}
                  />

                  <code>{scanUrl}</code>
                  <button className="secondary" onClick={() => toggleQr(qr)}>
                    {qr.is_active ? "Deactivate" : "Activate"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === "progress" && (
        <section className="progress-table">
          <div className="table-row header">
            <span>Participant</span>
            <span>Completed</span>
            <span>Latest talk</span>
          </div>

          {participantProfiles.map((person) => {
            const personEntries = entries
              .filter((entry) => entry.user_id === person.id)
              .sort((a, b) => Number(a.talk_number) - Number(b.talk_number));
            const latest = personEntries.at(-1);

            return (
              <div className="table-row" key={person.id}>
                <span><b>{person.full_name}</b><small>@{person.username}</small></span>
                <span>{personEntries.length}/8</span>
                <span>{latest ? `Talk ${latest.talk_number}` : "Not started"}</span>
              </div>
            );
          })}
        </section>
      )}
    </Layout>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/scan/:token" element={<ScanPage />} />
      <Route path="/journey" element={<Protected><Journey /></Protected>} />
      <Route path="/reflections" element={<Protected><Reflections /></Protected>} />
      <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
      <Route path="/admin" element={<Protected admin><AdminPage /></Protected>} />
      <Route path="/" element={<Navigate to="/journey" replace />} />
      <Route path="*" element={<Navigate to="/journey" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
