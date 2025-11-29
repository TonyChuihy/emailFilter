// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静态文件服务（React构建文件）
app.use(express.static(path.join(__dirname, "dist")));

// 存储连接的Python客户端
let pythonClient = null;

// WebSocket连接处理
wss.on("connection", function connection(ws, req) {
  const clientIP = req.socket.remoteAddress;
  console.log(`新的WebSocket连接: ${clientIP}`);

  // 检查是否是Python客户端（可以根据需要添加认证）
  ws.on("message", function message(data) {
    try {
      const parsedData = JSON.parse(data);
      console.log("收到消息:", parsedData);

      // 广播给所有连接的React前端
      wss.clients.forEach(function each(client) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    } catch (error) {
      console.log("收到文本消息:", data.toString());
    }
  });

  ws.on("close", function close() {
    console.log(`客户端断开连接: ${clientIP}`);
  });

  ws.send(
    JSON.stringify({
      type: "system",
      message: "WebSocket连接已建立",
      timestamp: new Date().toISOString(),
    })
  );
});

// 提供React应用
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`WebSocket服务器运行在 ws://localhost:${PORT}`);
});
