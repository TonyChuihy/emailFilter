"""
Email Alert System with API
"""

import win32com.client
import time
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
from datetime import datetime
import pythoncom

# Global variables
OLDtitle = ''
FirstTime = True
email_history = []  # Store email history
outlook_initialized = False

# Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS

# Default sensitive words
SENSITIVE_WORDS = ["password", "confidential", "passwords", "ID numbers", "id number", "credit card", "ssn", "social security"]
# User custom sensitive words
CUSTOM_SENSITIVE_WORDS = []
# User watch words - these are sent to AI as context
WATCH_WORDS = []

def initialize_outlook():
    """Initialize Outlook connection"""
    global outlook_initialized
    try:
        pythoncom.CoInitialize()
        outlook_initialized = True
        return True
    except Exception as e:
        print(f"COM initialization failed: {e}")
        return False

def cleanup_outlook():
    """Cleanup Outlook connection"""
    global outlook_initialized
    try:
        if outlook_initialized:
            pythoncom.CoUninitialize()
            outlook_initialized = False
    except:
        pass

def check_sensitive_content(subject: str, body: str) -> bool:
    """Check if email contains sensitive words (including custom sensitive words)"""
    content = f"{subject} {body}".lower()
    all_sensitive_words = SENSITIVE_WORDS + CUSTOM_SENSITIVE_WORDS
    return any(word.lower() in content for word in all_sensitive_words)

def check_email_safe():
    """Safe email checking function"""
    global OLDtitle, FirstTime, email_history
    
    if not initialize_outlook():
        return
    
    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
        inbox = outlook.GetNamespace("MAPI").GetDefaultFolder(6)  # Inbox
        messages = inbox.Items
        messages.Sort("[ReceivedTime]", True)
        
        if len(messages) == 0:
            return
            
        latest_email = messages[0]
        subject = latest_email.Subject
        body = latest_email.Body or ""

        # Check if it's a duplicate email
        if subject == OLDtitle and not FirstTime:
            return
        
        # Update status
        OLDtitle = subject
        if FirstTime:
            FirstTime = False
            print("✅ Initialization complete, starting email monitoring...")
            return

        print(f"\n📧 New email detected: {subject}")

        # Check sensitive words (including custom sensitive words)
        is_sensitive = check_sensitive_content(subject, body)
        
        # Create email record
        email_record = {
            "id": len(email_history) + 1,
            "title": subject,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "body_preview": body[:100] + "..." if len(body) > 100 else body
        }
        
        if is_sensitive:
            email_record["type"] = "Sensitive"
            email_record["reason"] = "Contains sensitive information"
            print(f"🚨 Sensitive email! -> Blocked, not sent to AI")
            
        else:
            email_record["type"] = "Non-urgent"
            email_record["reason"] = "Sent to AI analysis"
            print(f"📤 Sending to AI analysis...")
            
            # Send to AI API
            try:
                # Build message with watch words context
                watch_context = ""
                if WATCH_WORDS:
                    watch_context = f"\n\nAdditional context - user is watching for topics related to: {', '.join(WATCH_WORDS)}"
                
                payload = {
                    "message": f"user is looking for:{watch_context}\nCheck if this email requires attention\n\nemail content：{body}",
                    "title": subject
                }
                response = requests.post("http://localhost:8001/chat", json=payload, timeout=5)
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"✅ AI response: {result.get('response', 'No response')}")
                    
                    # Parse AI response
                    try:
                        # Safely parse JSON response
                        import json as json_module
                        ai_response = result.get('response', '{}')
                        if ai_response.startswith('{'):
                            ai_data = json_module.loads(ai_response)
                        else:
                            # Try eval as fallback
                            ai_data = eval(ai_response)
                            
                        if ai_data.get('alerted'):
                            email_record["type"] = "Alert"
                            email_record["reason"] = ai_data.get('reason', 'AI determined as urgent')
                        else:
                            email_record["type"] = "Non-urgent"
                            email_record["reason"] = ai_data.get('reason', 'AI determined as non-urgent')
                    except:
                        email_record["reason"] = "AI analysis completed"
            except Exception as e:
                email_record["reason"] = f"AI analysis failed: {str(e)}"
                print(f"❌ Failed to send to API: {e}")
        
        # Add to history
        email_history.append(email_record)
        print(f"✅ Email recorded: {subject} - Type: {email_record['type']}")
            
    except Exception as e:
        print(f"Error checking email: {e}")
    finally:
        # Ensure COM cleanup
        cleanup_outlook()

