const ROLE_RANK = {
  admin: 1,
  admin1: 2,
  admin2: 3,
  monitor1: 4,
  monitor2: 5,
};

const socket = io();

// ============================================================
// ----------------------- BIẾN TOÀN CỤC -----------------------
// ============================================================
let isMcuConnected = false;
let currentMcuId = "Unknown";

let countdownInterval = null;
let timerCounter = 0;

let currentMode = "MANUAL";
let isSystemRunning = false;
let pendingActionName = "";
let currentRunningAction = "";

let isLedOn = false;
let ledSpeedMs = 500;
let ledSpeedSendTimer = null;

// Debounce chống spam event từ MCU
let lastMcuAckTime = 0;
let lastPhysicalButtonTime = 0;
let lastConnectionStatusTime = 0;
let lastStatusStopTime = 0;
const DEBOUNCE_INTERVAL = 100;

// ============================================================
// ----------------------- MODAL SYSTEM ------------------------
// ============================================================
function showModal(message, icon = "ℹ️") {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-overlay");
    const iconEl = document.getElementById("modal-icon");
    const messageEl = document.getElementById("modal-message");
    const buttonsEl = document.getElementById("modal-buttons");

    if (!overlay || !iconEl || !messageEl || !buttonsEl) {
      alert(message);
      resolve();
      return;
    }

    iconEl.textContent = icon;
    messageEl.textContent = message;
    buttonsEl.innerHTML =
      '<button class="btn-modal-ok" onclick="closeModal()">OK</button>';

    overlay.classList.add("active");
    window.modalResolve = resolve;
  });
}

function showConfirm(message, icon = "❓") {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-overlay");
    const iconEl = document.getElementById("modal-icon");
    const messageEl = document.getElementById("modal-message");
    const buttonsEl = document.getElementById("modal-buttons");

    if (!overlay || !iconEl || !messageEl || !buttonsEl) {
      resolve(confirm(message));
      return;
    }

    iconEl.textContent = icon;
    messageEl.textContent = message;
    buttonsEl.innerHTML = `
      <button class="btn-modal-confirm" onclick="closeModal(true)">Xác nhận</button>
      <button class="btn-modal-cancel" onclick="closeModal(false)">Hủy</button>
    `;

    overlay.classList.add("active");
    window.modalResolve = resolve;
  });
}

function closeModal(result) {
  const overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.classList.remove("active");

  if (window.modalResolve) {
    window.modalResolve(result);
    window.modalResolve = null;
  }
}

// ============================================================
// ----------------------- HÀM TIỆN ÍCH ------------------------
// ============================================================
function getCurrentTime() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function canProcessMcuAck() {
  const now = Date.now();
  if (now - lastMcuAckTime < DEBOUNCE_INTERVAL) return false;
  lastMcuAckTime = now;
  return true;
}

function canProcessPhysicalButton() {
  const now = Date.now();
  if (now - lastPhysicalButtonTime < DEBOUNCE_INTERVAL) return false;
  lastPhysicalButtonTime = now;
  return true;
}

function canProcessConnectionStatus() {
  const now = Date.now();
  if (now - lastConnectionStatusTime < DEBOUNCE_INTERVAL) return false;
  lastConnectionStatusTime = now;
  return true;
}

function canProcessStatusStop() {
  const now = Date.now();
  if (now - lastStatusStopTime < DEBOUNCE_INTERVAL) return false;
  lastStatusStopTime = now;
  return true;
}

function ghiLog(noidung, mauSac = "#00ff00", targetId = "control-log") {
  const logBox = document.getElementById(targetId);
  if (!logBox) return;

  const time = getCurrentTime();
  logBox.innerHTML += `\n<span style="color:${mauSac}">[${time}] ${noidung}</span>`;
  logBox.scrollTop = logBox.scrollHeight;
}

