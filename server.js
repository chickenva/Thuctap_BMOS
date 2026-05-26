const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const socketIo = require("socket.io").Server;
const dgram = require("dgram"); // Thư viện cho UDP
const net = require("net"); // Dùng cho App PC/Mobile (TCP Raw Socket)
const { time } = require("console");
// const { SerialPort } = require("serialport");
// const { ReadlineParser } = require("@serialport/parser-readline");

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
// --------------------------- KÊNH TCP ADMIN (CỔNG 2222) ----------------------
// =============================================================================
// ==========================================
// KHAI BÁO BIẾN TOÀN CỤC VÀ TẠO TCP SERVER
// ==========================================
let isMcuConnected = false;
let mcuSocket = null;
let activeHardwareClients = [];
let lastMcuMode = null; // Tracking mode cũ để tránh emit liên tục
let lastMcuStatus = null; // Tracking status cũ để tránh emit liên tục

function createTCPServer(name, port, ioInstance) {
  const tcpServer = net.createServer((socket) => {
    // LƯU IP NGAY TỪ ĐẦU ĐỂ KHÔNG BỊ MẤT KHI RỚT MẠNG
    const clientIp = socket.remoteAddress;
    console.log(
      `[TCP ${name} - Port ${port}] 🟢 Thiết bị kết nối: ${clientIp}`,
    );

    isMcuConnected = true;
    mcuSocket = socket;
    activeHardwareClients.push(socket);

    // RESET trạng thái mode/status khi có kết nối mới
    lastMcuMode = null;
    lastMcuStatus = null;

    if (ioInstance) {
      ioInstance.emit("mcu-connection-status", {
        connected: true,
        mcu_id: clientIp,
      });
    }

    let dataBuffer = "";

    socket.on("data", (data) => {
      dataBuffer += data.toString();
      let packets = dataBuffer.split("\n");
      dataBuffer = packets.pop();

      for (let i = 0; i < packets.length; i++) {
        let completeString = packets[i].trim();

        if (completeString.length > 0) {
          console.log(`[TCP ${name} VĐK Gửi Lên] ->`, completeString);

          try {
            let parsedData = JSON.parse(completeString);

            if (ioInstance) {
              // 1. DATA PIN - nhận cả dạng chuẩn và dạng mảng cell trực tiếp
              if (parsedData.type === "BMS_DATA") {
                ioInstance.emit("hardware-update", parsedData);
                console.log("[SERVER] ✅ Emit hardware-update dạng BMS_DATA");
              } else if (Array.isArray(parsedData)) {
                ioInstance.emit("hardware-update", {
                  type: "BMS_DATA",
                  cells: parsedData,
                });
                console.log(
                  "[SERVER] ✅ Emit hardware-update dạng ARRAY cells",
                );
              }

              // 2. BẮT BIẾN ĐỔI MODE (Anh Tài gộp chung vào JSON)
              if (parsedData.mode) {
                const mcuMode = parsedData.mode.toUpperCase();
                console.log(`[SERVER] VĐK gửi trạng thái MODE: ${mcuMode}`);
                // CHỈ EMIT nếu MODE THỰC SỰ THAY ĐỔI - TRÁNH SPAM
                if (
                  mcuMode !== lastMcuMode &&
                  (mcuMode === "MANUAL" || mcuMode === "AUTO")
                ) {
                  lastMcuMode = mcuMode;
                  ioInstance.emit("mcu-physical-button", `MODE_${mcuMode}`);
                  console.log(
                    `[SERVER] ✅ Emit MODE_${mcuMode} vì có thay đổi`,
                  );
                }
              }

              // 3. BẮT TÍN HIỆU NÚT BẤM CŨ (Nếu anh Tài có dùng)
              if (parsedData.btn_sync) {
                ioInstance.emit("mcu-physical-button", parsedData.btn_sync);
              }

              // 4. BẮT TRẠNG THÁI STATUS (SẠC/XẢ/STOP/DONE)
              if (parsedData.status) {
                const mcuStatus = parsedData.status.toUpperCase();

                if (mcuStatus === "CHARGING" || mcuStatus === "DISCHARGING") {
                  // CHỈ EMIT nếu STATUS THỰC SỰ THAY ĐỔI - TRÁNH SPAM
                  if (mcuStatus !== lastMcuStatus) {
                    lastMcuStatus = mcuStatus;
                    ioInstance.emit("mcu-ack-received", { status: mcuStatus });
                    console.log(
                      `[SERVER] ✅ Emit mcu-ack-received vì có thay đổi status`,
                    );
                  }
                }
                // Xử lý luôn chữ STOP của anh Tài gửi lên
                else if (
                  mcuStatus === "DONE" ||
                  mcuStatus === "STOP" ||
                  mcuStatus === "IDLE"
                ) {
                  console.log(`[SERVER] VĐK báo DỪNG/HOÀN TẤT`);
                  // CHỈ EMIT nếu không phải trạng thái IDLE cuối cùng
                  if (lastMcuStatus !== "IDLE") {
                    lastMcuStatus = "IDLE";
                    ioInstance.emit("mcu-status-idle");
                    console.log(`[SERVER] ✅ Emit mcu-status-idle`);
                  }
                }
              }
            }
          } catch (e) {
            console.log(`[TCP ${name}] Bỏ qua gói tin không đúng chuẩn JSON.`);
          }
        }
      }
    });

    // GOM CHUNG LOGIC XỬ LÝ RỚT MẠNG VÀO 1 HÀM AN TOÀN
    const handleDisconnect = () => {
      activeHardwareClients = activeHardwareClients.filter(
        (client) => client !== socket,
      );

      if (mcuSocket === socket) {
        console.log(`[TCP ${name}] 🔴 Mạch ${clientIp} đã ngắt kết nối!`);
        isMcuConnected = false;
        mcuSocket = null;

        // RESET trạng thái mode/status để sẵn sàng kết nối lại
        lastMcuMode = null;
        lastMcuStatus = null;

        if (ioInstance) {
          // Bắn lệnh báo rớt mạng lên giao diện
          ioInstance.emit("mcu-connection-status", {
            connected: false,
            mcu_id: clientIp,
          });
        }
      }
    };

    socket.on("error", (err) => {
      console.log(
        `[TCP ${name}] ⚠️ Lỗi đường truyền với mạch ${clientIp}:`,
        err.message,
      );
      handleDisconnect();
    });

    socket.on("close", () => {
      handleDisconnect();
    });
  });

  tcpServer.listen(port, "0.0.0.0", () => {
    console.log(`✅ [TCP Server ${name}] Đang lắng nghe tại Cổng ${port}`);
  });
}

