/* =========================================================
   ATCHABOYHOLLA Entertainment — app.js
   - Supabase client: sb
   - No top-level await
   - Default avatar fallback
   - Reviews show username + avatar
========================================================= */
(() => {
  "use strict";

  /* ===================== SUPABASE SETUP ===================== */
  const SUPABASE_URL = "https://xfznhdxeifrtbcaagdoq.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmem5oZHhlaWZydGJjYWFnZG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MzI2OTQsImV4cCI6MjA4NjMwODY5NH0.FqClkDemAvxhftotSrIf90xunRrECLC-leVP2-nQgug";

  const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  /* ===================== SMALL HELPERS ===================== */
  const qs = (id) => document.getElementById(id);

  const DEFAULT_AVATAR_URL = "assets/default-avatar.png";

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toStars(r) {
    const whole = Math.round(Number(r) || 0);
    return Array.from({ length: 5 }, (_, i) => (i < whole ? "★" : "☆")).join("");
  }

  function formatDate(ts) {
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }

  function currentPage() {
    return (location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  /* ===================== AUTH + PROFILE ===================== */
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

  async function ensureProfileRow(user) {
    if (!sb || !user) return;

    const profile = await getProfile(user.id);
    if (profile) return;

    const display =
      (user.user_metadata && user.user_metadata.display_name) ||
      (user.email ? String(user.email).split("@")[0] : "Member");

    await sb.from("profiles").insert({
      id: user.id,
      display_name: String(display || "Member"),
    });
  }

  async function updateProfileAvatarPath(user, path) {
    if (!sb || !user) return { error: { message: "Supabase not loaded." } };

    const profile = await getProfile(user.id);
    const display =
      (user.user_metadata && user.user_metadata.display_name) ||
      (user.email ? String(user.email).split("@")[0] : "Member");

    if (profile) {
      return await sb.from("profiles").update({ avatar_path: path }).eq("id", user.id);
    }

    return await sb.from("profiles").insert({
      id: user.id,
      display_name: String(display || "Member"),
      avatar_path: path,
    });
  }

  function parseQueryParams() {
    return Object.fromEntries(new URLSearchParams(location.search));
  }

  async function setUserWelcome(profile) {
    const userWelcome = qs("userWelcome");
    if (!userWelcome) return;
    if (profile?.display_name) {
      userWelcome.textContent = `Hi, ${profile.display_name}`;
    } else {
      userWelcome.textContent = "";
    }
  }

  async function getCurrentProfile(user) {
    if (!user) return null;
    await ensureProfileRow(user);
    return getProfile(user.id);
  }

  /* ===================== AVATAR HELPERS ===================== */
  function getAvatarPublicUrl(avatarPath) {
    if (!sb || !avatarPath) return DEFAULT_AVATAR_URL;
    // Public bucket: "avatars"
    const { data } = sb.storage.from("avatars").getPublicUrl(avatarPath);
    return data?.publicUrl || DEFAULT_AVATAR_URL;
  }

  async function loadHeaderAvatar() {
    const img = qs("headerAvatar"); // optional element in header/nav
    if (!img) return;

    const user = await getSessionUser();
    if (!user) {
      img.style.display = "none";
      img.src = "";
      await setUserWelcome(null);
      return;
    }

    await ensureProfileRow(user);
    const profile = await getProfile(user.id);
    const url = getAvatarPublicUrl(profile?.avatar_path);

    img.src = url;
    img.style.display = "inline-block";
    await setUserWelcome(profile);
  }

  // Account page avatar upload (expects <input type="file" id="avatarFile"> and a button #btnUploadAvatar)
  async function uploadAvatarFromAccountPage() {
    const status = qs("avatarStatus");
    const fileInput = qs("avatarFile");
    const file = fileInput?.files?.[0];

    if (!sb) {
      return status && (status.textContent = "❌ Supabase not loaded.");
    }
    if (!fileInput) {
      return status && (status.textContent = "❌ Avatar input not found.");
    }
    if (!fileInput.files) {
      return status && (status.textContent = "❌ File input is not a valid file picker.");
    }

    const user = await getSessionUser();
    if (!user) {
      return status && (status.textContent = "❗ Please login first.");
    }
    if (!file) {
      return status && (status.textContent = "❗ Choose an image first.");
    }

    await ensureProfileRow(user);

    const cleanExt = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${user.id}.${cleanExt}`;

    status && (status.textContent = "Uploading avatar…");

    const { error: upErr } = await sb.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      console.error("Avatar upload error:", upErr);
      status &&
        (status.textContent = `❌ Avatar upload failed. ${upErr.message || "Check bucket permissions."}`);
      return;
    }

    const { error: profErr } = await updateProfileAvatarPath(user, path);

    if (profErr) {
      console.error("Profile update error:", profErr);
      const msg = profErr.message || "Profile update failed.";
      const rlsHint = msg.toLowerCase().includes("row-level security")
        ? " Please add a Supabase RLS policy allowing authenticated users to update their own profile row."
        : "";
      status && (status.textContent = `❌ Profile update failed. ${msg}${rlsHint}`);
      return;
    }

    status && (status.textContent = "✅ Avatar updated!");
    await loadHeaderAvatar();
  }

  async function populateAccountPage() {
    const user = await getSessionUser();
    const profile = user ? await getProfile(user.id) : null;
    const authDisplay = qs("authDisplay");
    const authEmail = qs("authEmail");
    const authPass = qs("authPass");
    const btnSignUp = qs("btnSignUp");
    const btnLogin = qs("btnLogin");
    const btnLogout = qs("btnLogout");
    const authStatus = qs("authStatus");
    const avatarPreview = qs("avatarPreview");

    if (user) {
      if (authDisplay) authDisplay.value = profile?.display_name || "";
      if (authEmail) authEmail.value = user.email || "";
      if (authPass) authPass.value = "";
      if (btnSignUp) btnSignUp.style.display = "none";
      if (btnLogin) btnLogin.style.display = "none";
      if (btnLogout) btnLogout.style.display = "inline-flex";
      if (authStatus)
        authStatus.textContent = `Logged in as ${profile?.display_name || user.email || "Member"}`;
      if (avatarPreview) {
        if (profile?.avatar_path) {
          avatarPreview.src = getAvatarPublicUrl(profile.avatar_path);
          avatarPreview.style.display = "block";
        } else {
          avatarPreview.style.display = "none";
        }
      }
    } else {
      if (authDisplay) authDisplay.value = "";
      if (authEmail) authEmail.value = "";
      if (authPass) authPass.value = "";
      if (btnSignUp) btnSignUp.style.display = "inline-flex";
      if (btnLogin) btnLogin.style.display = "inline-flex";
      if (btnLogout) btnLogout.style.display = "none";
      if (authStatus)
        authStatus.textContent = "Sign up or login to post reviews.";
      if (avatarPreview) avatarPreview.style.display = "none";
    }
  }

  async function handleAccountSignUp() {
    const authDisplay = qs("authDisplay");
    const authEmail = qs("authEmail");
    const authPass = qs("authPass");
    const authStatus = qs("authStatus");
    const display = authDisplay?.value?.trim();
    const email = authEmail?.value?.trim();
    const password = authPass?.value || "";

    if (!email || !password) {
      authStatus && (authStatus.textContent = "❗ Enter an email and password.");
      return;
    }

    authStatus && (authStatus.textContent = "Signing up…");
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: display ? { display_name: display } : {},
      },
    });

    if (error) {
      console.error(error);
      authStatus && (authStatus.textContent = `❌ Signup failed. ${error.message || ""}`);
      return;
    }

    if (data?.user) {
      await ensureProfileRow(data.user);
      authStatus && (authStatus.textContent = "✅ Account created! Check your email to confirm.");
    } else {
      authStatus &&
        (authStatus.textContent = "✅ Signup sent. Check your inbox for confirmation.");
    }
  }

  async function handleAccountLogin() {
    const authEmail = qs("authEmail");
    const authPass = qs("authPass");
    const authStatus = qs("authStatus");
    const email = authEmail?.value?.trim();
    const password = authPass?.value || "";

    if (!email || !password) {
      authStatus && (authStatus.textContent = "❗ Enter an email and password.");
      return;
    }

    authStatus && (authStatus.textContent = "Logging in…");
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(error);
      authStatus && (authStatus.textContent = `❌ Login failed. ${error.message || ""}`);
      return;
    }

    if (data?.user) {
      await ensureProfileRow(data.user);
      authStatus && (authStatus.textContent = "✅ Logged in! Redirecting…");
      const { redirect } = parseQueryParams();
      const target = redirect ? String(redirect) : "account.html";
      location.href = target;
    } else {
      authStatus && (authStatus.textContent = "✅ Logged in! Reloading page…");
      location.reload();
    }
  }

  async function handleAccountLogout() {
    const authStatus = qs("authStatus");
    await sb.auth.signOut();
    await setHeaderAuthUI();
    await loadHeaderAvatar();
    await populateAccountPage();
    authStatus && (authStatus.textContent = "✅ Logged out.");
  }

  function wireAccountPage() {
    const btnSignUp = qs("btnSignUp");
    const btnLogin = qs("btnLogin");
    const btnLogout = qs("btnLogout");
    const avatarFile = qs("avatarFile");
    const avatarPreview = qs("avatarPreview");

    btnSignUp?.addEventListener("click", handleAccountSignUp);
    btnLogin?.addEventListener("click", handleAccountLogin);
    btnLogout?.addEventListener("click", handleAccountLogout);

    avatarFile?.addEventListener("change", () => {
      const file = avatarFile.files?.[0];
      if (!file || !avatarPreview) return;
      avatarPreview.src = URL.createObjectURL(file);
      avatarPreview.style.display = "block";
    });
  }

  async function fetchClipsForUser(userId) {
    if (!sb || !userId) return [];

    const { data, error } = await sb
      .from("clips")
      .select("id,title,description,video_url,url,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.warn("Unable to load user clips:", error);
      return [];
    }

    return data || [];
  }

  async function loadUserProfilePage() {
    if (!qs("userReviews") && !qs("userName") && !qs("userAvatar")) return;

    const params = parseQueryParams();
    let profileId = params.id;
    const currentUser = await getSessionUser();
    if (!profileId && currentUser) profileId = currentUser.id;
    if (!profileId) {
      const userReviews = qs("userReviews");
      const userClips = qs("userClips");
      if (userReviews) userReviews.innerHTML = `<p class="muted">No profile selected.</p>`;
      if (userClips) userClips.innerHTML = `<p class="muted">No profile selected.</p>`;
      return;
    }

    const profile = await getProfile(profileId);
    const userName = qs("userName");
    const userAvatar = qs("userAvatar");
    if (userName) userName.textContent = profile?.display_name || "Member";
    if (userAvatar) {
      userAvatar.src = getAvatarPublicUrl(profile?.avatar_path);
      userAvatar.onerror = function () {
        this.onerror = null;
        this.src = DEFAULT_AVATAR_URL;
      };
    }

    await setUserWelcome(profile);

    const { data: reviews, error } = await sb
      .from("reviews")
      .select("id,title,type,rating,review,created_at,user_id")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false });

    const userReviews = qs("userReviews");
    if (userReviews) {
      if (error || !reviews?.length) {
        userReviews.innerHTML = `<p class="muted">${
          error ? "Unable to load reviews." : "No reviews yet."
        }</p>`;
      } else {
        userReviews.innerHTML = reviews
          .map((r) => {
            const name = profile?.display_name || "Member";
            const avatarUrl = getAvatarPublicUrl(profile?.avatar_path);
            return `
              <div class="wrItem">
                <div class="wrTop" style="align-items:center;">
                  <div style="display:flex; gap:10px; align-items:center;">
                    <img
                      src="${escapeHtml(avatarUrl)}"
                      alt="${escapeHtml(name)}"
                      style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.18);"
                      onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'"
                    />
                    <div>
                      <div class="wrTitle">${escapeHtml(r.title || "Untitled")}</div>
                      <div class="muted" style="font-size:.9rem;">
                        ${escapeHtml(name)} • ${formatDate(r.created_at)}
                      </div>
                    </div>
                  </div>

                  <div class="wrBadge">${escapeHtml(r.type || "")}</div>
                </div>

                <div class="wrRatingLine">
                  <div class="wrSmallStars">${toStars(Number(r.rating))}</div>
                  <strong>${Number(r.rating).toFixed(1)}/5</strong>
                </div>

                <div class="wrReview">${escapeHtml(r.review || "")}</div>
              </div>
            `;
          })
          .join("");
      }
    }

    const clips = await fetchClipsForUser(profileId);
    const userClips = qs("userClips");
    if (userClips) {
      if (!clips.length) {
        userClips.innerHTML = `<p class="muted">No clips yet.</p>`;
      } else {
        userClips.innerHTML = clips
          .map((clip) => {
            const clipUrl = clip.video_url || clip.url || "";
            return `
              <div class="wrItem">
                <div class="wrTop" style="align-items:center; justify-content:space-between; gap:12px;">
                  <div>
                    <div class="wrTitle">${escapeHtml(clip.title || "Untitled clip")}</div>
                    <div class="muted" style="font-size:.9rem; margin-top:4px;">
                      ${formatDate(clip.created_at)}
                    </div>
                  </div>
                  ${clipUrl ? `<a class="btn btn--small btn--ghost" href="${escapeHtml(clipUrl)}" target="_blank" rel="noreferrer">Watch</a>` : ""}
                </div>
                ${clip.description ? `<div class="wrReview" style="margin-top:10px;">${escapeHtml(clip.description)}</div>` : ""}
              </div>
            `;
          })
          .join("");
      }
    }
  }

  /* ===================== NAV UI (optional) ===================== */
  function initMobileMenu() {
    const menuBtn = qs("menuBtn");
    const nav = qs("nav");

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
  }

  function setFooterYear() {
    const yearEl = qs("year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  async function setHeaderAuthUI() {
    const navAuthLink = qs("navAuthLink");
    const navLogoutBtn = qs("navLogoutBtn");

    const user = await getSessionUser();
    const loggedIn = !!user;

    if (navAuthLink) {
      const current = currentPage();
      navAuthLink.textContent = loggedIn ? "Account" : "Sign Up / Login";
      navAuthLink.href = loggedIn
        ? "account.html"
        : `account.html?redirect=${encodeURIComponent(current)}`;
    }

    if (navLogoutBtn) {
      navLogoutBtn.style.display = loggedIn ? "inline-flex" : "none";
      navLogoutBtn.onclick = async () => {
        await sb?.auth?.signOut?.();
        await setHeaderAuthUI();
        await loadHeaderAvatar();
        location.href = "index.html";
      };
    }
  }

  /* ===================== REVIEWS (Watch & Rate Nation) ===================== */
  let filterType = null; // locked pages use hidden #wrType value

  function initFilterType() {
    const wrTypeEl = qs("wrType");
    if (!wrTypeEl) return;
    filterType = wrTypeEl.value || null;
  }

  async function fetchReviewsWithProfiles() {
    if (!sb) return [];

    // Pull reviews
    let q = sb
      .from("reviews")
      .select("id,title,type,rating,review,created_at,user_id")
      .order("created_at", { ascending: false });

    if (filterType) q = q.eq("type", filterType);

    const { data: reviews, error } = await q;
    if (error) {
      console.error(error);
      return [];
    }

    // Pull related profiles in one extra query
    const userIds = Array.from(new Set((reviews || []).map((r) => r.user_id).filter(Boolean)));
    let profileMap = {};

    if (userIds.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id,display_name,avatar_path")
        .in("id", userIds);

      (profs || []).forEach((p) => (profileMap[p.id] = p));
    }

    // merge
    return (reviews || []).map((r) => ({
      ...r,
      profile: profileMap[r.user_id] || null,
    }));
  }

  function applyReviewFilters(items) {
    const wrSearch = qs("wrSearch");
    const wrSearchMeta = qs("wrSearchMeta");
    const wrMinRating = qs("wrMinRating");
    const wrSort = qs("wrSort");

    let out = [...items];

    const q = (wrSearch?.value || "").trim().toLowerCase();
    if (q) {
      out = out.filter((r) => {
        const name = (r.profile?.display_name || "").toLowerCase();
        const hay = `${r.title || ""} ${r.review || ""} ${name}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const min = Number(wrMinRating?.value || "0");
    if (min > 0) out = out.filter((r) => Number(r.rating || 0) >= min);

    const sort = wrSort?.value || "newest";
    out.sort((a, b) => {
      const ra = Number(a.rating), rb = Number(b.rating);
      const ta = new Date(a.created_at).getTime(), tb = new Date(b.created_at).getTime();
      if (sort === "highest") return rb - ra || tb - ta;
      if (sort === "lowest") return ra - rb || tb - ta;
      if (sort === "oldest") return ta - tb;
      return tb - ta;
    });

    if (wrSearchMeta) wrSearchMeta.textContent = out.length ? `${out.length} result(s)` : "0 results";
    return out;
  }

  function renderReviewStats(items) {
    const wrCount = qs("wrCount");
    const wrAvg = qs("wrAvg");
    const wrAvgStars = qs("wrAvgStars");
    if (!wrCount || !wrAvg || !wrAvgStars) return;

    wrCount.textContent = String(items.length);
    const avg = items.length
      ? items.reduce((s, r) => s + Number(r.rating || 0), 0) / items.length
      : 0;

    wrAvg.textContent = avg.toFixed(1);
    wrAvgStars.textContent = toStars(avg);
  }

  function renderReviewList(items) {
    const wrList = qs("wrList");
    if (!wrList) return;

    if (!items.length) {
      wrList.innerHTML = `<p class="muted">No ratings yet. Be the first to set the tone.</p>`;
      return;
    }

    wrList.innerHTML = items.slice(0, 30).map((r) => {
      const name = r.profile?.display_name || "Member";
      const avatarUrl = getAvatarPublicUrl(r.profile?.avatar_path);

      return `
        <div class="wrItem">
          <div class="wrTop" style="align-items:center;">
            <div style="display:flex; gap:10px; align-items:center;">
              <img
                src="${escapeHtml(avatarUrl)}"
                alt="${escapeHtml(name)}"
                style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.18);"
                onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'"
              />
              <div>
                <div class="wrTitle">${escapeHtml(r.title || "Untitled")}</div>
                <div class="muted" style="font-size:.9rem;">
                  ${escapeHtml(name)} • ${formatDate(r.created_at)}
                </div>
              </div>
            </div>

            <div class="wrBadge">${escapeHtml(r.type || "")}</div>
          </div>

          <div class="wrRatingLine">
            <div class="wrSmallStars">${toStars(Number(r.rating))}</div>
            <strong>${Number(r.rating).toFixed(1)}/5</strong>
          </div>

          <div class="wrReview">${escapeHtml(r.review || "")}</div>
        </div>
      `;
    }).join("");
  }

  async function refreshWRN() {
    // Only run on pages that have WRN UI
    if (!qs("wrList") && !qs("wrAvg") && !qs("wrCount")) return;

    const all = await fetchReviewsWithProfiles();
    const filtered = applyReviewFilters(all);

    renderReviewStats(filtered);
    renderReviewList(filtered);
  }

  /* ===================== POST REVIEW (existing form) ===================== */
  const steps = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5);
  let selectedRating = 0.0;

  function renderStarButtons() {
    const starRow = qs("starRow");
    const wrSelected = qs("wrSelected");
    if (!starRow || !wrSelected) return;

    starRow.innerHTML = "";
    steps.forEach((val) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "starBtn";
      b.textContent = val.toFixed(1);
      b.addEventListener("click", () => {
        selectedRating = val;
        wrSelected.textContent = selectedRating.toFixed(1);
        starRow.querySelectorAll(".starBtn").forEach((x) => x.classList.remove("isActive"));
        b.classList.add("isActive");
      });
      starRow.appendChild(b);
    });
  }

  async function wireReviewForm() {
    const ratingForm = qs("ratingForm");
    const wrTitle = qs("wrTitle");
    const wrTypeEl = qs("wrType");
    const wrReview = qs("wrReview");
    const wrStatus = qs("wrStatus");
    const starRow = qs("starRow");
    const wrSelected = qs("wrSelected");

    if (starRow && wrSelected) renderStarButtons();
    if (!ratingForm) return;

    ratingForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const user = await getSessionUser();
      if (!user) return wrStatus && (wrStatus.textContent = "🔒 Please login to post a review.");
      if (selectedRating <= 0) return wrStatus && (wrStatus.textContent = "❗ Please select a rating.");

      const title = wrTitle?.value?.trim();
      const review = wrReview?.value?.trim();
      const type = wrTypeEl?.value;

      if (!title || !review || !type) {
        wrStatus && (wrStatus.textContent = "❗ Please enter a title and review.");
        return;
      }

      wrStatus && (wrStatus.textContent = "Posting…");

      await ensureProfileRow(user);

      const { error } = await sb.from("reviews").insert({
        user_id: user.id,
        title,
        type,
        rating: selectedRating,
        review,
      });

      if (error) {
        console.error(error);
        wrStatus && (wrStatus.textContent = "❌ Failed to post review.");
        return;
      }

      wrStatus && (wrStatus.textContent = "✅ Posted!");
      ratingForm.reset();
      selectedRating = 0;
      if (wrSelected) wrSelected.textContent = "0.0";
      starRow?.querySelectorAll(".starBtn").forEach((x) => x.classList.remove("isActive"));

      await refreshWRN();
    });
  }

  /* ===================== ACCOUNT PAGE WIRES ===================== */
  function wireAccountButtons() {
    const btnUploadAvatar = qs("btnUploadAvatar");
    btnUploadAvatar?.addEventListener("click", async () => {
      try {
        await uploadAvatarFromAccountPage();
      } catch (e) {
        console.error(e);
        const status = qs("avatarStatus");
        status && (status.textContent = "❌ Avatar upload failed. Check console.");
      }
    });
  }

  /* ===================== BOOT ===================== */
  async function boot() {
    initMobileMenu();
    setFooterYear();
    initFilterType();

    // Header
    await setHeaderAuthUI();
    await loadHeaderAvatar();

    // WRN
    const wrSearch = qs("wrSearch");
    const wrMinRating = qs("wrMinRating");
    const wrSort = qs("wrSort");
    wrSearch?.addEventListener("input", refreshWRN);
    wrMinRating?.addEventListener("change", refreshWRN);
    wrSort?.addEventListener("change", refreshWRN);

    await wireReviewForm();
    wireAccountPage();
    wireAccountButtons();
    await populateAccountPage();
    await loadUserProfilePage();

    // Keep UI updated
    sb?.auth?.onAuthStateChange?.(async () => {
      await setHeaderAuthUI();
      await loadHeaderAvatar();
      await populateAccountPage();
      await loadUserProfilePage();
      await refreshWRN();
    });

    await refreshWRN();
  }

  // run
  boot().catch((e) => console.error("boot error:", e));
})();