function appendMcuLog(message, type = "info") {
  const terminal = document.getElementById("mcu-log-terminal");
  if (!terminal) return;

  const colors = {
    info: "#94a3b8",
    success: "#10b981",
    error: "#ef4444",
    warning: "#f59e0b",
    process: "#3b82f6",
  };

  const timeStr = getCurrentTime();

  terminal.innerHTML += `
    <div style="margin-bottom:4px;">
      <span style="color:#475569;">[${timeStr}]</span>
      <span style="color:${colors[type] || colors.info};">${message}</span>
    </div>
  `;

  terminal.scrollTop = terminal.scrollHeight;
}

function showCustomAlert(message) {
  const alertOverlay = document.getElementById("custom-alert");
  const alertMsg = document.getElementById("alert-message");
  const alertBox = document.getElementById("alert-box");

  if (!alertOverlay || !alertMsg || !alertBox) {
    alert(message);
    return;
  }

  alertMsg.innerText = message;
  alertOverlay.style.display = "flex";

  setTimeout(() => {
    alertOverlay.style.opacity = "1";
    alertBox.style.transform = "translateY(0)";
  }, 10);
}

function closeCustomAlert() {
  const alertOverlay = document.getElementById("custom-alert");
  const alertBox = document.getElementById("alert-box");

  if (!alertOverlay || !alertBox) return;

  alertOverlay.style.opacity = "0";
  alertBox.style.transform = "translateY(-30px)";

  setTimeout(() => {
    alertOverlay.style.display = "none";
  }, 300);
}

// ============================================================
// ------------------------ DASHBOARD --------------------------
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  if (!document.body.classList.contains("dashboard-page")) return;

  const myRole = sessionStorage.getItem("bmos_role");
  const myName = sessionStorage.getItem("bmos_name");
  const myRank = ROLE_RANK[myRole] || 99;

  if (!myRole) {
    window.location.href = "/login";
    return;
  }

  const adminNameEl = document.getElementById("admin-name");
  if (adminNameEl) {
    adminNameEl.innerText = `${myName} (${myRole})`;
  }

  filterRoleSelect(myRank);
  loadUsers();
  initMonitorTable();
});

function filterRoleSelect(myRank) {
  const select = document.getElementById("role-select");
  if (!select) return;

  for (let i = select.options.length - 1; i >= 0; i--) {
    const optionValue = select.options[i].value;
    const optionRank = ROLE_RANK[optionValue];

    if (myRank >= optionRank) {
      select.remove(i);
    }
  }
}

async function handleLogout() {
  const confirmed = await showConfirm("Bạn có chắc chắn muốn đăng xuất?", "❓");

  if (!confirmed) return;

  sessionStorage.removeItem("bmos_role");
  sessionStorage.removeItem("bmos_name");
  sessionStorage.removeItem("bmos_port");
  window.location.href = "/login";
}

async function switchDesktopTab(tabId) {
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.remove("active"));

  document
    .querySelectorAll(".desktop-tab-btn")
    .forEach((el) => el.classList.remove("active"));

  const tabEl = document.getElementById(tabId);
  if (tabEl) tabEl.classList.add("active");

  const buttonMap = {
    "tab-list": "btn-tab-list",
    "tab-add": "btn-tab-add",
    "tab-monitor": "btn-tab-monitor",
    "tab-control": "btn-tab-control",
    "tab-charge-test": "btn-tab-charge-test",
  };

  const btnId = buttonMap[tabId];
  const btnEl = btnId ? document.getElementById(btnId) : null;
  if (btnEl) btnEl.classList.add("active");
}

