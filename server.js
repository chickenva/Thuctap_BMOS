const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const socketIo = require("socket.io").Server;
const dgram = require("dgram"); // Thư viện cho UDP
const net = require("net"); // Dùng cho App PC/Mobile (TCP Raw Socket)
const { time } = require("console");

// =============================================================================
// ----------------------------- CẤU HÌNH HỆ THỐNG -----------------------------
// =============================================================================

// ----- IP & PORTS -----
const CONFIG = {
  IP_DISPLAY: "14.241.169.17", // IP Cứng
  PORT: {
    ADMIN_WEB: 1111,
    ADMIN_APP: 2222,
    MONITOR_WEB: 3333,
    MONITOR_APP: 4444,
    DEVICE_UDP: 5555,
  },
};

// ----- CẤU HÌNH DATABASE -----
let exeFolder;

// THUẬT TOÁN DÒ ĐƯỜNG DẪN DÀNH RIÊNG CHO PORTABLE
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  // Nếu là file exe Portable -> Lấy chính xác nơi đang đặt file exe (VD: Desktop)
  exeFolder = process.env.PORTABLE_EXECUTABLE_DIR;
} else {
  // Nếu đang code (npm start) -> Lấy thư mục dự án
  exeFolder = process.cwd();
}

// Tạo thư mục "data" nằm ngay cạnh file .exe
const DATA_FOLDER = path.join(exeFolder, "data");

const FILES = {
  ADMIN: path.join(DATA_FOLDER, "Acc_Admin.json"),
  MONITOR: path.join(DATA_FOLDER, "Acc_Monitor.json"),
  LOG: path.join(DATA_FOLDER, "bms_log.json"),
};

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(DATA_FOLDER)) {
  fs.mkdirSync(DATA_FOLDER, { recursive: true });
}

// Khởi tạo Admin gốc nếu file trống hoặc chưa có
if (!fs.existsSync(FILES.ADMIN) || readJSON(FILES.ADMIN).length === 0) {
  const defaultAdmin = [
    {
      id: "bmos000000001",
      username: "admin",
      password: "admin",
      fullname: "Super Administrator",
      role: "admin",
      description: "Đây là tài khoản admin gốc",
      address: "Server BMOS",
      phone: "",
      mail: "",
    },
  ];
  writeJSON(FILES.ADMIN, defaultAdmin);
  console.log("✅ Tao tai khoan Super Administrator thanh cong:");
  console.log("- username: admin");
  console.log("- password: admin");
}

// Khởi tạo các file rỗng cho Monitor nếu chưa có
if (!fs.existsSync(FILES.MONITOR)) {
  writeJSON(FILES.MONITOR, []);
}

// Khởi tạo các file rỗng cho Log nếu chưa có
if (!fs.existsSync(FILES.LOG)) {
  writeJSON(FILES.LOG, []);
}

// =============================================================================
// ----------------------- HELPER FUNCTIONS (TIỆN ÍCH) -------------------------
// =============================================================================

// ----- ĐỌC/GHI FILE JSON -----
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ----- TẠO ID RANDOM (bmos + 9 SỐ NGẪU NHIÊN) -----
function generateRandomID() {
  return `bmos${Math.floor(Math.random() * 1000000000)
    .toString()
    .padStart(9, "0")}`;
}

// ----- GHI LOG DỮ LIỆU TỪ THIẾT BỊ -----
function saveToLog(data) {
  const logs = readJSON(FILES.LOG);
  logs.push(data);
  if (logs.length > 100) logs.shift(); // Giới hạn 100 dòng
  writeJSON(FILES.LOG, logs);
}

