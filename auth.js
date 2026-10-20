/* Acoulys account access and profile onboarding. Never request a user's Google password. */
(() => {
  const SUPABASE_URL = "https://iiwcpshtdjanyiixosle.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FFYD6lQmu6LfrPyhiVM9wg_e0hi41NC";
  const client = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;
  if (client) window.acoulysSupabase = client;

  const style = document.createElement("style");
  style.textContent = '#acoulysAuthGate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;overflow:auto;padding:18px;background:radial-gradient(ellipse at 50% 0%,#2c1c39 0,transparent 48%),#100d18;color:#f8f5ff;font-family:Inter,system-ui,sans-serif}#acoulysAuthGate *{box-sizing:border-box}#acoulysAuthGate .gate-card{width:min(100%,500px);max-height:calc(100dvh - 36px);overflow:auto;padding:clamp(22px,4vw,36px);border:1px solid #ffffff1b;border-radius:26px;background:#191622f5;box-shadow:0 28px 100px #0008;text-align:center}#acoulysAuthGate .gate-mark{font-size:28px;font-weight:950;letter-spacing:4px;background:linear-gradient(110deg,#ff4d6d,#7657ff,#27d6c4);color:transparent;background-clip:text;-webkit-background-clip:text}#acoulysAuthGate .gate-spark{margin:13px auto;width:48px;height:4px;border-radius:9px;background:linear-gradient(90deg,#a78bfa,#f0abfc,#8be9fd)}#acoulysAuthGate h1{font-size:clamp(24px,5vw,30px);line-height:1.15;letter-spacing:-.7px;margin:0 0 9px}#acoulysAuthGate .gate-sub{color:#bdb5ce;font-size:13px;line-height:1.55;margin:0 auto 22px;max-width:360px}#acoulysAuthGate label{display:block;text-align:left;color:#e8e0f5;font-size:12px;font-weight:750;margin:0 0 7px}#acoulysAuthGate input,#acoulysAuthGate select{width:100%;min-width:0;height:45px;padding:0 12px;border-radius:12px;border:1px solid #4a405c;background:#100d18;color:#fff;outline:none;font-size:14px}#acoulysAuthGate input:focus,#acoulysAuthGate select:focus{border-color:#c4a7ff;box-shadow:0 0 0 3px #27d6c424}#acoulysAuthGate input[type=file]{height:auto;padding:10px;font-size:12px}#acoulysAuthGate #gateCode{letter-spacing:8px;text-align:center;font-size:22px;font-weight:800}#acoulysAuthGate .gate-primary{width:100%;min-height:48px;margin-top:14px;border:0;border-radius:13px;background:linear-gradient(110deg,#ff647c,#27d6c4);color:#1a1324;font-weight:850;font-size:14px;cursor:pointer}#acoulysAuthGate .gate-primary:disabled{opacity:.6;cursor:wait}#acoulysAuthGate .gate-status{min-height:22px;margin:12px 0 0;color:#d2fff9;font-size:12px;line-height:1.5}#acoulysAuthGate .gate-secondary{margin-top:8px;padding:8px;background:none;border:0;color:#d2fff9;font-size:12px;text-decoration:underline;cursor:pointer}#acoulysAuthGate .gate-foot{margin-top:18px;color:#777084;font-size:10px;letter-spacing:.5px}#acoulysAuthGate .profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;text-align:left}#acoulysAuthGate .field{min-width:0}#acoulysAuthGate .field.full{grid-column:1/-1}#acoulysAuthGate .avatar-pick{display:flex;align-items:center;gap:14px;text-align:left;margin:0 auto 18px;max-width:360px}#acoulysAuthGate .avatar-preview{width:70px;height:70px;flex:0 0 70px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,#ff4d6d,#7657ff,#27d6c4);color:white;font-size:26px;font-weight:900;border:2px solid #ffffff30}#acoulysAuthGate .avatar-preview img{width:100%;height:100%;object-fit:cover}#acoulysAuthGate .small-note{font-size:11px;color:#a9a0b9;line-height:1.5;margin:6px 0 0;text-align:left}@media(max-width:480px){#acoulysAuthGate{padding:10px}#acoulysAuthGate .gate-card{max-height:calc(100dvh - 20px);border-radius:21px;padding:22px 17px}#acoulysAuthGate .profile-grid{gap:10px}#acoulysAuthGate input,#acoulysAuthGate select{font-size:13px}}';
  document.head.appendChild(style);

  const gate = document.createElement("div");
  gate.id = "acoulysAuthGate";
  gate.setAttribute("role", "main");
  gate.innerHTML = "<section class='gate-card' aria-labelledby='gateTitle'><div class='gate-mark'>ACOULYS</div><div class='gate-spark' aria-hidden='true'></div><h1 id='gateTitle'>Make it. Loop it. Share it.</h1><p class='gate-sub' id='gateSubtitle'>Sign in or create an account with your email. We'll send you a verification code.</p><form id='gateForm'><div id='gateEmailWrap'><label for='gateEmail'>Email address</label><input id='gateEmail' type='email' inputmode='email' autocomplete='email' autocapitalize='none' spellcheck='false' placeholder='you@example.com' required><div id='loginPasswordWrap' hidden><label for='loginPassword'>Acoulys password</label><input id='loginPassword' type='password' autocomplete='current-password' placeholder='Your Acoulys password'></div><p class='small-note'>The password is for Acoulys, never your Google account.</p></div><div id='gateCodeWrap' hidden><label for='gateCode'>6-digit verification code</label><input id='gateCode' type='text' inputmode='numeric' autocomplete='one-time-code' pattern='[0-9]{6}' maxlength='6' placeholder='••••••' aria-describedby='gateStatus'></div><button class='gate-primary' id='gateSubmit' type='submit'>Email me a code</button></form><button class='gate-secondary' id='gatePasswordSignIn' type='button'>Already have an Acoulys password? Sign in</button><button class='gate-secondary' id='gateChangeEmail' type='button' hidden>Use a different email</button><p class='gate-status' id='gateStatus' role='status' aria-live='polite'></p><div id='gateProfile' hidden></div><div class='gate-foot'>MAKE IT. LOOP IT. SHARE IT. ✦</div></section>";
  document.body.appendChild(gate);

  const $ = id => document.getElementById(id);
  let stage = "email";
  let pendingEmail = "";
  let selectedAvatar = "";
  let currentUser = null;

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
    $("gateStatus").style.color = isError ? "#ffb4c0" : "#d2fff9";
  }
  function paintUser(user) {
    const mini = document.querySelector(".profile-mini");
    if (!mini) return;
    const avatar = mini.querySelector(".avatar");
    const strong = mini.querySelector("strong");
    const muted = mini.querySelector(".muted");
    const meta = user?.user_metadata || {};
    const email = user?.email || "";
    const display = meta.preferred_name || meta.display_name || (email.split("@")[0] || "Creator");
    if (avatar) {
      avatar.textContent = meta.avatar_data ? "" : display.slice(0, 1).toUpperCase();
      avatar.style.backgroundImage = meta.avatar_data ? "url(" + meta.avatar_data + ")" : "";
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
    }
    if (strong) strong.textContent = display;
    if (muted) muted.textContent = email;
  }
  function resetToEmail() {
    stage = "email";
    pendingEmail = "";
    $("gateEmailWrap").hidden = false;
    $("gateCodeWrap").hidden = true;
    $("gateChangeEmail").hidden = true;
    $("gateEmail").readOnly = false;
    $("gateCode").required = false;
    $("gateCode").value = "";
    $("gateSubmit").textContent = "Email me a code";
    $("gateSubtitle").textContent = "Sign in or create an account with your email. We'll send you a verification code.";
    $("gateProfile").hidden = true;
    $("gateForm").hidden = false;
    setStatus("");
    $("loginPasswordWrap").hidden = true;
    $("loginPassword").value = "";
    $("gatePasswordSignIn").textContent = "Already have an Acoulys password? Sign in";
    $("gateEmail").focus();
  }
  function ageFromDob(value) {
    if (!value) return null;
    const birth = new Date(value + "T00:00:00");
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  }
  function renderProfile(user) {
    currentUser = user;
    stage = "profile";
    $("gateForm").hidden = true;
    $("gateChangeEmail").hidden = true;
    $("gateSubtitle").textContent = "Your account is verified. Let's set up your Acoulys profile.";
    $("gateProfile").hidden = false;
    $("gateProfile").innerHTML = "<div class='avatar-pick'><div class='avatar-preview' id='avatarPreview'>A</div><div class='field' style='flex:1'><label for='profileAvatar'>Profile picture (optional)</label><input id='profileAvatar' type='file' accept='image/*'><p class='small-note'>Choose a picture from your device. It will be resized before saving.</p></div></div><form id='profileForm'><div class='profile-grid'><div class='field'><label for='legalName'>Your name</label><input id='legalName' autocomplete='name' maxlength='80' placeholder='Your name' required></div><div class='field'><label for='preferredName'>Name you love to be called</label><input id='preferredName' autocomplete='nickname' maxlength='40' placeholder='Your name or nickname' required></div><div class='field'><label for='dob'>Date of birth</label><input id='dob' type='date' autocomplete='bday' required></div><div class='field'><label for='gender'>Gender</label><select id='gender' required><option value='' selected disabled>Choose one</option><option value='female'>Female</option><option value='male'>Male</option></select></div><div class='field full'><label for='pronouns'>Pronouns</label><select id='pronouns' required><option value='' selected disabled>Choose pronouns</option><option value='he/him'>He / him</option><option value='she/her'>She / her</option></select></div><div class='field'><label for='newPassword'>Create Acoulys password</label><input id='newPassword' type='password' autocomplete='new-password' minlength='8' placeholder='At least 8 characters' required></div><div class='field'><label for='confirmPassword'>Confirm password</label><input id='confirmPassword' type='password' autocomplete='new-password' minlength='8' placeholder='Type it again' required></div></div><p class='small-note'>Your date of birth helps calculate your age. Only share details you're comfortable providing. You can change your profile details later.</p><button class='gate-primary' id='saveProfile' type='submit'>Create my Acoulys profile</button></form>";
    const preview = $("avatarPreview");
    preview.textContent = (user?.email || "A").slice(0, 1).toUpperCase();
    $("profileAvatar").addEventListener("change", async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) { setStatus("Please choose an image file.", true); return; }
      if (file.size > 10 * 1024 * 1024) { setStatus("That image is over 10 MB. Choose a smaller image.", true); event.target.value = ""; return; }
      try {
        selectedAvatar = await resizeImage(file);
        preview.innerHTML = "";
        const img = document.createElement("img");
        img.src = selectedAvatar;
        img.alt = "Profile picture preview";
        preview.appendChild(img);
        setStatus("Profile picture ready.");
      } catch (error) {
        setStatus("That picture could not be opened. Try another image.", true);
      }
    });
    $("profileForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = $("saveProfile");
      button.disabled = true;
      const dob = $("dob").value;
      const age = ageFromDob(dob);
      try {
        if (age === null || age < 13 || age > 120) {
          setStatus("Enter a valid date of birth. Acoulys accounts are for people aged 13 and older.", true);
          return;
        }
        const metadata = {
          display_name: $("legalName").value.trim(),
          preferred_name: $("preferredName").value.trim(),
          date_of_birth: dob,
          age: age,
          gender: $("gender").value,
          pronouns: $("pronouns").value,
          profile_complete: true
        };
        const newPassword = $('newPassword').value;
        const confirmPassword = $('confirmPassword').value;
        if (newPassword.length < 8) { setStatus('Your Acoulys password must be at least 8 characters.', true); return; }
        if (newPassword !== confirmPassword) { setStatus('Those passwords do not match. Please check them.', true); return; }
        if (!metadata.display_name || !metadata.preferred_name) {
          setStatus("Please fill in both name fields.", true);
          return;
        }
        if (selectedAvatar) metadata.avatar_data = selectedAvatar;
        setStatus("Saving your profile…");
        const { data, error } = await client.auth.updateUser({ password: newPassword, data: metadata });
        if (error) throw error;
        currentUser = data.user || currentUser;
        paintUser(currentUser);
        setStatus("Your Acoulys profile is ready. Welcome in!");
        setTimeout(hideGate, 700);
      } catch (error) {
        setStatus(error?.message || "We couldn't save your profile. Please try again.", true);
      } finally {
        button.disabled = false;
      }
    });
  }
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not decode image"));
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.68));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (!client) {
    showGate();
    setStatus("The sign-in service could not load. Refresh this page and try again.", true);
    return;
  }

  $("gateChangeEmail").addEventListener("click", resetToEmail);
  $("gatePasswordSignIn").addEventListener("click", async () => {
    const email = $("gateEmail").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("Enter your email address first.", true);
      $("gateEmail").focus();
      return;
    }
    if ($("loginPasswordWrap").hidden) {
      $("loginPasswordWrap").hidden = false;
      $("loginPassword").focus();
      $("gatePasswordSignIn").textContent = "Sign in with Acoulys password";
      setStatus("Enter your Acoulys password, then press the sign-in button again.");
      return;
    }
    const password = $("loginPassword").value;
    if (!password) { setStatus("Enter your Acoulys password.", true); $("loginPassword").focus(); return; }
    const button = $("gatePasswordSignIn");
    button.disabled = true;
    try {
      setStatus("Signing in…");
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.user) throw new Error("No account was returned. Please try again.");
      if (data.user.user_metadata?.profile_complete) {
        paintUser(data.user);
        setStatus("You're signed in. Welcome back!");
        setTimeout(hideGate, 450);
      } else {
        renderProfile(data.user);
        setStatus("");
      }
    } catch (error) {
      setStatus(error?.message || "We couldn't sign you in. Check your email and Acoulys password.", true);
    } finally {
      button.disabled = false;
    }
  });
  $("gateForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = $("gateSubmit");
    submit.disabled = true;
    try {
      if (stage === "email") {
        const email = $("gateEmail").value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setStatus("Enter a valid email address.", true);
          return;
        }
        setStatus("Sending your verification code…");
        const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: "https://factorydefaulth12.github.io/Musicali/" } });
        if (error) throw error;
        pendingEmail = email;
        stage = "code";
        $("gateEmailWrap").hidden = true;
        $("gateCodeWrap").hidden = false;
        $("gateCode").required = true;
        $("gateChangeEmail").hidden = false;
        $("gateSubmit").textContent = "Verify code";
        $("gateSubtitle").textContent = "Check your inbox for the 6-digit code. If it is missing, check Spam or Junk.";
        setStatus("Code sent to " + pendingEmail + ".");
        $("gateCode").focus();
      } else if (stage === "code") {
        const token = $("gateCode").value.trim();
        if (!/^[0-9]{6}$/.test(token)) {
          setStatus("Enter the 6-digit code from your email.", true);
          return;
        }
        setStatus("Verifying your code…");
        const { data, error } = await client.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
        if (error) throw error;
        if (!data?.session || !data?.user) throw new Error("No sign-in session was returned. Please try again.");
        currentUser = data.user;
        if (data.user.user_metadata?.profile_complete) {
          paintUser(data.user);
          setStatus("You're signed in. Welcome back!");
          setTimeout(hideGate, 450);
        } else {
          renderProfile(data.user);
          setStatus("");
        }
      }
    } catch (error) {
      setStatus(error?.message || "We could not complete sign-in. Please try again.", true);
    } finally {
      submit.disabled = false;
    }
  });

  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      paintUser(session.user);
    } else {
      showGate();
    }
  });
  showGate();
  client.auth.getSession().then(({ data, error }) => {
    if (error) { setStatus("Please sign in with your email to continue.", true); return; }
    if (data?.session?.user) paintUser(data.session.user);
  }).catch(error => {
    console.error("Acoulys session check failed:", error);
    setStatus("Please sign in with your email to continue.", true);
  });
  window.acoulysAuth = { client, open: showGate, close: hideGate };
})();