(() => {
  "use strict";

  const LOGS_KEY = "lastcall_logs_v1";
  const SETTINGS_KEY = "lastcall_settings_v1";

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
  function getSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch {}
    if (!s || typeof s !== "object" || Array.isArray(s)) s = {};
    const merged = Object.assign({ pricePerCig: 0.6, quitDate: null, bestStreakMs: 0 }, s);
    if (!Number.isFinite(merged.pricePerCig) || merged.pricePerCig < 0) merged.pricePerCig = 0.6;
    if (!Number.isFinite(merged.bestStreakMs) || merged.bestStreakMs < 0) merged.bestStreakMs = 0;
    return merged;
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
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
    // Jangka panjang
    "Anggaran hayat berkurangan lebih kurang 11 minit bagi setiap batang.",
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

  const MILESTONES = [
    { t: 20 * 60, label: "20 minit", icon: "heart", desc: "Kadar denyutan jantung dan tekanan darah anda mula kembali ke paras normal." },
    { t: 8 * 3600, label: "8 jam", icon: "droplet", desc: "Paras nikotin dalam darah menurun kira-kira 93%; paras oksigen dalam darah mula meningkat." },
    { t: 12 * 3600, label: "12 jam", icon: "wind", desc: "Paras karbon monoksida dalam darah kembali normal — lebih banyak oksigen sampai ke organ." },
    { t: 24 * 3600, label: "24 jam", icon: "heart", desc: "Risiko serangan jantung mula berkurangan berbanding semasa masih merokok." },
    { t: 2 * 24 * 3600, label: "2 hari", icon: "sparkle", desc: "Hujung saraf mula tumbuh semula; deria rasa dan bau anda mula bertambah baik." },
    { t: 3 * 24 * 3600, label: "3 hari", icon: "wind", desc: "Nikotin 100% keluar dari badan. Saluran bronkial dalam paru-paru mula relaks — bernafas lebih senang (gejala penarikan mungkin memuncak sekitar masa ini)." },
    { t: 14 * 24 * 3600, label: "2 minggu", icon: "droplet", desc: "Peredaran darah bertambah baik dengan ketara, berjalan dan bersenam jadi lebih mudah." },
    { t: 30 * 24 * 3600, label: "1 bulan", icon: "wind", desc: "Batuk, sesak nafas dan keletihan berkurangan; silia (bulu halus) paru-paru mula pulih." },
    { t: 90 * 24 * 3600, label: "3 bulan", icon: "wind", desc: "Fungsi paru-paru meningkat sehingga 30%; peredaran darah terus bertambah baik." },
    { t: 270 * 24 * 3600, label: "9 bulan", icon: "wind", desc: "Silia paru-paru pulih sepenuhnya — risiko jangkitan paru-paru berkurangan dengan ketara." },
    { t: 365 * 24 * 3600, label: "1 tahun", icon: "heart", desc: "Risiko penyakit jantung koronari kira-kira separuh berbanding seorang perokok." },
    { t: 5 * 365 * 24 * 3600, label: "5 tahun", icon: "shield", desc: "Arteri dan saluran darah mula mengembang semula (risiko strok berkurangan); risiko kanser mulut, tekak, esofagus dan pundi kencing berkurangan separuh." },
    { t: 10 * 365 * 24 * 3600, label: "10 tahun", icon: "shield", desc: "Risiko kematian akibat kanser paru-paru kira-kira separuh berbanding perokok; risiko kanser laring dan pankreas turut berkurangan." },
    { t: 15 * 365 * 24 * 3600, label: "15 tahun", icon: "heart", desc: "Risiko penyakit jantung koronari setanding seseorang yang tidak pernah merokok." },
    { t: 20 * 365 * 24 * 3600, label: "20 tahun", icon: "shield", desc: "Risiko kematian akibat sebab berkaitan rokok (termasuk penyakit paru-paru) turun ke paras bukan perokok." },
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

  const MINUTES_LOST_PER_CIG = 11;

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
  const boxMinutesLost = $("boxMinutesLost");
  const boxMoneySpent = $("boxMoneySpent");
  const boxAvgDay = $("boxAvgDay");
  const barChart = $("barChart");
  const historyList = $("historyList");
  const priceInput = $("priceInput");
  const quitDateInput = $("quitDateInput");
  const toastEl = $("toast");

  // ---------- Reference point: last cigarette or quit date ----------
  function getReferenceTime() {
    const logs = getLogs();
    const settings = getSettings();
    const lastLog = logs.length ? logs[logs.length - 1] : null;
    const quitDate = settings.quitDate ? new Date(settings.quitDate + "T00:00:00").getTime() : null;
    if (lastLog && quitDate) return Math.max(lastLog, quitDate);
    if (lastLog) return lastLog;
    if (quitDate) return quitDate;
    return null;
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
      updateMilestone(null);
      renderFullTimeline(0);
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
    updateMilestone(elapsedMs / 1000);
    renderFullTimeline(elapsedMs / 1000);
    updateBestStreak(elapsedMs);
  }

  // Best streak = the longest interval ever reached between consecutive
  // logs, including the streak currently in progress. A relapse must never
  // erase this — it only resets the *current* streak (see getReferenceTime).
  function formatDurationShort(ms) {
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days} hari ${hours} jam`;
    if (hours > 0) return `${hours} jam ${mins} minit`;
    return `${mins} minit`;
  }
  function updateBestStreak(currentStreakMs) {
    const settings = getSettings();
    if (currentStreakMs > settings.bestStreakMs) {
      settings.bestStreakMs = currentStreakMs;
      saveSettings(settings);
    }
    if (settings.bestStreakMs > 60000) {
      bestStreakValue.textContent = formatDurationShort(settings.bestStreakMs);
      bestStreakBadge.classList.remove("hidden");
    } else {
      bestStreakBadge.classList.add("hidden");
    }
  }

  function updateMilestone(elapsedSec) {
    if (elapsedSec === null) {
      milestoneEta.textContent = "—";
      milestoneProgress.style.width = "0%";
      milestoneDesc.textContent = "Log rokok pertama atau tetapkan tarikh berhenti untuk mula menjejak kebaikan badan anda.";
      return;
    }
    let next = MILESTONES.find((m) => m.t > elapsedSec);
    if (!next) {
      milestoneEta.textContent = "Semua tahap dicapai";
      milestoneProgress.style.width = "100%";
      milestoneDesc.textContent = "Luar biasa! Anda telah mencapai semua tahap kesihatan utama. Teruskan begini.";
      return;
    }
    const prevT = [...MILESTONES].reverse().find((m) => m.t <= elapsedSec)?.t ?? 0;
    const pct = Math.min(100, Math.max(0, ((elapsedSec - prevT) / (next.t - prevT)) * 100));
    milestoneProgress.style.width = pct.toFixed(1) + "%";
    const remain = next.t - elapsedSec;
    milestoneEta.textContent = `${next.label} · baki ${formatDuration(remain * 1000)}`;
    milestoneDesc.textContent = next.desc;
  }

  // ---------- Full medical timeline ----------
  const timelineList = $("timelineList");
  let timelineBuilt = false;

  function renderFullTimeline(elapsedSec) {
    if (!timelineList) return;
    const rows = timelineList.querySelectorAll(".timeline-item");

    if (!timelineBuilt || rows.length !== MILESTONES.length) {
      timelineList.innerHTML = MILESTONES.map((m) => `
        <div class="timeline-item" data-t="${m.t}">
          <div class="timeline-marker">
            <span class="timeline-dot"></span>
            <span class="timeline-line"></span>
          </div>
          <div class="timeline-content">
            <div class="timeline-row">
              ${iconSvg(m.icon, "timeline-icon")}
              <span class="timeline-time">${m.label}</span>
            </div>
            <p class="timeline-desc">${m.desc}</p>
            <div class="timeline-mini-progress hidden"><div class="timeline-mini-fill" style="width:0%"></div></div>
            <span class="timeline-remain hidden"></span>
          </div>
        </div>
      `).join("");
      timelineBuilt = true;
    }

    const items = timelineList.querySelectorAll(".timeline-item");
    let prevT = 0;
    let currentAssigned = false;
    items.forEach((item, i) => {
      const m = MILESTONES[i];
      const fill = item.querySelector(".timeline-mini-fill");
      const progressWrap = item.querySelector(".timeline-mini-progress");
      const remainEl = item.querySelector(".timeline-remain");

      if (m.t <= elapsedSec) {
        item.className = "timeline-item achieved";
        progressWrap.classList.add("hidden");
        remainEl.classList.add("hidden");
      } else if (!currentAssigned) {
        item.className = "timeline-item current";
        currentAssigned = true;
        const pct = Math.min(100, Math.max(0, ((elapsedSec - prevT) / (m.t - prevT)) * 100));
        fill.style.width = pct.toFixed(1) + "%";
        progressWrap.classList.remove("hidden");
        remainEl.textContent = `Baki ${formatDuration((m.t - elapsedSec) * 1000)}`;
        remainEl.classList.remove("hidden");
      } else {
        item.className = "timeline-item upcoming";
        progressWrap.classList.add("hidden");
        remainEl.classList.add("hidden");
      }
      prevT = m.t;
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

    boxTotalCigs.textContent = logs.length;
    boxMinutesLost.textContent = (logs.length * MINUTES_LOST_PER_CIG).toLocaleString("ms-MY");
    boxMoneySpent.textContent = "RM" + (logs.length * (Number(settings.pricePerCig) || 0)).toFixed(2);
    boxAvgDay.textContent = (weekCount / 7).toFixed(1);

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
    const recent = [...logs].reverse().slice(0, 30);
    recent.forEach((ts) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const d = new Date(ts);
      const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
      item.innerHTML = `
        <div>
          <div class="history-item-time">${timeStr}</div>
          <div class="history-item-ago">${timeAgoLabel(ts)}</div>
        </div>
        <button class="history-del" data-ts="${ts}" type="button" aria-label="Padam"><svg class="del-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      `;
      historyList.appendChild(item);
    });
    historyList.querySelectorAll(".history-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ts = Number(btn.getAttribute("data-ts"));
        const logs2 = getLogs().filter((t) => t !== ts);
        saveLogs(logs2);
        refreshAll();
        showToast("Log dipadam", {
          label: "Buat asal",
          onClick: () => {
            const restored = getLogs();
            restored.push(ts);
            saveLogs(restored);
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
    const logs = getLogs();
    logs.push(Date.now());
    saveLogs(logs);
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
    refreshAll();
    showToast("Log terakhir dipadam", {
      label: "Buat asal",
      onClick: () => {
        const restored = getLogs();
        restored.push(removed);
        saveLogs(restored);
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

  // ---------- Settings ----------
  function loadSettingsIntoForm() {
    const s = getSettings();
    priceInput.value = s.pricePerCig ?? "";
    quitDateInput.value = s.quitDate ?? "";
  }
  priceInput?.addEventListener("change", () => {
    const s = getSettings();
    s.pricePerCig = Number(priceInput.value) || 0;
    saveSettings(s);
    refreshAll();
  });
  quitDateInput?.addEventListener("change", () => {
    const s = getSettings();
    s.quitDate = quitDateInput.value || null;
    saveSettings(s);
    refreshAll();
  });

  $("resetBtn")?.addEventListener("click", () => {
    if (confirm("Padam SEMUA data log dan tetapan? Tindakan ini tidak boleh diundur. Pertimbangkan untuk Eksport dahulu.")) {
      localStorage.removeItem(LOGS_KEY);
      localStorage.removeItem(SETTINGS_KEY);
      loadSettingsIntoForm();
      refreshAll();
      showToast("Semua data telah direset");
    }
  });

  // ---------- Export / Import ----------
  $("exportBtn")?.addEventListener("click", () => {
    const payload = {
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
      const incomingLogs = Array.isArray(parsed.logs)
        ? parsed.logs.filter((t) => typeof t === "number" && Number.isFinite(t) && t > 0)
        : null;
      const incomingSettings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : null;
      if (!incomingLogs && !incomingSettings) {
        showToast("Fail tidak mengandungi data LastCall yang sah");
        importFileInput.value = "";
        return;
      }
      if (!confirm("Import akan menggantikan data semasa. Teruskan?")) {
        importFileInput.value = "";
        return;
      }
      if (incomingLogs) saveLogs(incomingLogs.sort((a, b) => a - b));
      if (incomingSettings) saveSettings(Object.assign(getSettings(), incomingSettings));
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

  setInterval(updateHero, 1000);
  refreshAll();
  loadSettingsIntoForm();

  // ---------- Service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