// ----- TẠO TCP SERVER -----
function createTCPServer(name, port) {
  const server = net.createServer((socket) => {
    console.log(`✅ [${name} App] Client kết nối: ${socket.remoteAddress}`);
    socket.on("data", (data) => {
      console.log(`📥 [${name} App] Nhận: ${data.toString()}`);
      socket.write(`Server đã nhận lệnh từ ${name} App\n`);
    });
    socket.on("error", (err) =>
      console.log(`⚠️ [${name} App] Lỗi: ${err.message}`),
    );
    socket.on("end", () => console.log(`❌ [${name} App] Ngắt kết nối.`));
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`✅ [${name} App] TCP Server chạy tại Port: ${port}`);
  });

  return server;
}

// =============================================================================
// -------------------- LOGIC PHÂN QUYỀN & CRUD (CONTROLLER) -------------------
// =============================================================================

// ----- PHÂN QUYỀN (SỐ CÀNG NHỎ QUYỀN CÀNG TO) -----
const ROLE_RANK = {
  admin: 1, // Server Only
  admin1: 2, // Quản trị cấp 1
  admin2: 3, // Quản trị cấp 2
  monitor1: 4, // Giám sát trưởng
  monitor2: 5, // Chỉ xem
};

// ----- KIỂM TRA QUYỀN CỦA NGƯỜI DÙNG -----
function checkPermission(requesterRole, targetRole) {
  const rRank = ROLE_RANK[requesterRole];
  const tRank = ROLE_RANK[targetRole];

  // Chặn tác động vào Admin gốc
  if (targetRole === "admin") {
    return "❌ BẢO MẬT: Role 'admin' chỉ được quản lý trực tiếp trên Server!";
  }

  // Chặn monitor2 (Chỉ xem)
  if (requesterRole === "monitor2") {
    return "❌ QUYỀN HẠN: Role 'monitor2' chỉ được quyền xem, không được phép chỉnh sửa dữ liệu!";
  }

  // Chỉ được tác động cấp CÙNG hoặc THẤP hơn
  if (rRank >= tRank) {
    return `❌ KHÔNG ĐỦ QUYỀN: Bạn đang ở cấp '${requesterRole}', không thể tác động lên cấp cao hơn là '${targetRole}'`;
  }

  return null; // Cho phép
}

