/* Acoulys: Gmail one-time-code sign-in gate. */
(() => {
  const SUPABASE_URL = "https://iiwcpshtdjanyiixosle.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FFYD6lQmu6LfrPyhiVM9wg_e0hi41NC";
  const client = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;
  if (client) window.acoulysSupabase = client;

  const style = document.createElement("style");
  style.textContent = '#musicaliSignInGate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;overflow:auto;padding:24px;background:radial-gradient(ellipse at 50% 0%,#38234f 0,transparent 48%),#100d18;color:#f8f5ff;font-family:Inter,system-ui,sans-serif}#musicaliSignInGate *{box-sizing:border-box}#musicaliSignInGate .gate-card{width:min(100%,430px);padding:clamp(26px,5vw,42px);border:1px solid #ffffff1b;border-radius:28px;background:#191622ef;box-shadow:0 28px 100px #0008;text-align:center}#musicaliSignInGate .gate-mark{font-size:clamp(25px,5vw,32px);font-weight:950;letter-spacing:4px;background:linear-gradient(110deg,#c4a7ff,#f0abfc,#8be9fd);color:transparent;background-clip:text;-webkit-background-clip:text}#musicaliSignInGate .gate-spark{margin:18px auto 14px;width:48px;height:4px;border-radius:9px;background:linear-gradient(90deg,#a78bfa,#f0abfc,#8be9fd)}#musicaliSignInGate h1{font-size:clamp(25px,5vw,32px);line-height:1.15;letter-spacing:-1px;margin:0 0 10px}#musicaliSignInGate .gate-sub{color:#bdb5ce;font-size:14px;line-height:1.65;margin:0 auto 26px;max-width:310px}#musicaliSignInGate label{display:block;text-align:left;color:#e8e0f5;font-size:12px;font-weight:750;margin:0 0 8px}#musicaliSignInGate input{width:100%;height:51px;padding:0 14px;border-radius:13px;border:1px solid #4a405c;background:#100d18;color:#fff;outline:none;font-size:15px}#musicaliSignInGate input:focus{border-color:#c4a7ff;box-shadow:0 0 0 3px #a78bfa24}#musicaliSignInGate #gateCode{letter-spacing:9px;text-align:center;font-size:23px;font-weight:800}#musicaliSignInGate .gate-primary{width:100%;min-height:50px;margin-top:14px;border:0;border-radius:13px;background:linear-gradient(110deg,#b8a0ff,#f0abfc);color:#1a1324;font-weight:850;font-size:14px;cursor:pointer}#musicaliSignInGate .gate-primary:disabled{opacity:.6;cursor:wait}#musicaliSignInGate .gate-status{min-height:23px;margin:14px 0 0;color:#d7c5ff;font-size:12px;line-height:1.5}#musicaliSignInGate .gate-secondary{margin-top:8px;padding:8px;background:none;border:0;color:#c9b3ff;font-size:12px;text-decoration:underline;cursor:pointer}#musicaliSignInGate .gate-foot{margin-top:24px;color:#777084;font-size:10px;letter-spacing:.5px}@media(max-width:480px){#musicaliSignInGate{padding:16px}#musicaliSignInGate .gate-card{border-radius:23px}}';
  document.head.appendChild(style);

  const gate = document.createElement("div");
  gate.id = "musicaliSignInGate";
  gate.setAttribute("role", "main");
  gate.innerHTML = "<section class='gate-card' aria-labelledby='gateTitle'><div class='gate-mark'>ACOULYS</div><div class='gate-spark' aria-hidden='true'></div><h1 id='gateTitle'>Make it. Loop it. Share it.</h1><p class='gate-sub' id='gateSubtitle'>Sign in with your Gmail. We will send you a one-time verification code.</p><form id='gateForm'><div id='gateEmailWrap'><label for='gateEmail'>Gmail address</label><input id='gateEmail' type='email' inputmode='email' autocomplete='email' autocapitalize='none' spellcheck='false' placeholder='you@gmail.com' required></div><div id='gateCodeWrap' hidden><label for='gateCode'>6-digit verification code</label><input id='gateCode' type='text' inputmode='numeric' autocomplete='one-time-code' pattern='[0-9]{6}' maxlength='6' placeholder='••••••' aria-describedby='gateStatus'></div><button class='gate-primary' id='gateSubmit' type='submit'>Continue with Gmail</button></form><button class='gate-secondary' id='gateChangeEmail' type='button' hidden>Use a different Gmail</button><p class='gate-status' id='gateStatus' role='status' aria-live='polite'></p><div class='gate-foot'>MAKE IT. LOOP IT. SHARE IT. ✦</div></section>";
  document.body.appendChild(gate);

  const $ = id => document.getElementById(id);
  let stage = "email";
  let pendingEmail = "";

  function showGate() {
    gate.style.display = "flex";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  function hideGate() {
    gate.style.display = "none";
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }
  function setStatus(message, isError = false) {
    $("gateStatus").textContent = message || "";
    $("gateStatus").style.color = isError ? "#ffb4c0" : "#d7c5ff";
  }
  function paintUser(user) {
    const mini = document.querySelector(".profile-mini");
    if (!mini) return;
    const avatar = mini.querySelector(".avatar");
    const strong = mini.querySelector("strong");
    const muted = mini.querySelector(".muted");
    const email = user?.email || "";
    if (avatar) avatar.textContent = (user?.user_metadata?.display_name || email || "M").slice(0, 1).toUpperCase();
    if (strong) strong.textContent = user?.user_metadata?.display_name || (email.split("@")[0] || "Creator");
    if (muted) muted.textContent = email;
  }
  function isGmail(email) { return /^[^\s@]+@gmail\.com$/i.test(email); }
  function resetToEmail() {
    stage = "email";
    pendingEmail = "";
    $("gateEmailWrap").hidden = false;
    $("gateCodeWrap").hidden = true;
    $("gateChangeEmail").hidden = true;
    $("gateEmail").readOnly = false;
    $("gateCode").required = false;
    $("gateCode").value = "";
    $("gateSubmit").textContent = "Continue with Gmail";
    $("gateSubtitle").textContent = "Sign in with your Gmail. We will send you a one-time verification code.";
    setStatus("");
    $("gateEmail").focus();
  }
  if (!client) {
    showGate();
    setStatus("The sign-in service could not load. Refresh this page and try again.", true);
    return;
  }

  $("gateChangeEmail").addEventListener("click", resetToEmail);
  $("gateForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = $("gateSubmit");
    submit.disabled = true;
    try {
      if (stage === "email") {
        const email = $("gateEmail").value.trim().toLowerCase();
        if (!isGmail(email)) {
          setStatus("Enter a Gmail address ending in @gmail.com.", true);
          return;
        }
        setStatus("Sending your verification code…");
        const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw error;
        pendingEmail = email;
        stage = "code";
        $("gateEmailWrap").hidden = true;
        $("gateCodeWrap").hidden = false;
        $("gateCode").required = true;
        $("gateChangeEmail").hidden = false;
        $("gateSubmit").textContent = "Verify code and sign in";
        $("gateSubtitle").textContent = "Check your Gmail inbox for the 6-digit code. If it is missing, check Spam.";
        setStatus("Code sent to " + pendingEmail + ".");
        $("gateCode").focus();
      } else {
        const token = $("gateCode").value.trim();
        if (!/^[0-9]{6}$/.test(token)) {
          setStatus("Enter the 6-digit code from your email.", true);
          return;
        }
        setStatus("Verifying your code…");
        const { data, error } = await client.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
        if (error) throw error;
        if (!data?.session) throw new Error("No sign-in session was returned. Please try again.");
        paintUser(data.user);
        setStatus("You're in. Welcome to Acoulys!");
        setTimeout(hideGate, 450);
      }
    } catch (error) {
      setStatus(error?.message || "We could not complete sign-in. Please try again.", true);
    } finally {
      submit.disabled = false;
    }
  });

  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) paintUser(session.user);
    else showGate();
  });
  // A saved session must not bypass the requested Gmail-code screen on page load.
  showGate();
  client.auth.getSession().then(({ data, error }) => {
    if (error) { setStatus("Please sign in with your Gmail to continue.", true); return; }
    if (data?.session?.user) paintUser(data.session.user);
  }).catch(error => {
    console.error("Acoulys session check failed:", error);
    setStatus("Please sign in with your Gmail to continue.", true);
  });
  window.acoulysAuth = { client, open: showGate, close: hideGate };
})();