/* MUSICALI authentication client. Uses only Supabase's browser-safe publishable key. */
(() => {
  const SUPABASE_URL = "https://iiwcpshtdjanyiixosle.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FFYD6lQmu6LfrPyhiVM9wg_e0hi41NC";
  if (!window.supabase?.createClient) {
    console.error("MUSICALI auth: Supabase client library did not load.");
    return;
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.musicaliSupabase = client;

  const style = document.createElement("style");
  style.textContent = `
  .auth-trigger{padding:10px 15px;border-radius:999px;background:linear-gradient(115deg,#a78bfa,#f0abfc);color:#171321;font-weight:800}
  .auth-overlay{position:fixed;inset:0;background:#080710d9;backdrop-filter:blur(12px);z-index:9999;display:none;align-items:center;justify-content:center;padding:18px}
  .auth-overlay.open{display:flex}.auth-card{width:min(100%,430px);background:#191922;border:1px solid #ffffff20;border-radius:24px;padding:26px;box-shadow:0 24px 90px #0009;color:#f7f7fb}
  .auth-card h2{font-size:26px;margin:0 0 6px}.auth-sub{color:#b6b6c7;margin:0 0 20px}.auth-card label{display:block;font-size:13px;color:#d8d4e7;margin:12px 0 6px}
  .auth-card input{width:100%;padding:12px 13px;border-radius:12px;border:1px solid #393946;background:#101018;color:#fff;outline:none}.auth-card input:focus{border-color:#a78bfa}
  .auth-actions{display:grid;gap:10px;margin-top:16px}.auth-action{padding:12px;border-radius:12px;background:linear-gradient(115deg,#a78bfa,#f0abfc);color:#171321;font-weight:800}.auth-secondary{padding:11px;border-radius:12px;background:#252531;border:1px solid #ffffff18;color:#fff}
  .auth-row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;font-size:13px}.auth-link{color:#d9b8ff;text-decoration:underline;cursor:pointer;background:none;padding:0}.auth-status{font-size:13px;color:#c9b8ff;min-height:20px;margin-top:12px}.auth-close{float:right;background:#252531;border-radius:50%;width:34px;height:34px}
  .auth-note{font-size:12px;color:#aaa8bc;margin-top:14px;line-height:1.5}
  @media(max-width:600px){.auth-card{padding:21px}.topbar .auth-trigger{padding:9px 11px}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.className = "auth-overlay";
  overlay.id = "musicaliAuthOverlay";
  overlay.innerHTML = `
    <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" id="authClose" aria-label="Close sign-in">×</button>
      <div style="font-weight:950;letter-spacing:3px;background:linear-gradient(115deg,#a78bfa,#f0abfc,#8be9fd);color:transparent;background-clip:text;margin-bottom:15px">MUSICALI</div>
      <h2 id="authTitle">Welcome back.</h2>
      <p class="auth-sub" id="authSubtitle">Sign in to your creative world.</p>
      <form id="authForm">
        <label for="authEmail">Email address</label><input id="authEmail" type="email" autocomplete="email" required placeholder="you@example.com">
        <label for="authPassword">Password</label><input id="authPassword" type="password" autocomplete="current-password" minlength="8" required placeholder="At least 8 characters">
        <div class="auth-actions"><button class="auth-action" id="authSubmit" type="submit">Sign in</button></div>
      </form>
      <div class="auth-actions">
        <button class="auth-secondary" id="authGoogle" type="button">Continue with Google</button>
        <button class="auth-secondary" id="authApple" type="button">Continue with Apple</button>
      </div>
      <div class="auth-row"><span id="authModeHint">New to MUSICALI?</span><button class="auth-link" id="authToggle" type="button">Create an account</button></div>
      <div class="auth-row"><button class="auth-link" id="authReset" type="button">Forgot password?</button><button class="auth-link" id="authSignOut" type="button" style="display:none">Sign out</button></div>
      <div class="auth-status" id="authStatus" role="status" aria-live="polite"></div>
      <p class="auth-note">Email confirmation may be required. Google and Apple sign-in will work once their providers are configured in Supabase.</p>
    </section>`;
  document.body.appendChild(overlay);

  let mode = "signin";
  const $ = id => document.getElementById(id);
  const status = message => { $("authStatus").textContent = message || ""; };
  const toast = message => { if (typeof window.toast === "function") window.toast(message); else status(message); };
  const open = () => { overlay.classList.add("open"); $("authEmail").focus(); };
  const close = () => overlay.classList.remove("open");
  const setMode = next => {
    mode = next;
    $("authTitle").textContent = mode === "signup" ? "Create your account." : "Welcome back.";
    $("authSubtitle").textContent = mode === "signup" ? "Join your creative world." : "Sign in to your creative world.";
    $("authSubmit").textContent = mode === "signup" ? "Create account" : "Sign in";
    $("authPassword").autocomplete = mode === "signup" ? "new-password" : "current-password";
    $("authModeHint").textContent = mode === "signup" ? "Already have an account?" : "New to MUSICALI?";
    $("authToggle").textContent = mode === "signup" ? "Sign in" : "Create an account";
    status("");
  };
  function paintUser(user) {
    const mini = document.querySelector(".profile-mini");
    if (mini) {
      const avatar = mini.querySelector(".avatar");
      const strong = mini.querySelector("strong");
      const muted = mini.querySelector(".muted");
      const email = user?.email || user?.phone || "";
      if (avatar) avatar.textContent = (email[0] || "M").toUpperCase();
      if (strong) strong.textContent = user ? (user.user_metadata?.display_name || email.split("@")[0] || "Creator") : "Local workspace";
      if (muted) muted.textContent = user ? email : "Not signed in";
    }
    $("authSignOut").style.display = user ? "inline" : "none";
    const trigger = $("musicaliAuthTrigger");
    if (trigger) trigger.textContent = user ? "Account" : "Sign in";
  }
  const trigger = document.createElement("button");
  trigger.className = "auth-trigger";
  trigger.id = "musicaliAuthTrigger";
  trigger.type = "button";
  trigger.textContent = "Sign in";
  trigger.addEventListener("click", open);
  const topbar = document.querySelector(".topbar");
  if (topbar) topbar.insertBefore(trigger, topbar.firstChild);

  $("authClose").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  $("authToggle").addEventListener("click", () => setMode(mode === "signup" ? "signin" : "signup"));

  $("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const submit = $("authSubmit");
    submit.disabled = true;
    status(mode === "signup" ? "Creating your account…" : "Signing you in…");
    try {
      if (mode === "signup") {
        const usernameBase = (email.split("@")[0] || "creator").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 18) || "creator";
        const { data, error } = await client.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.href.split("#")[0], data: { username: usernameBase, display_name: email.split("@")[0] } }
        });
        if (error) throw error;
        if (data.session) {
          status("Account created. You're signed in!");
          paintUser(data.user); setTimeout(close, 900);
        } else {
          status("Account created. Check your email for the confirmation link, then sign in.");
        }
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        status("You're signed in. Welcome to MUSICALI!");
        paintUser(data.user); toast("Signed in successfully 💜"); setTimeout(close, 650);
      }
    } catch (err) {
      status(err?.message || "We couldn't complete that request. Check your details and try again.");
    } finally { submit.disabled = false; }
  });

  $("authGoogle").addEventListener("click", async () => {
    status("Opening Google sign-in…");
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href.split("#")[0] } });
    if (error) status(error.message);
  });
  $("authApple").addEventListener("click", async () => {
    status("Opening Apple sign-in…");
    const { error } = await client.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: window.location.href.split("#")[0] } });
    if (error) status(error.message);
  });
  $("authReset").addEventListener("click", async () => {
    const email = $("authEmail").value.trim();
    if (!email) return status("Enter your email address first.");
    status("Sending password reset email…");
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split("#")[0] });
    status(error ? error.message : "If that email belongs to an account, a password reset link will arrive shortly.");
  });
  $("authSignOut").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) return status(error.message);
    paintUser(null); status("You've signed out."); toast("Signed out.");
  });

  client.auth.onAuthStateChange((_event, session) => paintUser(session?.user || null));
  client.auth.getSession().then(({ data }) => paintUser(data.session?.user || null)).catch(console.error);
  window.musicaliAuth = { open, close, client };
})();