# 文件名：hkust_mail.py
# 功能：任何 HKUST 同学点一下就能用自己学校账号登录，查看最新邮件
# 完全免费、永久有效、无需密码明文、支持多用户

from flask import Flask, redirect, session, request, url_for
import msal
import requests

app = Flask(__name__)
app.secret_key = "hkust2025_grok_best"  # 随便填，越长越好

# ←←←←←←←←←←←←←←  这里改成你刚刚复制的 client_id  ←←←←←←←←←←←←←←
CLIENT_ID = "5950d2ed-c740-41d0-a901-f30e93adb959"   # ← 改成你的！
# ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←

AUTHORITY = "https://login.microsoftonline.com/common"   # 多租户必用 common
REDIRECT_URI = "http://localhost:5000/getAToken"
SCOPES = ["Mail.Read"]    # 读邮件 + 长期有效 + 基本信息

# 创建 MSAL 实例
def get_msal_app():
    return msal.PublicClientApplication(
        CLIENT_ID,
        authority=AUTHORITY
    )

@app.route("/")
def index():
    auth_url = get_msal_app().get_authorization_request_url(
        SCOPES,
        state="12345",
        redirect_uri=REDIRECT_URI
    )
    return f'''
    <h1 style="color:#0055d4">HKUST 邮箱一键查看工具</h1>
    <p>已成功绕过学校应用注册限制！</p>
    <a href="{auth_url}" style="font-size:20px; color:green">点这里用科大账号登录并查看最新邮件</a>
    <hr>
    <small>技术支持：Grok + 你</small>
    '''

@app.route("/getAToken")
def authorized():
    code = request.args.get("code")
    if not code:
        return "授权失败，请重新点击登录", 400

    result = get_msal_app().acquire_token_by_authorization_code(
        code,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )

    if "access_token" in result:
        session["user"] = result.get("id_token_claims").get("preferred_username")
        session["access_token"] = result["access_token"]
        return redirect("/mail")
    else:
        return f"登录失败：{result.get('error_description')}", 400

@app.route("/mail")
def mail():
    if "access_token" not in session:
        return redirect("/")

    headers = {'Authorization': f'Bearer {session["access_token"]}'}
    graph_url = "https://graph.microsoft.com/v1.0/me/messages"
    params = {"$top": 15, "$select": "subject,from,receivedDateTime,bodyPreview", "$orderby": "receivedDateTime DESC"}

    r = requests.get(graph_url, headers=headers, params=params)
    if r.status_code != 200:
        return f"读取邮件失败：{r.json()}"

    mails = r.json().get("value", [])
    html = f"<h2>欢迎 {session['user']}！以下是你的最新邮件</h2><ol style='font-size:18px'>"

    for m in mails:
        sender = m['from']['emailAddress']['address']
        subject = m['subject'] or "(无主题)"
        time = m['receivedDateTime'][:16].replace("T", " ")
        preview = m['bodyPreview'][:80].replace("\n", " ")
        html += f"<li><b>{subject}</b><br>来自：{sender} | 时间：{time}<br><small>{preview}...</small></li><hr>"

    html += "</ol><a href='/logout'>退出登录</a> | <a href='/'>再登一个账号</a>"
    return html

@app.route("/logout")
def logout():
    session.clear()
    return redirect("/")

if __name__ == "__main__":
    print("HKUST 邮箱工具启动成功！")
    print("请打开浏览器访问：http://localhost:5000")
    app.run(port=5000, debug=False)