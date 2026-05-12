const ROLE_RANK = { admin: 1, admin1: 2, admin2: 3, monitor1: 4, monitor2: 5 };
const socket = io(); // Kết nối Socket.IO

// ============================================================
// ----------------------- MODAL SYSTEM -----------------------
// ============================================================
function showModal(message, icon = "ℹ️") {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-overlay");
    const iconEl = document.getElementById("modal-icon");
    const messageEl = document.getElementById("modal-message");
    const buttonsEl = document.getElementById("modal-buttons");

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
  overlay.classList.remove("active");
  if (window.modalResolve) {
    window.modalResolve(result);
    window.modalResolve = null;
  }
}

// ============================================================
// Khi trang admin được tải, kiểm tra role và load dữ liệu cần thiết
document.addEventListener("DOMContentLoaded", () => {
  if (document.body.classList.contains("dashboard-page")) {
    const myRole = sessionStorage.getItem("bmos_role");
    const myName = sessionStorage.getItem("bmos_name");
    const myRank = ROLE_RANK[myRole] || 99;

    // Check login: Nếu không có role -> trả về trang login
    if (!myRole) {
      window.location.href = "/login";
      return;
    }

    document.getElementById("admin-name").innerText = `${myName} (${myRole})`;

    // Lọc role trong dropdown khi tạo user mới
    /** @type {HTMLSelectElement} */ // <--- Dòng này giúp VS Code gợi ý .options
    const select = document.getElementById("role-select");
    if (select) {
      for (let i = select.options.length - 1; i >= 0; i--) {
        const optionValue = select.options[i].value;
        const optionRank = ROLE_RANK[optionValue];

        // Xoá role có quyền CAO HƠN
        if (myRank >= optionRank) {
          select.remove(i);
        }
      }
    } else {
      console.error("Không tìm thấy thẻ role-select");
    }

    // Đồng hồ Server
    socket.on("server-time", (timeString) => {
      const clockEl = document.getElementById("server-clock");
      if (clockEl) {
        clockEl.innerText = timeString; // Cập nhật thời gian mới từ server
        console.log("Cập nhật thời gian từ server:", timeString);
      }
    });

    // Load danh sach user
    loadUsers();
  }
});

// Đăng xuất
async function handleLogout() {
  const confirmed = await showConfirm("Bạn có chắc chắn muốn đăng xuất?", "❓");
  if (confirmed) {
    sessionStorage.removeItem("bmos_role");
    sessionStorage.removeItem("bmos_name");
    sessionStorage.removeItem("bmos_port");
    window.location.href = "/login";
  }
}

// Chuyển đổi các tab trên desktop
async function switchDesktopTab(tabId) {
  // Ẩn tất cả nội dung
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.remove("active"));

  // Bỏ active tất cả nút
  document
    .querySelectorAll(".desktop-tab-btn")
    .forEach((el) => el.classList.remove("active"));

  // Hiển thị tab được chọn
  document.getElementById(tabId).classList.add("active");

  // Active nút tương ứng
  if (tabId === "tab-list") {
    document.getElementById("btn-tab-list").classList.add("active");
  } else if (tabId === "tab-add") {
    document.getElementById("btn-tab-add").classList.add("active");
  } else if (tabId === "tab-monitor") {
    document.getElementById("btn-tab-monitor").classList.add("active");
  } else if (tabId === "tab-control") {
    document.getElementById("btn-tab-control").classList.add("active");
  } else if (tabId === "tab-charge-test") {
    document.getElementById("btn-tab-charge-test").classList.add("active");
  }
}

