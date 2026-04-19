(() => {
  "use strict";

  const SUPABASE_URL = "https://xfznhdxeifrtbcaagdoq.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmem5oZHhlaWZydGJjYWFnZG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MzI2OTQsImV4cCI6MjA4NjMwODY5NH0.FqClkDemAvxhftotSrIf90xunRrECLC-leVP2-nQgug";

  const DEFAULT_AVATAR_URL = "assets/default-avatar.png";

  const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const qs = (id) => document.getElementById(id);
  const currentPage = () => (location.pathname.split("/").pop() || "").toLowerCase();

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const toStars = (rating) => {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const whole = Math.round(r);
    return Array.from({ length: 5 }, (_, i) => (i < whole ? "★" : "☆")).join("");
  };

  const formatDate = (ts) => {
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const menuBtn = qs("menuBtn");
  const nav = qs("nav");
  const yearEl = qs("year");

  menuBtn?.addEventListener("click", () => {
    const open = nav?.classList.toggle("isOpen");
    menuBtn.setAttribute("aria-expanded", String(!!open));
  });

  nav?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      nav.classList.remove("isOpen");
      menuBtn?.setAttribute("aria-expanded", "false");
    });
  });

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const authDisplay = qs("authDisplay");
  const authEmail = qs("authEmail");
  const authPass = qs("authPass");
  const btnSignUp = qs("btnSignUp");
  const btnLogin = qs("btnLogin");
  const btnLogout = qs("btnLogout");
  const authStatus = qs("authStatus");

  const navAuthLink = qs("navAuthLink");
  const navLogoutBtn = qs("navLogoutBtn");
  const headerAvatar = qs("headerAvatar");

  async function getSessionUser() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user ?? null;
  }

  async function getProfile(userId) {
    if (!sb || !userId) return null;
    const { data } = await sb
      .from("profiles")
      .select("id, display_name, avatar_path")
      .eq("id", userId)
      .maybeSingle();
    return data || null;
  }

  function deriveDisplayNameFromUser(user) {
    if (!user) return "Member";
    if (user.user_metadata?.display_name) return String(user.user_metadata.display_name);
    if (user.email) return String(user.email).split("@")[0];
    return "Member";
  }

  async function ensureProfileRow(user) {
    if (!sb || !user?.id) return;

    const existing = await getProfile(user.id);
    const desired = (existing?.display_name || "").trim() || deriveDisplayNameFromUser(user);

    await sb.from("profiles").upsert(
      { id: user.id, display_name: desired },
      { onConflict: "id" }
    );
  }

  async function getAvatarPublicUrl(profile) {
    const p = profile?.avatar_path;
    if (!sb || !p) return null;
    const { data } = sb.storage.from("avatars").getPublicUrl(p);
    return data?.publicUrl || null;
  }

  async function setHeaderAuthUI() {
    const user = await getSessionUser();
    const loggedIn = !!user;

    if (navAuthLink) {
      const current = currentPage() || "index.html";
      navAuthLink.textContent = loggedIn ? "Account" : "Sign Up / Login";
      navAuthLink.href = `account.html?redirect=${encodeURIComponent(current)}`;
    }

    if (navLogoutBtn) navLogoutBtn.style.display = loggedIn ? "inline-flex" : "none";
  }

  async function loadHeaderAvatar() {
    if (!headerAvatar) return;
    const user = await getSessionUser();

    if (!user) {
      headerAvatar.style.display = "none";
      headerAvatar.removeAttribute("src");
      return;
    }

    const prof = await getProfile(user.id);
    const url = (await getAvatarPublicUrl(prof)) || DEFAULT_AVATAR_URL;

    headerAvatar.src = url;
    headerAvatar.style.display = "inline-block";
    headerAvatar.alt = "Your avatar";
    headerAvatar.style.cursor = "pointer";
    headerAvatar.onclick = () => {
      window.location.href = `user.html?id=${encodeURIComponent(user.id)}`;
    };
  }

  async function setAuthUI() {
    const user = await getSessionUser();
    const loggedIn = !!user;

    if (btnLogout) btnLogout.style.display = loggedIn ? "inline-flex" : "none";
    if (btnLogin) btnLogin.style.display = loggedIn ? "none" : "inline-flex";
    if (btnSignUp) btnSignUp.style.display = loggedIn ? "none" : "inline-flex";

    if (authDisplay) authDisplay.style.display = loggedIn ? "none" : "";
    if (authEmail) authEmail.style.display = loggedIn ? "none" : "";
    if (authPass) authPass.style.display = loggedIn ? "none" : "";

    await setHeaderAuthUI();
    await loadHeaderAvatar();
  }

  btnSignUp?.addEventListener("click", async () => {
    try {
      if (!sb) return (authStatus.textContent = "❌ Supabase not loaded.");

      const display = authDisplay?.value?.trim();
      const email = authEmail?.value?.trim();
      const pass = authPass?.value;

      if (!display) return (authStatus.textContent = "❗ Enter a display name.");
      if (!email || !pass) return (authStatus.textContent = "❗ Enter email + password.");

      authStatus.textContent = "Creating account…";

      const { data, error } = await sb.auth.signUp({
        email,
        password: pass,
        options: { data: { display_name: display } },
      });

      if (error) return (authStatus.textContent = "❌ " + error.message);

      if (data?.user) {
        await sb.from("profiles").upsert(
          { id: data.user.id, display_name: display },
          { onConflict: "id" }
        );
      }

      authStatus.textContent =
        "✅ Signed up! Check your email if confirmation is required.";

      await setAuthUI();
    } catch (err) {
      console.error(err);
      if (authStatus) authStatus.textContent = "❌ Sign up crashed.";
    }
  });

  btnLogin?.addEventListener("click", async () => {
    try {
      if (!sb) {
        authStatus.textContent = "❌ Supabase not loaded.";
        return;
      }

      const email = authEmail?.value?.trim();
      const pass = authPass?.value;

      if (!email || !pass) {
        authStatus.textContent = "❗ Enter email and password.";
        return;
      }

      authStatus.textContent = "Logging in…";

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) {
        authStatus.textContent = "❌ " + error.message;
        return;
      }

      const user = data?.user;
      if (!user) {
        authStatus.textContent = "⚠️ Login succeeded but no user returned.";
        return;
      }

console.log("LOGIN SUCCESS USER:", user);

authStatus.textContent = "✅ Logged in! Redirecting...";

const redirect = new URLSearchParams(location.search).get("redirect");
window.location.href = redirect || "home.html";
    } catch (err) {
      console.error(err);
      if (authStatus) authStatus.textContent = "❌ Login crashed.";
    }
  });

  async function doLogout() {
    if (!sb) return;
    await sb.auth.signOut();
    await setAuthUI();
  }

  btnLogout?.addEventListener("click", async () => {
    await doLogout();
    if (authStatus) authStatus.textContent = "Logged out.";
  });

  navLogoutBtn?.addEventListener("click", async () => {
    await doLogout();
    window.location.href = "index.html";
  });

  async function uploadAvatar(file) {
    if (!sb) throw new Error("Supabase not loaded.");
    const user = await getSessionUser();
    if (!user) throw new Error("Please log in first.");

    await ensureProfileRow(user);

    const ext = (file?.name || "").split(".").pop().toLowerCase() || "png";
    const safeExt = ["png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "png";
    const path = `${user.id}.${safeExt}`;

    const { error: upErr } = await sb.storage
      .from("avatars")
      .upload(path, file, {
        upsert: true,
        contentType: file.type || `image/${safeExt}`,
      });

    if (upErr) throw upErr;

    const { error: profErr } = await sb
      .from("profiles")
      .upsert({ id: user.id, avatar_path: path }, { onConflict: "id" });

    if (profErr) throw profErr;

    return path;
  }

  async function wireAvatarUploadOnAccountPage() {
    const fileInput = qs("avatarFile");
    const btnUpload = qs("btnUploadAvatar");
    const out = qs("avatarStatus");

    if (!fileInput || !btnUpload) return;

    btnUpload.addEventListener("click", async () => {
      try {
        if (!sb) return (out.textContent = "❌ Supabase not loaded.");
        const f = fileInput.files?.[0];
        if (!f) return (out.textContent = "❗ Choose an image first.");

        out.textContent = "Uploading avatar…";
        await uploadAvatar(f);
        out.textContent = "✅ Avatar updated!";
        await loadHeaderAvatar();
      } catch (e) {
        console.error(e);
        out.textContent = "❌ Avatar upload failed.";
      }
    });
  }

  const ratingForm = qs("ratingForm");
  const wrTitle = qs("wrTitle");
  const wrTypeEl = qs("wrType");
  const wrReview = qs("wrReview");
  const wrStatus = qs("wrStatus");
  const starRow = qs("starRow");
  const wrSelected = qs("wrSelected");
  const wrAvg = qs("wrAvg");
  const wrAvgStars = qs("wrAvgStars");
  const wrCount = qs("wrCount");
  const wrList = qs("wrList");
  const wrTopList = qs("wrTopList");
  const wrSearch = qs("wrSearch");
  const wrSearchMeta = qs("wrSearchMeta");
  const wrMinRating = qs("wrMinRating");
  const wrSort = qs("wrSort");

  let filterType = null;
  if (wrTypeEl) {
    filterType = wrTypeEl.tagName.toUpperCase() === "SELECT" ? null : wrTypeEl.value;
  }

  let selectedRating = 0.0;
  const steps = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5);

  function renderStarButtons() {
    if (!starRow) return;
    starRow.innerHTML = "";

    steps.forEach((val) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "starBtn";
      b.textContent = val.toFixed(1);
      b.addEventListener("click", () => {
        selectedRating = val;
        if (wrSelected) wrSelected.textContent = selectedRating.toFixed(1);
        starRow.querySelectorAll(".starBtn").forEach((x) => x.classList.remove("isActive"));
        b.classList.add("isActive");
      });
      starRow.appendChild(b);
    });
  }

  async function fetchReviews() {
    if (!sb) return [];

    let q = sb
      .from("wrn_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filterType) q = q.eq("type", filterType);

    const { data, error } = await q;

    if (error) {
      console.error(error);
      return [];
    }

    return data || [];
  }

  async function fetchProfilesMap(userIds) {
    if (!sb) return new Map();
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (!ids.length) return new Map();

    const { data, error } = await sb
      .from("profiles")
      .select("id, display_name, avatar_path")
      .in("id", ids);

    if (error) {
      console.error(error);
      return new Map();
    }

    const m = new Map();
    (data || []).forEach((p) => m.set(p.id, p));
    return m;
  }

  function applyFilters(items) {
    let out = [...(items || [])];

    const q = (wrSearch?.value || "").trim().toLowerCase();
    const qNum = Number(q);
    const isNum = q && !Number.isNaN(qNum);

    if (q) {
      out = out.filter((r) => {
        const hay = `${r.title || ""} ${r.review || ""}`.toLowerCase();
        return hay.includes(q) || (isNum && Number(r.rating) === qNum);
      });
    }

    const min = Number(wrMinRating?.value || "0");
    if (min > 0) out = out.filter((r) => Number(r.rating) >= min);

    const sort = wrSort?.value || "newest";
    out.sort((a, b) => {
      const ra = Number(a.rating), rb = Number(b.rating);
      const ta = new Date(a.created_at).getTime(), tb = new Date(b.created_at).getTime();
      if (sort === "highest") return rb - ra || tb - ta;
      if (sort === "lowest") return ra - rb || tb - ta;
      if (sort === "oldest") return ta - tb;
      return tb - ta;
    });

    if (wrSearchMeta) {
      wrSearchMeta.textContent = out.length ? `${out.length} result(s)` : "0 results";
    }

    return out;
  }

  function renderStats(items) {
    if (!wrCount || !wrAvg || !wrAvgStars) return;
    wrCount.textContent = String(items.length);
    const avg = items.length
      ? items.reduce((s, r) => s + Number(r.rating), 0) / items.length
      : 0;
    wrAvg.textContent = avg.toFixed(1);
    wrAvgStars.textContent = toStars(avg);
  }

  async function renderTop(items, profilesMap) {
    if (!wrTopList) return;
    wrTopList.innerHTML = "";

    if (!items.length) {
      wrTopList.innerHTML = '<p class="muted">No top rated items yet.</p>';
      return;
    }

    const top = [...items]
      .sort((a, b) => Number(b.rating) - Number(a.rating) || new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    for (const r of top) {
      const p = profilesMap.get(r.user_id);
      const name = p?.display_name || "Member";
      const avatar = (await getAvatarPublicUrl(p)) || DEFAULT_AVATAR_URL;

      const d = document.createElement("div");
      d.className = "wrTopItem";
      d.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;min-width:0;">
          <a href="user.html?id=${encodeURIComponent(r.user_id)}" style="display:inline-flex;align-items:center;gap:10px;min-width:0;">
            <img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;" />
            <div style="min-width:0;">
              <div class="wrTopTitle" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.title)}</div>
              <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)} • ${escapeHtml(r.type)} • ${formatDate(r.created_at)}</div>
            </div>
          </a>
        </div>
        <div class="wrTopRight">
          <div class="wrSmallStars">${toStars(Number(r.rating))}</div>
          <strong>${Number(r.rating).toFixed(1)}/5</strong>
        </div>
      `;
      wrTopList.appendChild(d);
    }
  }

  async function renderList(items, profilesMap) {
    if (!wrList) return;
    wrList.innerHTML = "";

    if (!items.length) {
      wrList.innerHTML = '<p class="muted">No ratings yet. Be the first to set the tone.</p>';
      return;
    }

    const slice = items.slice(0, 30);

    for (const r of slice) {
      const p = profilesMap.get(r.user_id);
      const name = p?.display_name || "Member";
      const avatar = (await getAvatarPublicUrl(p)) || DEFAULT_AVATAR_URL;

      const c = document.createElement("div");
      c.className = "wrItem";
      c.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
          <div style="display:flex;gap:12px;align-items:center;min-width:0;">
            <a href="user.html?id=${encodeURIComponent(r.user_id)}" style="display:inline-flex;align-items:center;gap:12px;min-width:0;">
              <img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" />
              <div style="min-width:0;">
                <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.title)}</div>
                <div class="muted" style="font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)} • ${formatDate(r.created_at)}</div>
              </div>
            </a>
          </div>
          <div class="wrBadge">${escapeHtml(r.type)}</div>
        </div>

        <div class="wrRatingLine">
          <div class="wrSmallStars">${toStars(Number(r.rating))}</div>
          <strong>${Number(r.rating).toFixed(1)}/5</strong>
        </div>

        <div class="wrReview">${escapeHtml(r.review)}</div>
      `;
      wrList.appendChild(c);
    }
  }

  async function refreshReviews() {
    if (!wrList && !wrAvg && !wrCount && !wrTopList) return;

    const all = await fetchReviews();
    const filtered = applyFilters(all);
    const profilesMap = await fetchProfilesMap(filtered.map((r) => r.user_id));

    renderStats(filtered);
    await renderTop(filtered, profilesMap);
    await renderList(filtered, profilesMap);
  }

  if (starRow && wrSelected) renderStarButtons();
  wrSearch?.addEventListener("input", refreshReviews);
  wrMinRating?.addEventListener("change", refreshReviews);
  wrSort?.addEventListener("change", refreshReviews);

  ratingForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const user = await getSessionUser();
      if (!user) return (wrStatus.textContent = "🔒 Please login to post a review.");

      await ensureProfileRow(user);

      if (selectedRating <= 0) {
        return (wrStatus.textContent = "❗ Please select a rating (0.5 to 5.0).");
      }

      const title = wrTitle?.value?.trim();
      const review = wrReview?.value?.trim();
      const type = wrTypeEl?.value;

      if (!title || !review || !type) {
        return (wrStatus.textContent = "❗ Please enter a title and review.");
      }

      wrStatus.textContent = "Posting…";

      const { error } = await sb.from("wrn_reviews").insert({
        user_id: user.id,
        title,
        type,
        rating: selectedRating,
        review,
      });

      if (error) {
        console.error(error);
        return (wrStatus.textContent = "❌ Failed to post review.");
      }

      wrStatus.textContent = "✅ Posted!";
      ratingForm.reset();
      selectedRating = 0;
      if (wrSelected) wrSelected.textContent = "0.0";
      starRow?.querySelectorAll(".starBtn").forEach((x) => x.classList.remove("isActive"));

      await refreshReviews();
    } catch (err) {
      console.error(err);
      wrStatus.textContent = "❌ Post crashed. Check console.";
    }
  });

  async function loadUserPage() {
    if (currentPage() !== "user.html") return;
    if (!sb) return;

    const outName = qs("userName");
    const outAvatar = qs("userAvatar");
    const outBio = qs("userBio");
    const outList = qs("userReviews");

    const id = new URLSearchParams(location.search).get("id");
    if (!id) {
      if (outName) outName.textContent = "User not found";
      return;
    }

    const prof = await getProfile(id);
    const display = prof?.display_name || "Member";
    const avatar = (await getAvatarPublicUrl(prof)) || DEFAULT_AVATAR_URL;

    if (outName) outName.textContent = display;
    if (outAvatar) {
      outAvatar.src = avatar;
      outAvatar.alt = display;
    }
    if (outBio) outBio.textContent = "Public profile";

    if (outList) {
      outList.innerHTML = "<p class='muted'>Loading…</p>";
      const { data, error } = await sb
        .from("wrn_reviews")
        .select("id,title,type,rating,review,created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error(error);
        outList.innerHTML = "<p class='muted'>Could not load reviews.</p>";
        return;
      }

      const rows = data || [];
      if (!rows.length) {
        outList.innerHTML = "<p class='muted'>No reviews yet.</p>";
        return;
      }

      outList.innerHTML = rows
        .map(
          (r) => `
            <div class="wrItem">
              <div class="wrTop">
                <div class="wrTitle">${escapeHtml(r.title)}</div>
                <div class="wrBadge">${escapeHtml(r.type)}</div>
              </div>
              <div class="wrRatingLine">
                <div class="wrSmallStars">${toStars(Number(r.rating))}</div>
                <strong>${Number(r.rating).toFixed(1)}/5</strong>
                <span class="wrDate">• ${formatDate(r.created_at)}</span>
              </div>
              <div class="wrReview">${escapeHtml(r.review)}</div>
            </div>
          `
        )
        .join("");
    }
  }

  sb?.auth?.onAuthStateChange?.(async () => {
    await setAuthUI();
    await refreshReviews();
  });

(async () => {
  await setAuthUI();
  await setHeaderAuthUI();
  await loadHeaderAvatar();
  await wireAvatarUploadOnAccountPage();
  await refreshReviews();
  await loadUserPage();
})();
})();