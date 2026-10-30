
const $ = id => document.getElementById(id);
const state = { balance: 50, trades: [], candles: [], candles1h: [], news: [], signal: null, running: false, timer: null, lastBar: null, ai: null };
const money = n => (n < 0 ? "-$" : "$") + Math.abs(Number(n)).toFixed(2);
const today = () => new Date().toLocaleDateString();
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function save(){localStorage.setItem("rkGoldState",JSON.stringify({balance:state.balance,trades:state.trades,tp:$("tpInput").value,sl:$("slInput").value,target:$("targetInput").value,scale:$("scaleInput").value}));}
function load(){try{const x=JSON.parse(localStorage.getItem("rkGoldState")||"{}");if(Number.isFinite(+x.balance))state.balance=+x.balance;if(Array.isArray(x.trades))state.trades=x.trades;["tp","sl","target","scale"].forEach(k=>{if(x[k])$(k+"Input").value=x[k]})}catch(e){}}
function sma(arr,n){if(arr.length<n)return null;return arr.slice(-n).reduce((s,x)=>s+x.close,0)/n}
function calcSignal(){
 const m=state.candles,h=state.candles1h;if(m.length<8||h.length<8)return null;
 const c=m[m.length-1],prev=m[m.length-2], fast=sma(m,4),slow=sma(m,6);
 const pf=sma(m.slice(0,-1),4),ps=sma(m.slice(0,-1),6);
 const hf=sma(h,4),hs=sma(h,6);
 const bias=hf>hs?"BUY":hf<hs?"SELL":"NEUTRAL";
 const cross=pf<=ps&&fast>slow?"BUY":pf>=ps&&fast<slow?"SELL":"NONE";
 const body=Math.abs(c.close-c.open),upper=c.high-Math.max(c.open,c.close),lower=Math.min(c.open,c.close)-c.low;
 const wick=Math.max(upper,lower),liquidity=wick>Math.max(body*1.8,0.12);
 let side=(cross===bias&&bias!=="NEUTRAL")?cross:"WAIT";
 let score=side==="WAIT"?0:70+(liquidity?10:0);
 return {side,bias,cross,liquidity,score,price:c.close,time:c.datetime,fast,slow};
}
async function fetchCandles(){
 try{
  const [m,h]=await Promise.all([fetch("/api/candles?interval=1min&outputsize=100"),fetch("/api/candles?interval=1h&outputsize=100")]);
  if(!m.ok)throw new Error((await m.json()).detail||"1m data unavailable");
  if(!h.ok)throw new Error((await h.json()).detail||"1h data unavailable");
  state.candles=(await m.json()).values;state.candles1h=(await h.json()).values;
  $("feedStatus").textContent="Market data: connected";$("feedStatus").className="positive";
  state.signal=calcSignal();renderSignal();
  const key=state.candles.at(-1)?.datetime;
  if(key&&key!==state.lastBar){state.lastBar=key;if(state.running&&$("autoMode").checked)maybeAutoTrade();}
 }catch(e){$("feedStatus").textContent="Market data: "+e.message;$("feedStatus").className="negative";$("signalReason").textContent="Add a Twelve Data API key to enable the bot's candle calculations."}
}
function renderSignal(){
 const s=state.signal;if(!s)return;
 $("signalSide").textContent=s.side;$("signalSide").style.color=s.side==="BUY"?"var(--green)":s.side==="SELL"?"var(--red)":"var(--gold)";
 $("signalReason").textContent=`Last completed data point ${s.time||""} · close ${s.price.toFixed(2)}`;
 $("hourBias").textContent=s.bias;$("minuteCross").textContent=s.cross;$("liquidityFlag").textContent=s.liquidity?"Possible wick sweep":"Not detected";$("signalStrength").textContent=s.score+" / 100";
}
function render(){
 const closed=state.trades.filter(t=>t.status==="CLOSED"),wins=closed.filter(t=>t.pnl>0),losses=closed.filter(t=>t.pnl<0);
 const pnl=closed.filter(t=>new Date(t.closedAt).toLocaleDateString()===today()).reduce((a,t)=>a+t.pnl,0);
 $("balanceValue").textContent=money(state.balance);$("balanceInput").value=state.balance.toFixed(2);
 $("dailyPnl").textContent=money(pnl);$("dailyPnl").className="metric-value "+(pnl>=0?"positive":"negative");
 $("dailyCount").textContent=closed.filter(t=>new Date(t.closedAt).toLocaleDateString()===today()).length+" closed trades today";
 $("winRate").textContent=closed.length?(wins.length/closed.length*100).toFixed(1)+"%":"—";$("winCount").textContent=`${wins.length} wins · ${losses.length} losses`;
 $("totalTrades").textContent=closed.length;$("wins").textContent=wins.length;$("losses").textContent=losses.length;$("netPnl").textContent=money(closed.reduce((a,t)=>a+t.pnl,0));
 const target=+ $("targetInput").value||100;const pct=Math.max(0,Math.min(100,pnl/target*100));$("targetProgress").style.width=pct+"%";$("targetLabel").textContent=pct.toFixed(1)+"% of daily target";
 const rows=closed.slice().reverse().slice(0,40);
 $("tradeRows").innerHTML=rows.length?rows.map(t=>`<tr><td>${new Date(t.closedAt).toLocaleString()}</td><td>${t.side}</td><td>${Number(t.entry).toFixed(2)}</td><td>${Number(t.exit).toFixed(2)}</td><td class="${t.pnl>=0?"positive":"negative"}">${money(t.pnl)}</td><td>${t.reason}</td></tr>`).join(""):`<tr><td colspan="6" class="empty">No paper trades yet.</td></tr>`;
 if(closed.length>=4){const last=closed.slice(-4),wr=last.filter(t=>t.pnl>0).length/4*100;const bySide=["BUY","SELL"].map(s=>`${s}: ${last.filter(t=>t.side===s&&t.pnl>0).length}/${last.filter(t=>t.side===s).length}`).join(" · ");$("learningText").textContent=`Last 4 closed trades: ${wr.toFixed(0)}% wins. ${bySide}. These are observations only; review the sample size before changing any rule. Your SMA settings and risk limits have not been modified.`}
 save();
}
function openPaper(side,price,reason){
 const tp=+$("tpInput").value,sl=+$("slInput").value;
 if(!(tp>0&&sl>0)){toast("TP and SL must be positive.");return}
 const trade={id:crypto.randomUUID(),side,entry:price,exit:null,pnl:0,reason,status:"OPEN",openedAt:new Date().toISOString(),tp,sl};
 state.trades.push(trade);toast(`${side} paper position opened at ${price.toFixed(2)}`);render();
}
function closePaper(t,exit,pnl,reason){
 t.exit=exit;t.pnl=pnl;t.reason=reason;t.status="CLOSED";t.closedAt=new Date().toISOString();state.balance+=pnl;render();
}
function maybeAutoTrade(){
 const s=state.signal;if(!s||s.side==="WAIT")return;
 if(state.trades.some(t=>t.status==="OPEN"))return;
 if(s.score>=70)openPaper(s.side,s.price,"SMA4/6 + 1H context");
 if(s.liquidity&&$("liquidityMode").checked){openPaper(s.side==="BUY"?"SELL":"BUY",s.price,"Liquidity dual-side heuristic");}
}
async function simulateOpenPositions(){
 if(!state.candles.length)return;
 const price=state.candles.at(-1).close,scale=+$("scaleInput").value||1;
 state.trades.filter(t=>t.status==="OPEN").forEach(t=>{
  const favorable=(price-t.entry)*(t.side==="BUY"?1:-1);
  const pnl=favorable*scale;
  if(pnl>=t.tp)closePaper(t,price,t.tp,"Take profit hit");
  else if(pnl<=-t.sl)closePaper(t,price,-t.sl,"Stop loss hit");
 });
}
async function refreshNews(){
 $("newsList").innerHTML='<div class="empty">Fetching headlines…</div>';
 try{const r=await fetch("/api/news");const d=await r.json();state.news=d.items||[];
 $("newsList").innerHTML=state.news.length?state.news.map(n=>`<div class="news-item"><a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a><small>${escapeHtml(n.published||"Recent feed item")}</small></div>`).join(""):'<div class="empty">No RSS headlines available right now.</div>';
 }catch(e){$("newsList").innerHTML='<div class="empty">News feed unavailable. Check your internet connection.</div>'}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function askAI(){
 $("aiAnswer").textContent="Preparing research brief…";
 try{const r=await fetch("/api/ai/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({market:state.signal||{},news:state.news.slice(0,8).map(n=>({title:n.title,published:n.published}))})});const d=await r.json();if(!r.ok)throw new Error(d.detail||"AI request failed");$("aiProvider").textContent=d.provider;$("aiAnswer").textContent=d.answer}
 catch(e){$("aiAnswer").textContent=e.message}
}
$("editBalance").onclick=()=>{const v=prompt("Set simulated account balance ($)",state.balance.toFixed(2));if(v!==null&&Number.isFinite(+v)&&+v>=0){state.balance=+v;render();toast("Paper balance updated.")}};
$("balanceInput").onchange=()=>{const v=+$("balanceInput").value;if(v>=0){state.balance=v;render()}};
$("startBot").onclick=()=>{state.running=true;toast("Paper bot started. No broker orders are possible.");fetchCandles();state.timer=setInterval(async()=>{await fetchCandles();await simulateOpenPositions()},15000)};
$("stopBot").onclick=()=>{state.running=false;if(state.timer)clearInterval(state.timer);toast("Paper bot paused.")};
$("refreshAnalysis").onclick=fetchCandles;
$("paperTrade").onclick=()=>{const s=state.signal;if(!s||s.side==="WAIT"){toast("No qualified signal. WAIT.");return}if(state.trades.some(t=>t.status==="OPEN")){toast("Close open paper positions first.");return}openPaper(s.side,s.price,"Manual approval · SMA signal")};
$("loadNews").onclick=refreshNews;$("askAI").onclick=askAI;
["tpInput","slInput","targetInput","scaleInput"].forEach(id=>$(id).onchange=()=>{save();render()});
$("exportCsv").onclick=()=>{const rows=[["openedAt","closedAt","side","entry","exit","pnl","reason"],...state.trades.filter(t=>t.status==="CLOSED").map(t=>[t.openedAt,t.closedAt,t.side,t.entry,t.exit,t.pnl,t.reason])];const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="rk-gold-paper-journal.csv";a.click();URL.revokeObjectURL(a.href)};
$("clearHistory").onclick=()=>{if(confirm("Delete all locally stored paper-trade history?")){state.trades=[];render();toast("History cleared.")}};
$("clock").textContent=new Date().toLocaleTimeString();
setInterval(()=>$("clock").textContent=new Date().toLocaleTimeString(),1000);
load();render();refreshNews();fetch("/api/status").then(r=>r.json()).then(s=>{if(s.market_data_configured)$("feedStatus").textContent="Market data: key configured";if(s.ai_configured)$("aiProvider").textContent="API configured"}).catch(()=>{});