// ============================================================
// ---------------------- QUẢN LÝ TÀI KHOẢN -------------------
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
    tbody.innerHTML = "";

    const myRank = ROLE_RANK[sessionStorage.getItem("bmos_role")];

    users.forEach((u) => {
      const uRank = ROLE_RANK[u.role];

      // Gán css hiển thị theo vai trò
      let badgeClass = "bg-monitor";
      if (u.role === "admin") badgeClass = "bg-admin";
      else if (u.role === "admin1") badgeClass = "bg-admin1";
      else if (u.role === "admin2") badgeClass = "bg-admin2";

      // Gán nút hành động
      let actionHtml = '<span class="no-access">Đã khóa</span>';
      if (u.role !== "admin" && myRank < uRank) {
        const userStr = JSON.stringify(u).replace(/'/g, "&apos;");
        actionHtml = `
            <button class="btn btn-edit" onclick='startEdit(${userStr})'>Sửa</button>
            <button class="btn btn-del" onclick="deleteUser('${u.id}')">Xóa</button>`;
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
        </tr>`;
    });
  } catch (e) {
    console.error(e);
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

  document
    .getElementById("form-container")
    .scrollIntoView({ behavior: "smooth" });

  if (typeof switchDesktopTab === "function") {
    switchDesktopTab("tab-add");
  }
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

  if (typeof switchDesktopTab === "function") {
    switchDesktopTab("tab-list");
  }
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

  let url = "/api/users";
  let method = "POST";

  if (id) {
    url = `/api/users/${id}`;
    method = "PUT";
  }

  try {
    const res = await fetch(url, {
      method: method,
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
    console.error(e);
    await showModal("Lỗi kết nối khi lưu!", "❌");
  }
}

async function deleteUser(id) {
  const confirmed = await showConfirm("Bạn chắc chắn muốn xóa user này?", "❓");
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/users/${id}`, {
      method: "DELETE",
      headers: { "x-role": sessionStorage.getItem("bmos_role") },
    });
    const rs = await res.json();
    await showModal(rs.msg, rs.success ? "✅" : "❌");
    if (rs.success) loadUsers();
  } catch (e) {
    console.error(e);
    await showModal("Lỗi khi xóa!", "❌");
  }
}

// ============================================================
// ---------------------- TAB GIÁM SÁT -------------------
// ============================================================
// ==========================================
// CÁC BIẾN TOÀN CỤC CHUNG
// ==========================================
let isMcuConnected = false;
let currentMcuId = "Unknown";
let countdownInterval = null;
let timerCounter = 0;
let currentMode = "MANUAL";
let isSystemRunning = false;
let pendingActionName = "";
let currentRunningAction = "";

// ==========================================
// HÀM HIỂN THỊ LOG & POPUP
// ==========================================
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
  const timeStr = new Date().toLocaleTimeString("en-GB", { hour12: false });
  terminal.innerHTML += `<div style="margin-bottom: 4px;"><span style="color: #475569;">[${timeStr}]</span> <span style="color: ${colors[type]};">${message}</span></div>`;
  terminal.scrollTop = terminal.scrollHeight;
}

