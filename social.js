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
    await ensureProfile(signedInUser);
    const { data, error } = await client.from("posts")
      .select("id,user_id,caption,media_path,media_type,visibility,created_at,view_count,profiles(username,display_name),likes(count),comments(count)")
      .eq("visibility", "public").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    remotePosts = data || [];
    const authorIds = [...new Set(remotePosts.map(p => p.user_id).filter(Boolean))];
    followedIds = new Set();
    if (authorIds.length) {
      const { data: follows, error: followError } = await client.from("follows").select("following_id").eq("follower_id", signedInUser.id).in("following_id", authorIds);
      if (followError) throw followError;
      (follows || []).forEach(row => followedIds.add(row.following_id));
    }
    await renderSocialFeed();
    await renderOwnStats();
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
    const signedUrls = await Promise.all(posts.map(mediaUrl));
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
    const videos = feed.querySelectorAll("video[data-watch-post]");
    videos.forEach(video => {
      video.addEventListener("play", () => {
        const id = video.dataset.watchPost;
        const key = "acoulys-viewed:" + id;
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
        } catch (_) {}
        client.rpc("record_post_view", { post_uuid: id }).then(({ error }) => {
          if (!error) {
            const post = remotePosts.find(p => p.id === id);
            if (post && post.user_id !== signedInUser?.id) post.view_count = Number(post.view_count || 0) + 1;
            const counter = video.closest(".post")?.querySelector(".post-actions span");
            if (counter && post) counter.textContent = "◉ " + short(post.view_count) + " views";
          }
        });
      }, { once: true });
    });
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
  async function publishToCloud({ blob = null, mediaType = "text", caption = "", fileName = "" }) {
    if (busy) return;
    if (!signedInUser) {
      say("Sign in to publish to the community.");
      window.acoulysAuth?.open();
      return;
    }
    if (mediaType !== "text" && !blob) { say("Create or import a photo, video, or audio file first."); return; }
    busy = true;
    const button = $("publishPost") || $("blogPublish");
    if (button) { button.disabled = true; button.dataset.originalText ||= button.textContent; button.textContent = "Publishing…"; }
    let path = null;
    try {
      if (blob) {
        const ext = (fileName.split(".").pop() || ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "video/mp4":"mp4", "audio/mpeg":"mp3" }[blob.type] || blob.type.split("/")[1] || "bin")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
        path = signedInUser.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 9) + "." + ext;
        const { error: uploadError } = await client.storage.from("musicali-media").upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
      }
      const row = { user_id: signedInUser.id, caption: String(caption || "").trim(), media_path: path, media_type: mediaType, visibility: "public" };
      const { data, error } = await client.from("posts").insert(row).select("id").single();
      if (error) throw error;
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
    } catch (error) {
      if (path) {
        try { await client.storage.from("musicali-media").remove([path]); } catch (_) {}
      }
      console.error("Acoulys publish failed:", error);
      const message = error?.message || "Publishing failed.";
      say(message.includes("musicali-media") || message.includes("Bucket") ? "Media storage is not ready yet. Run backend/social-migration.sql in Supabase, then retry." : "Could not publish: " + message);
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
    await publishToCloud({ blob: mediaType === "text" ? null : item.blob, mediaType, caption, fileName: item.name || "" });
    // Keep the local draft intact if the upload failed; on success it is safe to remove it from Drafts.
    if (!busy) {
      const { data } = await client.from("posts").select("id").eq("user_id", signedInUser.id).eq("caption", caption).order("created_at", { ascending: false }).limit(1);
      if (data?.length) {
        await window.deleteLibraryItem(id);
        if (typeof window.renderPage === "function") await window.renderPage("Drafts");
      }
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
      publishToCloud({ blob: window.recordedBlob || recordedBlob, mediaType: (window.recordedBlob || recordedBlob)?.type?.startsWith("image/") ? "image" : (window.recordedBlob || recordedBlob)?.type?.startsWith("audio/") ? "audio" : "video", caption: $("postCaption")?.value || "", fileName: $("mediaImport")?.files?.[0]?.name || "" });
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
    if (signedInUser) window.setTimeout(() => loadSocialData().catch(error => { console.error("Acoulys feed load failed:", error); say("Couldn't load the shared feed. Check the social migration and Supabase connection."); }), 0);
    else renderSignedOut();
  });
  window.acoulysSocial = { refresh: () => loadSocialData(), publish: publishToCloud };
  loadSocialData().catch(error => {
    console.error("Acoulys social startup failed:", error);
    const feed = $("feed");
    if (feed) feed.innerHTML = '<div class="empty"><h3>Community feed could not load</h3><p>' + escape(error?.message || "Check the Supabase connection and run backend/social-migration.sql.") + '</p><button class="gradient-btn" id="socialRetry">Try again</button></div>';
    $("socialRetry")?.addEventListener("click", () => loadSocialData().catch(err => say(err.message)));
  });
})();