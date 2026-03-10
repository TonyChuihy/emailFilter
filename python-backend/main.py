"""
Outlook 收件匣監控（包含完整內容版本）
- 監控新郵件並輸出 JSON（包含 Body 完整內容 + 預覽）
- 使用 EntryID 確保不重複處理
- 短時間內多封新郵件也能全部捕捉
"""

import sys
import json
import time
import win32com.client
import win32timezone
import pythoncom
import io

# 全域變數
CHECK_LIMIT = 10                  # 每輪檢查最近 10 封
processed_ids = set()             # 已處理的 EntryID
FIRST_RUN = True
recent_emails = []                # 暫存最近發現的新郵件（包含內容）

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def initialize_com():
    try:
        pythoncom.CoInitialize()
        return True
    except Exception as e:
        print(json.dumps({"type": "error", "message": f"COM failed init. : {e}"}), flush=True)
        return False

def cleanup_com():
    try:
        pythoncom.CoUninitialize()
    except:
        pass


def build_email_info(msg):
    subject = msg.Subject or "(無主旨)"
    sender = msg.SenderName or msg.SenderEmailAddress or "未知寄件人"
    received_time = str(msg.ReceivedTime)

    # 原始正文（可能包含真正的換行符與字面上的 "\r\n" 文本）
    raw_body = msg.Body or ""

    # 先把字面上的 "\r\n"（兩個字元）轉成空格，再把實際換行符替換掉
    body = raw_body.replace("\\r\\n", " ")
    body = body.replace("\r\n", " ").replace("\n", " ").replace("\r", " ")

    # 壓縮多餘空白，避免變成一長串空格
    body = " ".join(body.split())

    body_preview = body[:300] + "..." if len(body) > 300 else body

    return {
        "entry_id": msg.EntryID,
        "subject": subject,
        "sender": sender,
        "received_time": received_time,
        "body": body,
        "body_preview": body_preview,
        "timestamp": time.time(),
    }

def check_recent_emails():
    global FIRST_RUN

    if not initialize_com():
        return

    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
        namespace = outlook.GetNamespace("MAPI")
        inbox = namespace.GetDefaultFolder(6)  # olFolderInbox
        messages = inbox.Items
        messages.Sort("[ReceivedTime]", True)

        new_emails_this_round = []

        for i in range(min(CHECK_LIMIT, len(messages))):
            msg = messages[i]
            entry_id = msg.EntryID

            if entry_id in processed_ids:
                continue

            processed_ids.add(entry_id)

            email_info = build_email_info(msg)

            if not FIRST_RUN:
                new_emails_this_round.append(email_info)
                # 立即發送新電郵資訊給 Electron
                print(json.dumps({
                    "type": "new_email",
                    "data": email_info
                }, ensure_ascii= False), flush=True)

            # 儲存到暫存（供查詢）
            recent_emails.append(email_info)

        # 限制暫存大小，避免記憶體一直增長
        if len(recent_emails) > 20:
            recent_emails.pop(0)

        if FIRST_RUN:
            FIRST_RUN = False
            print(json.dumps({"type": "init", "message": "monitor init. complete"}), flush=True)

    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}), flush=True)
    finally:
        cleanup_com()


def get_emails_since_entry(target_entry_id: str):
    """
    從最新郵件開始往回掃描，直到遇到 target_entry_id 為止。
    返回「在這封 email 之後收到的所有新郵件」。
    如果連續 100 封都沒有找到 target_entry_id，則直接返回最新的 100 封。
    """
    if not target_entry_id:
        return []

    if not initialize_com():
        return []

    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
        namespace = outlook.GetNamespace("MAPI")
        inbox = namespace.GetDefaultFolder(6)  # olFolderInbox
        messages = inbox.Items
        messages.Sort("[ReceivedTime]", True)

        result = []
        checked_without_match = 0

        for i in range(len(messages)):
            msg = messages[i]
            entry_id = msg.EntryID

            if entry_id == target_entry_id:
                # 找到對應的 email，停止回溯
                break

            email_info = build_email_info(msg)
            result.append(email_info)

            # 同時將這些視為已處理，避免後續重複推送
            processed_ids.add(entry_id)

            checked_without_match += 1
            if checked_without_match >= 100:
                # 連續 100 封都沒有遇到 target_entry_id，就只返回最新 100 封
                break

        # 只保留最新 100 封（保險）
        return result[:100]

    except Exception as e:
        print(json.dumps({"type": "error", "message": f"get_emails_since_entry error: {e}"}), flush=True)
        return []
    finally:
        cleanup_com()