// ----- LOGIC CRUD -----
const SharedUserHandler = {
  // 1. Lấy danh sách tất cả User
  getAll: (req, res) => {
    const admins = readJSON(FILES.ADMIN);
    const monitors = readJSON(FILES.MONITOR);
    res.json([...admins, ...monitors]);
  },

  // 2. Thêm User
  add: (req, res) => {
    const newUser = req.body;
    const requesterRole = req.headers["x-role"] || "monitor2";

    // Check quyền
    const errorMsg = checkPermission(requesterRole, newUser.role);
    if (errorMsg) return res.json({ success: false, msg: errorMsg });

    // Check trùng Username toàn hệ thống
    const allUsers = [...readJSON(FILES.ADMIN), ...readJSON(FILES.MONITOR)];
    if (allUsers.some((u) => u.username === newUser.username)) {
      return res.json({
        success: false,
        msg: "Username đã tồn tại trên hệ thống!",
      });
    }

    newUser.id = generateRandomID();

    // Phân loại file lưu
    const targetFile = ["admin", "admin1", "admin2"].includes(newUser.role)
      ? FILES.ADMIN
      : FILES.MONITOR;
    const currentData = readJSON(targetFile);

    currentData.push(newUser);
    writeJSON(targetFile, currentData);

    res.json({ success: true, msg: "Thêm thành công!", user: newUser });
  },

  // 3. Cập nhật User
  update: (req, res) => {
    const { id } = req.params;
    const newData = req.body; // Dữ liệu mới gửi lên
    const requesterRole = req.headers["x-role"] || "monitor2";

    // 1. Tìm user cũ
    const allUsers = [...readJSON(FILES.ADMIN), ...readJSON(FILES.MONITOR)];
    const targetUser = allUsers.find((u) => u.id === id);
    if (!targetUser)
      return res.json({ success: false, msg: "Không tìm thấy ID user!" });

    // 2. Check quyền sửa user này
    const err1 = checkPermission(requesterRole, targetUser.role);
    if (err1) return res.json({ success: false, msg: err1 });

    // 3. Check quyền gán role mới (nếu có thay đổi role)
    if (newData.role && newData.role !== targetUser.role) {
      const err2 = checkPermission(requesterRole, newData.role);
      if (err2) return res.json({ success: false, msg: err2 });
    }

    // 4. Check trùng username (Trừ chính nó ra)
    if (newData.username && newData.username !== targetUser.username) {
      const isDuplicate = allUsers.some(
        (u) => u.username === newData.username && u.id !== id,
      );
      if (isDuplicate)
        return res.json({
          success: false,
          msg: "Username mới đã bị người khác sử dụng!",
        });
    }

    // 5. Cập nhật dữ liệu trong file tương ứng
    const files = [FILES.ADMIN, FILES.MONITOR];
    let updated = false;

    for (const file of files) {
      let users = readJSON(file);
      const index = users.findIndex((u) => u.id === id);
      if (index !== -1) {
        // Giữ lại ID, cập nhật thông tin mới
        users[index] = { ...users[index], ...newData, id: id };

        writeJSON(file, users);
        updated = true;
        break;
      }
    }

    if (updated) res.json({ success: true, msg: "Cập nhật thành công!" });
    else res.json({ success: false, msg: "Lỗi khi lưu dữ liệu!" });
  },

  // 4. Xóa User
  delete: (req, res) => {
    const { id } = req.params;
    const requesterRole = req.headers["x-role"] || "monitor2";

    let allUsers = [...readJSON(FILES.ADMIN), ...readJSON(FILES.MONITOR)];
    let targetUser = allUsers.find((u) => u.id === id);

    if (!targetUser)
      return res.json({ success: false, msg: "Không tìm thấy ID" });

    const errorMsg = checkPermission(requesterRole, targetUser.role);
    if (errorMsg) return res.json({ success: false, msg: errorMsg });

    // Quét xóa ở cả 2 file
    const files = [FILES.ADMIN, FILES.MONITOR];
    for (const file of files) {
      let users = readJSON(file);
      let newUsers = users.filter((u) => u.id !== id);
      if (newUsers.length !== users.length) {
        writeJSON(file, newUsers);
        return res.json({ success: true, msg: "Đã xóa thành công!" });
      }
    }
    res.json({ success: false, msg: "Lỗi hệ thống khi xóa file" });
  },
};

// =============================================================================
// ----------------------------- ADMIN SERVER ----------------------------------
// =============================================================================

// ----- KHỞI TẠO WEB ADMIN -----
const appAdmin = express();
const serverAdmin = http.createServer(appAdmin);
const ioAdmin = new socketIo(serverAdmin);

appAdmin.use(express.json());
appAdmin.use(express.static(path.join(__dirname, "public/views/admin"))); // Cấu hình đường dẫn cho HTML (Views)
appAdmin.use("/assets", express.static(path.join(__dirname, "public/assets"))); // Cấu hình đường dẫn cho ASSETS

// ----- API LOGIN ADMIN -----
appAdmin.post("/api/login", (req, res) => {
  const { user, pass } = req.body;
  const found = readJSON(FILES.ADMIN).find(
    (a) => a.username === user && a.password === pass,
  );

  if (found) {
    res.json({ success: true, fullname: found.fullname, role: found.role });
  } else {
    res.json({
      success: false,
      msg: "❌ Sai tên đăng nhập hoặc mật khẩu !",
    });
  }
});

// ----- API QUẢN LÝ USER -----
appAdmin.get("/api/users", SharedUserHandler.getAll);
appAdmin.post("/api/users", SharedUserHandler.add);
appAdmin.put("/api/users/:id", SharedUserHandler.update);
appAdmin.delete("/api/users/:id", SharedUserHandler.delete);

// ----- API SERVER TIME -----
appAdmin.get("api/server-time", (req, res) => {
  res.json({ time: Date.now() });
});

appAdmin.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/views/login.html"));
});

