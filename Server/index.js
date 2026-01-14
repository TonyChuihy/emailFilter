const express = require("express");
const { AzureOpenAI } = require("openai");
const path = require("path");
const app = express();
const port = process.env.PORT || 8080; // Cloud Run 強制使用 $PORT

app.use(express.json());
app.use(express.static("public")); // 如果你要放靜態檔案，可選

// 訊息歷史（記憶體儲存，重啟會消失；生產可換 Redis / Firestore）
let messageHistory = [];

// Azure OpenAI 客戶端（使用環境變數，絕對不要硬碼）
require("dotenv").config();
const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-06-01",
  endpoint: process.env.AZURE_OPENAI_ENDPOINT, // e.g. https://hkust.azure-api.net
});

let currentSystemPrompt =
  "You are a email secretary. You will see what user is looking for, check if the email content related to users needs to be alerted. " +
  "Please respond in JSON format with fields: alerted (boolean), reason (string, less then 10 words).";

// 記錄訊息的 helper
function logMessage(type, content, status = "success") {
  const record = {
    id: messageHistory.length + 1,
    timestamp: new Date().toISOString(),
    type,
    content:
      typeof content === "string" ? content : JSON.stringify(content, null, 2),
    status,
  };
  messageHistory.push(record);
  console.log(
    `[${
      record.timestamp
    }] ${type.toUpperCase()} (${status}): ${record.content.substring(
      0,
      100
    )}...`
  );
}

// POST /chat
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    logMessage("input", message, "received");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: currentSystemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.3, // 可調整
      max_tokens: 150,
    });

    const responseText =
      completion.choices[0]?.message?.content?.trim() || "{}";

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      parsed = { alerted: false, reason: "Invalid JSON from AI" };
    }

    logMessage("output", parsed, "sent");

    res.json({
      status: "success",
      response: parsed,
      message: "Request processed successfully",
    });
  } catch (error) {
    console.error("OpenAI error:", error);
    logMessage("error", error.message || String(error), "error");
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /control - HTML 控制面板（簡化版，樣式可再優化）
app.post("/control/update-prompt", (req, res) => {
  try {
    const { newPrompt } = req.body;

    if (
      !newPrompt ||
      typeof newPrompt !== "string" ||
      newPrompt.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "請提供有效的 system prompt",
      });
    }

    const oldPrompt = currentSystemPrompt;
    currentSystemPrompt = newPrompt.trim();

    logMessage(
      "system",
      `System Prompt 已更新\n舊:\n${oldPrompt}\n新:\n${currentSystemPrompt}`,
      "updated"
    );

    res.json({
      success: true,
      message: "System prompt 已更新",
      currentPrompt: currentSystemPrompt,
    });
  } catch (err) {
    logMessage("error", err.message, "error");
    res.status(500).json({ success: false, message: "更新失敗" });
  }
});

// 修改 /chat 路由，使用動態的 currentSystemPrompt
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    logMessage("input", message, "received");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: currentSystemPrompt }, // ← 這裡改用變數
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    // ... 後續處理保持不變 ...
  } catch (error) {
    // ... 原有錯誤處理 ...
  }
});