// ----- KHỞI TẠO APP ADMIN -----
createTCPServer("Admin", CONFIG.PORT.ADMIN_APP, ioAdmin);

// ==========================================
// LẮNG NGHE LỆNH TỪ WEB ĐỂ BẮN XUỐNG MẠCH
// ==========================================
ioAdmin.on("connection", (socket) => {
  // Trạng thái cho tab Sạc/Xả ngay khi Web vừa load
  socket.emit("mcu-connection-status", {
    connected: isMcuConnected,
    mcu_id: mcuSocket ? mcuSocket.remoteAddress : null,
  });

  // A. LỆNH ĐIỀU KHIỂN CHUNG (Chạy code của bạn)
  socket.on("send-command-to-hardware", (commandData) => {
    console.log("Nhận lệnh từ Web/Desktop:", commandData);

    // Chuẩn hóa riêng cho lệnh điều khiển đèn LED_TEST
    if (commandData && commandData.device === "LED_TEST") {
      const rawSpeed = Number(commandData.speed_ms ?? 500);

      commandData.speed_ms = Math.max(
        0,
        Math.min(1000, Number.isNaN(rawSpeed) ? 500 : rawSpeed),
      );

      commandData.action = commandData.action ? 1 : 0;
    }

    const commandString = JSON.stringify(commandData) + "\n";

    activeHardwareClients.forEach((hwClient) => {
      hwClient.write(commandString);
    });

    console.log("[SERVER] Đã gửi xuống phần cứng:", commandString.trim());
  });

  // B. LỆNH DÀNH RIÊNG CHO TAB SẠC/XẢ (GG Power / Vinfast)
  socket.on("manual-mcu-command", (payload) => {
    console.log(
      `[SERVER] Web yêu cầu Sạc/Xả: ${payload.action} trong ${payload.minutes} phút`,
    );
    if (isMcuConnected && mcuSocket) {
      const commandString = JSON.stringify(payload) + "\n";
      mcuSocket.write(commandString);
    }
  });

  socket.on("server-ack-to-mcu", (data) => {
    if (isMcuConnected && mcuSocket) {
      const ackString = JSON.stringify({ status: "Web_OK" }) + "\n";
      mcuSocket.write(ackString);
    }
  });
});