// ==========================================
// GIAO DIỆN ĐỒNG HỒ & NÚT BẤM
// ==========================================
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

  if (!btnMCharge || !btnAStop) return;

  if (status === "READY") {
    isSystemRunning = false;
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
  } else if (status === "RUNNING") {
    isSystemRunning = true;

    if (currentMode === "MANUAL") {
      btnMCharge.disabled = false;
      btnMCharge.style.opacity = actionType === "CHARGE" ? "1" : "0.4";
      btnMDischarge.disabled = false;
      btnMDischarge.style.opacity = actionType === "DISCHARGE" ? "1" : "0.4";
      btnMStop.disabled = false;
      btnMStop.style.opacity = "1";
      btnMStop.style.cursor = "pointer";
    } else if (currentMode === "AUTO") {
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

// ==========================================
// HÀM NGẮT GIAO DIỆN
// ==========================================
function handleMcuStop(uiState) {
  if (isSystemRunning)
    appendMcuLog(`✅ Hệ thống đã DỪNG và trở về trạng thái Sẵn sàng.`, "info");
  clearInterval(countdownInterval);
  updateTimerDisplay(0, uiState, "");
  updateButtonUI("READY");
  isSystemRunning = false;
  currentRunningAction = "";
}

// ==========================================
// HÀM CHUYỂN CHẾ ĐỘ
// ==========================================
function switchMode(mode) {
  // CHỐT CHẶN: Nếu mode nhấn vào trùng với mode hiện tại thì không làm gì cả
  if (mode === currentMode) return;

  // Nếu hệ thống đang chạy (sạc hoặc xả) thì mới thực hiện ngắt
  if (isSystemRunning) {
    appendMcuLog(
      `⚠️ Chuyển chế độ: Tự động ngắt hệ thống để đảm bảo an toàn.`,
      "warning",
    );

    // Ngắt đồng hồ và giao diện trên Web trước
    clearInterval(countdownInterval);
    updateTimerDisplay(0, "READY", "");
    updateButtonUI("READY");

    // Sau đó mới bắn lệnh STOP xuống mạch (Chỉ bắn 1 lần duy nhất)
    if (typeof socket !== "undefined" && isMcuConnected) {
      socket.emit("manual-mcu-command", { action: "STOP" });
    }

    isSystemRunning = false;
    currentRunningAction = "";
  }

  // Thực hiện chuyển chế độ UI
  currentMode = mode;

  const tabManual = document.getElementById("tab-manual");
  const tabAuto = document.getElementById("tab-auto");
  const manualControls = document.getElementById("manual-controls");
  const autoControls = document.getElementById("auto-controls");

  if (tabManual) {
    tabManual.style.background = mode === "MANUAL" ? "#ffffff" : "transparent";
    tabManual.style.color = mode === "MANUAL" ? "#1e3a8a" : "#64748b";
  }
  if (tabAuto) {
    tabAuto.style.background = mode === "AUTO" ? "#ffffff" : "transparent";
    tabAuto.style.color = mode === "AUTO" ? "#1e3a8a" : "#64748b";
  }
  if (manualControls)
    manualControls.style.display = mode === "MANUAL" ? "block" : "none";
  if (autoControls)
    autoControls.style.display = mode === "AUTO" ? "block" : "none";

  // Thông báo Mode mới cho mạch
  if (typeof socket !== "undefined" && isMcuConnected) {
    socket.emit("manual-mcu-command", { mode: mode });
    appendMcuLog(
      `🔄 Chuyển sang chế độ: ${mode === "MANUAL" ? "THỦ CÔNG" : "TỰ ĐỘNG"}`,
      "process",
    );
  }
}

// ==========================================
// HÀM GỬI LỆNH TRUNG TÂM XUỐNG VĐK
// ==========================================
function executeCommand(action, mins) {
  if (!isMcuConnected)
    return appendMcuLog("KHÔNG THỂ GỬI: Mạch đang ngoại tuyến.", "error");

  if (isSystemRunning && action === currentRunningAction && action !== "STOP") {
    return;
  }

  let payload = {};

  if (action === "STOP") {
    payload = { action: "STOP" };
    appendMcuLog("🛑 Đã gửi lệnh DỪNG khẩn cấp xuống mạch!", "warning");
    handleMcuStop("READY");
  } else {
    if (currentMode === "MANUAL") {
      payload = { action: action };
    } else {
      payload = { action: action, minutes: mins.toString() };
    }
    pendingActionName = action === "CHARGE" ? "SẠC" : "XẢ";
    appendMcuLog(
      `Đã gửi lệnh ${pendingActionName}. Đang chờ mạch phản hồi...`,
      "process",
    );
  }

  socket.emit("manual-mcu-command", payload);
}

function startAutoTimed(action) {
  const mins = document.getElementById("test-duration").value;
  if (!mins || mins <= 0) return alert("Vui lòng nhập số phút hợp lệ!");
  executeCommand(action, mins);
}

// ==========================================
// LẮNG NGHE TÍN HIỆU TỪ BACKEND / MẠCH
// ==========================================
if (typeof socket !== "undefined") {
  socket.on("mcu-connection-status", (data) => {
    isMcuConnected = data.connected;
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
      appendMcuLog(`❌ CẢNH BÁO: Vi điều khiển đã mất kết nối!`, "error");

      clearInterval(countdownInterval);
      updateTimerDisplay(0, "READY", "");
      updateButtonUI("READY");
    }
  });

  socket.on("mcu-ack-received", (data) => {
    const mcuStatus = data.status ? data.status.toUpperCase() : "";
    if (mcuStatus === "STOP" || mcuStatus === "DONE" || mcuStatus === "IDLE") {
      handleMcuStop("READY");
      return;
    }

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
    } else {
      const inputMins = document.getElementById("test-duration").value;
      timerCounter = parseInt(inputMins) * 60;
      updateTimerDisplay(timerCounter, "RUNNING_DOWN", statusVN);
      countdownInterval = setInterval(() => {
        timerCounter--;
        if (timerCounter >= 0) {
          updateTimerDisplay(timerCounter, "RUNNING_DOWN", statusVN);
        } else {
          clearInterval(countdownInterval);
          appendMcuLog(
            `⏱️ Đã hết thời gian Tự động! Tiến hành ngắt mạch.`,
            "warning",
          );
          executeCommand("STOP", 0);
        }
      }, 1000);
    }
  });

  socket.on("mcu-test-completed", () => handleMcuStop("DONE"));
  socket.on("mcu-status-idle", () => handleMcuStop("READY"));

  socket.on("mcu-physical-button", (cmd) => {
    if (cmd === "MODE_MANUAL" && currentMode !== "MANUAL") {
      isSystemRunning = false;
      switchMode("MANUAL");
    } else if (cmd === "MODE_AUTO" && currentMode !== "AUTO") {
      isSystemRunning = false;
      switchMode("AUTO");
    } else if (cmd === "START_CHARGE") {
      executeCommand(
        "CHARGE",
        currentMode === "MANUAL"
          ? 0
          : document.getElementById("test-duration").value,
      );
    } else if (cmd === "START_DISCHARGE") {
      executeCommand(
        "DISCHARGE",
        currentMode === "MANUAL"
          ? 0
          : document.getElementById("test-duration").value,
      );
    } else if (cmd === "CANCEL" || cmd === "STOP") {
      executeCommand("STOP", 0);
    }
  });
}

