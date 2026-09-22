/* ====== Konfigurasi ======
   CLIENT_ID didapat dari Google Cloud Console (lihat README.md).
   Disimpan di localStorage supaya kamu tidak perlu edit kode untuk pasang punya sendiri. */
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const APP_FOLDER_NAME = "Arsip Saya";
const FOLDER_MIME = "application/vnd.google-apps.folder";

let tokenClient = null;
let accessToken = null;
let allItems = []; // files + folders di folder yang sedang dibuka
let activeCategory = "semua";
let folderStack = []; // [{id, name}, ...] root ada di index 0

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
  els.breadcrumb = document.getElementById("breadcrumb");
  els.fileList = document.getElementById("file-list");
  els.emptyState = document.getElementById("empty-state");
  els.storageValue = document.getElementById("storage-value");
  els.uploadBtn = document.getElementById("upload-btn");
  els.fileInput = document.getElementById("file-input");
  els.toast = document.getElementById("toast");
  els.toastText = document.getElementById("toast-text");
  els.actionSheet = document.getElementById("action-sheet");
  els.actionSheetBackdrop = document.getElementById("action-sheet-backdrop");
  els.actionUpload = document.getElementById("action-upload");
  els.actionNewFolder = document.getElementById("action-new-folder");
  els.newFolderModal = document.getElementById("new-folder-modal");
  els.newFolderInput = document.getElementById("new-folder-input");
  els.newFolderCancel = document.getElementById("new-folder-cancel");
  els.newFolderConfirm = document.getElementById("new-folder-confirm");
}

function bindEvents() {
  els.signinBtn.addEventListener("click", handleSignInClick);
  els.accountBtn.addEventListener("click", handleSignOut);
  els.searchInput.addEventListener("input", debounce(renderItems, 200));
  els.categories.addEventListener("click", (e) => {
    const tab = e.target.closest(".cat-tab");
    if (!tab) return;
    activeCategory = tab.dataset.category;
    [...els.categories.children].forEach((c) => c.classList.toggle("active", c === tab));
    renderItems();
  });

  els.uploadBtn.addEventListener("click", () => openActionSheet());
  els.actionSheetBackdrop.addEventListener("click", closeActionSheet);
  els.actionUpload.addEventListener("click", () => {
    closeActionSheet();
    els.fileInput.click();
  });
  els.actionNewFolder.addEventListener("click", () => {
    closeActionSheet();
    openNewFolderModal();
  });
  els.newFolderCancel.addEventListener("click", closeNewFolderModal);
  els.newFolderConfirm.addEventListener("click", handleCreateFolder);
  els.newFolderInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCreateFolder();
  });

  els.fileInput.addEventListener("change", handleFileUpload);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

/* ====== Action sheet (Unggah / Buat folder) ====== */
function openActionSheet() {
  els.actionSheet.classList.add("show");
  els.actionSheetBackdrop.classList.add("show");
}
function closeActionSheet() {
  els.actionSheet.classList.remove("show");
  els.actionSheetBackdrop.classList.remove("show");
}

function openNewFolderModal() {
  els.newFolderInput.value = "";
  els.newFolderModal.classList.add("show");
  els.actionSheetBackdrop.classList.add("show");
  setTimeout(() => els.newFolderInput.focus(), 50);
}
function closeNewFolderModal() {
  els.newFolderModal.classList.remove("show");
  els.actionSheetBackdrop.classList.remove("show");
}

async function handleCreateFolder() {
  const name = els.newFolderInput.value.trim();
  if (!name) return;
  closeNewFolderModal();
  showToast(`Membuat folder "${name}"...`);
  try {
    await driveFetch("files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [currentFolderId()],
      }),
    });
    showToast("Folder dibuat.");
    await loadItems();
  } catch (err) {
    console.error(err);
    showToast("Gagal membuat folder.");
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
  folderStack = [];
  els.mainView.classList.add("hidden");
  els.signinPanel.classList.remove("hidden");
}