appAdmin.get("/desktop", (req, res) => {
  res.sendFile(path.join(__dirname, "public/views/admin/desktop.html"));
});

appAdmin.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/views/admin/index.html"));
});

serverAdmin.listen(CONFIG.PORT.ADMIN_WEB, "0.0.0.0", () => {
  console.log(
    `✅ [Admin Web] http://${CONFIG.IP_DISPLAY}:${CONFIG.PORT.ADMIN_WEB}`,
  );
});

// =============================================================================
// --------------------------- KÊNH TCP (CỔNG 2222) ----------------------------
// =============================================================================
// Mảng lưu các thiết bị phần cứng đang kết nối
let activeHardwareClients = [];

function createTCPServer(name, port, ioInstance) {
  const tcpServer = net.createServer((socket) => {
    console.log(
      `[TCP ${name} - Port ${port}] 🟢 Thiết bị kết nối: ${socket.remoteAddress}`,
    );

    // Lưu socket của user vào mảng khi kết nối
    activeHardwareClients.push(socket);

    // if (ioInstance) {
    //   ioInstance.emit(
    //     "system-log",
    //     `Mạch phần cứng [${clientIP}] VỪA KẾT NỐI qua TCP.`,
    //   );
    // }

    socket.on("data", (data) => {
      try {
        const rawString = data.toString("utf8").trim();
        const parsedData = JSON.parse(rawString);

        console.log(`[TCP ${name}] 📥 Nhận Data:`, parsedData.cell_id || "BMS");

        // Dùng trực tiếp ioInstance được truyền vào
        if (ioInstance) {
          ioInstance.emit("hardware-update", parsedData);
          console.log(`📡 Đã phát 'hardware-update' lên UI qua ${name}`);
        } else {
          console.log("⚠️ Lỗi: Không nhận được biến Socket.io trong hàm TCP!");
        }

        socket.write(JSON.stringify({ status: "SUCCESS" }) + "\n");
      } catch (err) {
        console.log(`[TCP] ❌ Lỗi Data:`, err.message);
      }
    });

    socket.on("error", (err) =>
      console.log(`[TCP ${name}] ⚠️ Lỗi:`, err.message),
    );

    // Khi user ngắt kết nối thì xóa khỏi mảng
    socket.on("close", () => {
      activeHardwareClients = activeHardwareClients.filter(
        (client) => client !== socket,
      );
      console.log(`[TCP ${name}] 🔴 Ngắt kết nối.`);

      // 2BẮN LOG LÊN WEB KHI MẠCH PHẦN CỨNG BỊ RÚT ĐIỆN / MẤT MẠNG
      if (ioInstance) {
        ioInstance.emit(
          "system-log",
          `🔴 Mạch phần cứng [${clientIP}] ĐÃ NGẮT KẾT NỐI.`,
        );
      }
    });
  });

  tcpServer.listen(port, "0.0.0.0", () => {
    console.log(`✅ [TCP Server ${name}] Đang lắng nghe tại Cổng ${port}`);
  });
}

// ----- KHỞI TẠO APP ADMIN -----
createTCPServer("Admin", CONFIG.PORT.ADMIN_APP, ioAdmin);

// Lắng nghe lệnh từ Web (Socket.io) và bắn xuống phần cứng
ioAdmin.on("connection", (socket) => {
  socket.on("send-command-to-hardware", (commandData) => {
    console.log("Nhận lệnh từ Web:", commandData);

    // Đóng gói lệnh thành chuỗi JSON và thêm \n
    const commandString = JSON.stringify(commandData) + "\n";

    // Bắn lệnh này tới TẤT CẢ các mạch phần cứng đang kết nối
    activeHardwareClients.forEach((hwClient) => {
      hwClient.write(commandString);
    });

    console.log("Đã bắn lệnh xuống mạch!");
  });
});

// =============================================================================
// ----------------------------- MONITOR SERVER ----------------------------------
// =============================================================================

