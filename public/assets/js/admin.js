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
// ------------------------ LOGOUT ----------------------------
// ============================================================
async function handleLogout() {
  const confirmed = await showConfirm("Bạn có chắc chắn muốn đăng xuất?", "❓");
  if (confirmed) {
    sessionStorage.removeItem("bmos_role");
    sessionStorage.removeItem("bmos_name");
    sessionStorage.removeItem("bmos_port");
    window.location.href = "/login";
  }
}

// ============================================================
// ------------------------ DASHBOARD -------------------------
// ============================================================
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

// ============================================================
// -------------------------- CRUD ----------------------------
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

  // Nếu đang mở trên Desktop App thì tự động chuyển sang Tab Form
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

// Xử lý nút Lưu
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
    await showModal("Vui lòng nhập đầy đủ thông tin)!", "⚠️");
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
  }
}

// Lắng nghe sự kiện phần cứng đẩy lên từ Port 2222
socket.on("hardware-update", (data) => {
  const tbody = document.getElementById("monitor-tbody");
  if (!tbody) {
    console.log(
      "❌ Lỗi: Không tìm thấy thẻ <tbody id='monitor-tbody'> trên màn hình!",
    );
    return;
  }

  const timeStr = new Date().toLocaleTimeString();
  const tr = document.createElement("tr");

  // Logic Cảnh báo theo bảng yêu cầu
  const bypassColor = data.isBypass ? "#e74c3c" : "#27ae60"; // Đỏ nếu Cell bị hỏng và đang Bypass
  const bypassText = data.isBypass ? "Đang Bypass (Hỏng)" : "Hoạt động tốt";
  const tempColor = data.temp > 45.0 ? "red" : "black";

  tr.innerHTML = `
    <td style="padding: 10px; border: 1px solid #eee;">${timeStr}</td>
    <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">${data.cell_id}</td>
    <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">${data.voltage} V</td>
    <td style="padding: 10px; border: 1px solid #eee;">${data.resistance} mΩ</td>
    <td style="padding: 10px; border: 1px solid #eee; color: ${tempColor}; font-weight: bold;">${data.temp} °C</td>
    <td style="padding: 10px; border: 1px solid #eee;">
      <span style="background: ${bypassColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
        ${bypassText}
      </span>
    </td>
    <td style="padding: 10px; border: 1px solid #eee; color: red; font-weight: bold;">${data.warning || "Không"}</td>
  `;

  tbody.prepend(tr);
  if (tbody.children.length > 15) tbody.removeChild(tbody.lastChild);
});

function dieuKhienDen(isTurnOn) {
  const logBox = document.getElementById("control-log");
  const time = new Date().toLocaleTimeString();

  // Quy chuẩn: 1 là BẬT, 0 là TẮT (Số nguyên, không phải chuỗi)
  const actionCode = isTurnOn ? 1 : 0;
  const actionText = isTurnOn ? "BẬT (1)" : "TẮT (0)";

  // 1. In log ra màn hình UI cho có cảm giác "đàng hoàng"
  logBox.innerHTML += `\n[${time}] 📤 Phát lệnh xuống mạch: Thiết bị [LED_TEST] | Trạng thái: ${actionText}`;
  logBox.scrollTop = logBox.scrollHeight; // Tự động cuộn

  // 2. Bắn data qua Socket.io lên Server
  if (typeof socket !== "undefined") {
    socket.emit("send-command-to-hardware", {
      device: "LED_TEST",
      action: actionCode, // Gửi số 1 hoặc 0
    });
  } else {
    logBox.innerHTML += `\n[${time}] ❌ ERROR: Mất kết nối Socket nội bộ tới Server!`;
  }
}

// Hàm tiện ích để in Log ra màn hình đen
function ghiLog(noidung, mauSac = "#00ff00") {
  const logBox = document.getElementById("control-log");
  if (!logBox) return; // Tránh lỗi nếu chưa mở Tab Điều Khiển

  const time = new Date().toLocaleTimeString();
  logBox.innerHTML += `\n<span style="color: ${mauSac}">[${time}] ${noidung}</span>`;
  logBox.scrollTop = logBox.scrollHeight; // Cuộn xuống dòng cuối
}

// LẮNG NGHE SỰ KIỆN TỪ SERVER ĐẨY XUỐNG
if (typeof socket !== "undefined") {
  // 1. Lắng nghe thiết bị kết nối/ngắt kết nối
  socket.on("system-log", (msg) => {
    ghiLog(`📢 HỆ THỐNG: ${msg}`, "#f1c40f"); // Màu vàng báo hệ thống
  });

  // 2. Lắng nghe mạch anh Tài báo "Đã nhận lệnh"
  socket.on("hardware-ack", (msg) => {
    ghiLog(`✅ MẠCH PHẢN HỒI: ${msg}`, "#3498db"); // Màu xanh dương báo thành công
  });
}
