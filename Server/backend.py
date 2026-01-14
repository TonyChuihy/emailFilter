import openai
from openai import AzureOpenAI
from flask import Flask, request, jsonify, render_template_string
import logging
import json
from datetime import datetime
from typing import List, Dict

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 配置OpenAI客户端
client = AzureOpenAI(
    api_key="1c7d451126694bc3b872448f73eb795e" , #Expired, you need to provide a valid API key
    api_version="2024-06-01",
    azure_endpoint="https://hkust.azure-api.net",
)

# 存储消息记录
message_history: List[Dict] = []

# Flask应用用于接收HTTP请求
app = Flask(__name__)

@app.route('/chat', methods=['POST'])
def chat_endpoint():
    """接收聊天请求并转发到OpenAI API"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        message = data.get('message', '')
        if not message:
            return jsonify({"error": "No message provided"}), 400
        
        logger.info(f"收到消息: {message}")
        
        # 记录接收到的消息
        chat_record = {
            "id": len(message_history) + 1,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "type": "input",
            "content": message,
            "status": "received"
        }
        message_history.append(chat_record)
        
        # 处理OpenAI请求
        response = process_openai_request(message)
        
        # 记录AI响应
        response_record = {
            "id": len(message_history) + 1,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "type": "output",
            "content": response,
            "status": "sent"
        }
        message_history.append(response_record)
        
        return jsonify({
            "status": "success", 
            "response": response,
            "message": "Request processed successfully"
        })
    
    except Exception as e:
        logger.error(f"处理请求时出错: {e}")
        # 记录错误
        error_record = {
            "id": len(message_history) + 1,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "type": "error",
            "content": str(e),
            "status": "error"
        }
        message_history.append(error_record)
        
        return jsonify({"error": str(e)}), 500

def process_openai_request(message: str):
    """处理OpenAI请求并返回完整响应"""
    SYSTEM_PROMPT = "You are a email secretary. You will see what user is looking for, check if the email content related to users needs to be alerted. Please respond in JSON format with fields: alerted (boolean), reason (string, less then 10 words)."
    
    try:
        # 调用OpenAI API（非流式）
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": message}
            ],
            # 移除stream参数或设置为False
            stream=False
        )
        
        # 提取回复内容
        if response.choices and len(response.choices) > 0:
            content = response.choices[0].message.content
            logger.info(f"OpenAI回复: {content}")
            return content
        else:
            raise Exception("No response from OpenAI API")
        
    except Exception as e:
        logger.error(f"OpenAI API错误: {e}")
        raise e

@app.route('/control', methods=['GET'])
def control_panel():
    """控制面板 - 展示所有消息记录"""
    return render_template_string("""
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API 控制面板</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .header p {
            color: #666;
            font-size: 1.1em;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-number {
            font-size: 2.5em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .messages-section {
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        .section-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
        }
        .section-header h2 {
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .messages-list {
            max-height: 600px;
            overflow-y: auto;
        }
        .message-item {
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
            transition: background-color 0.3s;
        }
        .message-item:hover {
            background-color: #f8f9fa;
        }
        .message-item:last-child {
            border-bottom: none;
        }
        .message-header {
            display: flex;
            justify-content: between;
            align-items: center;
            margin-bottom: 10px;
        }
        .message-meta {
            display: flex;
            gap: 15px;
            align-items: center;
        }
        .message-id {
            background: #667eea;
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: bold;
        }
        .message-type {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .type-input {
            background: #e3f2fd;
            color: #1976d2;
        }
        .type-output {
            background: #e8f5e8;
            color: #2e7d32;
        }
        .type-error {
            background: #ffebee;
            color: #c62828;
        }
        .message-time {
            color: #666;
            font-size: 0.9em;
        }
        .message-content {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: 'Courier New', monospace;
            font-size: 0.95em;
        }
        .json-content {
            background: #f5f5f5;
            border-left-color: #4caf50;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }
        .empty-state i {
            font-size: 3em;
            margin-bottom: 20px;
            opacity: 0.5;
        }
        .controls {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
        }
        .btn-primary {
            background: #667eea;
            color: white;
        }
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 API 控制面板</h1>
            <p>实时监控所有输入输出消息记录</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">{{ total_messages }}</div>
                <div class="stat-label">总消息数</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{ input_count }}</div>
                <div class="stat-label">输入消息</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{ output_count }}</div>
                <div class="stat-label">AI回复</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{ error_count }}</div>
                <div class="stat-label">错误数量</div>
            </div>
        </div>
        
        <div class="messages-section">
            <div class="section-header">
                <h2>📋 消息记录</h2>
                <div class="controls">
                    <button class="btn btn-primary" onclick="refreshPage()">🔄 刷新</button>
                    <button class="btn btn-danger" onclick="clearHistory()">🗑️ 清空记录</button>
                </div>
            </div>
            
            <div class="messages-list">
                {% if messages %}
                    {% for message in messages %}
                    <div class="message-item">
                        <div class="message-header">
                            <div class="message-meta">
                                <span class="message-id">#{{ message.id }}</span>
                                <span class="message-type type-{{ message.type }}">{{ message.type }}</span>
                                <span class="message-time">{{ message.timestamp }}</span>
                                <span class="message-status" style="color: {% if message.status == 'error' %}#dc3545{% else %}#28a745{% endif %}">
                                    {{ message.status }}
                                </span>
                            </div>
                        </div>
                        <div class="message-content {% if message.content.startswith('{') %}json-content{% endif %}">
                            {{ message.content }}
                        </div>
                    </div>
                    {% endfor %}
                {% else %}
                    <div class="empty-state">
                        <div>📭</div>
                        <h3>暂无消息记录</h3>
                        <p>发送消息到 /chat 端点来查看记录</p>
                    </div>
                {% endif %}
            </div>
        </div>
    </div>

    <script>
        function refreshPage() {
            location.reload();
        }
        
        function clearHistory() {
            if (confirm('确定要清空所有消息记录吗？此操作不可恢复！')) {
                fetch('/control/clear', {
                    method: 'POST'
                }).then(response => {
                    if (response.ok) {
                        location.reload();
                    } else {
                        alert('清空记录失败');
                    }
                });
            }
        }
        
        // 自动滚动到最新消息
        window.addEventListener('load', function() {
            const messagesList = document.querySelector('.messages-list');
            if (messagesList) {
                messagesList.scrollTop = messagesList.scrollHeight;
            }
        });
        
        // 每10秒自动刷新
        setInterval(refreshPage, 10000);
    </script>
</body>
</html>
    """, 
    messages=message_history,
    total_messages=len(message_history),
    input_count=len([m for m in message_history if m['type'] == 'input']),
    output_count=len([m for m in message_history if m['type'] == 'output']),
    error_count=len([m for m in message_history if m['type'] == 'error'])
)

@app.route('/control/clear', methods=['POST'])
def clear_history():
    """清空消息记录"""
    global message_history
    message_history.clear()
    logger.info("消息记录已清空")
    return jsonify({"status": "success", "message": "History cleared"})

@app.route('/control/api', methods=['GET'])
def get_message_history():
    """获取消息记录的JSON API"""
    return jsonify({
        "total_messages": len(message_history),
        "messages": message_history
    })

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    stats = {
        "status": "healthy", 
        "service": "AI Chat API",
        "total_messages": len(message_history),
        "input_messages": len([m for m in message_history if m['type'] == 'input']),
        "output_messages": len([m for m in message_history if m['type'] == 'output']),
        "error_messages": len([m for m in message_history if m['type'] == 'error'])
    }
    return jsonify(stats)

@app.route('/', methods=['GET'])
def home():
    """首页"""
    return jsonify({
        "message": "AI Chat API is running",
        "endpoints": {
            "chat": "POST /chat",
            "control_panel": "GET /control",
            "health": "GET /health",
            "message_history": "GET /control/api"
        }
    })

def start_flask_server():
    """启动Flask服务器"""
    logger.info("Flask服务器启动在 localhost:8001")
    logger.info("控制面板访问: http://localhost:8001/control")
    app.run(host='0.0.0.0', port=8001, debug=False, threaded=True)

if __name__ == "__main__":
    # 直接启动Flask服务器
    start_flask_server()