// ----- Khởi tạo Web Monitor (Giám sát) -----
const appMonitor = express();
const serverMonitor = http.createServer(appMonitor);
const ioMonitor = new socketIo(serverMonitor);

appMonitor.use(express.json());
appMonitor.use(express.static(path.join(__dirname, "public/monitor")));
appMonitor.use(
  "/assets",
  express.static(path.join(__dirname, "public/assets")),
);

appMonitor.post("/api/login", (req, res) => {
  const { user, pass } = req.body;
  const found = readJSON(FILES.MONITOR).find(
    (m) => m.username === user && m.password === pass,
  );
  if (found)
    res.json({ success: true, fullname: found.fullname, role: found.role });
  else
    res.json({
      success: false,
      msg: "❌ Sai tên đăng nhập hoặc mật khẩu!",
    });
});

appMonitor.get("/api/users", SharedUserHandler.getAll);
appMonitor.post("/api/users", SharedUserHandler.add);
appMonitor.put("/api/users/:id", SharedUserHandler.update);
appMonitor.delete("/api/users/:id", SharedUserHandler.delete);

appMonitor.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/views/monitor/index.html"));
});

appMonitor.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/views/login.html"));
});

ioMonitor.on("connection", (socket) => {
  // Đọc file log gửi dữ liệu cũ (nếu có)
  const logs = readJSON(FILES.LOG);
  if (logs.length > 0) socket.emit("update-data", logs[logs.length - 1]);

  console.log("✅ [Monitor Web] Client kết nối:", socket.id);
});

serverMonitor.listen(CONFIG.PORT.MONITOR_WEB, "0.0.0.0", () => {
  console.log(
    `✅ [Monitor Web] http://${CONFIG.IP_DISPLAY}:${CONFIG.PORT.MONITOR_WEB}`,
  );
});

// ----- KHỞI TẠO APP MONITOR -----
createTCPServer("Monitor", CONFIG.PORT.MONITOR_APP);

// =============================================================================
// --------------------------------- DEVICE -----------------------------------
// =============================================================================

// ----- KHỞI TẠO SERVER UDP -----
const serverBMS = dgram.createSocket("udp4");

serverBMS.on("error", (err) => {
  serverBMS.close();

  console.log(`❌ [BMS Server] (ERROR):\n${err.stack}`);
});

// Xử lý khi nhận dữ liệu từ PIN (BMS) gửi về
serverBMS.on("message", (msg) => {
  const rawMessage = msg.toString();
  console.log(`🔋 [BMS UDP] Nhận: "${rawMessage}"`);
  try {
    const parsedData = rawMessage.startsWith("{")
      ? JSON.parse(rawMessage)
      : { message: rawMessage, time: new Date().toISOString() };

    saveToLog(parsedData);
    ioMonitor.emit("update-data", parsedData);
  } catch (error) {
    console.error(`❌ [BMS Error] ${error.message}`);
  }
});

serverBMS.bind(CONFIG.PORT.DEVICE_UDP, "0.0.0.0", () => {
  console.log(`✅ [BMS UDP] Port ${CONFIG.PORT.DEVICE_UDP}`);
});

// =============================================================================
// ------------------- ĐỒNG BỘ THỜI GIAN SERVER LIÊN TỤC -----------------------
// =============================================================================
setInterval(() => {
  const now = new Date();

  const timeString = now.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    day: "2-digit", // 2 số của ngày
    month: "2-digit", // 2 số của tháng
    year: "numeric", // hiển thị đầy đủ năm
    hour: "2-digit", // 2 số của giờ
    minute: "2-digit", // 2 số của phút
    second: "2-digit", // 2 số của giây
  });

  // Bắn dữ liệu thời gian liên tục xuống TẤT CẢ client đang kết nối
  ioAdmin.emit("server-time", timeString); // Gửi cho web Admin
  ioMonitor.emit("server-time", timeString); // Gửi cho web Monitor
}, 1000); // Lặp lại mỗi 1000ms (1 giây)