def email_monitor_loop():
    """Email monitoring loop"""
    while True:
        try:
            check_email_safe()
            time.sleep(1)  # 1 second interval
        except Exception as e:
            print(f"Monitoring loop error: {e}")
            time.sleep(5)  # Wait longer on error

# API Routes
@app.route('/api/emails', methods=['GET'])
def get_emails():
    """Get email history"""
    return jsonify({
        "status": "success",
        "count": len(email_history),
        "emails": email_history
    })

@app.route('/api/emails/latest', methods=['GET'])
def get_latest_emails():
    """Get latest emails (with optional count)"""
    count = request.args.get('count', default=10, type=int)
    latest_emails = email_history[-count:] if email_history else []
    return jsonify({
        "status": "success",
        "count": len(latest_emails),
        "emails": latest_emails
    })

@app.route('/api/emails/clear', methods=['POST'])
def clear_emails():
    """Clear email history"""
    global email_history
    email_history.clear()
    return jsonify({"status": "success", "message": "Email history cleared"})

# Sensitive Words API
@app.route('/api/sensitive_words', methods=['GET'])
def get_sensitive_words():
    """Get sensitive words list"""
    return jsonify({
        "status": "success",
        "default_words": SENSITIVE_WORDS,
        "custom_words": CUSTOM_SENSITIVE_WORDS,
        "all_words": SENSITIVE_WORDS + CUSTOM_SENSITIVE_WORDS
    })

@app.route('/api/sensitive_words', methods=['POST'])
def add_sensitive_word():
    """Add custom sensitive word"""
    global CUSTOM_SENSITIVE_WORDS
    
    data = request.get_json()
    if not data or 'word' not in data:
        return jsonify({"status": "error", "message": "Missing word parameter"}), 400
    
    word = data['word'].strip()
    if not word:
        return jsonify({"status": "error", "message": "Word cannot be empty"}), 400
    
    # Check if already exists
    all_words = SENSITIVE_WORDS + CUSTOM_SENSITIVE_WORDS
    if word.lower() in [w.lower() for w in all_words]:
        return jsonify({"status": "error", "message": "Word already exists"}), 400
    
    # Add to custom sensitive words list
    CUSTOM_SENSITIVE_WORDS.append(word)
    
    print(f"✅ Added custom sensitive word: {word}")
    print(f"   Current custom sensitive words: {CUSTOM_SENSITIVE_WORDS}")
    
    return jsonify({
        "status": "success", 
        "message": f"Added sensitive word: {word}",
        "custom_words": CUSTOM_SENSITIVE_WORDS
    })

@app.route('/api/sensitive_words', methods=['DELETE'])
def remove_sensitive_word():
    """Remove custom sensitive word"""
    global CUSTOM_SENSITIVE_WORDS
    
    data = request.get_json()
    if not data or 'word' not in data:
        return jsonify({"status": "error", "message": "Missing word parameter"}), 400
    
    word = data['word'].strip()
    
    # Remove from custom sensitive words list
    if word in CUSTOM_SENSITIVE_WORDS:
        CUSTOM_SENSITIVE_WORDS.remove(word)
        print(f"✅ Removed custom sensitive word: {word}")
        return jsonify({
            "status": "success", 
            "message": f"Removed sensitive word: {word}",
            "custom_words": CUSTOM_SENSITIVE_WORDS
        })
    else:
        return jsonify({"status": "error", "message": "Word not found"}), 404

@app.route('/api/sensitive_words/reset', methods=['POST'])
def reset_sensitive_words():
    """Reset custom sensitive words list"""
    global CUSTOM_SENSITIVE_WORDS
    CUSTOM_SENSITIVE_WORDS.clear()
    print("✅ Custom sensitive words list reset")
    return jsonify({"status": "success", "message": "Custom sensitive words list reset"})

