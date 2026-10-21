/* Acoulys real social layer: Supabase posts, storage, likes, follows, comments and view counts. */
(() => {
  const $ = id => document.getElementById(id);
  const client = window.acoulysSupabase || window.acoulysAuth?.client;
  if (!client) {
    console.error("Acoulys social layer could not find its Supabase client.");
    return;
  }
  let signedInUser = null;
  let remotePosts = [];
  let followedIds = new Set();
  let busy = false;
  let pendingPublish = null;
  const socialStyle = document.createElement("style");
  socialStyle.textContent = ".social-media{margin-top:12px;min-width:0}.social-media img{width:100%;max-height:640px;object-fit:contain;border-radius:12px;background:#09070f}.social-media video{display:block;width:100%;max-height:640px;border-radius:12px;background:#09070f}.social-text-post{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;padding:16px 2px;font-family:Georgia,serif;font-size:16px}.social-post .post-actions{align-items:center;flex-wrap:wrap}.social-post .post-actions button{padding:4px 0}.social-post .post-actions button:hover{color:var(--accent2)}";
  document.head.appendChild(socialStyle);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const short = n => {
    const value = Number(n || 0);
    if (value >= 1000000) return (value / 1000000).toFixed(value >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(value);
  };
  function say(message) {
    if (typeof window.toast === "function") window.toast(message);
    else {
      const el = $("toast");
      if (el) { el.textContent = message; el.style.display = "block"; }
      else console.info(message);
    }
  }
  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function currentFilter() {
    return document.querySelector("[data-filter].active")?.dataset.filter || "All";
  }
  function kindMatches(post, filter) {
    if (filter === "All") return true;
    if (filter === "Video") return post.media_type === "video";
    if (filter === "Audio") return post.media_type === "audio";
    if (filter === "Photo") return post.media_type === "image";
    if (filter === "Blog") return post.media_type === "text";
    return true;
  }
  async function ensureProfile(user) {
    const meta = user.user_metadata || {};
    const { data: profile, error } = await client.from("profiles").select("id,username,display_name,bio,avatar_path").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (!profile) {
      let base = (meta.preferred_name || meta.display_name || user.email?.split("@")[0] || "creator").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15);
      if (base.length < 3) base = "user";
      const username = base + "_" + user.id.replace(/-/g, "").slice(0, 5);
      const result = await client.from("profiles").upsert({ id: user.id, username, display_name: meta.preferred_name || meta.display_name || base }, { onConflict: "id" });
      if (result.error) throw result.error;
    } else if (!profile.display_name && (meta.preferred_name || meta.display_name)) {
      const result = await client.from("profiles").update({ display_name: meta.preferred_name || meta.display_name }).eq("id", user.id);
      if (result.error) throw result.error;
    }
  }
  async function loadSocialData() {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    signedInUser = authData?.user || null;
    if (!signedInUser) {
      renderSignedOut();
      return;
    }

    // The feed's core query intentionally avoids PostgREST relationship joins.
    // A broken/missing optional relationship must not blank the entire feed.
    try {
      await ensureProfile(signedInUser);
    } catch (profileError) {
      console.warn("Acoulys profile setup needs attention; continuing feed load:", profileError);
    }
    const { data, error } = await client.from("posts")
      .select("id,user_id,caption,media_path,media_type,visibility,created_at")
      .eq("visibility", "public").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    remotePosts = (data || []).map(post => ({
      ...post,
      view_count: Number(post.view_count || 0),
      profiles: { username: "creator", display_name: "Creator" },
      likes: [{ count: 0 }],
      comments: [{ count: 0 }]
    }));

    // Enrichment is deliberately best-effort. A count or profile lookup error
    // should be logged clearly, but must not turn a readable feed into an error page.
    const authorIdsForProfiles = [...new Set(remotePosts.map(p => p.user_id).filter(Boolean))];
    const postIdsForCounts = remotePosts.map(p => p.id);
    try {
      if (authorIdsForProfiles.length) {
        const { data: profileRows, error: profilesError } = await client.from("profiles")
          .select("id,username,display_name").in("id", authorIdsForProfiles);
        if (profilesError) throw profilesError;
        const profileMap = new Map((profileRows || []).map(profile => [profile.id, profile]));
        remotePosts.forEach(post => { post.profiles = profileMap.get(post.user_id) || post.profiles; });
      }
      if (postIdsForCounts.length) {
        const [likesResult, commentsResult] = await Promise.all([
          client.from("likes").select("post_id").in("post_id", postIdsForCounts),
          client.from("comments").select("post_id").in("post_id", postIdsForCounts)
        ]);
        if (likesResult.error) throw likesResult.error;
        if (commentsResult.error) throw commentsResult.error;
        const likesCounts = {}, commentsCounts = {};
        (likesResult.data || []).forEach(row => { likesCounts[row.post_id] = (likesCounts[row.post_id] || 0) + 1; });
        (commentsResult.data || []).forEach(row => { commentsCounts[row.post_id] = (commentsCounts[row.post_id] || 0) + 1; });
        remotePosts.forEach(post => {
          post.likes = [{ count: likesCounts[post.id] || 0 }];
          post.comments = [{ count: commentsCounts[post.id] || 0 }];
        });
      }
    } catch (enrichmentError) {
      console.warn("Acoulys feed loaded, but profile/like/comment details could not be refreshed:", enrichmentError);
    }
    followedIds = new Set();
    // Following data is optional UI enrichment. Missing policies/tables must not
    // prevent the public posts themselves from rendering.
    try {
      if (authorIdsForProfiles.length) {
        const [followingRes, followerRes] = await Promise.all([
          client.from("follows").select("following_id").eq("follower_id", signedInUser.id).in("following_id", authorIdsForProfiles),
          client.from("follows").select("following_id").in("following_id", authorIdsForProfiles)
        ]);
        if (followingRes.error) throw followingRes.error;
        if (followerRes.error) throw followerRes.error;
        (followingRes.data || []).forEach(row => followedIds.add(row.following_id));
        const followerCounts = {};
        (followerRes.data || []).forEach(row => { followerCounts[row.following_id] = (followerCounts[row.following_id] || 0) + 1; });
        remotePosts.forEach(post => { post.followers_count = followerCounts[post.user_id] || 0; });
      }
    } catch (followError) {
      console.warn("Acoulys feed loaded without follow details:", followError);
    }
    // Viewer-specific like state is also optional. Counts and posts are already loaded.
    try {
      if (postIdsForCounts.length) {
        const { data: likes, error: likesError } = await client.from("likes").select("post_id").eq("user_id", signedInUser.id).in("post_id", postIdsForCounts);
        if (likesError) throw likesError;
        const likedIds = new Set((likes || []).map(row => row.post_id));
        remotePosts.forEach(post => { post.viewer_liked = likedIds.has(post.id); });
      }
    } catch (viewerLikesError) {
      console.warn("Acoulys feed loaded without your like state:", viewerLikesError);
    }
    await renderSocialFeed();
    try {
      await renderOwnStats();
    } catch (statsError) {
      console.warn("Acoulys feed loaded, but profile stats failed:", statsError);
    }
  }
  function renderSignedOut() {
    const feed = $("feed");
    if (feed) feed.innerHTML = '<div class="empty"><h3>Sign in to join the community</h3><p>Published posts, likes, follows and view counts are tied to real accounts.</p><button class="gradient-btn" id="socialSignIn">Sign in</button></div>';
    $("socialSignIn")?.addEventListener("click", () => window.acoulysAuth?.open());
  }
  async function mediaUrl(post) {
    if (!post.media_path || post.media_type === "text") return "";
    const { data, error } = await client.storage.from("musicali-media").createSignedUrl(post.media_path, 3600);
    if (error) {
      console.warn("Could not make a view URL for post media", post.id, error.message);
      return "";
    }
    return data?.signedUrl || "";
  }
  function postScore(post, index) {
    const ageHours = Math.max(0, (Date.now() - new Date(post.created_at).getTime()) / 3600000);
    const likes = Number(post.likes?.[0]?.count || 0);
    const views = Number(post.view_count || 0);
    const creatorAffinity = followedIds.has(post.user_id) ? 2.5 : 0;
    const freshness = 2 / (1 + ageHours / 24);
    const popularity = Math.log1p(likes) * 0.7 + Math.log1p(views) * 0.12;
    const exploration = ((String(post.id).charCodeAt(0) || 0) % 10) / 100;
    return creatorAffinity + freshness + popularity + exploration - index * 0.0001;
  }
  async function renderSocialFeed() {
    const feed = $("feed");
    if (!feed) return;
    const filter = currentFilter();
    let posts = remotePosts.filter(post => kindMatches(post, filter));
    if (filter === "All") {
      posts = posts.map((post, index) => ({ post, score: postScore(post, index) }))
        .sort((a, b) => b.score - a.score).map(entry => entry.post);
      // Small diversity pass: avoid long runs of the same media type.
      const diversified = [];
      const remaining = posts.slice();
      while (remaining.length) {
        let index = 0;
        if (diversified.length >= 2) {
          const lastKind = diversified[diversified.length - 1].media_type;
          const previousKind = diversified[diversified.length - 2].media_type;
          if (lastKind === previousKind) {
            const alternative = remaining.findIndex(p => p.media_type !== lastKind);
            if (alternative > 0) index = alternative;
          }
        }
        diversified.push(remaining.splice(index, 1)[0]);
      }
      posts = diversified;
    }
    if (!posts.length) {
      feed.innerHTML = '<div class="empty"><div style="font-size:34px;margin-bottom:8px">✦</div><strong>No community posts yet.</strong><p>Publish your first real post. It will be saved to Acoulys, not just this browser.</p><button class="gradient-btn" id="socialCreate">＋ Create a post</button></div>';
      $("socialCreate")?.addEventListener("click", () => window.openStudio ? window.openStudio("Create a video or photo") : document.querySelector('[data-page="Create"]')?.click());
      return;
    }
    const signedUrls = await Promise.all(posts.map(post => mediaUrl(post).catch(error => {
      console.warn("Acoulys could not prepare media URL for post:", post.id, error);
      return "";
    })));
    const cards = posts.map((post, i) => {
      const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
      const name = profile?.display_name || profile?.username || "Acoulys creator";
      const username = profile?.username ? "@" + profile.username : "@creator";
      const likes = Number(post.likes?.[0]?.count || 0);
      const comments = Number(post.comments?.[0]?.count || 0);
      const views = Number(post.view_count || 0);
      const isOwn = post.user_id === signedInUser?.id;
      const isFollowing = followedIds.has(post.user_id);
      const isLiked = !!post.viewer_liked;
      const url = signedUrls[i];
      let content = "";
      if (post.media_type === "text") {
        content = '<div class="social-text-post">' + escape(post.caption || "") + '</div>';
      } else if (url && post.media_type === "image") {
        content = '<img loading="lazy" src="' + escape(url) + '" alt="Post by ' + escape(name) + '">';
      } else if (url && post.media_type === "video") {
        content = '<video loading="lazy" src="' + escape(url) + '" controls playsinline preload="metadata" data-watch-post="' + post.id + '"></video>';
      } else if (url && post.media_type === "audio") {
        content = '<audio src="' + escape(url) + '" controls style="width:100%"></audio>';
      } else {
        content = '<div class="notice">This post’s media could not be loaded. The post is still saved on Acoulys.</div>';
      }
      return '<article class="post social-post" data-post-id="' + post.id + '"><div class="post-body">' +
        '<div class="creator"><span class="avatar">' + escape((name[0] || "A").toUpperCase()) + '</span><div class="creator-info"><strong>' + escape(name) + '</strong><small>' + escape(username) + ' · ' + dateLabel(post.created_at) + '</small></div>' +
        (!isOwn ? '<button class="follow" data-follow="' + post.user_id + '">' + (isFollowing ? "Following" : "Follow") + '</button>' : '<span class="muted">You</span>') + '</div>' +
        (post.caption && post.media_type !== "text" ? '<p style="margin:12px 0;white-space:pre-wrap">' + escape(post.caption) + '</p>' : '') +
        '<div class="social-media">' + content + '</div>' +
        '<div class="post-actions"><button class="' + (isLiked ? "liked" : "") + '" data-like="' + post.id + '" aria-label="Like post">♥ ' + short(likes) + '</button>' +
        '<button data-comment="' + post.id + '">☷ ' + short(comments) + '</button><button data-share="' + post.id + '">↗ Share</button><span>◉ ' + short(views) + ' views</span></div>' +
        '<div class="muted" style="margin-top:7px">' + short(post.followers_count || 0) + ' followers · ' + escape(post.media_type.toUpperCase()) + '</div></div></article>';
    }).join("");
    feed.innerHTML = cards;
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.55) return;
          observer.unobserve(entry.target);
          const card = entry.target;
          const id = card.dataset.postId;
          const post = remotePosts.find(p => p.id === id);
          if (!post || post.user_id === signedInUser?.id) return;
          const key = "acoulys-viewed:" + signedInUser.id + ":" + id;
          try {
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, "1");
          } catch (_) {}
          client.rpc("record_post_view", { post_uuid: id }).then(async ({ error }) => {
            if (error) { console.warn("Could not record post view:", error.message); return; }
            const { data } = await client.from("posts").select("view_count").eq("id", id).maybeSingle();
            if (data) {
              post.view_count = Number(data.view_count || 0);
              const counter = card.querySelector(".post-actions span");
              if (counter) counter.textContent = "◉ " + short(post.view_count) + " views";
            }
          });
        });
      }, { threshold: [0.55] });
      feed.querySelectorAll(".social-post").forEach(card => observer.observe(card));
    }
  }
  async function renderOwnStats() {
    if (!signedInUser) return;
    let box = $("socialStats");
    if (!box) {
      box = document.createElement("div");
      box.id = "socialStats";
      box.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px";
      $("feed")?.parentElement?.insertBefore(box, $("feed"));
    }
    const [postsRes, followersRes, followingRes] = await Promise.all([
      client.from("posts").select("id", { count: "exact", head: true }).eq("user_id", signedInUser.id),
      client.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", signedInUser.id),
      client.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", signedInUser.id)
    ]);
    if (postsRes.error || followersRes.error || followingRes.error) return;
    box.innerHTML = '<span class="pill">✦ ' + short(postsRes.count || 0) + ' posts</span><span class="pill">♧ ' + short(followersRes.count || 0) + ' followers</span><span class="pill">↗ ' + short(followingRes.count || 0) + ' following</span>';
  }
  // Larger uploads use Supabase Storage's resumable TUS endpoint. The supplied
  // TikTok example's two-stage pattern applies, but its upload URL and headers do not.
  let tusClientPromise = null;
  function loadTusClient() {
    if (window.tus?.Upload) return Promise.resolve(window.tus);
    if (tusClientPromise) return tusClientPromise;
    tusClientPromise = new Promise((resolve, reject) => {
      const sources = [
        "https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js",
        "https://unpkg.com/tus-js-client@4.3.1/dist/tus.min.js"
      ];
      const attempt = index => {
        if (window.tus?.Upload) return resolve(window.tus);
        if (index >= sources.length) { tusClientPromise = null; return reject(new Error("Could not load the resumable upload library. Check your connection and try again.")); }
        const script = document.createElement("script");
        script.src = sources[index];
        script.async = true;
        script.onload = () => window.tus?.Upload ? resolve(window.tus) : attempt(index + 1);
        script.onerror = () => { script.remove(); attempt(index + 1); };
        document.head.appendChild(script);
      };
      attempt(0);
    });
    return tusClientPromise;
  }
  async function uploadMediaToCloud(path, blob, button) {
    // Small files use the simple Storage upload. Larger files upload in resumable chunks.
    const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
    if (blob.size <= RESUMABLE_THRESHOLD) {
      const { error } = await client.storage.from("musicali-media").upload(path, blob, {
        contentType: blob.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: false
      });
      if (error) throw error;
      return;
    }
    const tus = await loadTusClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Your sign-in session expired. Sign in again before uploading.");
    const parsedSupabaseUrl = new URL(client.supabaseUrl);
    if (parsedSupabaseUrl.protocol !== "https:" && parsedSupabaseUrl.hostname !== "localhost" && parsedSupabaseUrl.hostname !== "127.0.0.1") {
      throw new Error("Secure upload blocked: the Supabase endpoint must use HTTPS. Check the Supabase Project URL in auth.js.");
    }
    const baseUrl = parsedSupabaseUrl.origin;
    await new Promise((resolve, reject) => {
      let upload;
      try {
        upload = new tus.Upload(blob, {
          endpoint: baseUrl + "/storage/v1/upload/resumable",
          retryDelays: [0, 1000, 3000, 5000, 10000],
          chunkSize: 6 * 1024 * 1024,
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          headers: {
            authorization: "Bearer " + accessToken,
            apikey: client.supabaseKey
          },
          metadata: {
            bucketName: "musicali-media",
            objectName: path,
            contentType: blob.type || "application/octet-stream",
            cacheControl: "3600"
          },
          onProgress(bytesUploaded, bytesTotal) {
            if (button && bytesTotal > 0) button.textContent = "Uploading " + Math.min(99, Math.round(bytesUploaded / bytesTotal * 100)) + "%…";
          },
          onError: reject,
          onSuccess: resolve
        });
        upload.start();
      } catch (error) {
        reject(error);
      }
    });
  }
  async function publishToCloud({ blob = null, mediaType = "text", caption = "", fileName = "" }) {
    if (busy) return false;
    // Resolve the current session on demand. The studio can be used before the
    // asynchronous initial feed load has finished.
    if (!signedInUser) {
      try {
        const { data: authData, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        signedInUser = authData?.user || null;
      } catch (authError) {
        console.warn("Acoulys could not verify the publishing session:", authError);
      }
    }
    if (!signedInUser) {
      // Keep the selected Blob/caption in memory and resume after sign-in.
      pendingPublish = { blob, mediaType, caption, fileName };
      say("Sign in first. Acoulys will continue publishing your post after sign-in.");
      window.acoulysAuth?.open();
      return false;
    }
    if (mediaType !== "text" && !blob) { say("Create or import a photo, video, or audio file first."); return false; }
    busy = true;
    const button = mediaType === "text" ? $("blogPublish") : $("publishPost");
    if (button) { button.disabled = true; button.dataset.originalText ||= button.textContent; button.textContent = "Publishing…"; }
    const status = $("studioStatus");
    const oldStatus = status?.textContent || "";
    if (status && mediaType !== "text") status.textContent = "Preparing your post…";
    let path = null;
    let postCreated = false;
    try {
      // The posts.user_id foreign key requires a profile row. Ensure it exists
      // before spending time uploading a large file.
      try {
        await ensureProfile(signedInUser);
      } catch (profileError) {
        throw new Error("Your Acoulys profile could not be prepared: " + (profileError?.message || "profile setup failed"));
      }
      if (blob) {
        if (status && mediaType !== "text") status.textContent = "Uploading your media…";
        const ext = (fileName.split(".").pop() || ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "video/mp4":"mp4", "audio/mpeg":"mp3" }[blob.type] || blob.type.split("/")[1] || "bin")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
        path = signedInUser.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 9) + "." + ext;
        await uploadMediaToCloud(path, blob, button);
      }
      if (status && mediaType !== "text") status.textContent = "Saving your post…";
      const row = { user_id: signedInUser.id, caption: String(caption || "").trim(), media_path: path, media_type: mediaType, visibility: "public" };
      const { data, error } = await client.from("posts").insert(row).select("id").single();
      if (error) throw error;
      postCreated = true;
      if (mediaType === "text") {
        if (typeof window.closeBlogComposer === "function") window.closeBlogComposer();
        else $("blogModal") && ($("blogModal").style.display = "none");
      } else if (typeof window.closeStudio === "function") window.closeStudio();
      say("Published to Acoulys! Your post is now in the shared feed.");
      if (typeof window.readLibrary === "function" && typeof window.saveLibraryItem === "function") {
        // Keep a local archive copy only when it is already a local creation.
        if (blob && typeof window.localProfileName === "function") {
          try { await window.saveLibraryItem({ id: "archive_" + data.id, name: window.localProfileName(), author: window.localProfileName(), caption: String(caption || ""), type: blob.type, blob, createdAt: Date.now(), draft: false, published: false }); } catch (_) {}
        }
      }
      await loadSocialData();
      return true;
    } catch (error) {
      if (path && !postCreated) {
        try { await client.storage.from("musicali-media").remove([path]); } catch (_) {}
      }
      console.error("Acoulys publish failed:", error);
      if (postCreated) {
        say("Your post was published, but the feed could not refresh. Refresh Acoulys to see it.");
        return true;
      }
      const responseBody = error?.originalResponse?.getBody?.() || error?.response?.data || error?.body || "";
      const statusCode = error?.originalResponse?.getStatus?.() || error?.status || error?.statusCode || error?.response?.status || "";
      const baseMessage = error?.message || "Publishing failed.";
      const detail = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
      const message = [statusCode ? "HTTP " + statusCode : "", baseMessage, detail && detail !== baseMessage ? detail : ""].filter(Boolean).join(" · ");
      if (status && mediaType !== "text") status.textContent = "Publish failed: " + message;
      console.error("Acoulys backend setup hint:", message);
      if (/relation .* does not exist|column .* does not exist|schema cache|could not find the .* table/i.test(message)) {
        say("Acoulys database is not set up yet. Run the complete backend/setup.sql file in Supabase SQL Editor, then refresh.");
      } else if (/row-level security|permission denied|bucket/i.test(message)) {
        say("Supabase is blocking this upload. Run the complete backend/setup.sql file, confirm it succeeds, then try again.");
      } else {
        say("Could not publish: " + message);
      }
      return false;
    } finally {
      busy = false;
      if (button) { button.disabled = false; if (button.dataset.originalText) button.textContent = button.dataset.originalText; }
    }
  }
  async function publishLocalDraft(id) {
    if (!signedInUser) { say("Sign in to publish a draft."); window.acoulysAuth?.open(); return; }
    const items = await window.readLibrary();
    const item = items.find(entry => entry.id === id);
    if (!item) { say("That draft is no longer available on this device."); return; }
    const mediaType = item.kind === "blog" || item.type === "text/plain" ? "text" : item.type?.startsWith("image/") ? "image" : item.type?.startsWith("video/") ? "video" : item.type?.startsWith("audio/") ? "audio" : "";
    if (!mediaType) { say("This file type cannot be published yet."); return; }
    const caption = mediaType === "text" ? ((item.title ? item.title + "\n\n" : "") + (item.content || item.caption || "")) : (item.caption || "");
    const published = await publishToCloud({ blob: mediaType === "text" ? null : item.blob, mediaType, caption, fileName: item.name || "" });
    // Keep the local draft intact if publishing fails.
    if (published) {
      await window.deleteLibraryItem(id);
      if (typeof window.renderPage === "function") await window.renderPage("Drafts");
    }
  }
  async function toggleLike(postId) {
    const post = remotePosts.find(p => p.id === postId);
    if (!post || !signedInUser) { say("Sign in to like posts."); return; }
    const { data: existing, error: findError } = await client.from("likes").select("post_id").eq("user_id", signedInUser.id).eq("post_id", postId).maybeSingle();
    if (findError) { say("Could not check your like. " + findError.message); return; }
    if (existing) {
      const { error } = await client.from("likes").delete().eq("user_id", signedInUser.id).eq("post_id", postId);
      if (error) { say("Could not remove like. " + error.message); return; }
    } else {
      const { error } = await client.from("likes").insert({ user_id: signedInUser.id, post_id: postId });
      if (error) { say("Could not like this post. " + error.message); return; }
    }
    await loadSocialData();
  }
  async function toggleFollow(userId) {
    if (!signedInUser || userId === signedInUser.id) return;
    if (followedIds.has(userId)) {
      const { error } = await client.from("follows").delete().eq("follower_id", signedInUser.id).eq("following_id", userId);
      if (error) { say("Could not unfollow. " + error.message); return; }
      followedIds.delete(userId);
      say("Unfollowed creator.");
    } else {
      const { error } = await client.from("follows").insert({ follower_id: signedInUser.id, following_id: userId });
      if (error) { say("Could not follow. " + error.message); return; }
      followedIds.add(userId);
      say("You're following this creator ✦");
    }
    await loadSocialData();
  }
  async function addComment(postId) {
    if (!signedInUser) { say("Sign in to comment."); return; }
    const body = window.prompt("Write a comment (up to 1,200 characters):");
    if (body === null) return;
    const clean = body.trim();
    if (!clean) { say("A comment can't be empty."); return; }
    if (clean.length > 1200) { say("That comment is too long. Keep it under 1,200 characters."); return; }
    const { error } = await client.from("comments").insert({ post_id: postId, user_id: signedInUser.id, body: clean });
    if (error) { say("Could not add comment. " + error.message); return; }
    say("Comment posted.");
    await loadSocialData();
  }
  async function sharePost(postId) {
    const url = location.origin + location.pathname + "?post=" + encodeURIComponent(postId);
    try {
      if (navigator.share) await navigator.share({ title: "Acoulys post", text: "Look at this post on Acoulys", url });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); say("Post link copied."); }
      else say("Copy this post link: " + url);
      await client.from("notifications").select("id").limit(1); // no notification is fabricated for a share
    } catch (error) {
      if (error?.name !== "AbortError") say("Couldn't share this post from this browser.");
    }
  }
  document.addEventListener("click", event => {
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      event.preventDefault(); event.stopImmediatePropagation();
      document.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("active", button === filter));
      renderSocialFeed();
      return;
    }
    const like = event.target.closest("[data-like]");
    const follow = event.target.closest("[data-follow]");
    const comment = event.target.closest("[data-comment]");
    const share = event.target.closest("[data-share]");
    const draft = event.target.closest("[data-publish-draft]");
    if (like) { event.preventDefault(); event.stopImmediatePropagation(); toggleLike(like.dataset.like); return; }
    if (follow) { event.preventDefault(); event.stopImmediatePropagation(); toggleFollow(follow.dataset.follow); return; }
    if (comment) { event.preventDefault(); event.stopImmediatePropagation(); addComment(comment.dataset.comment); return; }
    if (share) { event.preventDefault(); event.stopImmediatePropagation(); sharePost(share.dataset.share); return; }
    if (draft) { event.preventDefault(); event.stopImmediatePropagation(); publishLocalDraft(draft.dataset.publishDraft); return; }
    if (event.target.closest("#publishPost")) {
      event.preventDefault(); event.stopImmediatePropagation();
      const creation = window.acoulysGetCurrentCreation?.() || {};
      const blob = creation.blob;
      if (!blob) { say("Choose or record a photo, video, or audio clip first."); return; }
      const mediaType = blob.type?.startsWith("image/") ? "image" : blob.type?.startsWith("audio/") ? "audio" : blob.type?.startsWith("video/") ? "video" : "";
      if (!mediaType) { say("This file type cannot be published yet."); return; }
      publishToCloud({ blob, mediaType, caption: creation.caption || $("postCaption")?.value || "", fileName: creation.fileName || $("mediaImport")?.files?.[0]?.name || "" });
      return;
    }
    if (event.target.closest("#blogPublish")) {
      event.preventDefault(); event.stopImmediatePropagation();
      const title = $("blogTitleInput")?.value.trim() || "";
      const content = $("blogBodyInput")?.value.trim() || "";
      if (!content) { say("Write something first, even if it is one sentence."); return; }
      publishToCloud({ mediaType: "text", caption: (title ? title + "\n\n" : "") + content });
    }
  }, true);
  // A signed-in session can publish, and the feed refreshes after auth changes.
  client.auth.onAuthStateChange((_event, session) => {
    signedInUser = session?.user || null;
    if (signedInUser) {
      window.setTimeout(() => {
        const queued = pendingPublish;
        pendingPublish = null;
        loadSocialData().catch(error => {
          console.error("Acoulys feed load failed:", error);
          say("Couldn't refresh the feed: " + (error?.message || "unknown error"));
        });
        if (queued) publishToCloud(queued).catch(error => {
          console.error("Queued Acoulys publish failed:", error);
          say("Could not finish publishing: " + (error?.message || "unknown error"));
        });
      }, 0);
    } else renderSignedOut();
  });

  async function listGroups() {
    if (!signedInUser) return {ok:false,message:"Sign in to use group chats."};
    const {data: memberships,error} = await client.from("group_chat_members").select("group_id").eq("user_id",signedInUser.id);
    if(error) return {ok:false,message:error.message};
    const ids=(memberships||[]).map(x=>x.group_id);
    if(!ids.length) return {ok:true,groups:[]};
    const {data:groups,error:groupError}=await client.from("group_chats").select("id,name,created_at").in("id",ids).order("created_at",{ascending:false});
    if(groupError) return {ok:false,message:groupError.message};
    const {data:members}=await client.from("group_chat_members").select("group_id").in("group_id",ids);
    return {ok:true,groups:(groups||[]).map(g=>({...g,member_count:(members||[]).filter(m=>m.group_id===g.id).length}))};
  }
  async function createGroup(name, memberNames) {
    if(!signedInUser) return {ok:false,message:"Sign in first to create a group."};
    const cleanName=String(name||"").trim();
    if(!cleanName||cleanName.length>70) return {ok:false,message:"Give your group a name (1 to 70 characters)."};
    const names=[...new Set(String(memberNames||"").split(",").map(n=>n.trim().replace(/^@/,"").toLowerCase()).filter(Boolean))];
    if(names.length>30) return {ok:false,message:"A group can add up to 30 other members at once."};
    let memberIds=[signedInUser.id];
    if(names.length){
      const {data:profiles,error}=await client.from("profiles").select("id,username").in("username",names);
      if(error)return {ok:false,message:error.message};
      const found=new Map((profiles||[]).map(p=>[p.username.toLowerCase(),p]));
      const missing=names.filter(n=>!found.has(n));
      if(missing.length)return {ok:false,message:"Username(s) not found: "+missing.join(", ")};
      memberIds.push(...[...found.values()].map(p=>p.id).filter(id=>id!==signedInUser.id));
    }
    const {data:group,error}=await client.from("group_chats").insert({name:cleanName,created_by:signedInUser.id}).select("id").single();
    if(error)return {ok:false,message:error.message};
    const {error:membersError}=await client.from("group_chat_members").insert([...new Set(memberIds)].map(user_id=>({group_id:group.id,user_id})));
    if(membersError)return {ok:false,message:"Group created, but members could not be added: "+membersError.message};
    return {ok:true,message:"Group created!",groupId:group.id};
  }
  async function listGroupMessages(groupId) {
    if(!signedInUser)return {ok:false,message:"Sign in to read group messages."};
    const {data,error}=await client.from("group_chat_messages").select("id,body,created_at,sender_id").eq("group_id",groupId).order("created_at",{ascending:true}).limit(200);
    if(error)return {ok:false,message:error.message};
    const ids=[...new Set((data||[]).map(m=>m.sender_id))];
    const {data:profiles}=ids.length?await client.from("profiles").select("id,username,display_name").in("id",ids):{data:[]};
    const byId=new Map((profiles||[]).map(p=>[p.id,p]));
    return {ok:true,messages:(data||[]).map(m=>({...m,sender_name:byId.get(m.sender_id)?.display_name||byId.get(m.sender_id)?.username||"Member",sender_username:byId.get(m.sender_id)?.username||""}))};
  }
  async function sendGroupMessage(groupId, body) {
    if(!signedInUser)return {ok:false,message:"Sign in to send messages."};
    const clean=String(body||"").trim();
    if(!clean||clean.length>4000)return {ok:false,message:"Messages must contain 1 to 4,000 characters."};
    const {error}=await client.from("group_chat_messages").insert({group_id:groupId,sender_id:signedInUser.id,body:clean});
    return error?{ok:false,message:error.message}:{ok:true};
  }

  // Keep every route back to For You on the shared feed, not the old device-only feed.
  window.renderFeed = renderSocialFeed;
  window.acoulysSocial = { refresh: () => loadSocialData(), publish: publishToCloud, listGroups, createGroup, listGroupMessages, sendGroupMessage };
  loadSocialData().catch(error => {
    console.error("Acoulys social startup failed:", error);
    const feed = $("feed");
    if (feed) feed.innerHTML = '<div class="empty"><h3>Community feed could not load</h3><p>' + escape(error?.message || "Check the Supabase connection and run backend/social-migration.sql.") + '</p><button class="gradient-btn" id="socialRetry">Try again</button></div>';
    $("socialRetry")?.addEventListener("click", () => loadSocialData().catch(err => say(err.message)));
  });
})();