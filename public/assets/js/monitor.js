const ROLE_RANK = { admin: 1, admin1: 2, admin2: 3, monitor1: 4, monitor2: 5 };

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
// ---------------------- DASHBOARD ---------------------------
// ============================================================
if (document.body.classList.contains("dashboard-page")) {
  const myRole = sessionStorage.getItem("bmos_role");
  const myName = sessionStorage.getItem("bmos_name");
  const myRank = ROLE_RANK[myRole] || 99;

  if (!myRole) window.location.href = "/login";
  document.getElementById("u-name").innerText = `${myName} (${myRole})`;

  // Monitor2 chỉ xem, không quản lý
  if (myRole === "monitor2")
    document.getElementById("btn-tab-users").style.display = "none";

  const socket = io();

  // Lắng nghe trạng thái kết nối
  socket.on("connect", () => {
    document.getElementById("status-dot").innerHTML =
      '<span style="color:#2ecc71; font-size: 1.2em">● Connected</span>';
  });

  socket.on("disconnect", () => {
    document.getElementById("status-dot").innerHTML =
      '<span style="color:#e74c3c; font-size: 1.2em">● Disconnected</span>';
  });

  // Lắng nghe dữ liệu Pin (BMS)
  socket.on("update-data", (data) => {
    document.getElementById("raw-log").innerText = JSON.stringify(
      data,
      null,
      2,
    );
    document.getElementById("last-update").innerText =
      new Date().toLocaleString("vi-VN", { hour12: false });

    if (data.vol !== undefined)
      document.getElementById("val-vol").innerText = data.vol;
    if (data.temp !== undefined)
      document.getElementById("val-temp").innerText = data.temp;
  });

  // Lắng nghe Thời gian Server
  socket.on("server-time", (timeString) => {
    const clockEl = document.getElementById("server-clock");
    if (clockEl) {
      clockEl.innerText = timeString;
    }
  });
}

// ============================================================
// -------------------- TAB SWITCHING -------------------------
// ============================================================
function switchTab(tabId) {
  document
    .querySelectorAll(".tab-content")
    .forEach((d) => d.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  event.target.classList.add("active");
  if (tabId === "tab-users") loadUsers();
}

// ============================================================
// ----------------------- CRUD USERS -------------------------
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

    const myRole = sessionStorage.getItem("bmos_role");
    const myRank = ROLE_RANK[myRole];

    users.forEach((u) => {
      const uRank = ROLE_RANK[u.role];

      let badgeClass = "bg-monitor";
      if (u.role === "admin") badgeClass = "bg-admin";
      else if (u.role === "admin1") badgeClass = "bg-admin1";
      else if (u.role === "admin2") badgeClass = "bg-admin2";

      let actionHtml = '<span class="no-access">Đã khóa</span>';

      if (myRole === "monitor2") {
        actionHtml = '<span class="no-access">Chỉ xem</span>';
      } else if (u.role !== "admin" && myRank < uRank) {
        const userStr = JSON.stringify(u).replace(/'/g, "&apos;");
        actionHtml = `
          <button class="btn btn-edit" onclick='startEdit(${userStr})'>Sửa</button>
          <button class="btn btn-del" onclick="deleteUser('${u.id}')"> Xóa</button>`;
      }

      tbody.innerHTML += `
        <tr>
          <td><small>${u.id}</small></td>
          <td><b>${u.username}</b></td>
          <td>${u.fullname || ""}</td>
          <td><span class="role-badge ${badgeClass}">${u.role}</span></td>
          <td><small>${u.description || ""}</small></td>
          <td><small>${u.phone || ""}</small></td>
          <td>${actionHtml}</td>
        </tr>`;
    });
  } catch (e) {
    console.error(e);
    await showModal(" Lỗi khi tải danh sách người dùng!", "❌");
  }
}

function startEdit(user) {
  const myRole = sessionStorage.getItem("bmos_role");
  if (myRole === "monitor2") {
    showModal("Bạn không có quyền chỉnh sửa!", "⛔");
    return;
  }

  document.getElementById("form-title").innerText = `Sửa: ${user.username}`;
  const btn = document.getElementById("btn-save");
  btn.innerText = "LƯU THAY ĐỔI";
  btn.className = "btn btn-update";
  document.getElementById("btn-cancel").style.display = "block";

  document.getElementById("edit-id").value = user.id;
  document.getElementById("new-user").value = user.username;
  document.getElementById("new-pass").value = user.password;
  document.getElementById("new-name").value = user.fullname || "";
  document.getElementById("new-role").value = user.role;
  document.getElementById("new-desc").value = user.description || "";
  document.getElementById("new-addr").value = user.address || "";
  document.getElementById("new-phone").value = user.phone || "";
  document.getElementById("new-mail").value = user.mail || "";

  document
    .querySelector("#tab-users .card")
    .scrollIntoView({ behavior: "smooth" });
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
  document.getElementById("new-addr").value = "";
  document.getElementById("new-phone").value = "";
  document.getElementById("new-mail").value = "";
}

async function handleSaveUser() {
  const myRole = sessionStorage.getItem("bmos_role");
  if (myRole === "monitor2") {
    await showModal("Bạn không có quyền thực hiện thao tác này!", "⛔");
    return;
  }

  const id = document.getElementById("edit-id").value;

  const data = {
    username: document.getElementById("new-user").value,
    password: document.getElementById("new-pass").value,
    fullname: document.getElementById("new-name").value,
    role: document.getElementById("new-role").value,
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
  const myRole = sessionStorage.getItem("bmos_role");
  if (myRole === "monitor2") {
    await showModal("Bạn không có quyền xóa!", "⛔");
    return;
  }

  const confirmed = await showConfirm(
    " Bạn chắc chắn muốn xóa user này?",
    "❓",
  );
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
    await showModal(" Lỗi khi xóa!", "❌");
  }
}