// ============================================================
// --------------------- QUẢN LÝ TÀI KHOẢN --------------------
// ============================================================
async function loadUsers() {
  try {
    const res = await fetch("/api/users");

    if (res.status === 403) {
      await showModal("Bị chặn IP truy cập!", "⛔");
      return;
    }

    const users = await res.json();
    const tbody = document.querySelector("#user-table tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const myRank = ROLE_RANK[sessionStorage.getItem("bmos_role")] || 99;

    users.forEach((u) => {
      const uRank = ROLE_RANK[u.role] || 99;

      let badgeClass = "bg-monitor";
      if (u.role === "admin") badgeClass = "bg-admin";
      else if (u.role === "admin1") badgeClass = "bg-admin1";
      else if (u.role === "admin2") badgeClass = "bg-admin2";

      let actionHtml = '<span class="no-access">Đã khóa</span>';

      if (u.role !== "admin" && myRank < uRank) {
        const userStr = JSON.stringify(u).replace(/'/g, "&apos;");
        actionHtml = `
          <button class="btn btn-edit" onclick='startEdit(${userStr})'>Sửa</button>
          <button class="btn btn-del" onclick="deleteUser('${u.id}')">Xóa</button>
        `;
      }

      tbody.innerHTML += `
        <tr>
          <td><small>${u.id}</small></td>
          <td><b>${u.username}</b></td>
          <td>${u.fullname || ""}</td>
          <td><span class="role-badge ${badgeClass}">${u.role}</span></td>
          <td><small>${u.description || ""}</small></td>
          <td><small>${u.address || ""}</small></td>
          <td><small>${u.phone || ""}</small></td>
          <td><small>${u.mail || ""}</small></td>
          <td>${actionHtml}</td>
        </tr>
      `;
    });
  } catch (e) {
    console.error("[CRUD] Lỗi loadUsers:", e);
  }
}

function startEdit(user) {
  document.getElementById("form-title").innerText = `Sửa: ${user.username}`;

  const btn = document.getElementById("btn-save");
  btn.innerText = "LƯU THAY ĐỔI";
  btn.className = "btn btn-update";

  document.getElementById("btn-cancel").style.display = "block";
  document.getElementById("edit-id").value = user.id;
  document.getElementById("new-user").value = user.username;
  document.getElementById("new-pass").value = user.password;
  document.getElementById("new-name").value = user.fullname || "";
  document.getElementById("role-select").value = user.role;
  document.getElementById("new-desc").value = user.description || "";
  document.getElementById("new-addr").value = user.address || "";
  document.getElementById("new-phone").value = user.phone || "";
  document.getElementById("new-mail").value = user.mail || "";

  const formContainer = document.getElementById("form-container");
  if (formContainer) {
    formContainer.scrollIntoView({ behavior: "smooth" });
  }

  switchDesktopTab("tab-add");
}

function resetForm() {
  document.getElementById("form-title").innerText = "Thêm Tài Khoản Mới";

  const btn = document.getElementById("btn-save");
  btn.innerText = "THÊM TÀI KHOẢN";
  btn.className = "btn btn-add";

  document.getElementById("btn-cancel").style.display = "none";
  document.getElementById("edit-id").value = "";
  document.getElementById("new-user").value = "";
  document.getElementById("new-pass").value = "";
  document.getElementById("new-name").value = "";
  document.getElementById("new-desc").value = "";
  document.getElementById("new-phone").value = "";
  document.getElementById("new-addr").value = "";
  document.getElementById("new-mail").value = "";

  switchDesktopTab("tab-list");
}

async function handleSaveUser() {
  const id = document.getElementById("edit-id").value;

  const data = {
    username: document.getElementById("new-user").value,
    password: document.getElementById("new-pass").value,
    fullname: document.getElementById("new-name").value,
    role: document.getElementById("role-select").value,
    description: document.getElementById("new-desc").value,
    address: document.getElementById("new-addr").value,
    phone: document.getElementById("new-phone").value,
    mail: document.getElementById("new-mail").value,
  };

  if (!data.username || !data.password) {
    await showModal("Vui lòng nhập đầy đủ thông tin!", "⚠️");
    return;
  }

  const url = id ? `/api/users/${id}` : "/api/users";
  const method = id ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-role": sessionStorage.getItem("bmos_role"),
      },
      body: JSON.stringify(data),
    });

    const rs = await res.json();
    await showModal(rs.msg, rs.success ? "✅" : "❌");

    if (rs.success) {
      loadUsers();
      resetForm();
    }
  } catch (e) {
    console.error("[CRUD] Lỗi lưu user:", e);
    await showModal("Lỗi kết nối khi lưu!", "❌");
  }
}