// 修改 /control 的 HTML，加入 prompt 編輯區塊
app.get("/control", (req, res) => {
  const total = messageHistory.length;
  const inputs = messageHistory.filter((m) => m.type === "input").length;
  const outputs = messageHistory.filter((m) => m.type === "output").length;
  const errors = messageHistory.filter((m) => m.type === "error").length;

  const html = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API 控制面板</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f0f2f5; padding: 20px; line-height: 1.6; }
    .container { max-width: 1200px; margin: auto; }
    .header { text-align: center; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin: 20px 0; }
    .stat-card { padding: 20px; text-align: center; background: #f8f9fa; border-radius: 8px; }
    .stat-number { font-size: 2.2em; font-weight: bold; color: #4285f4; }
    textarea { width: 100%; min-height: 120px; padding: 12px; font-family: monospace; font-size: 0.95em; border: 1px solid #ccc; border-radius: 6px; resize: vertical; }
    button { padding: 10px 20px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
    button:hover { background: #3367d6; }
    #status { margin-top: 10px; color: #555; min-height: 1.2em; }
    .messages { margin-top: 20px; }
    .message { padding: 12px; border-bottom: 1px solid #eee; }
    pre { background: #f8f9fa; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 API 控制面板</h1>
      <p>實時監控 & System Prompt 管理</p>
    </div>

    <div class="section">
      <h3>目前 System Prompt</h3>
      <pre id="current-prompt">${currentSystemPrompt
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>
    </div>

    <div class="section">
      <h3>修改 System Prompt</h3>
      <textarea id="new-prompt" placeholder="輸入新的 system prompt..."></textarea>
      <div style="margin-top: 12px;">
        <button onclick="updatePrompt()">儲存並套用</button>
        <span id="status"></span>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card"><div class="stat-number">${total}</div><div>總訊息數</div></div>
      <div class="stat-card"><div class="stat-number">${inputs}</div><div>輸入訊息</div></div>
      <div class="stat-card"><div class="stat-number">${outputs}</div><div>AI 回覆</div></div>
      <div class="stat-card"><div class="stat-number">${errors}</div><div>錯誤數量</div></div>
    </div>

    <div class="section messages">
      <h3>訊息記錄</h3>
      ${
        messageHistory.length === 0
          ? '<p style="text-align:center;padding:30px;color:#777;">暫無記錄</p>'
          : messageHistory
              .map(
                (m) => `
          <div class="message">
            <div style="display:flex; gap:10px; font-size:0.9em; margin-bottom:6px;">
              <span>#${m.id}</span>
              <strong>${m.type.toUpperCase()}</strong>
              <span>${new Date(m.timestamp).toLocaleString("zh-TW")}</span>
              <span style="color:${
                m.status === "error" ? "#d93025" : "#188038"
              }">${m.status}</span>
            </div>
            <pre>${m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
          </div>
        `
              )
              .join("")
      }
    </div>
  </div>

  <script>
    async function updatePrompt() {
      const textarea = document.getElementById('new-prompt');
      const status = document.getElementById('status');
      const newPrompt = textarea.value.trim();

      if (!newPrompt) {
        status.textContent = '請輸入內容';
        status.style.color = 'red';
        return;
      }

      status.textContent = '更新中...';

      try {
        const res = await fetch('/control/update-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPrompt })
        });

        const data = await res.json();

        if (data.success) {
          status.textContent = '更新成功！';
          status.style.color = 'green';
          document.getElementById('current-prompt').textContent = data.currentPrompt;
          textarea.value = '';  // 可選：清空輸入框
        } else {
          status.textContent = data.message || '更新失敗';
          status.style.color = 'red';
        }
      } catch (err) {
        status.textContent = '網路錯誤：' + err.message;
        status.style.color = 'red';
      }
    }

  </script>
</body>
</html>
  `;

  res.send(html);
});
// GET /control/api
app.get("/control/api", (req, res) => {
  res.json({
    total_messages: messageHistory.length,
    messages: messageHistory,
  });
});

// POST /control/clear
app.post("/control/clear", (req, res) => {
  messageHistory = [];
  console.log("訊息歷史已清空");
  res.json({ status: "success", message: "History cleared" });
});

// GET /health
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "AI Chat API (Node.js)",
    total_messages: messageHistory.length,
    input_messages: messageHistory.filter((m) => m.type === "input").length,
    output_messages: messageHistory.filter((m) => m.type === "output").length,
    error_messages: messageHistory.filter((m) => m.type === "error").length,
  });
});

// 根路徑
app.get("/", (req, res) => {
  res.json({
    message: "AI Email Secretary API is running",
    endpoints: {
      chat: "POST /chat",
      control: "GET /control",
      health: "GET /health",
    },
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port} (Cloud Run mode)`);
});