// =============================================================================
// ----------------------------- MONITOR SERVER --------------------------------
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

serverBMS.on("message", (msg, rinfo) => {
  const rawMessage = msg.toString().trim();
  if (!rawMessage) {
    console.log(
      `⚠️ [BMS UDP] Bỏ qua gói rỗng từ ${rinfo.address}:${rinfo.port}`,
    );
    return;
  }

  console.log(
    `🔋 [BMS UDP] Nhận từ ${rinfo.address}:${rinfo.port} -> "${rawMessage}"`,
  );

  try {
    let parsedData = JSON.parse(rawMessage);

    // Trường hợp anh Tài gửi thẳng mảng cell:
    // [{"cell_id":1,"voltage":3.34,...}]
    if (Array.isArray(parsedData)) {
      parsedData = {
        type: "BMS_DATA",
        source: "UDP",
        cells: parsedData,
      };
    }

    // Trường hợp gửi object có cells nhưng quên type
    // {"cells":[...]}
    if (
      parsedData &&
      typeof parsedData === "object" &&
      !Array.isArray(parsedData) &&
      parsedData.cells &&
      !parsedData.type
    ) {
      parsedData.type = "BMS_DATA";
      parsedData.source = "UDP";
    }

    saveToLog({
      ...parsedData,
      protocol: "UDP",
      udp_from: `${rinfo.address}:${rinfo.port}`,
      received_at: new Date().toISOString(),
    });

    // UDP dữ liệu pin -> bắn lên tab Giám sát desktop/mobile
    if (parsedData.type === "BMS_DATA") {
      ioAdmin.emit("hardware-update", parsedData);
      ioMonitor.emit("update-data", parsedData);

      console.log("[UDP -> SOCKET] Emit hardware-update:", parsedData);
      return;
    }

    // Nếu UDP gửi mode
    if (parsedData.mode) {
      const mcuMode = parsedData.mode.toUpperCase();

      if (mcuMode === "MANUAL" || mcuMode === "AUTO") {
        ioAdmin.emit("mcu-physical-button", `MODE_${mcuMode}`);
        console.log(`[UDP -> SOCKET] Emit MODE_${mcuMode}`);
      }
    }

    // Nếu UDP gửi nút vật lý
    if (parsedData.btn_sync) {
      ioAdmin.emit("mcu-physical-button", parsedData.btn_sync);
      console.log(`[UDP -> SOCKET] Emit btn_sync: ${parsedData.btn_sync}`);
    }

    // Nếu UDP gửi trạng thái sạc/xả
    if (parsedData.status) {
      const mcuStatus = parsedData.status.toUpperCase();

      if (mcuStatus === "CHARGING" || mcuStatus === "DISCHARGING") {
        ioAdmin.emit("mcu-ack-received", { status: mcuStatus });
        console.log(`[UDP -> SOCKET] Emit mcu-ack-received: ${mcuStatus}`);
      } else if (
        mcuStatus === "DONE" ||
        mcuStatus === "STOP" ||
        mcuStatus === "IDLE"
      ) {
        ioAdmin.emit("mcu-status-idle");
        console.log("[UDP -> SOCKET] Emit mcu-status-idle");
      }
    }
  } catch (error) {
    console.error(`❌ [BMS UDP Error] Không parse được JSON: ${error.message}`);
    console.error(`❌ [BMS UDP Raw] ${rawMessage}`);
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
