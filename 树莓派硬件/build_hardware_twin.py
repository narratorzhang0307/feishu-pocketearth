#!/usr/bin/env python3
"""Build the self-contained Pocket Earth Frost Edge review twin."""

from __future__ import annotations

import base64
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREENS = Path(__file__).resolve().parent / "真实Whisplay界面"
OUTPUTS = (
    Path(__file__).resolve().parent / "Pocket_Earth_Frost_Edge_数字孪生_单文件版.html",
    ROOT / "public" / "hardware-digital-twin.html",
)

SCREEN_FILES = {
    "home": "01_PI_HOME_三项目入口.png",
    "podcast-modes": "02_口袋播客_模式选择.png",
    "podcast": "03_口袋播客_真实核验内容.png",
    "reading": "04_口袋播客_文字与Agent空间.png",
    "sunset-modes": "05_日落电台_三模式.png",
    "songs": "06_日落电台_歌曲目录.png",
    "sunsets": "07_日落电台_真实日落时刻.png",
    "dice": "08_日落电台_随机骰子结果.png",
    "answer-idle": "09_地球答案_每日一次.png",
    "answer": "10_地球答案_揭晓与回看.png",
    "agents": "11_Frost_Agent_公共知识入口.png",
    "verify": "12_Gemini双角色事实核验.png",
}


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    screen_data = {key: data_uri(SCREENS / filename) for key, filename in SCREEN_FILES.items()}
    payload = json.dumps(screen_data, ensure_ascii=False, separators=(",", ":"))
    return r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pocket Earth · Frost Edge 数字孪生</title>