// ============================================================
// -------------------------- DÙNG CHUNG ----------------------
// ============================================================
// --- LẮNG NGHE SỰ KIỆN SOCKET (GỘP CHUNG TẤT CẢ) ---
if (typeof socket !== "undefined") {
  // Hệ thống báo cáo
  socket.on("system-log", (msg) => {
    ghiLog(`📢 HỆ THỐNG: ${msg}`, "#f1c40f", "control-log");
  });

  // Mạch cũ phản hồi
  socket.on("hardware-ack", (msg) => {
    ghiLog(`✅ MẠCH PHẢN HỒI: ${msg}`, "#3498db", "control-log");
  });

  // Lắng nghe dữ liệu 16 Cell pin đẩy lên để cập nhật Bảng Giám Sát
  socket.on("hardware-update", (payload) => {
    const danhSachCell = payload.cells || payload;

    // Bỏ qua nếu dữ liệu không phải là mảng
    if (!Array.isArray(danhSachCell)) return;

    const timeNow = new Date().toLocaleTimeString();

    // Duyệt qua từng Cell trong cục data để bơm vào bảng
    danhSachCell.forEach((cellData) => {
      const cellId = cellData.cell_id;
      if (!cellId || cellId < 1 || cellId > 16) return;

      const updateCellUI = (suffix, value, unit = "") => {
        const el = document.getElementById(`cell-${cellId}-${suffix}`);
        if (el && value !== undefined && value !== null) {
          if (value === 1 || value === "ON" || value === true) {
            el.innerHTML = `<span style="background:#2ecc71; color:white; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold;">BẬT</span>`;
          } else if (value === 0 || value === "OFF" || value === false) {
            el.innerHTML = `<span style="background:#bdc3c7; color:white; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold;">TẮT</span>`;
          } else {
            el.innerText = value + unit;
          }
        }
      };

      // Điền data vào đúng dòng của cell đó
      document.getElementById(`cell-${cellId}-time`).innerText = timeNow;
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

      // Hiệu ứng chớp nền báo hiệu có data mới
      const row = document.getElementById(`row-cell-${cellId}`);
      if (row) {
        row.style.transition = "none";
        row.style.backgroundColor = "#e8f8f5";
        setTimeout(() => {
          row.style.transition = "background-color 0.8s ease";
          row.style.backgroundColor = "transparent";
        }, 100);
      }
    });
  });

  // Lắng nghe dữ liệu Mạch Vinfast gửi lên
  socket.on("vinfast-mcu-log", (data) => {
    let color = "#00ff00"; // Mặc định xanh lá
    if (data.type === "system") color = "#f1c40f"; // Vàng
    if (data.type === "error") color = "#e74c3c"; // Đỏ

    // In log vào đúng bảng của Tab Vinfast
    ghiLog(data.msg, color, "vinfast-log");
  });
}

window.onload = function () {
  initMonitorTable();
};