# Watch Words API
@app.route('/api/watch_words', methods=['GET'])
def get_watch_words():
    """Get watch words list"""
    return jsonify({
        "status": "success",
        "watch_words": WATCH_WORDS
    })

@app.route('/api/watch_words', methods=['POST'])
def add_watch_word():
    """Add watch word"""
    global WATCH_WORDS
    
    data = request.get_json()
    if not data or 'word' not in data:
        return jsonify({"status": "error", "message": "Missing word parameter"}), 400
    
    word = data['word'].strip()
    if not word:
        return jsonify({"status": "error", "message": "Word cannot be empty"}), 400
    
    # Check if already exists
    if word.lower() in [w.lower() for w in WATCH_WORDS]:
        return jsonify({"status": "error", "message": "Word already exists"}), 400
    
    # Add to watch words list
    WATCH_WORDS.append(word)
    
    print(f"✅ Added watch word: {word}")
    print(f"   Current watch words: {WATCH_WORDS}")
    
    return jsonify({
        "status": "success", 
        "message": f"Added watch word: {word}",
        "watch_words": WATCH_WORDS
    })

@app.route('/api/watch_words', methods=['DELETE'])
def remove_watch_word():
    """Remove watch word"""
    global WATCH_WORDS
    
    data = request.get_json()
    if not data or 'word' not in data:
        return jsonify({"status": "error", "message": "Missing word parameter"}), 400
    
    word = data['word'].strip()
    
    # Remove from watch words list
    if word in WATCH_WORDS:
        WATCH_WORDS.remove(word)
        print(f"✅ Removed watch word: {word}")
        return jsonify({
            "status": "success", 
            "message": f"Removed watch word: {word}",
            "watch_words": WATCH_WORDS
        })
    else:
        return jsonify({"status": "error", "message": "Word not found"}), 404

@app.route('/api/watch_words/reset', methods=['POST'])
def reset_watch_words():
    """Reset watch words list"""
    global WATCH_WORDS
    WATCH_WORDS.clear()
    print("✅ Watch words list reset")
    return jsonify({"status": "success", "message": "Watch words list reset"})

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check"""
    return jsonify({
        "status": "healthy",
        "service": "Email Alert API",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_emails": len(email_history),
        "total_sensitive_words": len(SENSITIVE_WORDS + CUSTOM_SENSITIVE_WORDS),
        "total_watch_words": len(WATCH_WORDS)
    })

@app.route('/')
def home():
    """Home page"""
    return jsonify({
        "message": "Email Alert API is running",
        "endpoints": {
            "get_emails": "GET /api/emails",
            "get_latest": "GET /api/emails/latest?count=10",
            "clear_emails": "POST /api/emails/clear",
            "get_sensitive_words": "GET /api/sensitive_words",
            "add_sensitive_word": "POST /api/sensitive_words",
            "remove_sensitive_word": "DELETE /api/sensitive_words",
            "reset_sensitive_words": "POST /api/sensitive_words/reset",
            "get_watch_words": "GET /api/watch_words",
            "add_watch_word": "POST /api/watch_words",
            "remove_watch_word": "DELETE /api/watch_words",
            "reset_watch_words": "POST /api/watch_words/reset",
            "health": "GET /api/health"
        }
    })

if __name__ == "__main__":
    print("🚀 Starting Email Alert API...")
    print("   📧 Email monitoring running in background")
    print("   🔒 Default sensitive words:", SENSITIVE_WORDS)
    print("   👀 Watch words will be sent to AI as context")
    print("   🌐 API service running on http://localhost:3002")
    print("   📊 Visit http://localhost:3002/api/emails to view emails")
    print("   ⏹️  Press Ctrl+C to stop\n")
    
    # Start email monitoring thread
    monitor_thread = threading.Thread(target=email_monitor_loop)
    monitor_thread.daemon = True
    monitor_thread.start()
    
    # Start Flask server
    app.run(host='0.0.0.0', port=3002, debug=False)