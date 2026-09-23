(() => {
  "use strict";

  const LOGS_KEY = "lastcall_logs_v1";
  const SETTINGS_KEY = "lastcall_settings_v1";
  const SCHEMA_VERSION = 2;

  const DAY = 24 * 3600 * 1000;

  // ---------- Data helpers ----------
  // Defensive against corrupted/legacy localStorage: never let a bad value
  // (wrong type, NaN, future timestamp, negative price) crash the app.
  function getLogs() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]"); } catch { return []; }
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw
      .filter((t) => typeof t === "number" && Number.isFinite(t) && t > 0 && t <= now)
      .sort((a, b) => a - b);
  }
  function saveLogs(logs) {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }

  const DEFAULT_SETTINGS = {
    // Legacy (pre-amendment) fields — kept so existing users' data and cost
    // history are never silently altered.
    pricePerCig: 0.6,
    quitDate: null,
    // Canonical single source of truth for the active quit-attempt timer.
    // The Current Streak and the Medical Timeline both derive elapsedMs
    // from this one timestamp — see getReferenceTime().
    currentAttemptStartedAt: null,
    bestStreakMs: 0,
    // New pack-based money model (section 9/10 of the amendment).
    packPrice: null,
    sticksPerPack: null,
    cigarettesPerDay: null,
    appLock: {
      enabled: false,
      hashHex: null,
      saltHex: null,
      pinLength: null,
      timeoutMin: 5,
      failedAttempts: 0,
      lockoutUntil: 0,
      lastUnlockedAt: null,
    },
  };

  function getSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch {}
    if (!s || typeof s !== "object" || Array.isArray(s)) s = {};
    const merged = Object.assign({}, DEFAULT_SETTINGS, s);
    merged.appLock = Object.assign({}, DEFAULT_SETTINGS.appLock, s.appLock && typeof s.appLock === "object" ? s.appLock : {});
    if (!Number.isFinite(merged.pricePerCig) || merged.pricePerCig < 0) merged.pricePerCig = 0.6;
    if (!Number.isFinite(merged.bestStreakMs) || merged.bestStreakMs < 0) merged.bestStreakMs = 0;
    if (!Number.isFinite(merged.packPrice) || merged.packPrice <= 0) merged.packPrice = null;
    if (!Number.isFinite(merged.sticksPerPack) || merged.sticksPerPack <= 0) merged.sticksPerPack = null;
    if (!Number.isFinite(merged.cigarettesPerDay) || merged.cigarettesPerDay <= 0) merged.cigarettesPerDay = null;
    if (!Number.isFinite(merged.currentAttemptStartedAt) || merged.currentAttemptStartedAt <= 0 || merged.currentAttemptStartedAt > Date.now()) {
      merged.currentAttemptStartedAt = null;
    }
    return merged;
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  // Cost per cigarette: prefer the new pack-price model, fall back to the
  // legacy flat pricePerCig so historical figures for existing users never
  // change just because this version shipped (amendment section 10/11).
  function getCostPerCig(settings) {
    if (settings.packPrice && settings.sticksPerPack) {
      return settings.packPrice / settings.sticksPerPack;
    }
    return Number(settings.pricePerCig) || 0;
  }

  // One-time defensive migration: derive currentAttemptStartedAt for users
  // who only have legacy data (a latest cigarette log and/or a date-only
  // quitDate). Runs once at boot; getSettings() never invents this value
  // itself so repeated reads stay pure. Never destroys existing logs/settings.
  function migrateIfNeeded() {
    const settings = getSettings();
    if (settings.currentAttemptStartedAt !== null) return;
    const logs = getLogs();
    let derived = null;
    if (logs.length) {
      derived = logs[logs.length - 1];
    } else if (settings.quitDate) {
      const parsed = new Date(settings.quitDate + "T00:00:00").getTime();
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= Date.now()) derived = parsed;
    }
    if (derived !== null) {
      settings.currentAttemptStartedAt = derived;
      saveSettings(settings);
    }
  }

  // Keeps currentAttemptStartedAt in sync with the latest cigarette log
  // whenever logs are added/removed/restored, so there is exactly one
  // timestamp driving both the Current Streak and the Medical Timeline.
  function syncCurrentAttemptStart(logs, settings) {
    if (logs.length) {
      const latest = logs[logs.length - 1];
      if (settings.currentAttemptStartedAt !== latest) {
        settings.currentAttemptStartedAt = latest;
        return true;
      }
    }
    return false;
  }

  // ---------- Content ----------
  const DAMAGE_FACTS = [
    // Jantung & peredaran darah
    "Nikotin sampai ke otak dalam masa 10 saat sahaja.",
    "Kadar denyutan jantung anda meningkat serta-merta.",
    "Tekanan darah anda naik.",
    "Karbon monoksida mula menggantikan oksigen dalam sel darah merah.",
    "Darah anda menjadi lebih likat dan mudah membeku, meningkatkan risiko strok.",
    "Saluran darah anda mengecut (vasokonstriksi), menjadikan jantung bekerja lebih kuat.",
    // Paru-paru & pernafasan
    "Silia (bulu halus) dalam paru-paru anda lumpuh buat sementara.",
    "Paras oksigen ke otot dan organ berkurangan.",
    "Lebih 7,000 bahan kimia & 70 karsinogen memasuki badan anda.",
    "Saluran udara dalam paru-paru anda menyempit, menjadikan nafas lebih berat.",
    // Mulut, gigi & gusi
    "Enamel gigi dan gusi terdedah kepada bahan toksik.",
    "Gigi anda mula menguning akibat tar dan nikotin yang melekat pada enamel.",
    "Gusi anda berisiko mengalami jangkitan dan penyakit gusi (periodontitis) akibat aliran darah yang berkurangan.",
    "Bau mulut (halitosis) menjadi lebih teruk akibat bahan kimia dalam asap rokok.",
    "Risiko kehilangan gigi meningkat akibat kerosakan tulang rahang dan gusi dalam jangka panjang.",
    // Otak & memori
    "Fungsi memori dan tumpuan otak anda terjejas akibat kekurangan oksigen ke otak.",
    "Reseptor nikotin di otak memberi isyarat ketagihan berulang.",
    "Kualiti tidur anda terjejas akibat kesan rangsangan nikotin pada sistem saraf.",
    // Kulit & penampilan
    "Kulit terdedah kepada radikal bebas yang mempercepatkan penuaan.",
    "Kolagen kulit anda dipecahkan lebih cepat, mempercepatkan kedutan dan garis halus.",
    "Rambut anda lebih mudah gugur akibat peredaran darah yang berkurangan ke folikel rambut.",
    // Deria
    "Deria rasa dan bau anda menjadi kurang sensitif buat sementara.",
    "Penglihatan anda berisiko terjejas — merokok meningkatkan risiko degenerasi makula jangka panjang.",
    // Sistem imun & penyembuhan
    "Sistem imun anda menjadi lebih lemah buat sementara.",
    "Keupayaan badan anda menyembuhkan luka menjadi lebih perlahan.",
    // Tulang, otot & organ lain
    "Risiko osteoporosis (tulang rapuh) meningkat dalam jangka panjang.",
    "Stamina dan prestasi fizikal anda berkurangan akibat kurang oksigen ke otot.",
    "Pencernaan turut terjejas — risiko ulser gastrik dan refluks asid meningkat.",
    "Risiko diabetes jenis 2 meningkat akibat rintangan insulin yang lebih tinggi.",
    "Kesuburan lelaki dan perempuan turut terjejas akibat merokok.",
  ];

  const CRAVING_TIPS = [
    "Keinginan merokok biasanya hanya bertahan 3-5 minit — tunggu ia berlalu.",
    "Simpan tangan sibuk: pen, gula-gula getah, atau stress ball.",
    "Elakkan tempat/rakan yang biasa dikaitkan dengan tabiat merokok buat sementara.",
    "Catat sebab anda mahu berhenti dan bacanya semula bila teringin.",
    "Bergerak sikit — jalan cepat 5 minit boleh kurangkan keinginan dengan ketara.",
    "Hubungi seseorang yang menyokong usaha anda berhenti merokok.",
  ];

  const QUOTES = [
    "Setiap batang yang anda tidak isap adalah kemenangan.",
    "Badan anda mula sembuh saat anda berhenti — walaupun beberapa minit.",
    "Bukan tentang sempurna, tentang terus mencuba.",
    "Wang yang anda simpan hari ini adalah pelaburan untuk esok.",
    "Anda lebih kuat daripada keinginan sementara ini.",
  ];

  // Medical Timeline (AMENDMENT 23 SEPT 2026). Evidence-based, source-
  // attributed, deliberately conservative wording — no invented precision,
  // no guaranteed individual outcomes. thresholdMs is in milliseconds and
  // is the ONLY thing that drives LOCKED/NEXT/REACHED state; it always
  // reads off the same elapsedMs as the Current Streak timer.
  const MEDICAL_MILESTONES = [
    { id: "20m", thresholdMs: 20 * 60 * 1000, label: "20 minit", icon: "heart",
      title: "Denyutan jantung mula menurun.", source: "CDC/NHS" },
    { id: "8h", thresholdMs: 8 * 3600 * 1000, label: "8 jam", icon: "droplet",
      title: "Paras karbon monoksida mula berkurang.", source: "NHS" },
    { id: "12h", thresholdMs: 12 * 3600 * 1000, label: "12 jam", icon: "wind",
      title: "Karbon monoksida terus menurun.", source: "CDC" },
    { id: "24h", thresholdMs: 24 * 3600 * 1000, label: "24 jam", icon: "heart",
      title: "Paras nikotin dalam darah turun ke sifar.", source: "CDC" },
    { id: "48h", thresholdMs: 48 * 3600 * 1000, label: "48 jam", icon: "sparkle",
      title: "Deria rasa dan bau mula bertambah baik.", source: "NHS" },
    { id: "72h", thresholdMs: 72 * 3600 * 1000, label: "72 jam", icon: "wind",
      title: "Pernafasan mungkin terasa lebih mudah.", source: "NHS" },
    { id: "2-12w", thresholdMs: 14 * DAY, label: "2–12 minggu", icon: "droplet",
      title: "Peredaran darah bertambah baik.", source: "NHS/CDC" },
    { id: "1-12mo", thresholdMs: 30 * DAY, label: "1–12 bulan", icon: "wind",
      title: "Batuk dan sesak nafas boleh berkurang.", source: "CDC" },
    { id: "3-9mo", thresholdMs: 90 * DAY, label: "3–9 bulan", icon: "wind",
      title: "Masalah pernafasan boleh bertambah baik.", source: "NHS" },
    { id: "1-2y", thresholdMs: 365 * DAY, label: "1–2 tahun", icon: "heart",
      title: "Risiko serangan jantung turun dengan ketara.", source: "CDC" },
    { id: "3-6y", thresholdMs: 3 * 365 * DAY, label: "3–6 tahun", icon: "heart",
      title: "Risiko tambahan penyakit jantung koronari berkurang.", source: "CDC" },
    { id: "5-10y", thresholdMs: 5 * 365 * DAY, label: "5–10 tahun", icon: "shield",
      title: "Risiko strok dan beberapa kanser terus menurun.", source: "CDC" },
    { id: "10y", thresholdMs: 10 * 365 * DAY, label: "10 tahun", icon: "shield",
      title: "Risiko tambahan kanser paru-paru berkurang.", source: "CDC" },
    { id: "15y", thresholdMs: 15 * 365 * DAY, label: "15 tahun", icon: "shield",
      title: "Risiko penyakit jantung koronari menghampiri orang yang tidak merokok.", source: "CDC" },
    { id: "20y", thresholdMs: 20 * 365 * DAY, label: "20 tahun", icon: "shield",
      title: "Risiko beberapa kanser terus berkurang.", source: "CDC" },
  ];

  // Withdrawal is what the user may FEEL (nicotine withdrawal symptoms) —
  // deliberately a separate, shorter timeline from long-term organ/health
  // recovery above. Conservative wording per NHS: no guaranteed schedule.
  const WITHDRAWAL_STAGES = [
    { id: "now", thresholdMs: 0, label: "Sekarang", title: "Anda mungkin mengalami craving.", source: "NHS" },
    { id: "d1-3", thresholdMs: 1 * DAY, label: "Hari 1–3", title: "Gejala withdrawal boleh menjadi lebih kuat.", source: "NHS" },
    { id: "w1", thresholdMs: 7 * DAY, label: "Minggu pertama", title: "Craving, mudah tersinggung, gelisah dan sukar tumpu perhatian boleh berlaku.", source: "NHS" },
    { id: "w3-4", thresholdMs: 21 * DAY, label: "3–4 minggu", title: "Bagi ramai orang, gejala withdrawal beransur-ansur berkurang.", source: "NHS" },
  ];

  const ICON_PATHS = {
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
    droplet: '<path d="M12 2s6 7.2 6 11.5A6 6 0 0 1 6 13.5C6 9.2 12 2 12 2Z"/>',
    wind: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 11.6A2 2 0 1 1 14 15H2"/><path d="M17.6 6.6A2 2 0 1 1 19 10H2"/>',
    sparkle: '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/>',
    shield: '<path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  };
  function iconSvg(name, cls) {
    return `<svg class="${cls}" viewBox="0 0 24 24">${ICON_PATHS[name] || ""}</svg>`;
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const heroTimer = $("heroTimer");
  const heroLabel = $("heroLabel");
  const heroSub = $("heroSub");
  const milestoneEta = $("milestoneEta");
  const milestoneProgress = $("milestoneProgress");
  const milestoneDesc = $("milestoneDesc");
  const bestStreakBadge = $("bestStreakBadge");
  const bestStreakValue = $("bestStreakValue");
  const undoBtn = $("undoBtn");
  const statToday = $("statToday");
  const statWeek = $("statWeek");
  const statTotal = $("statTotal");
  const boxTotalCigs = $("boxTotalCigs");
  const boxMoneySpent = $("boxMoneySpent");
  const boxMoneySaved = $("boxMoneySaved");
  const boxAvgDay = $("boxAvgDay");
  const boxBestStreak = $("boxBestStreak");
  const barChart = $("barChart");
  const historyList = $("historyList");
  const quitDateInput = $("quitDateInput");
  const toastEl = $("toast");

  // ---------- Single source of truth for the active quit-attempt timer ----------
  // currentAttemptStartedAt is the ONLY timestamp the Current Streak and the
  // Medical Timeline read from (amendment section 1/2). Never derive a second,
  // independent clock from quitDate/logs here — migrateIfNeeded() already
  // folded any legacy value into currentAttemptStartedAt once, at boot.
  function getReferenceTime() {
    return getSettings().currentAttemptStartedAt;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (days > 0) return `${days} hari ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }

  function updateHero() {
    const ref = getReferenceTime();
    if (!ref) {
      heroTimer.textContent = "00:00:00";
      heroLabel.textContent = "Belum ada log";
      heroSub.textContent = "Tekan butang di bawah untuk mula menjejak.";
      undoBtn.classList.add("hidden");
      bestStreakBadge.classList.add("hidden");
      updateMilestoneSummary(null);
      renderMedicalTimeline(null);
      renderWithdrawalTimeline(null);
      return;
    }
    const elapsedMs = Date.now() - ref;
    heroTimer.textContent = formatDuration(elapsedMs);
    heroLabel.textContent = "Tidak merokok selama";
    const logs = getLogs();
    heroSub.textContent = logs.length
      ? `Sejak log terakhir · ${logs.length} rokok direkodkan keseluruhan`
      : "Sejak tarikh berhenti ditetapkan";
    undoBtn.classList.toggle("hidden", logs.length === 0);
    updateMilestoneSummary(elapsedMs);
    renderMedicalTimeline(elapsedMs);
    renderWithdrawalTimeline(elapsedMs);
    updateBestStreakDisplay(elapsedMs);
  }

  // ---------- Best streak (optimized: in-memory each tick, persisted only
  // on meaningful events — amendment section 4. Never written every second). ----------
  let bestStreakMemory = null;
  function formatDurationShort(ms) {
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days} hari ${hours} jam`;
    if (hours > 0) return `${hours} jam ${mins} minit`;
    return `${mins} minit`;
  }
  function updateBestStreakDisplay(currentStreakMs) {
    if (bestStreakMemory === null) bestStreakMemory = getSettings().bestStreakMs;
    if (currentStreakMs > bestStreakMemory) bestStreakMemory = currentStreakMs;
    if (bestStreakMemory > 60000) {
      bestStreakValue.textContent = formatDurationShort(bestStreakMemory);
      bestStreakBadge.classList.remove("hidden");
      if (boxBestStreak) boxBestStreak.textContent = formatDurationShort(bestStreakMemory);
    } else {
      bestStreakBadge.classList.add("hidden");
      if (boxBestStreak) boxBestStreak.textContent = "—";
    }
  }
  // Call at meaningful events only: init, confirmed log, history edit,
  // import, beforeunload — NOT from the per-second timer tick.
  function persistBestStreak() {
    const settings = getSettings();
    if (bestStreakMemory !== null && bestStreakMemory > settings.bestStreakMs) {
      settings.bestStreakMs = bestStreakMemory;
      saveSettings(settings);
      return true;
    }
    return false;
  }

  // ---------- Medical Timeline milestone state ----------
  // LOCKED / NEXT / REACHED, all derived from the same elapsedMs as the
  // Current Streak (amendment section 3/5).
  function milestoneState(thresholdMs, elapsedMs, nextAssigned) {
    if (elapsedMs >= thresholdMs) return "reached";
    if (!nextAssigned.done) { nextAssigned.done = true; return "next"; }
    return "locked";
  }

  function updateMilestoneSummary(elapsedMs) {
    if (elapsedMs === null) {
      milestoneEta.textContent = "—";
      milestoneProgress.style.width = "0%";
      milestoneDesc.textContent = "Log rokok pertama atau tetapkan tarikh berhenti untuk mula menjejak kebaikan badan anda.";
      return;
    }
    const next = MEDICAL_MILESTONES.find((m) => m.thresholdMs > elapsedMs);
    if (!next) {
      milestoneEta.textContent = "Semua tahap dicapai";
      milestoneProgress.style.width = "100%";
      milestoneDesc.textContent = "Anda telah mencapai semua tahap dalam Garis Masa Perubatan. Teruskan begini.";
      return;
    }
    const prevMs = [...MEDICAL_MILESTONES].reverse().find((m) => m.thresholdMs <= elapsedMs)?.thresholdMs ?? 0;
    const pct = Math.min(100, Math.max(0, ((elapsedMs - prevMs) / (next.thresholdMs - prevMs)) * 100));
    milestoneProgress.style.width = pct.toFixed(1) + "%";
    const remain = next.thresholdMs - elapsedMs;
    milestoneEta.textContent = `${next.label} · baki ${formatDuration(remain)}`;
    milestoneDesc.textContent = next.title;
  }

  // ---------- Full medical timeline (organ/health recovery) ----------
  const timelineList = $("timelineList");
  let timelineBuilt = false;
  const STATE_BADGE = { reached: "DICAPAI", next: "SETERUSNYA", locked: "BELUM SAMPAI" };

  function renderMedicalTimeline(elapsedMs) {
    if (!timelineList) return;
    const rows = timelineList.querySelectorAll(".timeline-item");

    if (!timelineBuilt || rows.length !== MEDICAL_MILESTONES.length) {
      timelineList.innerHTML = MEDICAL_MILESTONES.map((m) => `
        <div class="timeline-item" data-id="${m.id}">
          <div class="timeline-marker">
            <span class="timeline-dot"></span>
            <span class="timeline-line"></span>
          </div>
          <div class="timeline-content">
            <div class="timeline-row">
              ${iconSvg(m.icon, "timeline-icon")}
              <span class="timeline-time">${m.label}</span>
              <span class="timeline-state-badge"></span>
            </div>
            <p class="timeline-desc">${m.title}</p>
            <div class="timeline-mini-progress hidden"><div class="timeline-mini-fill" style="width:0%"></div></div>
            <span class="timeline-remain hidden"></span>
            <span class="timeline-source">Sumber: ${m.source}</span>
          </div>
        </div>
      `).join("");
      timelineBuilt = true;
    }

    const items = timelineList.querySelectorAll(".timeline-item");
    const nextAssigned = { done: false };
    let prevMs = 0;
    items.forEach((item, i) => {
      const m = MEDICAL_MILESTONES[i];
      const fill = item.querySelector(".timeline-mini-fill");
      const progressWrap = item.querySelector(".timeline-mini-progress");
      const remainEl = item.querySelector(".timeline-remain");
      const badgeEl = item.querySelector(".timeline-state-badge");
      const state = elapsedMs === null ? "locked" : milestoneState(m.thresholdMs, elapsedMs, nextAssigned);

      item.className = "timeline-item " + state;
      badgeEl.textContent = STATE_BADGE[state];
      if (state === "next" && elapsedMs !== null) {
        const pct = Math.min(100, Math.max(0, ((elapsedMs - prevMs) / (m.thresholdMs - prevMs)) * 100));
        fill.style.width = pct.toFixed(1) + "%";
        progressWrap.classList.remove("hidden");
        remainEl.textContent = `Baki ${formatDuration(m.thresholdMs - elapsedMs)}`;
        remainEl.classList.remove("hidden");
      } else {
        progressWrap.classList.add("hidden");
        remainEl.classList.add("hidden");
      }
      prevMs = m.thresholdMs;
    });
  }

  // ---------- Withdrawal timeline (separate from organ/health recovery) ----------
  const withdrawalList = $("withdrawalList");
  let withdrawalBuilt = false;

  function renderWithdrawalTimeline(elapsedMs) {
    if (!withdrawalList) return;
    if (!withdrawalBuilt) {
      withdrawalList.innerHTML = WITHDRAWAL_STAGES.map((m) => `
        <div class="timeline-item withdrawal-item" data-id="${m.id}">
          <div class="timeline-marker">
            <span class="timeline-dot"></span>
            <span class="timeline-line"></span>
          </div>
          <div class="timeline-content">
            <div class="timeline-row">
              <span class="timeline-time">${m.label}</span>
              <span class="timeline-state-badge"></span>
            </div>
            <p class="timeline-desc">${m.title}</p>
            <span class="timeline-source">Sumber: ${m.source}</span>
          </div>
        </div>
      `).join("");
      withdrawalBuilt = true;
    }
    const items = withdrawalList.querySelectorAll(".timeline-item");
    const nextAssigned = { done: false };
    items.forEach((item, i) => {
      const m = WITHDRAWAL_STAGES[i];
      const badgeEl = item.querySelector(".timeline-state-badge");
      const state = elapsedMs === null ? "locked" : milestoneState(m.thresholdMs, elapsedMs, nextAssigned);
      item.className = "timeline-item withdrawal-item " + state;
      badgeEl.textContent = STATE_BADGE[state];
    });
  }

  // ---------- Stats ----------
  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function refreshStats() {
    const logs = getLogs();
    const settings = getSettings();
    const now = Date.now();
    const todayStart = startOfDay(now);
    const weekStart = todayStart - 6 * DAY;

    const todayCount = logs.filter((t) => t >= todayStart).length;
    const weekCount = logs.filter((t) => t >= weekStart).length;

    statToday.textContent = todayCount;
    statWeek.textContent = weekCount;
    statTotal.textContent = logs.length;

    const costPerCig = getCostPerCig(settings);
    boxTotalCigs.textContent = logs.length;
    boxMoneySpent.textContent = "RM" + (logs.length * costPerCig).toFixed(2);
    boxAvgDay.textContent = (weekCount / 7).toFixed(1);
    if (boxBestStreak) boxBestStreak.textContent = bestStreakMemory !== null ? formatDurationShort(bestStreakMemory) : formatDurationShort(settings.bestStreakMs);

    // Money saved is a separate estimate from money spent (amendment
    // section 12) — only shown when the user has given a daily baseline.
    if (boxMoneySaved) {
      if (settings.cigarettesPerDay) {
        const trackingStart = logs.length ? logs[0] : settings.currentAttemptStartedAt;
        const smokeFreeDays = trackingStart ? Math.max(0, (now - trackingStart) / DAY) : 0;
        const expectedCigarettes = settings.cigarettesPerDay * smokeFreeDays;
        const cigarettesAvoided = Math.max(0, expectedCigarettes - logs.length);
        const moneySaved = cigarettesAvoided * costPerCig;
        boxMoneySaved.textContent = "RM" + moneySaved.toFixed(2);
      } else {
        boxMoneySaved.textContent = "—";
      }
    }

    renderBarChart(logs, todayStart);
    renderHistory(logs);
  }

  const DAY_NAMES = ["Ahd", "Isn", "Sel", "Rab", "Kha", "Jum", "Sab"];

  function renderBarChart(logs, todayStart) {
    barChart.innerHTML = "";
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart - i * DAY;
      const dayEnd = dayStart + DAY;
      const count = logs.filter((t) => t >= dayStart && t < dayEnd).length;
      days.push({ count, date: new Date(dayStart) });
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    days.forEach((d) => {
      const col = document.createElement("div");
      col.className = "bar-col";
      const num = document.createElement("span");
      num.className = "bar-num";
      num.textContent = d.count;
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.height = `${(d.count / max) * 78}px`;
      const label = document.createElement("span");
      label.className = "bar-day";
      label.textContent = DAY_NAMES[d.date.getDay()];
      col.appendChild(num);
      col.appendChild(fill);
      col.appendChild(label);
      barChart.appendChild(col);
    });
  }

  function timeAgoLabel(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Baru sahaja";
    if (mins < 60) return `${mins} minit lalu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} jam lalu`;
    const days = Math.floor(hours / 24);
    return `${days} hari lalu`;
  }

  function renderHistory(logs) {
    historyList.innerHTML = "";
    if (!logs.length) {
      historyList.innerHTML = `<p class="empty-note">Belum ada log lagi.</p>`;
      return;
    }
    // logs is ascending-sorted; capture each row's exact index in THAT array
    // (not the timestamp value) so deleting one entry can never remove a
    // second one that happens to share the same millisecond.
    const recentWithIdx = logs.map((ts, idx) => ({ ts, idx })).reverse().slice(0, 30);
    recentWithIdx.forEach(({ ts, idx }) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const d = new Date(ts);
      const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
      item.innerHTML = `
        <div>
          <div class="history-item-time">${timeStr}</div>
          <div class="history-item-ago">${timeAgoLabel(ts)}</div>
        </div>
        <button class="history-del" data-idx="${idx}" type="button" aria-label="Padam log ${timeStr}"><svg class="del-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      `;
      historyList.appendChild(item);
    });
    historyList.querySelectorAll(".history-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-idx"));
        const logs2 = getLogs();
        const [removedTs] = logs2.splice(idx, 1);
        saveLogs(logs2);
        const settings = getSettings();
        if (syncCurrentAttemptStart(logs2, settings) || persistBestStreak()) saveSettings(settings);
        refreshAll();
        showToast("Log dipadam", {
          label: "Buat asal",
          onClick: () => {
            const restored = getLogs();
            restored.push(removedTs);
            restored.sort((a, b) => a - b);
            saveLogs(restored);
            const s2 = getSettings();
            if (syncCurrentAttemptStart(restored, s2)) saveSettings(s2);
            refreshAll();
          },
        });
      });
    });
  }

  // ---------- Rotating fact ticker ----------
  const factCardText = $("factCardText");
  let factQueue = [];
  function nextFact() {
    if (!factQueue.length) factQueue = shuffleArray(DAMAGE_FACTS);
    return factQueue.pop();
  }
  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function rotateFact() {
    if (!factCardText) return;
    factCardText.classList.add("fading");
    setTimeout(() => {
      factCardText.textContent = nextFact();
      factCardText.classList.remove("fading");
    }, 250);
  }
  if (factCardText) {
    factCardText.textContent = nextFact();
    setInterval(rotateFact, 6000);
  }

  // ---------- Logging ----------
  function pickRandom(arr, n) {
    const copy = [...arr];
    const out = [];
    for (let i = 0; i < n && copy.length; i++) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
  }

  let logActionLocked = false;

  function openLogConfirm() {
    const modal = $("confirmLogModal");
    if (!modal || logActionLocked) return;
    modal.classList.remove("hidden");
  }

  function closeLogConfirm() {
    $("confirmLogModal")?.classList.add("hidden");
  }

  function confirmLogCigarette() {
    if (logActionLocked) return;
    logActionLocked = true;
    // Capture the streak that's ENDING right now as a best-streak candidate
    // before it resets, so a relapse never loses a record that was in
    // progress (amendment section 4/section 1 "Best streak remains").
    const prevRef = getReferenceTime();
    if (prevRef) updateBestStreakDisplay(Date.now() - prevRef);
    persistBestStreak();

    const now = Date.now();
    const logs = getLogs();
    logs.push(now);
    saveLogs(logs);
    const settings = getSettings();
    settings.currentAttemptStartedAt = now; // the one canonical timer source
    saveSettings(settings);

    closeLogConfirm();
    refreshAll();
    showDamageModal();
    setTimeout(() => { logActionLocked = false; }, 800);
  }

  function showDamageModal() {
    const facts = pickRandom(DAMAGE_FACTS, 3);
    const list = $("modalFacts");
    list.innerHTML = "";
    facts.forEach((f) => {
      const li = document.createElement("li");
      li.innerHTML = `<svg class="fact-alert-icon" viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>${f}</span>`;
      list.appendChild(li);
    });
    $("damageModal").classList.remove("hidden");
  }

  function undoLast() {
    const logs = getLogs();
    if (!logs.length) return;
    const removed = logs.pop();
    saveLogs(logs);
    const settings = getSettings();
    // The attempt that was "current" belonged to the log we just removed —
    // fall back to whichever log is now latest (or leave the prior value
    // untouched if none remain; see syncCurrentAttemptStart).
    syncCurrentAttemptStart(logs, settings);
    saveSettings(settings);
    refreshAll();
    showToast("Log terakhir dipadam", {
      label: "Buat asal",
      onClick: () => {
        const restored = getLogs();
        restored.push(removed);
        saveLogs(restored);
        const s2 = getSettings();
        syncCurrentAttemptStart(restored, s2);
        saveSettings(s2);
        refreshAll();
      },
    });
  }

  // ---------- Toast ----------
  const toastMsgEl = $("toastMsg");
  const toastActionEl = $("toastAction");
  let toastTimer = null;
  function showToast(msg, action) {
    toastMsgEl.textContent = msg;
    toastEl.classList.remove("hidden");
    if (action) {
      toastActionEl.textContent = action.label;
      toastActionEl.classList.remove("hidden");
      toastActionEl.onclick = () => {
        action.onClick();
        toastEl.classList.add("hidden");
        clearTimeout(toastTimer);
      };
    } else {
      toastActionEl.classList.add("hidden");
      toastActionEl.onclick = null;
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), action ? 4500 : 2200);
  }

  // ---------- Tips view ----------
  function renderTips() {
    const cravingList = $("cravingTips");
    cravingList.innerHTML = CRAVING_TIPS.map((t) => `<li>${t}</li>`).join("");
    $("quoteBox").textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }

  // ---------- Settings: pack-price money model (amendment section 9/10) ----------
  const packPriceInput = $("packPriceInput");
  const sticksPerPackInput = $("sticksPerPackInput");
  const costPerCigDisplay = $("costPerCigDisplay");
  const cigsPerDayInput = $("cigsPerDayInput");

  function loadSettingsIntoForm() {
    const s = getSettings();
    packPriceInput.value = s.packPrice ?? "";
    sticksPerPackInput.value = s.sticksPerPack ?? "";
    cigsPerDayInput.value = s.cigarettesPerDay ?? "";
    costPerCigDisplay.textContent = "RM" + getCostPerCig(s).toFixed(2);
    quitDateInput.value = s.quitDate ?? "";
  }

  function savePackPriceModel() {
    const s = getSettings();
    const pp = Number(packPriceInput.value);
    const spp = Number(sticksPerPackInput.value);
    s.packPrice = Number.isFinite(pp) && pp > 0 ? pp : null;
    s.sticksPerPack = Number.isFinite(spp) && spp > 0 ? spp : null;
    saveSettings(s);
    costPerCigDisplay.textContent = "RM" + getCostPerCig(s).toFixed(2);
    refreshAll();
  }
  packPriceInput?.addEventListener("change", savePackPriceModel);
  sticksPerPackInput?.addEventListener("change", savePackPriceModel);

  cigsPerDayInput?.addEventListener("change", () => {
    const s = getSettings();
    const v = Number(cigsPerDayInput.value);
    s.cigarettesPerDay = Number.isFinite(v) && v > 0 ? v : null;
    saveSettings(s);
    refreshAll();
  });

  // Picking a quit-start date is a deliberate action to (re)start the
  // active quit attempt — it writes the SAME canonical timestamp the timer
  // and Medical Timeline read from. quitDate itself is kept only as the
  // legacy/migration record (amendment section 2).
  quitDateInput?.addEventListener("change", () => {
    const s = getSettings();
    const val = quitDateInput.value;
    if (!val) { s.quitDate = null; saveSettings(s); return; }
    const parsed = new Date(val + "T00:00:00").getTime();
    if (!Number.isFinite(parsed) || parsed > Date.now()) {
      showToast("Tarikh tidak sah");
      quitDateInput.value = s.quitDate ?? "";
      return;
    }
    persistBestStreak();
    bestStreakMemory = null;
    s.quitDate = val;
    s.currentAttemptStartedAt = parsed;
    saveSettings(s);
    refreshAll();
  });

  // ---------- Reset (type-to-confirm, amendment section 16) ----------
  const resetConfirmModal = $("resetConfirmModal");
  const resetConfirmInput = $("resetConfirmInput");
  const resetConfirmSubmit = $("resetConfirmSubmit");
  const resetConfirmCancel = $("resetConfirmCancel");

  $("resetBtn")?.addEventListener("click", () => {
    resetConfirmInput.value = "";
    resetConfirmSubmit.disabled = true;
    resetConfirmModal.classList.remove("hidden");
    setTimeout(() => resetConfirmInput.focus(), 50);
  });
  resetConfirmInput?.addEventListener("input", () => {
    resetConfirmSubmit.disabled = resetConfirmInput.value !== "RESET";
  });
  resetConfirmCancel?.addEventListener("click", () => resetConfirmModal.classList.add("hidden"));
  resetConfirmSubmit?.addEventListener("click", () => {
    if (resetConfirmInput.value !== "RESET") return;
    localStorage.removeItem(LOGS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    bestStreakMemory = null;
    resetConfirmModal.classList.add("hidden");
    loadSettingsIntoForm();
    refreshAll();
    showToast("Semua data telah direset");
  });

  // ---------- Export / Import (amendment section 15) ----------
  $("exportBtn")?.addEventListener("click", () => {
    persistBestStreak();
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      logs: getLogs(),
      settings: getSettings(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lastcall-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Data dieksport");
  });

  const importFileInput = $("importFile");
  $("importBtn")?.addEventListener("click", () => importFileInput?.click());
  importFileInput?.addEventListener("change", () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        showToast("Fail tidak sah — bukan format JSON yang betul");
        importFileInput.value = "";
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        showToast("Fail tidak mengandungi data LastCall yang sah");
        importFileInput.value = "";
        return;
      }
      // schemaVersion may be absent on backups exported before this field
      // existed — treat that as legacy v1 and still accept it.
      const now = Date.now();
      const incomingLogs = Array.isArray(parsed.logs)
        ? parsed.logs.filter((t) => typeof t === "number" && Number.isFinite(t) && t > 0 && t <= now)
        : null;
      const incomingSettings = parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings)
        ? parsed.settings
        : null;
      if (!incomingLogs && !incomingSettings) {
        showToast("Fail tidak mengandungi data LastCall yang sah");
        importFileInput.value = "";
        return;
      }
      if (!confirm("Import akan menggantikan data semasa. Teruskan?")) {
        importFileInput.value = "";
        return;
      }
      const sortedLogs = incomingLogs ? incomingLogs.sort((a, b) => a - b) : getLogs();
      if (incomingLogs) saveLogs(sortedLogs);
      // Merge onto sanitized current settings so legacy fields the import
      // doesn't mention (or an app-lock PIN hash it shouldn't overwrite
      // blindly) survive; getSettings() re-sanitizes everything afterward.
      const mergedSettings = Object.assign(getSettings(), incomingSettings || {});
      syncCurrentAttemptStart(sortedLogs, mergedSettings);
      saveSettings(mergedSettings);
      bestStreakMemory = null;
      loadSettingsIntoForm();
      refreshAll();
      showToast("Data berjaya dipulihkan");
      importFileInput.value = "";
    };
    reader.readAsText(file);
  });

  // ---------- Tab navigation ----------
  const tabBtns = document.querySelectorAll(".tab-btn[data-view]");
  const views = { home: $("view-home"), timeline: $("view-timeline"), stats: $("view-stats"), tips: $("view-tips"), settings: $("view-settings") };
  function switchView(v) {
    tabBtns.forEach((b) => b.classList.toggle("active", b.getAttribute("data-view") === v));
    Object.entries(views).forEach(([key, el]) => el.classList.toggle("active", key === v));
    if (v === "tips") renderTips();
    if (v === "stats") refreshStats();
    if (v === "settings") loadSettingsIntoForm();
  }
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
  });
  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => switchView(el.getAttribute("data-goto")));
  });

  // ---------- Buttons ----------
  $("logCigBtn").addEventListener("click", openLogConfirm);
  $("confirmLogCancel")?.addEventListener("click", closeLogConfirm);
  $("confirmLogYes")?.addEventListener("click", confirmLogCigarette);
  $("confirmLogModal")?.addEventListener("click", (e) => {
    if (e.target === $("confirmLogModal")) closeLogConfirm();
  });
  undoBtn.addEventListener("click", undoLast);
  $("modalCloseBtn").addEventListener("click", () => $("damageModal").classList.add("hidden"));

  // ---------- Install prompt ----------
  const INSTALL_DISMISSED_KEY = "lastcall_install_prompt_dismissed";
  let deferredPrompt = null;
  const installBtn = $("installBtn");
  const installBtn2 = $("installBtn2");

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function isIOS() {
    const ua = window.navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function isAndroid() {
    return /android/i.test(window.navigator.userAgent);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove("hidden");
    installBtn2.classList.remove("hidden");
    maybeShowAndroidOnboardCta();
  });
  async function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add("hidden");
    installBtn2.classList.add("hidden");
    closeInstallOnboard();
  }
  installBtn.addEventListener("click", triggerInstall);
  installBtn2.addEventListener("click", triggerInstall);
  window.addEventListener("appinstalled", () => {
    installBtn.classList.add("hidden");
    installBtn2.classList.add("hidden");
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    closeInstallOnboard();
  });

  // ---------- First-visit install onboarding (iOS manual steps / Android native) ----------
  const installOnboard = $("installOnboard");
  const installOnboardBtn = $("installOnboardBtn");
  const installOnboardLater = $("installOnboardLater");
  const installStepsIOS = $("installStepsIOS");
  const installOnboardSub = $("installOnboardSub");

  function closeInstallOnboard() {
    installOnboard?.classList.add("hidden");
  }
  function dismissInstallOnboard() {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    closeInstallOnboard();
  }
  function maybeShowAndroidOnboardCta() {
    if (isAndroid() && deferredPrompt && !installOnboard.classList.contains("hidden")) {
      installOnboardBtn.classList.remove("hidden");
    }
  }
  installOnboardLater?.addEventListener("click", dismissInstallOnboard);
  installOnboardBtn?.addEventListener("click", triggerInstall);

  function initInstallOnboard() {
    if (isStandalone()) return;
    if (localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
    if (isIOS()) {
      installOnboardSub.textContent = "Akses pantas dari skrin utama telefon anda, buka macam app biasa.";
      installStepsIOS.classList.remove("hidden");
      installOnboard.classList.remove("hidden");
    } else if (isAndroid()) {
      installOnboardSub.textContent = "Akses pantas, buka macam app biasa, dan berfungsi walau tanpa internet.";
      installOnboard.classList.remove("hidden");
      // beforeinstallprompt may arrive slightly after load; show the CTA
      // once it's ready, and fall back to manual instructions if it never
      // fires (installability criteria not met on this browser/session).
      maybeShowAndroidOnboardCta();
      setTimeout(() => {
        if (!deferredPrompt && !installOnboard.classList.contains("hidden")) {
          installOnboardSub.textContent = "Ketik menu (⋮) pelayar anda, kemudian pilih \"Install app\" atau \"Add to Home screen\".";
        }
      }, 2500);
    }
  }
  // A short delay lets a first-time visitor see the app itself before the
  // install sheet covers part of the screen, instead of it being the very
  // first thing they see on load.
  setTimeout(initInstallOnboard, 1800);

  // ---------- Main refresh loop ----------
  function refreshAll() {
    updateHero();
    refreshStats();
  }

  migrateIfNeeded();
  setInterval(updateHero, 1000);
  refreshAll();
  loadSettingsIntoForm();
  persistBestStreak();
  window.addEventListener("beforeunload", persistBestStreak);

  // ---------- Intro splash ----------
  // First paint already has real data by now (refreshAll ran above), so the
  // splash isn't hiding a blank/loading state — it's a short branded beat
  // before the app underneath is revealed. Skipped entirely when App Lock
  // must show first (privacy takes priority over the branded beat).
  const splashScreen = $("splashScreen");
  function playSplash() {
    if (!splashScreen) return;
    setTimeout(() => {
      splashScreen.classList.add("splash-out");
      splashScreen.addEventListener("transitionend", () => splashScreen.remove(), { once: true });
      setTimeout(() => splashScreen.remove(), 800); // fallback if transitionend never fires
    }, 1100);
  }

  // ---------- App Lock (sections 24-29) ----------
  // Client-side privacy lock, not banking-level security: a salted SHA-256
  // hash of the PIN is stored via Web Crypto, never the PIN itself.
  const lockScreen = $("lockScreen");
  const lockPinDots = $("lockPinDots");
  const lockTitle = $("lockTitle");
  const lockSubtitle = $("lockSubtitle");
  const lockError = $("lockError");
  const lockKeypad = $("lockKeypad");
  const lockForgotBtn = $("lockForgotBtn");
  const lockRecoveryPanel = $("lockRecoveryPanel");
  const lockRecoveryConfirm = $("lockRecoveryConfirm");
  const lockRecoveryCancel = $("lockRecoveryCancel");
  const appLockToggle = $("appLockToggle");
  const appLockTimeoutSelect = $("appLockTimeoutSelect");
  const appLockTimeoutRow = $("appLockTimeoutRow");
  const appLockChangePinBtn = $("appLockChangePinBtn");

  let pinBuffer = "";
  let pinMode = null; // null = unlock; "setup-first" / "setup-confirm" during setup
  let pinFirstEntry = null;

  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function randomSaltHex() {
    const arr = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function hashPin(pin, saltHex) {
    return sha256Hex(saltHex + ":" + pin);
  }

  function lockTimeoutMs(settings) {
    const map = { 0: 0, 1: 60000, 5: 300000, 15: 900000 };
    return map[settings.appLock.timeoutMin] ?? 300000;
  }
  // A page reload / fresh launch has no memory of "still unlocked" — the
  // JS session itself is gone, so it always re-asks for the PIN. The
  // configurable timeout only governs returning from the background
  // WITHOUT a reload (visibilitychange, same still-alive tab/session).
  function shouldRequireUnlockOnBoot() {
    return getSettings().appLock.enabled;
  }
  function shouldRequireUnlockOnResume() {
    const settings = getSettings();
    if (!settings.appLock.enabled) return false;
    const last = settings.appLock.lastUnlockedAt;
    if (!last) return true;
    return Date.now() - last > lockTimeoutMs(settings);
  }

  function renderPinDots() {
    if (!lockPinDots) return;
    const expected = pinMode ? Math.max(pinBuffer.length, 4) : (getSettings().appLock.pinLength || 4);
    lockPinDots.innerHTML = "";
    for (let i = 0; i < Math.max(expected, pinBuffer.length); i++) {
      const dot = document.createElement("span");
      dot.className = "lock-pin-dot" + (i < pinBuffer.length ? " filled" : "");
      lockPinDots.appendChild(dot);
    }
  }
  function updateLockTitle() {
    if (!lockTitle) return;
    if (pinMode === "setup-first") { lockTitle.textContent = "Tetapkan PIN"; lockSubtitle.textContent = "Masukkan 4–6 digit PIN baharu"; }
    else if (pinMode === "setup-confirm") { lockTitle.textContent = "Sahkan PIN"; lockSubtitle.textContent = "Masukkan semula PIN yang sama"; }
    else { lockTitle.textContent = "LastCall dikunci"; lockSubtitle.textContent = "Masukkan PIN untuk teruskan"; }
    $("lockEnterBtn")?.classList.toggle("hidden", !pinMode);
  }
  function showLockError(msg) {
    if (!lockError) return;
    lockError.textContent = msg;
    lockError.classList.remove("hidden");
    lockScreen.classList.add("lock-shake");
    setTimeout(() => lockScreen.classList.remove("lock-shake"), 400);
  }

  function showLockScreen(mode) {
    pinMode = mode;
    pinBuffer = "";
    pinFirstEntry = null;
    lockError?.classList.add("hidden");
    lockRecoveryPanel?.classList.add("hidden");
    updateLockTitle();
    renderPinDots();
    lockScreen.classList.remove("hidden");
    requestAnimationFrame(() => lockScreen.classList.add("active"));
  }
  function hideLockScreen() {
    lockScreen.classList.add("lock-unlocked");
    setTimeout(() => {
      lockScreen.classList.remove("active", "lock-unlocked");
      lockScreen.classList.add("hidden");
    }, 220);
  }

  async function attemptUnlock() {
    const settings = getSettings();
    if (settings.appLock.lockoutUntil && Date.now() < settings.appLock.lockoutUntil) {
      showLockError(`Cuba lagi dalam ${Math.ceil((settings.appLock.lockoutUntil - Date.now()) / 1000)}s`);
      pinBuffer = "";
      renderPinDots();
      return;
    }
    const hash = await hashPin(pinBuffer, settings.appLock.saltHex);
    if (hash === settings.appLock.hashHex) {
      settings.appLock.failedAttempts = 0;
      settings.appLock.lockoutUntil = 0;
      settings.appLock.lastUnlockedAt = Date.now();
      saveSettings(settings);
      hideLockScreen();
      playSplash();
    } else {
      // Progressive brute-force delay (section 25): mild → longer, never
      // permanent — a "Forgot PIN?" recovery path always stays reachable.
      settings.appLock.failedAttempts = (settings.appLock.failedAttempts || 0) + 1;
      const delays = [0, 0, 0, 5000, 10000, 20000, 30000];
      const idx = Math.min(settings.appLock.failedAttempts, delays.length - 1);
      settings.appLock.lockoutUntil = delays[idx] ? Date.now() + delays[idx] : 0;
      saveSettings(settings);
      showLockError("PIN salah");
      pinBuffer = "";
      renderPinDots();
    }
  }

  function handleSetupNext() {
    if (pinBuffer.length < 4) return;
    if (pinMode === "setup-first") {
      pinFirstEntry = pinBuffer;
      pinBuffer = "";
      pinMode = "setup-confirm";
      updateLockTitle();
      renderPinDots();
    } else if (pinMode === "setup-confirm") {
      if (pinBuffer !== pinFirstEntry) {
        showLockError("PIN tidak sepadan — cuba lagi");
        pinMode = "setup-first";
        pinBuffer = "";
        pinFirstEntry = null;
        updateLockTitle();
        renderPinDots();
        return;
      }
      finalizeSetup(pinFirstEntry);
    }
  }

  async function finalizeSetup(pin) {
    const settings = getSettings();
    const saltHex = randomSaltHex();
    settings.appLock.enabled = true;
    settings.appLock.saltHex = saltHex;
    settings.appLock.hashHex = await hashPin(pin, saltHex);
    settings.appLock.pinLength = pin.length;
    settings.appLock.failedAttempts = 0;
    settings.appLock.lockoutUntil = 0;
    settings.appLock.lastUnlockedAt = Date.now();
    saveSettings(settings);
    hideLockScreen();
    refreshAppLockUI();
    showToast("App Lock diaktifkan");
  }

  function handleLockDigit(d) {
    const maxLen = pinMode ? 6 : (getSettings().appLock.pinLength || 6);
    if (pinBuffer.length >= maxLen) return;
    pinBuffer += d;
    lockError?.classList.add("hidden");
    renderPinDots();
    if (!pinMode) {
      const expected = getSettings().appLock.pinLength || 4;
      if (pinBuffer.length === expected) attemptUnlock();
    } else if (pinBuffer.length === 6) {
      handleSetupNext();
    }
  }
  function handleLockBackspace() {
    pinBuffer = pinBuffer.slice(0, -1);
    renderPinDots();
  }

  lockKeypad?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.digit !== undefined) handleLockDigit(btn.dataset.digit);
    else if (btn.dataset.action === "back") handleLockBackspace();
    else if (btn.dataset.action === "enter") handleSetupNext();
  });

  lockForgotBtn?.addEventListener("click", () => lockRecoveryPanel?.classList.remove("hidden"));
  lockRecoveryCancel?.addEventListener("click", () => lockRecoveryPanel?.classList.add("hidden"));
  lockRecoveryConfirm?.addEventListener("click", () => {
    // Resetting the PIN never touches cigarette history/settings — only
    // the appLock block itself (section 26).
    const settings = getSettings();
    settings.appLock = Object.assign({}, DEFAULT_SETTINGS.appLock);
    saveSettings(settings);
    hideLockScreen();
    refreshAppLockUI();
    playSplash();
    showToast("App Lock telah direset");
  });

  function refreshAppLockUI() {
    const settings = getSettings();
    if (appLockToggle) appLockToggle.checked = settings.appLock.enabled;
    if (appLockTimeoutSelect) appLockTimeoutSelect.value = String(settings.appLock.timeoutMin);
    appLockTimeoutRow?.classList.toggle("hidden", !settings.appLock.enabled);
    appLockChangePinBtn?.classList.toggle("hidden", !settings.appLock.enabled);
  }

  appLockToggle?.addEventListener("change", () => {
    if (appLockToggle.checked) {
      appLockToggle.checked = false; // stays off until setup actually completes
      showLockScreen("setup-first");
    } else {
      const settings = getSettings();
      settings.appLock = Object.assign({}, DEFAULT_SETTINGS.appLock);
      saveSettings(settings);
      refreshAppLockUI();
      showToast("App Lock dimatikan");
    }
  });
  appLockChangePinBtn?.addEventListener("click", () => showLockScreen("setup-first"));
  appLockTimeoutSelect?.addEventListener("change", () => {
    const settings = getSettings();
    settings.appLock.timeoutMin = Number(appLockTimeoutSelect.value);
    saveSettings(settings);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && shouldRequireUnlockOnResume()) showLockScreen(null);
  });

  // Decide, before anything else paints meaningfully, whether privacy
  // (lock screen) or the branded splash goes first.
  if (shouldRequireUnlockOnBoot()) {
    splashScreen?.remove();
    showLockScreen(null);
  } else {
    lockScreen?.classList.add("hidden");
    playSplash();
  }
  refreshAppLockUI();

  // ---------- Service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
