# RK Gold AI Scalper — Paper Trading Edition

A local-first XAUUSD research and paper-trading dashboard. It does **not** connect to a broker or place real orders.

## Included
- TradingView XAUUSD chart embed (chart display only; TradingView's iframe does not expose its feed to this app).
- Optional Twelve Data market-data adapter for machine-readable candles.
- 1H context + 1M SMA(4)/SMA(6) signal logic.
- Gold-news RSS reader.
- Optional Gemini or OpenAI analysis endpoint.
- Paper trade journal, balance editing, daily P&L and win-rate statistics stored in browser localStorage.
- Learning review based on completed paper trades. It summarizes patterns; it does not rewrite its own strategy.

## Important risk note
The requested +$0.10 take-profit and -$0.90 stop-loss have a 9:1 loss-to-reward ratio before spreads, fees and slippage. The dashboard displays this prominently. A $100 daily target is a user-defined tracking target, not a forecast or guarantee.

## Requirements
- Python 3.10+
- Internet connection for live chart/news/market data
- API keys are optional. Twelve Data is needed for the app's own candle-based signals. Check its current free-tier limits and symbol availability.

## Run on Windows
1. Extract the ZIP.
2. Open PowerShell in the extracted folder.
3. Create a virtual environment:
   ```powershell
   py -m venv .venv
   .\\.venv\\Scripts\\Activate.ps1
   ```
4. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
5. Copy `.env.example` to `.env` and add keys if you have them.
6. Start:
   ```powershell
   uvicorn app:app --reload
   ```
7. Open http://127.0.0.1:8000

## API setup
- `TWELVE_DATA_API_KEY`: optional market-data key. The app requests XAU/USD 1min and 1h candles. Verify that your plan supports the symbol and intervals.
- `GEMINI_API_KEY`: optional. If supplied, Gemini is used for news/context summaries.
- `OPENAI_API_KEY`: optional. If supplied, OpenAI is used when Gemini is not configured.
- `AI_MODEL`: optional model name. Defaults are conservative placeholders; set a model available to your account.

Never paste API keys into frontend JavaScript or publish `.env` to GitHub.

## Strategy implementation
- SMA 4 / SMA 6 are calculated from completed 1-minute candles.
- 1-hour SMA 4 / SMA 6 gives directional context.
- A signal is generated when the 1m averages cross and the 1h context agrees.
- "Strong signal" is a stricter score threshold, not permission to bypass risk controls.
- A simple long-wick candle flag marks a possible liquidity sweep. It is only a heuristic, not proof of institutional liquidity.
- The dashboard defaults to manual paper-trade approval. Enable auto paper mode only after reviewing the logic.

## Paper P&L calibration
Paper P&L uses a configurable **virtual dollar value per $1.00 XAUUSD price move**. This is only a simulator parameter. Set it to match the contract/lot assumptions you want to test. It is not a broker quote or guaranteed representation of MT5/TradingView P&L.

## Safety
- Demo simulation only. No broker credentials, order endpoints or live execution code are included.
- Keep the stop-loss enabled in the simulator.
- Test with historical data and paper trades before drawing conclusions.