async function deleteUser(id) {
  const confirmed = await showConfirm("Bạn chắc chắn muốn xóa user này?", "❓");
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/users/${id}`, {
      method: "DELETE",
      headers: {
        "x-role": sessionStorage.getItem("bmos_role"),
      },
    });

    const rs = await res.json();
    await showModal(rs.msg, rs.success ? "✅" : "❌");

    if (rs.success) loadUsers();
  } catch (e) {
    console.error("[CRUD] Lỗi xóa user:", e);
    await showModal("Lỗi khi xóa!", "❌");
  }
}

// ============================================================
// --------------------- TAB ĐIỀU KHIỂN ĐÈN -------------------
// ============================================================
function getSafeLedSpeed(value) {
  const speed = Number(value);

  if (Number.isNaN(speed)) return 500;
  if (speed < 0) return 0;
  if (speed > 1000) return 1000;

  return speed;
}

function updateLedStatusBadge() {
  const statusEl = document.getElementById("led-current-status");
  const valueEl = document.getElementById("ledSpeedValue");

  if (valueEl) valueEl.innerText = ledSpeedMs;

  if (!statusEl) return;

  if (isLedOn) {
    statusEl.innerText = `Đang bật - ${ledSpeedMs} ms`;
    statusEl.style.background = "#eafaf1";
    statusEl.style.color = "#27ae60";
  } else {
    statusEl.innerText = "Đang tắt";
    statusEl.style.background = "#ecf0f1";
    statusEl.style.color = "#7f8c8d";
  }
}

function guiLenhDen(action) {
  const payload = {
    device: "LED_TEST",
    action: action ? 1 : 0,
    speed_ms: ledSpeedMs,
  };

  socket.emit("send-command-to-hardware", payload);

  ghiLog(
    `📤 Gửi LED_TEST: action=${payload.action}, speed_ms=${payload.speed_ms}`,
    action ? "#2ecc71" : "#f39c12",
    "control-log",
  );

  console.log("[DESKTOP] Gửi LED_TEST:", payload);
}

function dieuKhienDen(isTurnOn) {
  isLedOn = Boolean(isTurnOn);
  updateLedStatusBadge();
  guiLenhDen(isLedOn);
}

function capNhatTocDoDen(value) {
  ledSpeedMs = getSafeLedSpeed(value);
  updateLedStatusBadge();

  if (!isLedOn) return;

  clearTimeout(ledSpeedSendTimer);

  ledSpeedSendTimer = setTimeout(() => {
    guiLenhDen(true);
  }, 80);
}

// ============================================================
// ---------------------- TAB GIÁM SÁT PIN ---------------------
// ============================================================
function initMonitorTable() {
  const tbody = document.getElementById("monitor-tbody");

  if (!tbody) {
    console.warn("[MONITOR] Không tìm thấy monitor-tbody");
    return;
  }

  tbody.innerHTML = "";

  for (let i = 1; i <= 16; i++) {
    tbody.innerHTML += `
      <tr id="row-cell-${i}" style="border-bottom:1px solid #eee;">
        <td id="cell-${i}-time" style="padding:8px;">--:--:--</td>
        <td style="padding:8px; font-weight:bold; color:#2980b9;">Cell ${i}</td>
        <td id="cell-${i}-voltage" style="padding:8px;">--</td>
        <td id="cell-${i}-current" style="padding:8px;">--</td>
        <td id="cell-${i}-temp" style="padding:8px;">--</td>
        <td id="cell-${i}-ir" style="padding:8px;">--</td>
        <td id="cell-${i}-cr" style="padding:8px;">--</td>
        <td id="cell-${i}-bypass" style="padding:8px;">--</td>
        <td id="cell-${i}-cb-chudong" style="padding:8px;">--</td>
        <td id="cell-${i}-cb-thudong" style="padding:8px;">--</td>
        <td id="cell-${i}-cb-tinh" style="padding:8px;">--</td>
        <td id="cell-${i}-cb-dienap" style="padding:8px;">--</td>
      </tr>
    `;
  }

  console.log("[MONITOR] Đã khởi tạo bảng 16 cell");
}

function renderStatusBadge(value) {
  if (value === 1 || value === "ON" || value === true) {
    return `<span style="background:#2ecc71; color:white; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold;">BẬT</span>`;
  }

  if (value === 0 || value === "OFF" || value === false) {
    return `<span style="background:#bdc3c7; color:white; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold;">TẮT</span>`;
  }

  return null;
}

function updateMonitorCell(cellData) {
  const cellId = Number(cellData.cell_id);

  if (!cellId || cellId < 1 || cellId > 16) return;

  const timeNow = getCurrentTime();

  const timeEl = document.getElementById(`cell-${cellId}-time`);
  if (timeEl) {
    timeEl.innerText = timeNow;
  }

  const updateCellUI = (suffix, value, unit = "") => {
    const el = document.getElementById(`cell-${cellId}-${suffix}`);

    if (!el) {
      console.warn(`[MONITOR] Không tìm thấy ô cell-${cellId}-${suffix}`);
      return;
    }

    if (value === undefined || value === null) return;

    const badge = renderStatusBadge(value);

    if (badge) {
      el.innerHTML = badge;
    } else {
      el.innerText = value + unit;
    }
  };

  updateCellUI("voltage", cellData.voltage, " V");
  updateCellUI("current", cellData.current, " A");
  updateCellUI("temp", cellData.temperature, " °C");
  updateCellUI("ir", cellData.noi_tro, " mΩ");
  updateCellUI("cr", cellData.dien_tro_tx, " mΩ");
  updateCellUI("bypass", cellData.bypass);
  updateCellUI("cb-chudong", cellData.cb_chu_dong);
  updateCellUI("cb-thudong", cellData.cb_thu_dong);
  updateCellUI("cb-tinh", cellData.cb_tinh);
  updateCellUI("cb-dienap", cellData.cb_dien_ap);

  const row = document.getElementById(`row-cell-${cellId}`);

  if (row) {
    row.style.transition = "none";
    row.style.backgroundColor = "#e8f8f5";

    setTimeout(() => {
      row.style.transition = "background-color 0.8s ease";
      row.style.backgroundColor = "transparent";
    }, 100);
  }
}

function handleHardwareUpdate(payload) {
  console.log("[DESKTOP] Nhận hardware-update:", payload);

  const danhSachCell = payload && payload.cells ? payload.cells : payload;

  if (!Array.isArray(danhSachCell)) {
    console.warn("[DESKTOP] hardware-update không phải mảng:", payload);
    return;
  }

  if (!document.getElementById("cell-1-time")) {
    console.warn("[DESKTOP] Bảng chưa khởi tạo, tạo lại bảng...");
    initMonitorTable();
  }

  danhSachCell.forEach(updateMonitorCell);
}

// ============================================================
// ---------------------- TAB SẠC / XẢ -------------------------
// ============================================================
function updateTimerDisplay(seconds, state, modeText) {
  const display = document.getElementById("countdown-display");
  const modeLabel = document.getElementById("countdown-mode");

  if (!display || !modeLabel) return;

  if (state === "READY") {
    display.innerText = "--:--";
    display.style.color = "#cbd5e1";
    modeLabel.innerText = "SẴN SÀNG";
    modeLabel.style.color = "#94a3b8";
    return;
  }

  if (state === "DONE") {
    display.innerText = "00:00";
    display.style.color = "#10b981";
    modeLabel.innerText = "HOÀN TẤT";
    modeLabel.style.color = "#10b981";
    return;
  }

  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");

  display.innerText = `${m}:${s}`;
  display.style.color = "#0f172a";

  modeLabel.innerText =
    state === "RUNNING_UP"
      ? `ĐANG ${modeText} (LIÊN TỤC)`
      : `ĐANG ${modeText} (TỰ ĐỘNG)`;

  modeLabel.style.color = modeText === "SẠC" ? "#059669" : "#dc2626";
}

function updateButtonUI(status, actionType = "") {
  const btnMCharge = document.getElementById("btn-manual-charge");
  const btnMDischarge = document.getElementById("btn-manual-discharge");
  const btnMStop = document.getElementById("btn-manual-stop");

  const btnACharge = document.getElementById("btn-auto-charge");
  const btnADischarge = document.getElementById("btn-auto-discharge");
  const btnAStop = document.getElementById("btn-auto-stop");

  if (
    !btnMCharge ||
    !btnMDischarge ||
    !btnMStop ||
    !btnACharge ||
    !btnADischarge ||
    !btnAStop
  ) {
    return;
  }

  if (status === "READY") {
    isSystemRunning = false;
    currentRunningAction = "";

    btnMCharge.disabled = false;
    btnMCharge.style.opacity = "1";

    btnMDischarge.disabled = false;
    btnMDischarge.style.opacity = "1";

    btnMStop.disabled = true;
    btnMStop.style.opacity = "0.5";
    btnMStop.style.cursor = "not-allowed";

    btnACharge.disabled = false;
    btnACharge.style.opacity = "1";

    btnADischarge.disabled = false;
    btnADischarge.style.opacity = "1";

    btnAStop.disabled = true;
    btnAStop.style.opacity = "0.5";
    btnAStop.style.cursor = "not-allowed";
    return;
  }

  if (status === "RUNNING") {
    isSystemRunning = true;

    if (currentMode === "MANUAL") {
      btnMCharge.disabled = false;
      btnMCharge.style.opacity = actionType === "CHARGE" ? "1" : "0.4";

      btnMDischarge.disabled = false;
      btnMDischarge.style.opacity = actionType === "DISCHARGE" ? "1" : "0.4";

      btnMStop.disabled = false;
      btnMStop.style.opacity = "1";
      btnMStop.style.cursor = "pointer";
    }

    if (currentMode === "AUTO") {
      btnACharge.disabled = false;
      btnACharge.style.opacity = actionType === "CHARGE" ? "1" : "0.4";

      btnADischarge.disabled = false;
      btnADischarge.style.opacity = actionType === "DISCHARGE" ? "1" : "0.4";

      btnAStop.disabled = false;
      btnAStop.style.opacity = "1";
      btnAStop.style.cursor = "pointer";

      btnMStop.disabled = false;
      btnMStop.style.opacity = "1";
      btnMStop.style.cursor = "pointer";
    }
  }
}

function handleMcuStop(uiState) {
  if (isSystemRunning) {
    appendMcuLog("✅ Hệ thống đã DỪNG và trở về trạng thái sẵn sàng.", "info");
  }

  clearInterval(countdownInterval);
  updateTimerDisplay(0, uiState, "");
  updateButtonUI("READY");

  isSystemRunning = false;
  currentRunningAction = "";
}

function switchMode(mode, isFromHardware = false) {
  if (isSystemRunning) {
    appendMcuLog(
      "⚠️ Phát hiện chuyển chế độ khi đang chạy: tự động gửi STOP!",
      "warning",
    );

    if (socket && isMcuConnected) {
      socket.emit("manual-mcu-command", { action: "STOP" });
    }

    clearInterval(countdownInterval);
    updateTimerDisplay(0, "READY", "");
    updateButtonUI("READY");

    isSystemRunning = false;
    currentRunningAction = "";
  }

  currentMode = mode;

  const tabManual = document.getElementById("tab-manual");
  const tabAuto = document.getElementById("tab-auto");
  const manualControls = document.getElementById("manual-controls");
  const autoControls = document.getElementById("auto-controls");

  if (!tabManual || !tabAuto || !manualControls || !autoControls) return;

  tabManual.style.background = mode === "MANUAL" ? "#ffffff" : "transparent";
  tabManual.style.color = mode === "MANUAL" ? "#1e3a8a" : "#64748b";

  tabAuto.style.background = mode === "AUTO" ? "#ffffff" : "transparent";
  tabAuto.style.color = mode === "AUTO" ? "#1e3a8a" : "#64748b";

  manualControls.style.display = mode === "MANUAL" ? "block" : "none";
  autoControls.style.display = mode === "AUTO" ? "block" : "none";

  if (!isFromHardware && socket && isMcuConnected) {
    socket.emit("manual-mcu-command", { mode });

    appendMcuLog(
      `🔄 Đã báo MCU chuyển sang: ${
        mode === "MANUAL" ? "THỦ CÔNG" : "TỰ ĐỘNG"
      }`,
      "process",
    );
  }
}

function executeCommand(action, mins) {
  if (!isMcuConnected) {
    appendMcuLog("KHÔNG THỂ GỬI: Mạch đang ngoại tuyến.", "error");
    return;
  }

  if (isSystemRunning && action === currentRunningAction && action !== "STOP") {
    appendMcuLog("⚠️ Bỏ qua lệnh trùng khi hệ thống đang chạy.", "warning");
    return;
  }

  let payload = {};

  if (action === "STOP") {
    payload = { action: "STOP" };
    appendMcuLog("🛑 Đã gửi lệnh DỪNG xuống mạch!", "warning");

    socket.emit("manual-mcu-command", payload);
    handleMcuStop("READY");
    return;
  }

  if (currentMode === "MANUAL") {
    payload = { action };
  } else {
    payload = {
      action,
      minutes: mins.toString(),
    };
  }

  pendingActionName = action === "CHARGE" ? "SẠC" : "XẢ";

  appendMcuLog(
    `Đã gửi lệnh ${pendingActionName}. Đang chờ mạch phản hồi...`,
    "process",
  );

  socket.emit("manual-mcu-command", payload);
}

function startAutoTimed(action) {
  const input = document.getElementById("test-duration");
  const mins = input ? Number(input.value) : 0;

  if (!mins || mins <= 0) {
    showCustomAlert("Vui lòng nhập số phút hợp lệ!");
    return;
  }

  executeCommand(action, mins);
}

function startTimerFromMcuStatus(mcuStatus) {
  const isCharging = mcuStatus === "CHARGING";
  const actionType = isCharging ? "CHARGE" : "DISCHARGE";
  const statusVN = isCharging ? "SẠC" : "XẢ";

  if (isSystemRunning && currentRunningAction === actionType) {
    return;
  }

  currentRunningAction = actionType;

  appendMcuLog(`✅ Mạch báo cáo đang thực thi: ${statusVN}.`, "success");
  updateButtonUI("RUNNING", actionType);

  clearInterval(countdownInterval);

  if (currentMode === "MANUAL") {
    timerCounter = 0;
    updateTimerDisplay(timerCounter, "RUNNING_UP", statusVN);

    countdownInterval = setInterval(() => {
      timerCounter++;
      updateTimerDisplay(timerCounter, "RUNNING_UP", statusVN);
    }, 1000);

    return;
  }

  const input = document.getElementById("test-duration");
  const inputMins = input ? Number(input.value) : 0;

  timerCounter = inputMins * 60;
  updateTimerDisplay(timerCounter, "RUNNING_DOWN", statusVN);

  countdownInterval = setInterval(() => {
    timerCounter--;

    if (timerCounter >= 0) {
      updateTimerDisplay(timerCounter, "RUNNING_DOWN", statusVN);
      return;
    }

    clearInterval(countdownInterval);

    appendMcuLog(
      "⏱️ Đã hết thời gian tự động! Tiến hành ngắt mạch.",
      "warning",
    );
    executeCommand("STOP", 0);
  }, 1000);
}

// ============================================================
// ---------------------- SOCKET LISTENERS ---------------------
// ============================================================
if (typeof socket !== "undefined") {
  socket.on("server-time", (timeString) => {
    const clockEl = document.getElementById("server-clock");
    if (clockEl) clockEl.innerText = timeString;
  });

  socket.on("system-log", (msg) => {
    ghiLog(`📢 HỆ THỐNG: ${msg}`, "#f1c40f", "control-log");
  });

  socket.on("hardware-ack", (msg) => {
    ghiLog(`✅ MẠCH PHẢN HỒI: ${msg}`, "#3498db", "control-log");
  });

  socket.on("hardware-update", handleHardwareUpdate);

  socket.on("mcu-connection-status", (data) => {
    if (!canProcessConnectionStatus()) return;

    isMcuConnected = Boolean(data.connected);
    if (data.mcu_id) currentMcuId = data.mcu_id;

    const statusText = document.getElementById("mcu-status-text");
    const statusCard = document.getElementById("mcu-status-card");

    if (isMcuConnected) {
      if (statusText) {
        statusText.innerText = "THIẾT BỊ ĐÃ KẾT NỐI";
        statusText.style.color = "#059669";
      }

      if (statusCard) statusCard.style.borderColor = "#059669";

      appendMcuLog(
        `✅ [Vi điều khiển: ${currentMcuId}] đã kết nối vào hệ thống.`,
        "success",
      );
    } else {
      if (statusText) {
        statusText.innerText = "ĐANG NGẮT KẾT NỐI";
        statusText.style.color = "#94a3b8";
      }

      if (statusCard) statusCard.style.borderColor = "#e2e8f0";

      appendMcuLog("❌ CẢNH BÁO: Vi điều khiển đã mất kết nối!", "error");

      clearInterval(countdownInterval);
      updateTimerDisplay(0, "READY", "");
      updateButtonUI("READY");
    }
  });

  socket.on("mcu-ack-received", (data) => {
    if (!canProcessMcuAck()) return;

    const mcuStatus = data.status ? data.status.toUpperCase() : "";

    if (mcuStatus === "STOP" || mcuStatus === "DONE" || mcuStatus === "IDLE") {
      handleMcuStop("READY");
      return;
    }

    if (mcuStatus !== "CHARGING" && mcuStatus !== "DISCHARGING") {
      return;
    }

    startTimerFromMcuStatus(mcuStatus);
  });

  socket.on("mcu-test-completed", () => {
    if (canProcessStatusStop()) {
      handleMcuStop("DONE");
    }
  });

  socket.on("mcu-status-idle", () => {
    if (canProcessStatusStop()) {
      handleMcuStop("READY");
    }
  });

  socket.on("mcu-physical-button", (cmd) => {
    if (!canProcessPhysicalButton()) return;

    appendMcuLog(`🔘 MCU gửi tín hiệu vật lý: ${cmd}`, "process");

    if (cmd === "MODE_MANUAL" && currentMode !== "MANUAL") {
      switchMode("MANUAL", true);
      return;
    }

    if (cmd === "MODE_AUTO" && currentMode !== "AUTO") {
      switchMode("AUTO", true);
      return;
    }

    if (cmd === "START_CHARGE") {
      executeCommand(
        "CHARGE",
        currentMode === "MANUAL"
          ? 0
          : document.getElementById("test-duration").value,
      );
      return;
    }

    if (cmd === "START_DISCHARGE") {
      executeCommand(
        "DISCHARGE",
        currentMode === "MANUAL"
          ? 0
          : document.getElementById("test-duration").value,
      );
      return;
    }

    if (cmd === "CANCEL" || cmd === "STOP") {
      executeCommand("STOP", 0);
    }
  });

  socket.on("vinfast-mcu-log", (data) => {
    let color = "#00ff00";
    if (data.type === "system") color = "#f1c40f";
    if (data.type === "error") color = "#e74c3c";

    ghiLog(data.msg, color, "vinfast-log");
  });
}

// ============================================================
// -------------------------- INIT -----------------------------
// ============================================================
window.addEventListener("load", () => {
  initMonitorTable();
  updateLedStatusBadge();
});