def monitor_loop():
    print(json.dumps({"type": "status", "message": "monitor start"}), flush=True)
    while True:
        try:
            check_recent_emails()
            time.sleep(5)
        except KeyboardInterrupt:
            print(json.dumps({"type": "status", "message": "monitor stop"}), flush=True)
            break

# 處理來自 Electron 的指令
def handle_commands():
    if sys.stdin is None:
        print(json.dumps({"type": "status", "message": "無 stdin，進入純監控模式"}), flush=True)
        while True:
            time.sleep(3600)  # 無限等待，避免 CPU 空轉
        return
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            cmd = req.get("cmd")

            if cmd == "get_recent":
                # 回傳第 n 封郵件的 EntryID（n 由主進程決定，預設為 10）
                try:
                    index = int(req.get("index", 10))
                except (TypeError, ValueError):
                    index = 10

                if index <= 0:
                    index = 1

                if not initialize_com():
                    print(json.dumps({
                        "type": "response",
                        "cmd": "get_recent",
                        "data": {"entry_id": None, "index": index}
                    }, ensure_ascii=False), flush=True)
                    continue

                try:
                    outlook = win32com.client.Dispatch("Outlook.Application")
                    namespace = outlook.GetNamespace("MAPI")
                    inbox = namespace.GetDefaultFolder(6)  # olFolderInbox
                    messages = inbox.Items
                    messages.Sort("[ReceivedTime]", True)

                    if len(messages) == 0:
                        entry_id = None
                    else:
                        # 第 1 封的索引為 0，以此類推
                        idx = min(index - 1, len(messages) - 1)
                        msg = messages[idx]
                        entry_id = msg.EntryID

                    print(json.dumps({
                        "type": "response",
                        "cmd": "get_recent",
                        "data": {
                            "entry_id": entry_id,
                            "index": index
                        }
                    }, ensure_ascii=False), flush=True)
                except Exception as e:
                    print(json.dumps({
                        "type": "error",
                        "message": f"get_recent error: {e}"
                    }, ensure_ascii=False), flush=True)
                    print(json.dumps({
                        "type": "response",
                        "cmd": "get_recent",
                        "data": {"entry_id": None, "index": index}
                    }, ensure_ascii=False), flush=True)
                finally:
                    cleanup_com()

            elif cmd == "get_since_entry":
                target_id = req.get("entry_id")
                if not isinstance(target_id, str) or not target_id:
                    print(json.dumps({
                        "type": "error",
                        "message": "get_since_entry 需要有效的 entry_id"
                    }, ensure_ascii=False), flush=True)
                    continue

                emails = get_emails_since_entry(target_id)
                print(json.dumps({
                    "type": "response",
                    "cmd": "get_since_entry",
                    "data": emails
                }, ensure_ascii=False), flush=True)

            elif cmd == "ping":
                print(json.dumps({
                    "type": "response",
                    "cmd": "ping",
                    "message": "pong",
                    "timestamp": time.time()
                }), flush=True)

            else:
                print(json.dumps({
                    "type": "error",
                    "message": f"未知指令: {cmd}"
                }), flush=True)

        except json.JSONDecodeError:
            print(json.dumps({"type": "error", "message": "invalid JSON"}), flush=True)

if __name__ == "__main__":
    from threading import Thread
    monitor_thread = Thread(target=monitor_loop, daemon=True)
    monitor_thread.start()

    handle_commands()