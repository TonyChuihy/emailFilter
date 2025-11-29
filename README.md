````markdown
# Outlook AI 助手（Windows 專用）

自動讀取 Outlook 新郵件 → 交給 Azure OpenAI 智能回覆 → 前端即時顯示

## 快速啟動（三步搞定）

### 1. 建立環境並安裝套件（只需執行一次）

```bash
conda create -n outlook-ai python=3.10 -y
conda activate outlook-ai

pip install pywin32 flask flask-cors requests openai python-dateutil
# 或
pip install -r requirements.txt
```

> 如果遇到問題，安裝完 pywin32 後請再執行一次（只做一次即可）  
> `python Scripts/pywin32_postinstall.py -install`

### 2. 依序啟動三個服務（開三個終端機）

**終端機 1** — 後端 API

如果我的 AI quota 用盡，請修改 Server backend.py 中的 配置 OpenAI 客户端部分，使用你自己的 Azure OpenAI 金鑰與端點。

```bash
cd Server
python backend.py
# → 看到 "Flask服务器启动在 localhost:8001" 即成功
```

**終端機 2** — Outlook 郵件監聽（核心）

```bash
python outlook_reader.py
# → 看到 "開始監聽 Outlook..." 即成功
```

**終端機 3** — 前端 React 介面

```bash
cd Client-terminal
npm install    # 僅第一次需要
npm run dev    # 自動打開 http://localhost:5173
```

### 完成！

現在收到新郵件時，系統會自動：

1. 讀取郵件
2. 交給 Azure OpenAI 產生回覆
3. 在前端即時顯示結果

## 重要提醒

- 必須在 **Windows** 執行
- 請用**管理員權限**執行 `outlook_reader.py`
- 請先開啟並登入 Outlook，不可以使用 microsoft store 版

Enjoy your AI email assistant!

```

```
````
