/* ====== Konfigurasi ======
   CLIENT_ID didapat dari Google Cloud Console (lihat README.md).
   Disimpan di localStorage supaya kamu tidak perlu edit kode untuk pasang punya sendiri. */
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const APP_FOLDER_NAME = "Arsip Saya";

let tokenClient = null;
let accessToken = null;
let appFolderId = null;
let allFiles = [];
let activeCategory = "semua";

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  bindEvents();
  registerServiceWorker();

  const savedClientId = localStorage.getItem("arsip_client_id");
  if (savedClientId) {
    els.clientIdInput.value = savedClientId;
    initGoogle(savedClientId);
  }

  const savedToken = sessionStorage.getItem("arsip_access_token");
  if (savedToken && savedClientId) {
    accessToken = savedToken;
    afterSignIn();
  }
});

function cacheEls() {
  els.signinPanel = document.getElementById("signin-panel");
  els.mainView = document.getElementById("main-view");
  els.clientIdInput = document.getElementById("client-id-input");
  els.signinBtn = document.getElementById("signin-btn");
  els.accountBtn = document.getElementById("account-btn");
  els.searchInput = document.getElementById("search-input");
  els.categories = document.getElementById("categories");
  els.fileList = document.getElementById("file-list");
  els.emptyState = document.getElementById("empty-state");
  els.storageValue = document.getElementById("storage-value");
  els.uploadBtn = document.getElementById("upload-btn");
  els.fileInput = document.getElementById("file-input");
  els.toast = document.getElementById("toast");
  els.toastText = document.getElementById("toast-text");
}

function bindEvents() {
  els.signinBtn.addEventListener("click", handleSignInClick);
  els.accountBtn.addEventListener("click", handleSignOut);
  els.searchInput.addEventListener("input", debounce(renderFiles, 200));
  els.categories.addEventListener("click", (e) => {
    const tab = e.target.closest(".cat-tab");
    if (!tab) return;
    activeCategory = tab.dataset.category;
    [...els.categories.children].forEach((c) => c.classList.toggle("active", c === tab));
    renderFiles();
  });
  els.uploadBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", handleFileUpload);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

/* ====== Google Sign-In ====== */
function initGoogle(clientId) {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) {
        showToast("Login gagal, coba lagi.");
        return;
      }
      accessToken = resp.access_token;
      sessionStorage.setItem("arsip_access_token", accessToken);
      afterSignIn();
    },
  });
}

function handleSignInClick() {
  const clientId = els.clientIdInput.value.trim();
  if (!clientId) {
    showToast("Isi dulu Client ID dari Google Cloud Console.");
    return;
  }
  localStorage.setItem("arsip_client_id", clientId);
  if (!tokenClient) initGoogle(clientId);
  tokenClient.requestAccessToken();
}

function handleSignOut() {
  if (accessToken && google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  sessionStorage.removeItem("arsip_access_token");
  accessToken = null;
  appFolderId = null;
  els.mainView.classList.add("hidden");
  els.signinPanel.classList.remove("hidden");
}

async function afterSignIn() {
  els.signinPanel.classList.add("hidden");
  els.mainView.classList.remove("hidden");
  try {
    appFolderId = await findOrCreateAppFolder();
    await loadFiles();
  } catch (err) {
    console.error(err);
    showToast("Gagal memuat data dari Drive.");
  }
}

/* ====== Drive API ====== */
async function driveFetch(path, options = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return res.json();
}

async function findOrCreateAppFolder() {
  const q = encodeURIComponent(
    `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const found = await driveFetch(`files?q=${q}&fields=files(id,name)`);
  if (found.files && found.files.length > 0) return found.files[0].id;

  const created = await driveFetch("files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  return created.id;
}

async function loadFiles() {
  const q = encodeURIComponent(`'${appFolderId}' in parents and trashed=false`);
  const data = await driveFetch(
    `files?q=${q}&orderBy=modifiedTime desc&pageSize=200&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`
  );
  allFiles = data.files || [];
  renderFiles();
  updateStorageLabel();
}

function updateStorageLabel() {
  els.storageValue.textContent = `${allFiles.length} berkas`;
}

/* ====== Upload ====== */
async function handleFileUpload(e) {
  const files = [...e.target.files];
  if (files.length === 0) return;

  showToast(`Mengunggah ${files.length} berkas...`);

  for (const file of files) {
    try {
      await uploadFile(file);
    } catch (err) {
      console.error(err);
      showToast(`Gagal unggah ${file.name}`);
    }
  }

  showToast("Selesai mengunggah.");
  els.fileInput.value = "";
  await loadFiles();
}

async function uploadFile(file) {
  const metadata = { name: file.name, parents: [appFolderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  if (!res.ok) throw new Error("Upload gagal");
  return res.json();
}

/* ====== Render ====== */
function categoryOf(mimeType) {
  if (mimeType.startsWith("image/")) return "foto";
  if (mimeType === "application/pdf" || mimeType.includes("document") || mimeType.includes("text")) return "dokumen";
  return "lainnya";
}

function renderFiles() {
  const query = els.searchInput.value.trim().toLowerCase();

  const filtered = allFiles.filter((f) => {
    const matchesCategory = activeCategory === "semua" || categoryOf(f.mimeType) === activeCategory;
    const matchesQuery = !query || f.name.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  els.fileList.innerHTML = "";

  if (filtered.length === 0) {
    els.emptyState.classList.remove("hidden");
    els.emptyState.textContent = allFiles.length === 0
      ? "Belum ada berkas. Ketuk tombol unggah di bawah untuk mulai menyimpan."
      : "Tidak ada berkas yang cocok.";
    return;
  }
  els.emptyState.classList.add("hidden");

  for (const file of filtered) {
    els.fileList.appendChild(renderFileRow(file));
  }
}

function renderFileRow(file) {
  const row = document.createElement("div");
  row.className = "file-row";
  row.addEventListener("click", () => window.open(file.webViewLink, "_blank"));

  const cat = categoryOf(file.mimeType);
  const iconClass = cat === "foto" ? "image" : cat === "dokumen" ? "pdf" : "";

  row.innerHTML = `
    <div class="file-icon ${iconClass}">${fileIconSvg(cat)}</div>
    <div class="file-meta">
      <div class="file-name">${escapeHtml(file.name)}</div>
      <div class="file-sub">${formatSize(file.size)} · ${formatDate(file.modifiedTime)}</div>
    </div>
  `;
  return row;
}

function fileIconSvg(cat) {
  if (cat === "foto") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="M21 15l-5-5L5 19"/></svg>`;
  }
  if (cat === "dokumen") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>`;
  }
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>`;
}

/* ====== Util ====== */
function formatSize(bytes) {
  if (!bytes) return "-";
  const n = Number(bytes);
  if (n < 1024) return `${n} b`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kb`;
  return `${(n / (1024 * 1024)).toFixed(1)} mb`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let toastTimer;
function showToast(text) {
  els.toastText.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}