<style>
:root{--ink:#08090a;--paper:#f3efe5;--paper2:#dfdbd0;--green:#00f48b;--orange:#ff7e34;--cyan:#1ecaff;--magenta:#ff14c7;--muted:#8e938f;--line:#262a28;--panel:#111513}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#080b09;color:var(--paper);font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif}body{background-image:linear-gradient(rgba(0,244,139,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,244,139,.035) 1px,transparent 1px);background-size:32px 32px}.mono{font-family:"SFMono-Regular",Menlo,Consolas,monospace;letter-spacing:.06em}.shell{max-width:1500px;margin:auto;padding:24px}.mast{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid var(--green);padding:8px 0 18px;gap:20px}.mast h1{font-size:clamp(26px,3vw,48px);line-height:.95;margin:0;text-transform:uppercase;letter-spacing:.03em}.mast h1 span{color:var(--green)}.mast p{margin:8px 0 0;color:#aeb6b1}.live{border:1px solid var(--green);padding:9px 12px;color:var(--green);white-space:nowrap;background:#07130d}.grid{display:grid;grid-template-columns:minmax(250px,.8fr) minmax(420px,1.25fr) minmax(280px,.9fr);gap:16px;margin-top:16px}.panel{border:1px solid #39433d;background:rgba(12,16,14,.95);box-shadow:0 14px 40px rgba(0,0,0,.25)}.panel-title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #39433d;padding:13px 15px;font-size:12px;color:#a6afa9}.panel-title strong{color:var(--paper);font-size:14px}.stack{padding:14px}.card{border:1px solid #39433d;background:#0b0e0c;margin-bottom:10px;padding:14px;position:relative}.card:before{content:"";position:absolute;left:-1px;top:-1px;width:4px;height:calc(100% + 2px);background:var(--accent,var(--green))}.tag{font-size:10px;color:var(--accent,var(--green));text-transform:uppercase}.card h3{font-size:16px;margin:8px 0 5px}.card p{font-size:12px;color:#9ba39e;line-height:1.6;margin:0}.metric{display:flex;justify-content:space-between;margin-top:12px;font-size:11px}.metric b{color:var(--green)}.route{padding:14px;border-top:1px solid #39433d}.route ol{padding-left:22px;margin:10px 0 0}.route li{font-size:12px;color:#aab2ad;margin:9px 0}.route li.active{color:var(--green)}
.stage{min-height:730px;padding:18px;display:flex;flex-direction:column;align-items:center;overflow:hidden}.project-nav{display:flex;gap:7px;width:100%;margin-bottom:16px;flex-wrap:wrap;justify-content:center}.project-nav button,.subnav button{border:1px solid #47534b;background:#0b0e0c;color:#bbc2bd;padding:9px 12px;cursor:pointer;font:11px var(--mono,monospace)}button:hover,button.active{border-color:var(--green);color:var(--green);background:#092018}.device-wrap{position:relative;width:min(100%,520px);height:560px;display:flex;align-items:center;justify-content:center}.device-shadow{position:absolute;width:330px;height:55px;border-radius:50%;background:rgba(0,0,0,.55);filter:blur(18px);bottom:11px}.device{position:relative;width:330px;height:512px;border-radius:42px;background:linear-gradient(145deg,#fff8e9 0%,#e7dac3 62%,#c8b69f 100%);border:5px solid #161513;box-shadow:inset 0 0 0 3px #f8f0df,inset -18px -18px 34px rgba(97,66,33,.16),18px 26px 0 #050605,0 38px 80px rgba(0,0,0,.6)}.device:before{content:"FROST EDGE";position:absolute;top:18px;left:32px;color:#292622;font:700 12px monospace;letter-spacing:.12em}.screen-bezel{position:absolute;left:48px;top:48px;width:234px;height:272px;background:#050605;border:7px solid #171513;border-radius:14px;box-shadow:inset 0 0 0 2px #493c2d}.screen-bezel img{display:block;width:220px;height:256px;object-fit:fill;border-radius:5px}.speaker{position:absolute;left:45px;bottom:56px;width:142px;height:96px;border:2px solid #8a7b69;border-radius:12px;background:radial-gradient(circle,#443f37 2px,transparent 3px);background-size:13px 13px}.camera{position:absolute;right:36px;bottom:134px;width:79px;height:79px;background:linear-gradient(145deg,#ff8b3f,#d5541d);border:4px solid #5b2b16;border-radius:18px;box-shadow:inset 0 0 0 3px rgba(255,255,255,.16)}.camera:before{content:"";position:absolute;width:40px;height:28px;background:#090909;border-radius:8px;left:16px;top:12px;box-shadow:inset 0 0 0 5px #222}.button{position:absolute;right:45px;bottom:67px;width:58px;height:47px;border-radius:12px;background:linear-gradient(#ff8f43,#df5b1e);border:3px solid #7b3519;cursor:pointer;box-shadow:inset 0 0 0 2px rgba(255,255,255,.18)}.button:active{transform:translateY(2px)}.led{position:absolute;bottom:24px;right:42px;width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 14px var(--green)}.subnav{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:12px}.caption{font-size:11px;color:#8f9892;margin-top:11px;text-align:center}.trace{padding:12px}.trace-row{display:grid;grid-template-columns:62px 1fr;gap:10px;padding:11px 4px;border-bottom:1px solid #273029}.trace-row time{font:10px monospace;color:#68736c}.trace-row b{display:block;font-size:12px;color:#dce1dd}.trace-row span{font-size:11px;color:#8d9790;line-height:1.45}.trace-row.on b{color:var(--green)}.boundary{margin:12px;border:1px solid #3f5046;background:#0a1510;padding:14px}.boundary h3{font-size:13px;color:var(--green);margin:0 0 10px}.boundary ul{padding-left:18px;margin:0}.boundary li{font-size:11px;color:#a7b0aa;margin:7px 0;line-height:1.45}.truth{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px}.truth div{border:1px solid #37423b;padding:10px 6px;text-align:center}.truth strong{display:block;font:18px monospace;color:var(--green)}.truth span{font-size:9px;color:#929a95}.foot{border-top:1px solid #39433d;margin-top:16px;padding-top:14px;display:flex;justify-content:space-between;gap:20px;font-size:11px;color:#7e8982}.foot b{color:#b7c0ba}@media(max-width:1100px){.grid{grid-template-columns:1fr 1.5fr}.right{grid-column:1/-1}.stage{min-height:650px}}@media(max-width:760px){.shell{padding:12px}.mast{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.stage{min-height:620px}.device-wrap{transform:scale(.9);height:520px}.right{grid-column:auto}.foot{flex-direction:column}}
</style>
</head>
<body>
<main class="shell">
  <header class="mast"><div><h1>POCKET EARTH <span>· FROST EDGE</span></h1><p>Google AI 软硬件共生数字孪生 · 单文件离线审核版</p></div><div class="live mono">● REVIEW TWIN · NO LOGIN</div></header>
  <section class="grid">
    <aside class="panel">
      <div class="panel-title mono"><strong>GOOGLE AI STACK</strong><span>EDGE → CLOUD</span></div>
      <div class="stack">
        <article class="card" style="--accent:var(--green)"><span class="tag mono">LOCAL · LOOPBACK</span><h3>Gemma 4 E4B IT</h3><p>QAT Q4_0 权重由 llama-server 仅绑定 127.0.0.1。负责受限意图分类、候选排序和隐私敏感的本地选择。</p><div class="metric"><span>MODEL</span><b>GOOGLE · ~5.15 GB</b></div></article>
        <article class="card" style="--accent:var(--cyan)"><span class="tag mono">COMPLEX · CONSENTED</span><h3>Gemini Flash</h3><p>复杂多语理解与跨文化生成经 Pocket Earth 服务端调用。官方 Gemini API 优先；GMI 只作为 Google 模型备用传输。</p><div class="metric"><span>OWNER</span><b>GOOGLE</b></div></article>
        <article class="card" style="--accent:var(--orange)"><span class="tag mono">DEVICE BOUNDARY</span><h3>Public-only Edge</h3><p>硬件只接收白名单公共事件和缓存，不接触私人原文、原图、完整画像、精确坐标或云密钥。</p></article>
      </div>
      <div class="route"><span class="mono tag">HARNESS ROUTE</span><ol id="route"><li class="active">规则快路</li><li>Gemma 端侧判断</li><li>隐私护栏与同意</li><li>Gemini 复杂生成</li><li>Validator / Critic</li><li>Confirm Gate / RunTrace</li></ol></div>
    </aside>

    <section class="panel stage">
      <div class="project-nav mono" id="projectNav">
        <button data-screen="home" class="active">PI HOME</button>
        <button data-screen="podcast-modes">口袋播客</button>
        <button data-screen="sunset-modes">日落电台</button>
        <button data-screen="answer-idle">地球答案</button>
        <button data-screen="agents">FROST-AGENT</button>
      </div>
      <div class="device-wrap">
        <div class="device-shadow"></div>
        <div class="device">
          <div class="screen-bezel"><img id="deviceScreen" alt="真实 Whisplay 界面"></div>
          <div class="speaker"></div><div class="camera"></div><button class="button" id="orangeButton" aria-label="橙色硬件按钮"></button><div class="led"></div>
        </div>
      </div>
      <div class="subnav mono" id="subnav"></div>
      <div class="caption mono" id="caption">生产渲染函数 · 240×280 · CLICK / HOLD / 2X</div>
    </section>

    <aside class="panel right">
      <div class="panel-title mono"><strong>RUNTRACE</strong><span id="traceStatus">LOCAL READY</span></div>
      <div class="trace" id="trace">
        <div class="trace-row on"><time>00.000</time><div><b>规则快路</b><span>项目入口与确定性按钮映射在设备内完成。</span></div></div>
        <div class="trace-row"><time>00.018</time><div><b>Gemma 4 E4B</b><span>只处理受限分类；端点为本机 loopback。</span></div></div>
        <div class="trace-row"><time>00.031</time><div><b>Boundary</b><span>公共白名单通过；私人字段拒绝进入设备事件。</span></div></div>
        <div class="trace-row"><time>—</time><div><b>Gemini</b><span>当前界面无需云端；复杂任务须用户明确同意。</span></div></div>
      </div>
      <div class="boundary"><h3 class="mono">PRIVACY BOUNDARY</h3><ul><li>原始照片与私人记忆留在个人地球。</li><li>云端图片理解必须二次说明用途与 provider。</li><li>模型只能生成草稿，无权自动写地球或驱动硬件。</li><li>断网使用规则、本地目录与上一份有效公共缓存。</li></ul></div>
      <div class="truth"><div><strong>3</strong><span>PHYSICAL MODES</span></div><div><strong>12</strong><span>REAL SCREENS</span></div><div><strong>0</strong><span>CLOUD KEYS ON PI</span></div></div>
    </aside>
  </section>
  <footer class="foot"><span><b>审核口径：</b>本页是 Frost Edge 补充证据，可离线双击，也可部署到正式域名独立路径。</span><span class="mono">POCKET EARTH · GOOGLE AI · 2026</span></footer>
</main>
<script>
const screens=__SCREEN_DATA__;
const flows={
 home:[['home','PI HOME']],
 'podcast-modes':[['podcast-modes','模式'],['podcast','核验播客'],['reading','文字 / AGENTS'],['verify','事实核验']],
 'sunset-modes':[['sunset-modes','模式'],['songs','歌曲目录'],['sunsets','日落时刻'],['dice','随机骰子']],
 'answer-idle':[['answer-idle','今日一次'],['answer','揭晓 / 回看']],
 agents:[['agents','公共知识入口'],['verify','Gemini 双角色']]
};
const captions={home:'三项目真实入口 · 默认选择口袋播客', 'podcast-modes':'口袋播客 · 播客模式与文字模式',podcast:'只播报经过交叉核验的公共知识',reading:'文字模式进入静默地球、AGENTS 与今日一页','sunset-modes':'日落电台 · 歌曲目录、真实日落与随机骰子',songs:'城市与曲目目录留在本地',sunsets:'真实城市日落时间与最近顺序',dice:'设备本地完成随机选择与播放入口','answer-idle':'每日一次 · 长按后才揭晓',answer:'只允许向历史回看，不提前暴露明天',agents:'Frost-Agent 公共知识与人格边界',verify:'Gemini Investigator / Skeptic + 确定性裁决 + 人工闸门'};
let current='home', root='home', step=0;
const screen=document.querySelector('#deviceScreen'),subnav=document.querySelector('#subnav'),caption=document.querySelector('#caption'),traceStatus=document.querySelector('#traceStatus');
function traceFor(key){const rows=document.querySelectorAll('.trace-row');rows.forEach((r,i)=>r.classList.toggle('on',i===0));if(['podcast','verify'].includes(key)){rows[1].classList.add('on');rows[2].classList.add('on');traceStatus.textContent='PUBLIC KNOWLEDGE';}else if(['answer-idle','answer'].includes(key)){rows[1].classList.add('on');traceStatus.textContent='LOCAL ONLY';}else{traceStatus.textContent='DEVICE ROUTE';}}
function show(key){current=key;screen.src=screens[key];caption.textContent=(captions[key]||'真实 Whisplay 界面')+' · 240×280';traceFor(key);[...subnav.children].forEach(b=>b.classList.toggle('active',b.dataset.screen===key));}
function setFlow(key){root=key;step=0;subnav.innerHTML='';(flows[key]||[]).forEach(([id,label])=>{const b=document.createElement('button');b.textContent=label;b.dataset.screen=id;b.onclick=()=>{step=flows[key].findIndex(item=>item[0]===id);show(id)};subnav.appendChild(b)});show((flows[key]||[[key]])[0][0]);document.querySelectorAll('#projectNav button').forEach(b=>b.classList.toggle('active',b.dataset.screen===key));}
document.querySelectorAll('#projectNav button').forEach(b=>b.onclick=()=>setFlow(b.dataset.screen));
document.querySelector('#orangeButton').onclick=()=>{const flow=flows[root]||[[root]];step=(step+1)%flow.length;show(flow[step][0]);};
screen.onload=()=>screen.setAttribute('data-loaded','true');setFlow('home');
</script>
</body></html>'''.replace("__SCREEN_DATA__", payload)


def main() -> None:
    html = build()
    for output in OUTPUTS:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(html, encoding="utf-8")
        print(f"wrote {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
