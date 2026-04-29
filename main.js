const { app, BrowserWindow } = require("electron");

// Khởi chạy ngầm toàn bộ backend (Express, Socket.IO, UDP) của hệ thống
require("./server.js");

let mainWindow; // Biến global để giữ cửa sổ chính, tránh bị GC (garbage collected) và tự tắt

// Hàm tạo UI cho app
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 768,
    title: "BMOS - Hệ Thống Quản Trị Pin",
    webPreferences: {
      nodeIntegration: false, // Không cho frontend truy cập Node.js trực tiếp -> Tránh bị hack
      contextIsolation: true, // Tách biệt frontend và backend -> An toàn hơn
    },
  });

  // Load giao diện Admin (Cổng 1111)
  setTimeout(() => {
    if (mainWindow) {
      mainWindow.loadURL("http://localhost:1111/desktop");
    }
  }, 1500); // Đợi 1.5 giây để đảm bảo server đã sẵn sàng trước khi tải UI

  // Giải phóng tài nguyên khi cửa sổ chính bị đóng
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// KIỂM TRA KHÓA: Ngăn người dùng mở 2 phần mềm BMOS cùng lúc
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Nếu phát hiện app đã mở rồi, tự sát ngay lập tức
  app.quit();
} else {
  // Nếu có người cố tình mở app lần 2, tự động kéo cái cửa sổ đang ẩn lên cho họ xem
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Mở cửa sổ chính khi Electron đã sẵn sàng
  app.whenReady().then(() => {
    createWindow();

    app.on("activate", function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// Tắt hoàn toàn tiến trình ngầm (kể cả server.js) khi đóng cửa sổ chính
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
    process.exit(0);
  }
});
