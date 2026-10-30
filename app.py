import os, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()
app = FastAPI(title="RK Gold AI Scalper - Paper Trading")
app.mount("/static", StaticFiles(directory="static"), name="static")

TWELVE_KEY = os.getenv("TWELVE_DATA_API_KEY", "").strip()
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip()
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "").strip()
AI_MODEL = os.getenv("AI_MODEL", "").strip()

@app.get("/")
def home():
    return FileResponse("static/index.html")

@app.get("/api/status")
def status():
    return {
        "mode": "PAPER ONLY",
        "market_data_configured": bool(TWELVE_KEY),
        "ai_configured": bool(GEMINI_KEY or OPENAI_KEY),
        "server_time": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/candles")
def candles(interval: str = "1min", outputsize: int = 100):
    if interval not in ("1min", "1h"):
        raise HTTPException(400, "Allowed intervals: 1min, 1h")
    if not TWELVE_KEY:
        raise HTTPException(503, "Add TWELVE_DATA_API_KEY to .env to enable candle-based signals.")
    try:
        r = requests.get(
            "https://api.twelvedata.com/time_series",
            params={"symbol": "XAU/USD", "interval": interval, "outputsize": min(max(outputsize, 20), 500),
                    "apikey": TWELVE_KEY, "format": "JSON"},
            timeout=15
        )
        data = r.json()
        if "values" not in data:
            raise HTTPException(502, data.get("message", data.get("code", "Market-data provider error")))
        vals = [{
            "datetime": x.get("datetime"),
            "open": float(x["open"]), "high": float(x["high"]),
            "low": float(x["low"]), "close": float(x["close"])
        } for x in reversed(data["values"])]
        return {"symbol": "XAU/USD", "interval": interval, "values": vals,
                "provider_note": "Provider availability, delay and quotas depend on your Twelve Data plan."}
    except requests.RequestException as e:
        raise HTTPException(502, f"Market-data request failed: {e}")

@app.get("/api/news")
def news():
    feeds = [
        "https://www.cnbc.com/id/100003114/device/rss/rss.html",
        "https://www.investing.com/rss/news_301.rss"
    ]
    items = []
    for url in feeds:
        try:
            raw = requests.get(url, timeout=10, headers={"User-Agent": "RKGoldResearch/1.0"}).text
            root = ET.fromstring(raw)
            for node in root.findall(".//item")[:12]:
                title = node.findtext("title") or ""
                link = node.findtext("link") or ""
                pub = node.findtext("pubDate") or ""
                desc = node.findtext("description") or ""
                if title:
                    items.append({"title": title, "link": link, "published": pub, "summary": desc[:400]})
        except Exception:
            continue
    # Deduplicate by title
    seen, out = set(), []
    for item in items:
        if item["title"] not in seen:
            seen.add(item["title"]); out.append(item)
    return {"items": out[:20], "note": "Headlines are context, not trade signals. Feed availability varies."}

@app.post("/api/ai/analyze")
def ai_analyze(payload: dict):
    prompt = (
        "You are a cautious gold-market research assistant. This is educational paper trading only. "
        "Do not claim certainty or guarantee outcomes. Separate verified facts from interpretation. "
        "Explain how the supplied headlines and indicators might affect gold, list bullish and bearish "
        "factors, identify missing information, and say WAIT when evidence is mixed. Do not issue broker orders.\n\n"
        f"Market context: {payload.get('market', {})}\n"
        f"Headlines: {payload.get('news', [])}\n"
        f"Strategy: SMA4/SMA6; 1h context, 1m paper entry; TP +$0.10, SL -$0.90.\n"
    )
    try:
        if GEMINI_KEY:
            model = AI_MODEL or "gemini-2.0-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            r = requests.post(url, params={"key": GEMINI_KEY},
                json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=30)
            data = r.json()
            if r.status_code >= 400:
                raise Exception(data.get("error", {}).get("message", "Gemini request failed"))
            answer = data["candidates"][0]["content"]["parts"][0]["text"]
            return {"provider": "Gemini", "answer": answer}
        if OPENAI_KEY:
            model = AI_MODEL or "gpt-4o-mini"
            r = requests.post("https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_KEY}"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}],
                      "temperature": 0.2}, timeout=30)
            data = r.json()
            if r.status_code >= 400:
                raise Exception(data.get("error", {}).get("message", "OpenAI request failed"))
            return {"provider": "OpenAI", "answer": data["choices"][0]["message"]["content"]}
        return {"provider": "Offline", "answer":
            "AI is not configured yet. Add GEMINI_API_KEY or OPENAI_API_KEY to your private .env file, restart the server, and retry. The rule-based SMA analysis remains separate."}
    except Exception as e:
        raise HTTPException(502, f"AI analysis failed: {e}")