async function afterSignIn() {
  els.signinPanel.classList.add("hidden");
  els.mainView.classList.remove("hidden");
  try {
    const rootId = await findOrCreateAppFolder();
    folderStack = [{ id: rootId, name: APP_FOLDER_NAME }];
    await loadItems();
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
    `name='${APP_FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false and 'root' in parents`
  );
  const found = await driveFetch(`files?q=${q}&fields=files(id,name)`);
  if (found.files && found.files.length > 0) return found.files[0].id;

  const created = await driveFetch("files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  return created.id;
}

function currentFolderId() {
  return folderStack[folderStack.length - 1].id;
}

async function loadItems() {
  const q = encodeURIComponent(`'${currentFolderId()}' in parents and trashed=false`);
  const data = await driveFetch(
    `files?q=${q}&orderBy=folder,modifiedTime desc&pageSize=200&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`
  );
  allItems = data.files || [];
  renderBreadcrumb();
  renderItems();
  updateStorageLabel();
}

function updateStorageLabel() {
  const fileCount = allItems.filter((f) => f.mimeType !== FOLDER_MIME).length;
  els.storageValue.textContent = `${fileCount} berkas`;
}

/* ====== Breadcrumb / navigasi folder ====== */
function renderBreadcrumb() {
  els.breadcrumb.innerHTML = "";
  folderStack.forEach((f, idx) => {
    const isLast = idx === folderStack.length - 1;
    const crumb = document.createElement("button");
    crumb.className = "crumb" + (isLast ? " current" : "");
    crumb.textContent = f.name;
    crumb.disabled = isLast;
    crumb.addEventListener("click", () => {
      folderStack = folderStack.slice(0, idx + 1);
      loadItems();
    });
    els.breadcrumb.appendChild(crumb);
    if (!isLast) {
      const sep = document.createElement("span");
      sep.className = "crumb-sep";
      sep.textContent = "/";
      els.breadcrumb.appendChild(sep);
    }
  });
}

function enterFolder(folder) {
  folderStack.push({ id: folder.id, name: folder.name });
  loadItems();
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
  await loadItems();
}

async function uploadFile(file) {
  const metadata = { name: file.name, parents: [currentFolderId()] };
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
  if (mimeType === FOLDER_MIME) return "folder";
  if (mimeType.startsWith("image/")) return "foto";
  if (mimeType === "application/pdf" || mimeType.includes("document") || mimeType.includes("text")) return "dokumen";
  return "lainnya";
}

function renderItems() {
  const query = els.searchInput.value.trim().toLowerCase();

  const folders = allItems.filter((f) => f.mimeType === FOLDER_MIME && (!query || f.name.toLowerCase().includes(query)));
  const files = allItems.filter((f) => {
    if (f.mimeType === FOLDER_MIME) return false;
    const matchesCategory = activeCategory === "semua" || categoryOf(f.mimeType) === activeCategory;
    const matchesQuery = !query || f.name.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  els.fileList.innerHTML = "";

  if (folders.length === 0 && files.length === 0) {
    els.emptyState.classList.remove("hidden");
    els.emptyState.textContent = allItems.length === 0
      ? "Folder ini masih kosong. Ketuk tombol + di bawah untuk unggah berkas atau buat folder baru."
      : "Tidak ada yang cocok.";
    return;
  }
  els.emptyState.classList.add("hidden");

  for (const folder of folders) {
    els.fileList.appendChild(renderFolderRow(folder));
  }
  for (const file of files) {
    els.fileList.appendChild(renderFileRow(file));
  }
}

function renderFolderRow(folder) {
  const row = document.createElement("div");
  row.className = "file-row";
  row.addEventListener("click", () => enterFolder(folder));
  row.innerHTML = `
    <div class="file-icon folder">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
    </div>
    <div class="file-meta">
      <div class="file-name">${escapeHtml(folder.name)}</div>
      <div class="file-sub">Folder</div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--ink-faint); flex-shrink:0;"><path d="M9 6l6 6-6 6"/></svg>
  `;
  return row;
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
