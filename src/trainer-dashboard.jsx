import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

// ─── Firebase sync helpers ────────────────────────────────────
async function fbSave(client) {
  try {
    const clean = JSON.parse(JSON.stringify(client));
    await setDoc(doc(db, "clients", String(client.id)), clean);
  } catch(e) { console.error("fbSave error", e); }
}
async function fbDelete(id) {
  try { await deleteDoc(doc(db, "clients", String(id))); } catch(e) {}
}

// ─── STRENGTH STANDARDS ───────────────────────────────────────
const STANDARDS = {
  "Bench Press":    { male:[0.5,0.75,1.0,1.25,1.5],  female:[0.25,0.4,0.6,0.8,1.0] },
  "Squat":          { male:[0.75,1.0,1.25,1.5,1.75],  female:[0.5,0.75,1.0,1.25,1.5] },
  "Deadlift":       { male:[1.0,1.25,1.5,1.75,2.0],   female:[0.75,1.0,1.25,1.5,1.75] },
  "Shoulder Press": { male:[0.35,0.5,0.65,0.8,1.0],   female:[0.2,0.3,0.45,0.6,0.75] },
  "Pull-up":        { male:[0.5,0.75,1.0,1.25,1.5],   female:[0.2,0.4,0.6,0.8,1.0] },
  "Barbell Row":    { male:[0.5,0.75,1.0,1.25,1.5],   female:[0.3,0.5,0.7,0.9,1.1] },
  "Leg Press":      { male:[1.5,2.0,2.5,3.0,3.5],     female:[1.0,1.5,2.0,2.5,3.0] },
  "Bicep Curl":     { male:[0.2,0.3,0.4,0.55,0.7],    female:[0.1,0.2,0.3,0.4,0.5] },
};
const ageModifier = (age) => age>=50?0.90:age>=40?0.95:age<=22?0.97:1.0;
const LEVELS = ["Beginner","Novice","Intermediate","Advanced","Elite"];
const LEVEL_COLORS = ["#6b7280","#60a5fa","#34d399","#f59e0b","#f97316"];
const PR_POINTS = { "Beginner":10,"Novice":25,"Intermediate":50,"Advanced":100,"Elite":200 };
const EXERCISES = ["Bench Press","Squat","Deadlift","Shoulder Press","Pull-up","Barbell Row","Leg Press","Bicep Curl"];
const GOALS_LIST = ["ลดน้ำหนัก","เพิ่มกล้ามเนื้อ","เพิ่มความแข็งแรง","ออกกำลังกายเพื่อสุขภาพ","เพิ่มความฟิต"];
const CARDIO_TYPES = ["Burpees 3min","วิ่ง 1.6km (วินาที)","Push-up 1min","Plank (วินาที)"];
const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function getLevel(ex, gender, bw, age, kg) {
  const std=STANDARDS[ex]; if(!std||!bw) return null;
  const ratios=std[gender]||std.male, mod=ageModifier(age||25), ratio=kg/bw;
  let lvl=-1; for(let i=0;i<ratios.length;i++) if(ratio>=ratios[i]*mod) lvl=i;
  return { level:lvl, ratio:ratio.toFixed(2), targets:ratios.map(r=>+(r*mod*bw).toFixed(1)) };
}
function getBurpeeLevel(count, gender, age) {
  const tbl = gender==="female"
    ? (age<=30?[10,18,26,34]:age<=40?[8,15,22,30]:[6,12,18,25])
    : (age<=30?[15,25,35,45]:age<=40?[12,20,30,40]:[8,15,25,35]);
  let lvl=-1; for(let i=0;i<tbl.length;i++) if(count>=tbl[i]) lvl=i;
  return { level:lvl, nextTarget:lvl<tbl.length-1?tbl[lvl+1]:null };
}
function calcScores(c) {
  const bw=c.bodyStats.length?c.bodyStats[c.bodyStats.length-1].weight:null;
  const latBs=c.bodyStats[c.bodyStats.length-1], fstBs=c.bodyStats[0];
  let sp=0;
  EXERCISES.forEach(ex=>{
    const logs=c.strengthLogs.filter(l=>l.exercise===ex); if(!logs.length||!bw) return;
    const best=Math.max(...logs.map(l=>l.weight));
    const info=getLevel(ex,c.gender||"male",bw,c.age||25,best);
    if(info&&info.level>=0) for(let i=0;i<=info.level;i++) sp+=PR_POINTS[LEVELS[i]];
    const s=[...logs].sort((a,b)=>a.date.localeCompare(b.date)); let p=0;
    s.forEach(l=>{ if(l.weight>p){sp+=5;p=l.weight;} });
  });
  let bp=0;
  if(latBs&&fstBs&&latBs!==fstBs){
    const fd=fstBs.fat-latBs.fat, mg=latBs.muscle-fstBs.muscle;
    if(fd>0) bp+=Math.min(150,Math.floor(fd*15));
    if(mg>0) bp+=Math.min(150,Math.floor(mg*15));
  }
  if(latBs?.fat){ if(latBs.fat<10)bp+=50; else if(latBs.fat<15)bp+=30; else if(latBs.fat<20)bp+=15; }
  let cp=0;
  const bLogs=(c.cardioLogs||[]).filter(l=>l.type==="Burpees 3min");
  if(bLogs.length){ const best=Math.max(...bLogs.map(l=>l.value)); const lv=getBurpeeLevel(best,c.gender||"male",c.age||25); if(lv.level>=0)cp+=(lv.level+1)*50; }
  const bSorted=[...bLogs].sort((a,b)=>a.date.localeCompare(b.date)); let pp=0;
  bSorted.forEach(l=>{ if(l.value>pp){cp+=10;pp=l.value;} });
  return { total:sp+bp+cp, strengthPts:sp, bodyPts:bp, cardioPts:cp };
}
function getRank(pts) {
  if(pts>=900) return { rank:"LEGEND",   color:"#f97316", icon:"👑" };
  if(pts>=600) return { rank:"ELITE",    color:"#f59e0b", icon:"🥇" };
  if(pts>=350) return { rank:"ADVANCED", color:"#34d399", icon:"🏅" };
  if(pts>=150) return { rank:"NOVICE",   color:"#60a5fa", icon:"🔵" };
  return               { rank:"BEGINNER",color:"#6b7280", icon:"⬜" };
}

// ─── Bimonthly report generator ──────────────────────────────
// Returns array of 2-month periods from startDate to now
function getBimonthlyPeriods(startDate) {
  const start = new Date(startDate||"2025-01-01");
  const now = new Date();
  const periods = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= now) {
    const from = new Date(cur);
    const to = new Date(cur.getFullYear(), cur.getMonth()+2, 0); // end of 2nd month
    const toDisplay = to > now ? now : to;
    periods.push({
      key: `${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,"0")}`,
      label: `${TH_MONTHS[from.getMonth()]}–${TH_MONTHS[Math.min(from.getMonth()+1,11)]} ${from.getFullYear()}`,
      from: from.toISOString().slice(0,10),
      to: toDisplay.toISOString().slice(0,10),
    });
    cur.setMonth(cur.getMonth()+2);
  }
  return periods.reverse(); // newest first
}

function buildReport(client, period) {
  const inRange = (d) => d >= period.from && d <= period.to;
  // Body stats in period
  const bsAll = client.bodyStats.filter(s => inRange(s.date));
  const bsFirst = client.bodyStats.filter(s => s.date < period.from).slice(-1)[0] || bsAll[0];
  const bsLast  = bsAll[bsAll.length-1];
  // Strength PRs in period
  const prByEx = EXERCISES.map(ex => {
    const allLogs = client.strengthLogs.filter(l => l.exercise===ex);
    const prevBest = allLogs.filter(l=>l.date<period.from).reduce((m,l)=>Math.max(m,l.weight),0);
    const periodLogs = allLogs.filter(l=>inRange(l.date));
    const periodBest = periodLogs.reduce((m,l)=>Math.max(m,l.weight),0);
    return periodBest > 0 ? { ex, prevBest, periodBest, isPR: periodBest > prevBest } : null;
  }).filter(Boolean);
  // Cardio in period
  const bLogs = (client.cardioLogs||[]).filter(l=>l.type==="Burpees 3min"&&inRange(l.date));
  const prevBurpee = (client.cardioLogs||[]).filter(l=>l.type==="Burpees 3min"&&l.date<period.from).reduce((m,l)=>Math.max(m,l.value),0);
  const bestBurpee = bLogs.reduce((m,l)=>Math.max(m,l.value),0);
  // Score delta
  const scNow = calcScores(client);
  return { bsFirst, bsLast, bsAll, prByEx, bestBurpee, prevBurpee, scNow };
}

// ─── Target system ────────────────────────────────────────────
// target shape: { id, type:"weight"|"fat"|"muscle"|"strength"|"burpee", exercise?, value, deadline, note }
function calcTargetProgress(target, client) {
  const bw = client.bodyStats.length ? client.bodyStats[client.bodyStats.length-1].weight : null;
  const latBs = client.bodyStats[client.bodyStats.length-1];
  const fstBs = client.bodyStats[0];
  let current = null, start = null;
  if (target.type === "weight")    { current = latBs?.weight; start = fstBs?.weight; }
  if (target.type === "fat")       { current = latBs?.fat;    start = fstBs?.fat; }
  if (target.type === "muscle")    { current = latBs?.muscle; start = fstBs?.muscle; }
  if (target.type === "strength" && target.exercise) {
    const logs = client.strengthLogs.filter(l=>l.exercise===target.exercise);
    current = logs.length ? Math.max(...logs.map(l=>l.weight)) : 0;
    start = 0;
  }
  if (target.type === "burpee") {
    const logs = (client.cardioLogs||[]).filter(l=>l.type==="Burpees 3min");
    current = logs.length ? Math.max(...logs.map(l=>l.value)) : 0;
    start = 0;
  }
  if (current === null || current === undefined) return { pct:0, current:null, done:false };
  const goal = +target.value;
  // For weight/fat: lower is better; for others: higher is better
  const lowerBetter = target.type==="weight"||target.type==="fat";
  let pct = 0;
  if (lowerBetter) {
    if (start && start !== goal) pct = Math.min(100, Math.max(0, ((start-current)/(start-goal))*100));
    else pct = current <= goal ? 100 : 0;
  } else {
    if (goal > 0) pct = Math.min(100, (current/goal)*100);
  }
  const done = lowerBetter ? current <= goal : current >= goal;
  const daysLeft = target.deadline ? Math.ceil((new Date(target.deadline)-new Date())/(1000*60*60*24)) : null;
  return { pct: Math.round(pct), current, done, daysLeft };
}

// ─── Design tokens ────────────────────────────────────────────
const D = {
  bg:"#0D0D0D", card:"#161616", card2:"#1E1E1E", border:"#2A2A2A",
  orange:"#F97316", orange2:"#FB923C", orangeDim:"rgba(249,115,22,0.12)",
  text:"#F5F5F5", sub:"#888", dim:"#555",
};

// ─── Vector Logo ──────────────────────────────────────────────
function VectorLogo({ size=36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs><linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F97316"/><stop offset="100%" stopColor="#FDBA74"/>
      </linearGradient></defs>
      <polygon points="50,8 92,75 8,75" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
      <polygon points="50,30 72,60 50,82 28,60" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── UI helpers ───────────────────────────────────────────────
const inp = { background:"#1E1E1E", border:"1.5px solid #2A2A2A", borderRadius:10, padding:"10px 14px", color:D.text, fontSize:14, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box" };
function Inp(p) { return <input {...p} style={{...inp,...p.style}} onFocus={e=>e.target.style.borderColor=D.orange} onBlur={e=>e.target.style.borderColor="#2A2A2A"}/>; }
function Sel({children,...p}){ return <select {...p} style={{...inp,...p.style}}>{children}</select>; }
function Lbl({children}){ return <div style={{fontSize:11,color:D.sub,marginBottom:4,marginTop:12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>{children}</div>; }
function OBtn({children,onClick,style}){ return <button onClick={onClick} style={{background:`linear-gradient(135deg,${D.orange},#EA580C)`,color:"#fff",border:"none",borderRadius:12,padding:"12px 20px",fontWeight:700,fontSize:14,cursor:"pointer",width:"100%",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(249,115,22,0.3)",...style}}>{children}</button>; }
function GBtn({children,onClick,style}){ return <button onClick={onClick} style={{background:"transparent",color:D.orange,border:"1.5px solid #2A2A2A",borderRadius:12,padding:"10px 20px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",...style}}>{children}</button>; }
function Crd({children,style,onClick}){ return <div onClick={onClick} style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:16,padding:18,...style}}>{children}</div>; }
function LvBar({level,max=4}){ return <div style={{display:"flex",gap:3,marginTop:6}}>{Array.from({length:max+1},(_,i)=><div key={i} style={{flex:1,height:4,borderRadius:2,background:i<=level?LEVEL_COLORS[Math.min(i,LEVEL_COLORS.length-1)]:"#222"}}/>)}</div>; }

function Ring({pts,size=72}){
  const r=getRank(pts), pct=Math.min(1,pts/1000), R=size/2-5, circ=2*Math.PI*R;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={R} fill="none" stroke="#222" strokeWidth="5"/>
        <circle cx={size/2} cy={size/2} r={R} fill="none" stroke={r.color} strokeWidth="5" strokeDasharray={`${circ*pct} ${circ*(1-pct)}`} strokeLinecap="round"/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontSize:size>55?14:10,fontWeight:800,color:r.color,fontFamily:"monospace",lineHeight:1}}>{pts}</div>
        <div style={{fontSize:8,color:D.sub}}>pts</div>
      </div>
    </div>
  );
}

function MiniChart({data,color=D.orange,label}){
  if(!data||data.length<2) return <div style={{color:D.dim,fontSize:12,padding:"6px 0"}}>ต้องการข้อมูล 2 ครั้งขึ้นไป</div>;
  const vals=data.map(d=>d.value), mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
  const W=280,H=56, cx=i=>(i/(vals.length-1))*W, cy=v=>H-((v-mn)/rng)*(H-12)-6;
  const pts=vals.map((v,i)=>`${cx(i)},${cy(v)}`).join(" ");
  const area=`${cx(0)},${H} `+vals.map((v,i)=>`${cx(i)},${cy(v)}`).join(" ")+` ${cx(vals.length-1)},${H}`;
  const gid=`vg${color.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <div>
      {label&&<div style={{fontSize:11,color:D.sub,marginBottom:5,fontWeight:600}}>{label}</div>}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
        <polygon points={area} fill={`url(#${gid})`}/>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        {vals.map((v,i)=><g key={i}><circle cx={cx(i)} cy={cy(v)} r="4" fill={D.card} stroke={color} strokeWidth="2"/><text x={cx(i)} y={cy(v)-9} textAnchor="middle" fill={color} fontSize="9" fontWeight="700">{v}</text></g>)}
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:D.dim,marginTop:2}}><span>{data[0]?.date}</span><span>{data[data.length-1]?.date}</span></div>
    </div>
  );
}

function Screen({title,sub,onBack,children}){
  return (
    <div style={{minHeight:"100vh",background:D.bg,color:D.text,fontFamily:"'Sarabun',sans-serif",paddingBottom:80}}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet"/>
      <div style={{background:D.card,borderBottom:`1px solid ${D.border}`,padding:"14px 18px",position:"sticky",top:0,zIndex:30,display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:D.card2,border:`1px solid ${D.border}`,color:D.orange,cursor:"pointer",fontSize:18,width:36,height:36,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>
        <div style={{flex:1}}><div style={{fontSize:17,fontWeight:800,lineHeight:1.2}}>{title}</div>{sub&&<div style={{fontSize:11,color:D.sub,marginTop:1}}>{sub}</div>}</div>
        <VectorLogo size={28}/>
      </div>
      <div style={{padding:"20px 18px"}}>{children}</div>
    </div>
  );
}

function PhotoSection({photos=[],onAdd,onDelete,isAdmin=false}){
  const ref=useRef(); const [lbl,setLbl]=useState("before"); const [note,setNote]=useState("");
  const handle=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{onAdd({id:Date.now(),src:ev.target.result,label:lbl,note,date:new Date().toISOString().slice(0,10)});setNote("");};r.readAsDataURL(f);e.target.value="";};
  const bef=photos.filter(p=>p.label==="before"),aft=photos.filter(p=>p.label==="after");
  return (
    <div>
      {isAdmin&&<Crd style={{marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📸 อัปโหลดรูปภาพ</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>{["before","after"].map(l=><button key={l} onClick={()=>setLbl(l)} style={{flex:1,padding:"8px 0",borderRadius:10,border:`1.5px solid ${lbl===l?D.orange:D.border}`,cursor:"pointer",background:lbl===l?D.orange:"transparent",color:lbl===l?"#fff":D.sub,fontWeight:700,fontSize:13,fontFamily:"inherit"}}>{l==="before"?"Before":"After"}</button>)}</div>
        <Inp placeholder="หมายเหตุ" value={note} onChange={e=>setNote(e.target.value)} style={{marginBottom:12}}/>
        <input ref={ref} type="file" accept="image/*" onChange={handle} style={{display:"none"}}/>
        <OBtn onClick={()=>ref.current.click()}>+ เลือกรูปภาพ</OBtn>
      </Crd>}
      {(bef.length>0||aft.length>0)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {[["before","Before 📷",bef,"#F97316"],["after","After ✨",aft,"#34d399"]].map(([key,title,list,col])=>(
          <div key={key}>
            <div style={{fontSize:12,color:col,fontWeight:700,marginBottom:8,textAlign:"center"}}>{title}</div>
            {list.length===0&&<div style={{color:D.dim,fontSize:12,textAlign:"center",padding:"20px 0"}}>ยังไม่มีรูป</div>}
            {list.map(p=>(
              <div key={p.id} style={{position:"relative",borderRadius:12,overflow:"hidden",border:`1.5px solid ${col}40`,marginBottom:8}}>
                <img src={p.src} alt="" style={{width:"100%",display:"block"}}/>
                <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(0,0,0,0.7))",padding:"20px 8px 8px"}}><div style={{fontSize:10,color:"#aaa"}}>{p.date}</div>{p.note&&<div style={{fontSize:11,color:"#fff",fontWeight:600}}>{p.note}</div>}</div>
                {isAdmin&&<button onClick={()=>onDelete(p.id)} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.7)",border:"none",color:"#f87171",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>}
              </div>
            ))}
          </div>
        ))}
      </div>}
    </div>
  );
}

// ─── HYROX TAB ───────────────────────────────────────────────
const HYROX_LEVELS = [
  { label:"Finisher",    color:"#6b7280", time:"2:00:00+",  maxSec:999999 },
  { label:"Intermediate",color:"#60a5fa", time:"1:30–2:00", maxSec:7200 },
  { label:"Advanced",    color:"#34d399", time:"1:15–1:30", maxSec:5400 },
  { label:"Elite",       color:"#f97316", time:"<1:15",     maxSec:4500 },
];
const THRESHOLD_TABLE = [
  { level:"Beginner",    pace:">5:30 /km",    color:"#6b7280" },
  { level:"Intermediate",pace:"4:30–5:30 /km",color:"#60a5fa" },
  { level:"Advanced",    pace:"<4:30 /km",    color:"#34d399" },
];

function parsePace(str) {
  if (!str) return null;
  const parts = str.split(":");
  if (parts.length === 2) return parseInt(parts[0])*60 + parseInt(parts[1]);
  return null;
}
function secToTime(sec) {
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function getHyroxLevel(totalSec) {
  if (totalSec < 4500) return HYROX_LEVELS[3];
  if (totalSec < 5400) return HYROX_LEVELS[2];
  if (totalSec < 7200) return HYROX_LEVELS[1];
  return HYROX_LEVELS[0];
}
function analyzeAerobic(curr, prev) {
  if (!prev) return null;
  const currPace = parsePace(curr.pace), prevPace = parsePace(prev.pace);
  const paceImproved = currPace < prevPace;
  const paceSame = Math.abs(currPace - prevPace) <= 5;
  const hrLower = curr.hr < prev.hr;
  const hrMuch = curr.hr > prev.hr + 10;
  if (paceImproved && !hrMuch) return { icon:"✅", label:"Aerobic Improved", color:"#34d399", desc:`Pace เร็วขึ้น ${prevPace-currPace}วิ/km · HR ${hrLower?"ลดลง":"คงที่"}` };
  if (paceSame && hrLower) return { icon:"✅", label:"Efficiency Improved", color:"#60a5fa", desc:`Pace เท่าเดิม · HR ลดลง ${prev.hr-curr.hr} bpm` };
  if (paceImproved && hrMuch) return { icon:"⚠️", label:"Check Form / Overreaching", color:"#f59e0b", desc:"Pace เร็วขึ้นแต่ HR สูงมาก อาจ overreach" };
  return { icon:"➡️", label:"No Change", color:"#888", desc:"ยังไม่มีการเปลี่ยนแปลงที่ชัดเจน" };
}

function HyroxTab({ client, onUpdate, isAdmin=false }) {
  const hyrox = client.hyrox || { tests:[], raceGoalSec:"", raceLogs:[] };
  const [showTestForm, setShowTestForm] = useState(false);
  const [showRaceForm, setShowRaceForm] = useState(false);
  const [testForm, setTestForm] = useState({ date:"", type:"Running", pace:"", hr:"", rpe:"", note:"" });
  const [raceForm, setRaceForm] = useState({ date:"", totalTime:"", note:"" });
  const [goalInput, setGoalInput] = useState(hyrox.raceGoalSec||"");

  const saveTest = () => {
    if (!testForm.date||!testForm.pace||!testForm.hr) return;
    const updated = { ...hyrox, tests:[...(hyrox.tests||[]), {...testForm,hr:+testForm.hr,rpe:+testForm.rpe}].sort((a,b)=>a.date.localeCompare(b.date)) };
    onUpdate({...client, hyrox:updated});
    setTestForm({date:"",type:"Running",pace:"",hr:"",rpe:"",note:""});
    setShowTestForm(false);
  };
  const saveRace = () => {
    if (!raceForm.date||!raceForm.totalTime) return;
    const [h,m,s] = raceForm.totalTime.split(":").map(Number);
    const sec = (h||0)*3600+(m||0)*60+(s||0);
    const updated = { ...hyrox, raceLogs:[...(hyrox.raceLogs||[]),{...raceForm,totalSec:sec}].sort((a,b)=>a.date.localeCompare(b.date)) };
    onUpdate({...client,hyrox:updated});
    setRaceForm({date:"",totalTime:"",note:""});
    setShowRaceForm(false);
  };
  const saveGoal = () => {
    const [h,m,s] = goalInput.split(":").map(Number);
    const sec = (h||0)*3600+(m||0)*60+(s||0);
    onUpdate({...client, hyrox:{...hyrox,raceGoalSec:sec}});
  };

  const tests = hyrox.tests||[];
  const running = tests.filter(t=>t.type==="Running");
  const treadmill = tests.filter(t=>t.type==="Treadmill");
  const raceLogs = hyrox.raceLogs||[];
  const bestRace = raceLogs.length ? raceLogs.reduce((b,r)=>r.totalSec<b.totalSec?r:b) : null;
  const raceLevel = bestRace ? getHyroxLevel(bestRace.totalSec) : null;
  const goalSec = hyrox.raceGoalSec||0;

  return (
    <div>
      {/* Race Goal */}
      <Crd style={{marginBottom:14,background:"linear-gradient(135deg,#1A0A00,#161616)"}}>
        <div style={{fontWeight:700,fontSize:14,color:D.orange,marginBottom:10}}>🏁 เป้าหมายเวลา HYROX Race</div>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
          <Inp placeholder="1:30:00" value={goalInput} onChange={isAdmin?e=>setGoalInput(e.target.value):undefined} readOnly={!isAdmin} style={{flex:1}}/>
          {isAdmin&&<OBtn onClick={saveGoal} style={{width:"auto",padding:"10px 16px",flexShrink:0}}>บันทึก</OBtn>}
        </div>
        {goalSec>0&&<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {HYROX_LEVELS.map((lv,i)=>(
            <div key={i} style={{background:goalSec<=lv.maxSec?`${lv.color}22`:"rgba(255,255,255,0.03)",border:`1px solid ${goalSec<=lv.maxSec?lv.color:D.border}`,borderRadius:10,padding:"8px 12px",textAlign:"center",flex:1,minWidth:70}}>
              <div style={{fontSize:11,fontWeight:700,color:lv.color}}>{lv.label}</div>
              <div style={{fontSize:10,color:D.sub,marginTop:2}}>{lv.time}</div>
            </div>
          ))}
        </div>}
      </Crd>

      {/* Race Logs */}
      <Crd style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:14}}>🏆 Race Results</div>
          {isAdmin&&<OBtn onClick={()=>setShowRaceForm(!showRaceForm)} style={{width:"auto",padding:"7px 14px",fontSize:12}}>+ บันทึก Race</OBtn>}
        </div>
        {showRaceForm&&<div style={{background:D.card2,borderRadius:12,padding:14,marginBottom:12}}>
          <Lbl>วันที่</Lbl><Inp type="date" value={raceForm.date} onChange={e=>setRaceForm(f=>({...f,date:e.target.value}))}/>
          <Lbl>เวลารวม (ชม:นาที:วินาที)</Lbl><Inp placeholder="1:30:00" value={raceForm.totalTime} onChange={e=>setRaceForm(f=>({...f,totalTime:e.target.value}))}/>
          <Lbl>หมายเหตุ</Lbl><Inp placeholder="เช่น Bangkok HYROX 2026" value={raceForm.note} onChange={e=>setRaceForm(f=>({...f,note:e.target.value}))}/>
          <div style={{display:"flex",gap:8,marginTop:12}}><OBtn onClick={saveRace} style={{flex:2}}>💾 บันทึก</OBtn><GBtn onClick={()=>setShowRaceForm(false)} style={{flex:1}}>ยกเลิก</GBtn></div>
        </div>}
        {bestRace&&<div style={{background:`${raceLevel.color}15`,border:`1px solid ${raceLevel.color}40`,borderRadius:12,padding:14,marginBottom:10}}>
          <div style={{fontSize:11,color:D.sub,marginBottom:4}}>🏅 Best Time</div>
          <div style={{fontSize:28,fontWeight:800,color:raceLevel.color,fontFamily:"monospace"}}>{secToTime(bestRace.totalSec)}</div>
          <div style={{fontSize:12,fontWeight:700,color:raceLevel.color,marginTop:4}}>{raceLevel.label} · {raceLevel.time}</div>
          {goalSec>0&&<div style={{marginTop:10}}>
            <div style={{fontSize:11,color:D.sub,marginBottom:4}}>เทียบเป้าหมาย {secToTime(goalSec)}</div>
            <div style={{height:8,background:"#222",borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(100,(goalSec/bestRace.totalSec)*100)}%`,background:bestRace.totalSec<=goalSec?"#34d399":D.orange,borderRadius:4}}/>
            </div>
            <div style={{fontSize:11,marginTop:4,color:bestRace.totalSec<=goalSec?"#34d399":"#f87171"}}>
              {bestRace.totalSec<=goalSec?`✅ ถึงเป้าแล้ว! เร็วกว่า ${secToTime(goalSec-bestRace.totalSec)}`:`⏳ เหลืออีก ${secToTime(bestRace.totalSec-goalSec)}`}
            </div>
          </div>}
        </div>}
        {raceLogs.length===0&&!showRaceForm&&<div style={{color:D.dim,fontSize:13,textAlign:"center",padding:"16px 0"}}>ยังไม่มีข้อมูล Race</div>}
        {[...raceLogs].reverse().slice(0,5).map((r,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${D.border}`,fontSize:12}}>
            <span style={{color:D.sub}}>{r.date}</span>
            <span style={{color:getHyroxLevel(r.totalSec).color,fontWeight:700}}>{secToTime(r.totalSec)}</span>
            <span style={{color:D.sub}}>{getHyroxLevel(r.totalSec).label}</span>
          </div>
        ))}
      </Crd>

      {/* 20-min Test */}
      <Crd style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:14}}>⏱ 20-Min Aerobic Test</div>
          {isAdmin&&<OBtn onClick={()=>setShowTestForm(!showTestForm)} style={{width:"auto",padding:"7px 14px",fontSize:12}}>+ บันทึก Test</OBtn>}
        </div>
        {showTestForm&&<div style={{background:D.card2,borderRadius:12,padding:14,marginBottom:12}}>
          <Lbl>วันที่</Lbl><Inp type="date" value={testForm.date} onChange={e=>setTestForm(f=>({...f,date:e.target.value}))}/>
          <Lbl>ประเภท</Lbl>
          <div style={{display:"flex",gap:8,marginTop:6}}>
            {["Running","Treadmill"].map(t=><button key={t} onClick={()=>setTestForm(f=>({...f,type:t}))} style={{flex:1,padding:"8px 0",borderRadius:10,border:`1.5px solid ${testForm.type===t?D.orange:D.border}`,cursor:"pointer",background:testForm.type===t?D.orange:"transparent",color:testForm.type===t?"#fff":D.sub,fontWeight:600,fontSize:13,fontFamily:"inherit"}}>{t==="Running"?"🏃 Running":"🏃 Treadmill"}</button>)}
          </div>
          <Lbl>Average Pace (นาที:วินาที เช่น 5:20)</Lbl><Inp placeholder="5:20" value={testForm.pace} onChange={e=>setTestForm(f=>({...f,pace:e.target.value}))}/>
          <Lbl>Average HR (bpm)</Lbl><Inp type="number" placeholder="165" value={testForm.hr} onChange={e=>setTestForm(f=>({...f,hr:e.target.value}))}/>
          <Lbl>RPE (1-10)</Lbl><Inp type="number" min="1" max="10" placeholder="7" value={testForm.rpe} onChange={e=>setTestForm(f=>({...f,rpe:e.target.value}))}/>
          <Lbl>หมายเหตุ</Lbl><Inp placeholder="เช่น อากาศร้อน, ฟอร์มดี" value={testForm.note} onChange={e=>setTestForm(f=>({...f,note:e.target.value}))}/>
          <div style={{display:"flex",gap:8,marginTop:12}}><OBtn onClick={saveTest} style={{flex:2}}>💾 บันทึก</OBtn><GBtn onClick={()=>setShowTestForm(false)} style={{flex:1}}>ยกเลิก</GBtn></div>
        </div>}

        {/* Running Tests */}
        {[["Running","🏃 Running",running],["Treadmill","🏃 Treadmill",treadmill]].map(([type,label,logs])=>logs.length>0&&(
          <div key={type} style={{marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:13,color:D.orange,marginBottom:8}}>{label}</div>
            {(() => {
              const analysis = logs.length>=2 ? analyzeAerobic(logs[logs.length-1], logs[logs.length-2]) : null;
              const paceData = logs.map(l=>({date:l.date.slice(5),value:parsePace(l.pace)}));
              const hrData = logs.map(l=>({date:l.date.slice(5),value:l.hr}));
              return <>
                {analysis&&<div style={{background:`${analysis.color}15`,border:`1px solid ${analysis.color}40`,borderRadius:10,padding:"10px 14px",marginBottom:10}}>
                  <div style={{fontWeight:700,fontSize:13,color:analysis.color}}>{analysis.icon} {analysis.label}</div>
                  <div style={{fontSize:11,color:D.sub,marginTop:3}}>{analysis.desc}</div>
                </div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <Crd style={{padding:12}}><MiniChart data={paceData} color={D.orange} label="Pace (วินาที/km)"/></Crd>
                  <Crd style={{padding:12}}><MiniChart data={hrData} color="#f87171" label="HR (bpm)"/></Crd>
                </div>
                {[...logs].reverse().slice(0,4).map((t,i)=>(
                  <div key={i} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:`1px solid ${D.border}`,fontSize:12,alignItems:"center"}}>
                    <span style={{color:D.sub,minWidth:60}}>{t.date}</span>
                    <span style={{color:D.orange,fontWeight:700,minWidth:50}}>{t.pace}</span>
                    <span style={{color:"#f87171",minWidth:50}}>❤️{t.hr}</span>
                    <span style={{color:D.sub}}>RPE {t.rpe}</span>
                    {t.note&&<span style={{color:D.dim,fontSize:10,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note}</span>}
                  </div>
                ))}
              </>;
            })()}
          </div>
        ))}
        {tests.length===0&&!showTestForm&&<div style={{color:D.dim,fontSize:13,textAlign:"center",padding:"16px 0"}}>ยังไม่มีข้อมูล Test</div>}
      </Crd>

      {/* Threshold Table */}
      <Crd>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📋 Threshold Pace Reference</div>
        <div style={{fontSize:11,color:D.sub,marginBottom:10}}>เกณฑ์มาตรฐาน Aerobic Threshold สำหรับ HYROX Training</div>
        {THRESHOLD_TABLE.map(({level,pace,color})=>(
          <div key={level} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${D.border}`}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:color,flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:700,color,width:100}}>{level}</span>
            <span style={{fontSize:13,color:D.text,fontFamily:"monospace"}}>{pace}</span>
          </div>
        ))}
        <div style={{fontSize:11,color:D.sub,marginTop:10,paddingTop:10,borderTop:`1px solid ${D.border}`}}>
          ทดสอบทุก 4–8 สัปดาห์ · เปรียบเทียบ Pace + HR + RPE เพื่อวัด Aerobic Fitness
        </div>
      </Crd>
    </div>
  );
}

// ─── TARGET TAB ──────────────────────────────────────────────
function TargetTab({ client, onUpdate, isAdmin=false }) {
  const targets = client.targets || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type:"strength", exercise:"Bench Press", value:"", deadline:"", note:"" });

  const TARGET_TYPES = [
    { value:"strength", label:"💪 น้ำหนักที่ยก (PR)" },
    { value:"weight",   label:"⚖️ น้ำหนักตัว (kg)" },
    { value:"fat",      label:"🔥 ไขมัน (%)" },
    { value:"muscle",   label:"💚 กล้ามเนื้อ (%)" },
    { value:"burpee",   label:"🫀 Burpees 3 นาที" },
  ];

  const addTarget = () => {
    if (!form.value) return;
    const newTarget = { id: Date.now(), ...form, createdAt: new Date().toISOString().slice(0,10) };
    onUpdate({ ...client, targets: [...targets, newTarget] });
    setForm({ type:"strength", exercise:"Bench Press", value:"", deadline:"", note:"" });
    setShowForm(false);
  };

  const delTarget = (id) => onUpdate({ ...client, targets: targets.filter(t=>t.id!==id) });

  return (
    <div>
      {/* Add target form */}
      {isAdmin && (showForm ? (
        <Crd style={{marginBottom:16,border:`1px solid ${D.orange}40`}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:D.orange}}>🎯 ตั้งเป้าหมายใหม่</div>
          <Lbl>ประเภทเป้าหมาย</Lbl>
          <Sel value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
            {TARGET_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </Sel>
          {form.type==="strength" && <>
            <Lbl>ท่าออกกำลังกาย</Lbl>
            <Sel value={form.exercise} onChange={e=>setForm(f=>({...f,exercise:e.target.value}))}>
              {EXERCISES.map(ex=><option key={ex}>{ex}</option>)}
            </Sel>
          </>}
          <Lbl>ค่าเป้าหมาย {form.type==="strength"||form.type==="burpee"?"(ครั้ง/kg)":"(%/kg)"}</Lbl>
          <Inp type="number" placeholder="เช่น 100" value={form.value} onChange={e=>setForm(f=>({...f,value:e.target.value}))}/>
          <Lbl>กำหนดส่ง (deadline)</Lbl>
          <Inp type="date" value={form.deadline} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))}/>
          <Lbl>หมายเหตุ</Lbl>
          <Inp placeholder="เช่น ภายใน 3 เดือน" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <OBtn onClick={addTarget} style={{flex:2}}>✓ บันทึกเป้าหมาย</OBtn>
            <GBtn onClick={()=>setShowForm(false)} style={{flex:1}}>ยกเลิก</GBtn>
          </div>
        </Crd>
      ) : (
        <OBtn onClick={()=>setShowForm(true)} style={{marginBottom:16}}>+ ตั้งเป้าหมายใหม่</OBtn>
      ))}

      {targets.length === 0 && !showForm && (
        <div style={{textAlign:"center",color:D.dim,padding:"40px 0",fontSize:14}}>
          <div style={{fontSize:36,marginBottom:12}}>🎯</div>
          ยังไม่มีเป้าหมาย<br/>
          <span style={{fontSize:12}}>กดปุ่มด้านบนเพื่อตั้งเป้าหมาย</span>
        </div>
      )}

      {targets.map(t => {
        const prog = calcTargetProgress(t, client);
        const typeLabel = { strength:`💪 ${t.exercise}`, weight:"⚖️ น้ำหนักตัว", fat:"🔥 ไขมัน", muscle:"💚 กล้ามเนื้อ", burpee:"🫀 Burpees" }[t.type]||t.type;
        const unitLabel = { strength:"kg", weight:"kg", fat:"%", muscle:"%", burpee:"ครั้ง" }[t.type]||"";
        const barColor = prog.done ? "#34d399" : prog.pct>60 ? D.orange : prog.pct>30 ? "#f59e0b" : "#60a5fa";

        return (
          <Crd key={t.id} style={{marginBottom:12,border:`1px solid ${prog.done?"#34d39940":D.border}`,background:prog.done?"rgba(52,211,153,0.05)":D.card}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{typeLabel}</div>
                {t.note&&<div style={{fontSize:11,color:D.sub}}>{t.note}</div>}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {prog.done && <span style={{fontSize:18}}>✅</span>}
                {isAdmin&&<button onClick={()=>delTarget(t.id)} style={{background:"transparent",border:"none",color:D.dim,cursor:"pointer",fontSize:16,padding:0}}>×</button>}
              </div>
            </div>

            {/* Progress */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
              <div>
                <span style={{fontSize:11,color:D.sub}}>ปัจจุบัน </span>
                <span style={{fontSize:18,fontWeight:800,color:barColor,fontFamily:"monospace"}}>{prog.current??"-"}</span>
                <span style={{fontSize:11,color:D.sub}}> {unitLabel}</span>
              </div>
              <div style={{textAlign:"right"}}>
                <span style={{fontSize:11,color:D.sub}}>เป้า </span>
                <span style={{fontSize:18,fontWeight:800,color:"#fff",fontFamily:"monospace"}}>{t.value}</span>
                <span style={{fontSize:11,color:D.sub}}> {unitLabel}</span>
              </div>
            </div>

            {/* Bar */}
            <div style={{height:10,background:"#222",borderRadius:5,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:`${prog.pct}%`,background:barColor,borderRadius:5,transition:"width 0.5s",position:"relative"}}>
                {prog.pct>15&&<div style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:700,color:"#000"}}>{prog.pct}%</div>}
              </div>
            </div>

            {/* Bottom row */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:D.sub}}>เริ่ม {t.createdAt}</div>
              {t.deadline && prog.daysLeft !== null && (
                <div style={{fontSize:11,fontWeight:700,color:prog.daysLeft<0?"#f87171":prog.daysLeft<14?D.orange:D.sub,background:prog.daysLeft<0?"rgba(248,113,113,0.1)":prog.daysLeft<14?D.orangeDim:"rgba(255,255,255,0.05)",padding:"2px 8px",borderRadius:8}}>
                  {prog.daysLeft<0?`เกิน ${Math.abs(prog.daysLeft)} วัน`:prog.done?"✓ สำเร็จ":`⏱ ${prog.daysLeft} วัน`}
                </div>
              )}
            </div>
          </Crd>
        );
      })}
    </div>
  );
}

// ─── REPORT TAB ──────────────────────────────────────────────
function ReportTab({ client }) {
  const periods = getBimonthlyPeriods(client.startDate);
  const [mode, setMode] = useState("preset"); // "preset" | "custom"
  const [selPeriod, setSelPeriod] = useState(periods[0]?.key||"");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const printRef = useRef();

  let period = null;
  if (mode==="preset") {
    period = periods.find(p=>p.key===selPeriod);
  } else if (customFrom && customTo) {
    period = { key:"custom", label:`${customFrom} ถึง ${customTo}`, from:customFrom, to:customTo };
  }

  const report = period ? buildReport(client, period) : null;
  const { bsFirst, bsLast, prByEx, bestBurpee, prevBurpee, scNow } = report||{};

  const handlePDF = () => {
    const el = printRef.current;
    if (!el) return;
    const orig = document.body.innerHTML;
    const style = `
      <style>
        body { font-family: 'Sarabun', sans-serif; background: #fff; color: #1C1917; padding: 32px; }
        .pdf-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; border-bottom: 3px solid #F97316; padding-bottom: 16px; }
        .pdf-title { font-size: 24px; font-weight: 800; color: #F97316; }
        .pdf-sub { font-size: 12px; color: #888; }
        .pdf-card { background: #F9F9F9; border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        .pdf-card-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; color: #1C1917; }
        .pdf-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
        .pdf-stat { background: #fff; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; text-align: center; }
        .pdf-stat-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
        .pdf-stat-val { font-size: 22px; font-weight: 800; }
        .pdf-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB; font-size: 13px; }
        .green { color: #16A34A; } .red { color: #DC2626; } .orange { color: #F97316; }
        @media print { body { padding: 16px; } }
      </style>
    `;
    const rnk = getRank(scNow?.total||0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>VECTOR Report</title>${style}</head><body>
      <div class="pdf-header">
        <div>
          <div class="pdf-title">⚡ VECTOR FITNESS STUDIO</div>
          <div class="pdf-sub">Personal Trainer CTAM · รายงานพัฒนาการ</div>
        </div>
      </div>
      <div class="pdf-card">
        <div class="pdf-card-title">📋 ข้อมูลลูกค้า</div>
        <div class="pdf-row"><span>ชื่อ</span><span><b>${client.name}</b></span></div>
        <div class="pdf-row"><span>เพศ / อายุ</span><span>${client.gender==="female"?"♀ หญิง":"♂ ชาย"} / ${client.age} ปี</span></div>
        <div class="pdf-row"><span>เป้าหมาย</span><span>${(client.goals||[]).join(", ")||"—"}</span></div>
        <div class="pdf-row"><span>ช่วงเวลา</span><span><b>${period?.label||""}</b></span></div>
        <div class="pdf-row"><span>Rank</span><span><b>${rnk.rank} · ${scNow?.total||0} pts</b></span></div>
      </div>
      ${bsLast?`<div class="pdf-card">
        <div class="pdf-card-title">📊 การเปลี่ยนแปลงร่างกาย</div>
        <div class="pdf-grid">
          <div class="pdf-stat"><div class="pdf-stat-label">น้ำหนัก</div><div class="pdf-stat-val orange">${bsLast.weight}<span style="font-size:12px">kg</span></div>${bsFirst&&bsLast!==bsFirst?`<div class="${(bsLast.weight-bsFirst.weight)<0?"green":"red"}">${(bsLast.weight-bsFirst.weight)>0?"+":""}${(bsLast.weight-bsFirst.weight).toFixed(1)}kg</div>`:""}</div>
          <div class="pdf-stat"><div class="pdf-stat-label">ไขมัน</div><div class="pdf-stat-val" style="color:#60a5fa">${bsLast.fat}<span style="font-size:12px">%</span></div>${bsFirst&&bsLast!==bsFirst?`<div class="${(bsLast.fat-bsFirst.fat)<0?"green":"red"}">${(bsLast.fat-bsFirst.fat)>0?"+":""}${(bsLast.fat-bsFirst.fat).toFixed(1)}%</div>`:""}</div>
          <div class="pdf-stat"><div class="pdf-stat-label">กล้ามเนื้อ</div><div class="pdf-stat-val" style="color:#34d399">${bsLast.muscle}<span style="font-size:12px">%</span></div>${bsFirst&&bsLast!==bsFirst?`<div class="${(bsLast.muscle-bsFirst.muscle)>0?"green":"red"}">${(bsLast.muscle-bsFirst.muscle)>0?"+":""}${(bsLast.muscle-bsFirst.muscle).toFixed(1)}%</div>`:""}</div>
        </div>
      </div>`:""}
      ${prByEx?.length?`<div class="pdf-card">
        <div class="pdf-card-title">💪 ความแข็งแรง (PR)</div>
        ${prByEx.map(({ex,prevBest,periodBest,isPR})=>`<div class="pdf-row"><span>${ex}</span><span>${prevBest?`${prevBest}kg → `:""}<b class="${isPR?"orange":""}">${periodBest}kg${isPR?" 🏆":""}</b></span></div>`).join("")}
      </div>`:""}
      ${scNow?`<div class="pdf-card">
        <div class="pdf-card-title">🏆 คะแนนรวม</div>
        <div class="pdf-row"><span>💪 ความแข็งแรง</span><span class="orange"><b>${scNow.strengthPts} pts</b></span></div>
        <div class="pdf-row"><span>📊 ร่างกาย</span><span style="color:#60a5fa"><b>${scNow.bodyPts} pts</b></span></div>
        <div class="pdf-row"><span>🫀 ฟิต</span><span style="color:#34d399"><b>${scNow.cardioPts} pts</b></span></div>
        <div class="pdf-row"><span><b>รวมทั้งหมด</b></span><span><b class="orange">${scNow.total} pts · ${rnk.rank}</b></span></div>
      </div>`:""}
      <div style="text-align:center;font-size:11px;color:#aaa;margin-top:24px">VECTOR FITNESS STUDIO · Personal Trainer CTAM · พิมพ์วันที่ ${new Date().toLocaleDateString("th-TH")}</div>
    </body></html>`;
    const w = window.open("","_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(()=>{ w.print(); }, 500);
  };

  const Delta = ({ val, lowerBetter=false, unit="" }) => {
    if (val===undefined||val===null) return <span style={{color:D.dim}}>—</span>;
    const good = lowerBetter ? val<0 : val>0;
    const color = val===0?D.sub:good?"#34d399":"#f87171";
    return <span style={{color,fontWeight:700}}>{val>0?"+":""}{typeof val==="number"?val.toFixed(1):val}{unit}</span>;
  };

  return (
    <div ref={printRef}>
      {/* Mode selector */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[["preset","📅 ทุก 2 เดือน"],["custom","🗓 เลือกเองได้"]].map(([m,l])=>(
          <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${mode===m?D.orange:D.border}`,cursor:"pointer",background:mode===m?D.orange:"transparent",color:mode===m?"#fff":D.sub,fontWeight:600,fontSize:13,fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>

      {mode==="preset"&&<div style={{marginBottom:16}}>
        <Lbl>เลือกช่วงเวลา</Lbl>
        <Sel value={selPeriod} onChange={e=>setSelPeriod(e.target.value)}>
          {periods.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
        </Sel>
      </div>}

      {mode==="custom"&&<div style={{marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><Lbl>วันเริ่ม</Lbl><Inp type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></div>
          <div><Lbl>วันสิ้นสุด</Lbl><Inp type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></div>
        </div>
      </div>}

      {!period && <div style={{textAlign:"center",color:D.dim,padding:"40px 0"}}>ไม่มีข้อมูล</div>}

      {period && report && (
        <>
          {/* Report header */}
          <div style={{background:`linear-gradient(135deg,rgba(249,115,22,0.15),rgba(249,115,22,0.05))`,border:`1px solid ${D.orange}40`,borderRadius:16,padding:18,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <VectorLogo size={22}/>
              <div style={{fontSize:10,color:D.orange,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase"}}>VECTOR FITNESS · รายงาน 2 เดือน</div>
            </div>
            <div style={{fontSize:20,fontWeight:800,marginBottom:2}}>{period.label}</div>
            <div style={{fontSize:12,color:D.sub}}>{client.name} · {client.gender==="female"?"♀":"♂"} {client.age}ปี · {(client.goals||[]).join(", ")||"—"}</div>
          </div>

          {/* Body changes */}
          <Crd style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:14,display:"flex",alignItems:"center",gap:6}}>📊 การเปลี่ยนแปลงร่างกาย</div>
            {!bsLast ? (
              <div style={{color:D.dim,fontSize:13}}>ไม่มีข้อมูลร่างกายในช่วงนี้</div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  {lbl:"น้ำหนัก",key:"weight",unit:"kg",lb:true},
                  {lbl:"ไขมัน",key:"fat",unit:"%",lb:true},
                  {lbl:"กล้ามเนื้อ",key:"muscle",unit:"%",lb:false},
                ].map(({lbl,key,unit,lb})=>{
                  const cur=bsLast?.[key], prev=bsFirst?.[key];
                  const delta=cur!==undefined&&prev!==undefined?+(cur-prev).toFixed(1):null;
                  return (
                    <div key={key} style={{background:D.card2,borderRadius:12,padding:"12px 10px",textAlign:"center"}}>
                      <div style={{fontSize:10,color:D.sub,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{lbl}</div>
                      <div style={{fontSize:20,fontWeight:800,fontFamily:"monospace",color:D.text}}>{cur??"-"}<span style={{fontSize:10}}>{unit}</span></div>
                      {delta!==null&&<Delta val={delta} lowerBetter={lb} unit={unit}/>}
                    </div>
                  );
                })}
              </div>
            )}
          </Crd>

          {/* Strength PRs */}
          <Crd style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>💪 ความแข็งแรง (PR ในช่วงนี้)</div>
            {prByEx.length===0?(
              <div style={{color:D.dim,fontSize:13}}>ไม่มีการบันทึกในช่วงนี้</div>
            ):(
              prByEx.map(({ex,prevBest,periodBest,isPR})=>(
                <div key={ex} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${D.border}`}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{ex}</div>
                    {isPR&&<div style={{fontSize:10,color:D.orange,marginTop:2}}>🏆 PR ใหม่!</div>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {prevBest>0&&<span style={{fontSize:11,color:D.sub}}>{prevBest}kg →</span>}
                    <span style={{fontSize:16,fontWeight:800,color:isPR?D.orange:D.text,fontFamily:"monospace"}}>{periodBest}kg</span>
                    {isPR&&prevBest>0&&<Delta val={+(periodBest-prevBest).toFixed(1)} unit="kg"/>}
                  </div>
                </div>
              ))
            )}
          </Crd>

          {/* Cardio */}
          <Crd style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>🫀 ความฟิต (Burpees 3 นาที)</div>
            {bestBurpee===0?(
              <div style={{color:D.dim,fontSize:13}}>ไม่มีการบันทึกในช่วงนี้</div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:32,fontWeight:800,color:"#34d399",fontFamily:"monospace"}}>{bestBurpee}</div>
                  <div style={{fontSize:11,color:D.sub}}>ครั้ง (Best ช่วงนี้)</div>
                </div>
                {prevBurpee>0&&<div style={{flex:1}}>
                  <div style={{fontSize:12,color:D.sub,marginBottom:4}}>เทียบกับก่อนหน้า</div>
                  <Delta val={bestBurpee-prevBurpee} unit=" ครั้ง"/>
                </div>}
              </div>
            )}
          </Crd>

          {/* Target progress snapshot */}
          {(client.targets||[]).length>0&&(
            <Crd style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>🎯 เป้าหมาย (สถานะปัจจุบัน)</div>
              {(client.targets||[]).map(t=>{
                const prog=calcTargetProgress(t,client);
                const typeLabel={strength:`💪 ${t.exercise}`,weight:"⚖️ น้ำหนัก",fat:"🔥 ไขมัน",muscle:"💚 กล้ามเนื้อ",burpee:"🫀 Burpees"}[t.type]||t.type;
                const barColor=prog.done?"#34d399":prog.pct>60?D.orange:"#60a5fa";
                return (
                  <div key={t.id} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
                      <span style={{fontWeight:600}}>{typeLabel}</span>
                      <span style={{color:prog.done?"#34d399":barColor,fontWeight:700}}>{prog.pct}%{prog.done?" ✅":""}</span>
                    </div>
                    <div style={{height:8,background:"#222",borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${prog.pct}%`,background:barColor,borderRadius:4}}/>
                    </div>
                  </div>
                );
              })}
            </Crd>
          )}

          {/* Score summary */}
          <Crd style={{background:`linear-gradient(135deg,#1A1208,${D.card})`,border:`1px solid ${D.orange}30`}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:D.orange}}>🏆 คะแนนรวม (ปัจจุบัน)</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <Ring pts={scNow.total} size={72}/>
              <div style={{flex:1,marginLeft:16}}>
                {[{l:"💪 ความแข็งแรง",v:scNow.strengthPts,c:D.orange},{l:"📊 ร่างกาย",v:scNow.bodyPts,c:"#60a5fa"},{l:"🫀 ฟิต",v:scNow.cardioPts,c:"#34d399"}].map(({l,v,c})=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:12,color:D.sub}}>{l}</span>
                    <span style={{fontSize:13,fontWeight:700,color:c,fontFamily:"monospace"}}>{v} pts</span>
                  </div>
                ))}
                <div style={{borderTop:`1px solid ${D.border}`,paddingTop:6,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,fontWeight:700}}>รวม</span>
                  <span style={{fontSize:15,fontWeight:800,color:D.orange,fontFamily:"monospace"}}>{scNow.total} pts</span>
                </div>
              </div>
            </div>
          </Crd>
          {/* PDF Export */}
          <OBtn onClick={handlePDF} style={{marginTop:8,background:"linear-gradient(135deg,#7C3AED,#5B21B6)"}}>📄 Export PDF รายงาน</OBtn>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════
let nextId = 15;
function mkClient(id, idx, name, gender, age){
  return { id, name:name||`ลูกค้า ${id}`, gender:gender||(idx%2===0?"male":"female"), age:age||(22+idx),
    goals:[["ลดน้ำหนัก","เพิ่มกล้ามเนื้อ","เพิ่มความแข็งแรง"][idx%3]],
    startDate:new Date().toISOString().slice(0,10),
    bodyStats:[], strengthLogs:[], cardioLogs:[], photos:[], program:"", targets:[] };
}
function avatarGrad(id){ const hues=[16,24,28,32,20,18,12,36,22,26,14,30,10,34]; const h=hues[(id-1)%hues.length]; return `linear-gradient(135deg,hsl(${h},90%,45%),hsl(${h+15},80%,35%))`; }

export default function App({ isAdmin=false }){
  const [clients,setClients]=useState(null);
  const [view,setView]=useState("dashboard");
  const [selId,setSelId]=useState(null);
  const [tab,setTab]=useState("score");
  const [editName,setEditName]=useState(false);
  const [form,setForm]=useState({});
  const [addMode,setAddMode]=useState(null);
  const [toast,setToast]=useState("");
  const [search,setSearch]=useState("");
  const [showAddClient,setShowAddClient]=useState(false);
  const [newCF,setNewCF]=useState({name:"",gender:"male",age:""});
  const [confirmDel,setConfirmDel]=useState(null);

  // ── Load from Firestore on mount ──
  useEffect(()=>{
    const unsub = onSnapshot(collection(db,"clients"), async snap=>{
      if(snap.empty){
        const init = Array.from({length:14},(_,i)=>mkClient(i+1,i));
        for(const c of init) await fbSave(c);
      } else {
        const data = snap.docs.map(d=>({targets:[],photos:[],cardioLogs:[],strengthLogs:[],bodyStats:[],program:"",...d.data()})).sort((a,b)=>a.id-b.id);
        nextId = Math.max(...data.map(c=>c.id))+1;
        setClients(data);
      }
    });
    return ()=>unsub();
  },[]);

  // ── Save to Firestore whenever clients change ──
  useEffect(()=>{
    if(!clients) return;
    clients.forEach(c=>fbSave(c));
  },[clients]);

  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(""),2500);};
  const upd=(id,fn)=>setClients(cs=>cs.map(c=>c.id===id?fn({...c}):c));
  const updClient=(id,next)=>setClients(cs=>cs.map(c=>c.id===id?{...next}:c));
  const client=clients?.find(c=>c.id===selId);

  if(!clients) return (
    <div style={{minHeight:"100vh",background:"#080810",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <svg width="56" height="56" viewBox="0 0 100 100" fill="none">
        <defs><linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F97316"/><stop offset="100%" stopColor="#FDBA74"/></linearGradient></defs>
        <polygon points="50,8 92,75 8,75" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
        <polygon points="50,30 72,60 50,82 28,60" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
      </svg>
      <div style={{color:"#F97316",fontFamily:"sans-serif",fontWeight:700,fontSize:16}}>กำลังโหลด...</div>
    </div>
  );

  const addClient=()=>{ if(!newCF.name.trim())return; const id=nextId++; const nc=mkClient(id,id-1,newCF.name,newCF.gender,+newCF.age||25); setClients(cs=>[...cs,nc]); setNewCF({name:"",gender:"male",age:""}); setShowAddClient(false); showToast(`✓ เพิ่ม ${newCF.name}`); };
  const delClient=id=>{ fbDelete(id); setClients(cs=>cs.filter(c=>c.id!==id)); if(view==="client")setView("dashboard"); setConfirmDel(null); showToast("✓ ลบแล้ว"); };
  const saveBody=()=>{ if(!form.date||!form.weight)return; upd(selId,c=>({...c,bodyStats:[...c.bodyStats,{date:form.date,weight:+form.weight,fat:+form.fat||0,muscle:+form.muscle||0}].sort((a,b)=>a.date.localeCompare(b.date))})); setForm({});setAddMode(null);showToast("✓ บันทึกข้อมูลร่างกาย"); };
  const saveStrength=()=>{ if(!form.date||!form.exercise||!form.weight)return; upd(selId,c=>({...c,strengthLogs:[...c.strengthLogs,{date:form.date,exercise:form.exercise,weight:+form.weight,reps:+form.reps||1,sets:+form.sets||1}].sort((a,b)=>a.date.localeCompare(b.date))})); setForm({});setAddMode(null);showToast("✓ บันทึกความแข็งแรง"); };
  const saveCardio=()=>{ if(!form.date||!form.cardioType||!form.value)return; upd(selId,c=>({...c,cardioLogs:[...(c.cardioLogs||[]),{date:form.date,type:form.cardioType,value:+form.value}].sort((a,b)=>a.date.localeCompare(b.date))})); setForm({});setAddMode(null);showToast("✓ บันทึกความฟิต"); };

  const filtered=clients.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()));
  const leaderboard=[...clients].map(c=>({...c,...calcScores(c)})).sort((a,b)=>b.total-a.total);

  // ─── CLIENT DETAIL ─────────────────────────────────────────
  if(view==="client"&&client){
    const sc=calcScores(client);
    const rnk=getRank(sc.total);
    const bw=client.bodyStats.length?client.bodyStats[client.bodyStats.length-1].weight:null;
    const bs=client.bodyStats,latBs=bs[bs.length-1],fstBs=bs[0];
    const wData=bs.map(s=>({date:s.date.slice(5),value:s.weight}));
    const fData=bs.map(s=>({date:s.date.slice(5),value:s.fat}));
    const mData=bs.map(s=>({date:s.date.slice(5),value:s.muscle}));
    const bLogs=(client.cardioLogs||[]).filter(l=>l.type==="Burpees 3min");
    const bestBurpee=bLogs.length?Math.max(...bLogs.map(l=>l.value)):null;
    const burpeeLv=bestBurpee?getBurpeeLevel(bestBurpee,client.gender||"male",client.age||25):null;
    const byEx=EXERCISES.map(ex=>{ const logs=client.strengthLogs.filter(l=>l.exercise===ex);if(!logs.length)return null;const best=Math.max(...logs.map(l=>l.weight));return{ex,logs,best,data:logs.map(l=>({date:l.date.slice(5),value:l.weight})),lvInfo:bw?getLevel(ex,client.gender||"male",bw,client.age||25,best):null}; }).filter(Boolean);
    const TABS=[["score","🏆 คะแนน"],["target","🎯 เป้าหมาย"],["report","📋 รายงาน"],["hyrox","🏁 HYROX"],["strength","💪 แข็งแรง"],["cardio","🫀 ฟิต"],["body","📊 ร่างกาย"],["photos","📸 รูป"],["program","📝 โปรแกรม"]];
    const nameEl=isAdmin&&editName?<input autoFocus value={client.name} style={{...inp,fontSize:16,padding:"4px 8px",width:"auto",maxWidth:180}} onChange={e=>upd(client.id,c=>({...c,name:e.target.value}))} onBlur={()=>setEditName(false)} onKeyDown={e=>e.key==="Enter"&&setEditName(false)}/>:<span onClick={isAdmin?()=>setEditName(true):undefined} style={{cursor:isAdmin?"pointer":"default",borderBottom:isAdmin?`1px dashed ${D.border}`:"none"}}>{client.name}{isAdmin&&<span style={{fontSize:13,color:D.dim}}> ✏️</span>}</span>;

    return (
      <Screen title={nameEl} sub={`${client.gender==="female"?"♀":"♂"} ${client.age||"?"}ปี`} onBack={()=>{setView("dashboard");setAddMode(null);}}>
        {isAdmin&&confirmDel===client.id&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
            <Crd style={{maxWidth:320,width:"100%",textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>🗑️</div><div style={{fontWeight:700,fontSize:16,marginBottom:8}}>ลบ {client.name}?</div><div style={{fontSize:13,color:D.sub,marginBottom:20}}>ข้อมูลทั้งหมดจะถูกลบถาวร</div><div style={{display:"flex",gap:10}}><GBtn onClick={()=>setConfirmDel(null)} style={{flex:1}}>ยกเลิก</GBtn><OBtn onClick={()=>delClient(client.id)} style={{flex:1,background:"#DC2626",boxShadow:"none"}}>ลบเลย</OBtn></div></Crd>
          </div>
        )}

        {/* Profile card */}
        <Crd style={{marginBottom:16,background:"linear-gradient(135deg,#1A1208,#161616)"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:54,height:54,borderRadius:14,background:avatarGrad(client.id),display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:"0 4px 14px rgba(249,115,22,0.4)"}}>{client.name.slice(-1)}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                {["male","female"].map(g=><button key={g} onClick={isAdmin?()=>upd(client.id,c=>({...c,gender:g})):undefined} style={{padding:"3px 12px",borderRadius:20,border:`1.5px solid ${client.gender===g?D.orange:D.border}`,cursor:isAdmin?"pointer":"default",background:client.gender===g?D.orange:"transparent",color:client.gender===g?"#fff":D.sub,fontWeight:600,fontSize:11,fontFamily:"inherit"}}>{g==="male"?"♂ ชาย":"♀ หญิง"}</button>)}
                <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:11,color:D.sub}}>อายุ</span><Inp type="number" value={client.age||""} onChange={isAdmin?e=>upd(client.id,c=>({...c,age:+e.target.value})):undefined} readOnly={!isAdmin} style={{width:52,padding:"3px 8px",fontSize:12}}/><span style={{fontSize:11,color:D.sub}}>ปี</span></div>
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{GOALS_LIST.map(g=>{ const sel=(client.goals||[]).includes(g); return <button key={g} onClick={isAdmin?()=>upd(client.id,c=>{ const cur=c.goals||[];if(cur.includes(g))return{...c,goals:cur.filter(x=>x!==g)};if(cur.length>=2)return{...c,goals:[cur[1],g]};return{...c,goals:[...cur,g]}; }):undefined} style={{padding:"2px 8px",borderRadius:20,border:`1.5px solid ${sel?D.orange:D.border}`,cursor:isAdmin?"pointer":"default",background:sel?D.orangeDim:"transparent",color:sel?D.orange:D.sub,fontSize:10,fontWeight:sel?700:400,fontFamily:"inherit"}}>{g}</button>; })}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><Ring pts={sc.total} size={68}/>{isAdmin&&<button onClick={()=>setConfirmDel(client.id)} style={{background:"transparent",border:"none",color:D.dim,cursor:"pointer",fontSize:11,padding:0}}>🗑️ ลบ</button>}</div>
          </div>
          <div style={{marginTop:14,padding:"10px 14px",background:"rgba(0,0,0,0.3)",borderRadius:12,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>{rnk.icon}</span>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:rnk.color}}>{rnk.rank}</div><div style={{fontSize:11,color:D.sub}}>{sc.total} pts รวม</div></div>
            <div style={{display:"flex",gap:12}}>
              {[{v:sc.strengthPts,l:"แข็งแรง",c:D.orange},{v:sc.bodyPts,l:"ร่างกาย",c:"#60a5fa"},{v:sc.cardioPts,l:"ฟิต",c:"#34d399"}].map(({v,l,c})=><div key={l} style={{textAlign:"center"}}><div style={{fontSize:14,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</div><div style={{fontSize:9,color:D.sub}}>{l}</div></div>)}
            </div>
          </div>
        </Crd>

        {/* Tabs */}
        <div style={{display:"flex",gap:3,marginBottom:20,overflowX:"auto",paddingBottom:2}}>
          {TABS.map(([t,l])=><button key={t} onClick={()=>{setTab(t);setAddMode(null);}} style={{flexShrink:0,padding:"8px 13px",borderRadius:10,border:`1.5px solid ${tab===t?D.orange:D.border}`,cursor:"pointer",background:tab===t?D.orange:"transparent",color:tab===t?"#fff":D.sub,fontWeight:600,fontSize:11,fontFamily:"inherit",whiteSpace:"nowrap"}}>{l}</button>)}
        </div>

        {/* ── TARGET TAB ── */}
        {tab==="target"&&<TargetTab client={client} onUpdate={next=>updClient(client.id,next)} isAdmin={isAdmin}/>}

        {/* ── REPORT TAB ── */}
        {tab==="report"&&<ReportTab client={client}/>}

        {/* ── SCORE TAB ── */}
        {tab==="score"&&(<>
          {!bw&&<div style={{background:"rgba(249,115,22,0.1)",border:"1px solid rgba(249,115,22,0.3)",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#FCA974"}}>⚠️ บันทึกน้ำหนักก่อนเพื่อคำนวณคะแนนความแข็งแรง</div>}
          {[{label:"💪 ความแข็งแรง",pts:sc.strengthPts,max:400,color:D.orange,desc:"คะแนนจาก PR ท่าต่างๆ"},{label:"📊 ร่างกาย",pts:sc.bodyPts,max:300,color:"#60a5fa",desc:"ไขมัน% ที่ลดลง + กล้ามเนื้อ% ที่เพิ่มขึ้น"},{label:"🫀 ความฟิต",pts:sc.cardioPts,max:200,color:"#34d399",desc:"Burpees 3 นาที + PR ใหม่"}].map(({label,pts,max,color,desc})=>(
            <Crd key={label} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}><div><div style={{fontWeight:700,fontSize:14}}>{label}</div><div style={{fontSize:11,color:D.sub,marginTop:2}}>{desc}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:800,color,fontFamily:"monospace"}}>{pts}</div><div style={{fontSize:10,color:D.sub}}>/{max} pts</div></div></div>
              <div style={{height:6,background:"#222",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,(pts/max)*100)}%`,background:color,borderRadius:3}}/></div>
            </Crd>
          ))}
          {byEx.length>0&&<Crd style={{marginTop:4}}>
            <div style={{fontWeight:700,fontSize:13,color:D.sub,marginBottom:12,letterSpacing:"0.06em",textTransform:"uppercase"}}>รายละเอียดต่อท่า</div>
            {byEx.map(({ex,best,lvInfo})=>{ const lv=lvInfo?.level??-1; return <div key={ex} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${D.border}`}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{ex}</div><div style={{fontSize:11,color:lv>=0?LEVEL_COLORS[lv]:D.dim,marginTop:2}}>{lv>=0?LEVELS[lv]:"—"} · {best}kg</div>{lv>=0&&<LvBar level={lv} max={4}/>}</div><div style={{textAlign:"right",marginLeft:12}}><div style={{fontSize:16,fontWeight:700,color:lv>=0?LEVEL_COLORS[lv]:D.dim}}>{lv>=0?LEVELS.slice(0,lv+1).reduce((s,l)=>s+PR_POINTS[l],0):0}</div><div style={{fontSize:10,color:D.sub}}>pts</div></div></div>; })}
          </Crd>}
          <Crd style={{marginTop:12}}>
            <div style={{fontWeight:700,fontSize:11,color:D.sub,marginBottom:10,letterSpacing:"0.08em",textTransform:"uppercase"}}>Level System</div>
            {LEVELS.map((lv,i)=><div key={lv} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}><div style={{width:8,height:8,borderRadius:"50%",background:LEVEL_COLORS[i],flexShrink:0}}/><span style={{fontSize:12,color:LEVEL_COLORS[i],width:90,fontWeight:600}}>{lv}</span><div style={{flex:1,height:3,background:"#222",borderRadius:2}}><div style={{width:`${(i+1)*20}%`,height:"100%",background:LEVEL_COLORS[i],borderRadius:2}}/></div><span style={{fontSize:11,color:D.sub,width:44,textAlign:"right"}}>+{PR_POINTS[lv]}pts</span></div>)}
            <div style={{fontSize:11,color:D.sub,marginTop:8,paddingTop:8,borderTop:`1px solid ${D.border}`}}>+5pts ต่อ PR ใหม่ · +10pts ต่อ Burpee PR</div>
          </Crd>
        </>)}

        {/* ── STRENGTH TAB ── */}
        {tab==="strength"&&(<>
          {isAdmin&&(addMode==="strength"?(<Crd style={{marginBottom:16}}><div style={{fontWeight:700,fontSize:14,marginBottom:12,color:D.orange}}>บันทึกความแข็งแรง</div><Lbl>วันที่</Lbl><Inp type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/><Lbl>ท่า</Lbl><Sel value={form.exercise||""} onChange={e=>setForm(f=>({...f,exercise:e.target.value}))}><option value="">เลือกท่า...</option>{EXERCISES.map(ex=><option key={ex}>{ex}</option>)}</Sel><Lbl>น้ำหนัก (kg)</Lbl><Inp type="number" value={form.weight||""} onChange={e=>setForm(f=>({...f,weight:e.target.value}))}/><div style={{display:"flex",gap:8}}><div style={{flex:1}}><Lbl>Reps</Lbl><Inp type="number" value={form.reps||""} onChange={e=>setForm(f=>({...f,reps:e.target.value}))}/></div><div style={{flex:1}}><Lbl>Sets</Lbl><Inp type="number" value={form.sets||""} onChange={e=>setForm(f=>({...f,sets:e.target.value}))}/></div></div><div style={{display:"flex",gap:8,marginTop:16}}><OBtn onClick={saveStrength} style={{flex:2}}>💾 บันทึก</OBtn><GBtn onClick={()=>setAddMode(null)} style={{flex:1}}>ยกเลิก</GBtn></div></Crd>):<OBtn onClick={()=>{setForm({date:new Date().toISOString().slice(0,10)});setAddMode("strength");}} style={{marginBottom:16}}>+ บันทึกความแข็งแรง</OBtn>)}
          {!bw&&<div style={{color:"#FCA974",fontSize:12,marginBottom:12}}>⚠️ บันทึกน้ำหนักในแท็บ ร่างกาย ก่อน</div>}
          {byEx.length===0&&!addMode&&<div style={{textAlign:"center",color:D.dim,padding:"40px 0",fontSize:14}}>ยังไม่มีข้อมูล</div>}
          {byEx.map(({ex,logs,best,data,lvInfo})=>{ const lv=lvInfo?.level??-1,nextTgt=lvInfo&&lv<4?lvInfo.targets[lv+1]:null; return <Crd key={ex} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontWeight:700,fontSize:15}}>{ex}</span><span style={{background:D.orangeDim,color:D.orange,padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>🏆 {best}kg</span></div>{bw&&lvInfo&&<><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:12,fontWeight:700,color:lv>=0?LEVEL_COLORS[lv]:D.dim}}>{lv>=0?LEVELS[lv]:"Unranked"}</span><span style={{fontSize:11,color:D.sub}}>ratio {lvInfo.ratio}× BW</span></div><LvBar level={lv} max={4}/>{nextTgt&&<div style={{fontSize:11,color:D.sub,marginTop:6}}>🎯 Next: <span style={{color:LEVEL_COLORS[lv+1],fontWeight:700}}>{nextTgt}kg</span> (+{Math.max(0,nextTgt-best).toFixed(1)}kg) → {LEVELS[lv+1]}</div>}</>}<div style={{marginTop:12}}><MiniChart data={data} color={D.orange} label="น้ำหนัก (kg)"/></div><div style={{fontSize:11,color:D.sub,marginTop:6}}>ล่าสุด: {logs[logs.length-1].weight}kg × {logs[logs.length-1].reps}×{logs[logs.length-1].sets} · {logs[logs.length-1].date}</div></Crd>; })}
        </>)}

        {/* ── HYROX TAB ── */}
        {tab==="hyrox"&&<HyroxTab client={client} onUpdate={next=>updClient(client.id,next)} isAdmin={isAdmin}/>}

        {/* ── CARDIO TAB ── */}
        {tab==="cardio"&&(<>
          {isAdmin&&(addMode==="cardio"?(<Crd style={{marginBottom:16}}><div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#34d399"}}>🫀 บันทึกความฟิต</div><Lbl>วันที่</Lbl><Inp type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/><Lbl>ประเภท</Lbl><Sel value={form.cardioType||""} onChange={e=>setForm(f=>({...f,cardioType:e.target.value}))}><option value="">เลือก...</option>{CARDIO_TYPES.map(t=><option key={t}>{t}</option>)}</Sel><Lbl>ผลลัพธ์</Lbl><Inp type="number" value={form.value||""} onChange={e=>setForm(f=>({...f,value:e.target.value}))}/><div style={{display:"flex",gap:8,marginTop:16}}><OBtn onClick={saveCardio} style={{flex:2}}>💾 บันทึก</OBtn><GBtn onClick={()=>setAddMode(null)} style={{flex:1}}>ยกเลิก</GBtn></div></Crd>):<OBtn onClick={()=>{setForm({date:new Date().toISOString().slice(0,10)});setAddMode("cardio");}} style={{marginBottom:16,background:"linear-gradient(135deg,#059669,#047857)"}}>+ บันทึกความฟิต</OBtn>)}
          {bestBurpee!==null&&<Crd style={{marginBottom:12,background:"linear-gradient(135deg,#052E16,#161616)"}}><div style={{fontWeight:700,fontSize:14,color:"#34d399",marginBottom:8}}>🫀 Burpees 3 นาที</div><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{textAlign:"center"}}><div style={{fontSize:32,fontWeight:800,color:"#34d399",fontFamily:"monospace"}}>{bestBurpee}</div><div style={{fontSize:11,color:"#6EE7B7"}}>ครั้ง (Best)</div></div><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:burpeeLv?.level>=0?LEVEL_COLORS[burpeeLv.level]:D.dim,marginBottom:4}}>{burpeeLv?.level>=0?["Beginner","Novice","Intermediate","Advanced"][burpeeLv.level]:"Unranked"}</div><LvBar level={burpeeLv?.level??-1} max={3}/>{burpeeLv?.nextTarget&&<div style={{fontSize:11,color:"#34d399",marginTop:5}}>🎯 Next: {burpeeLv.nextTarget} ครั้ง</div>}</div></div><div style={{marginTop:12}}><MiniChart data={bLogs.map(l=>({date:l.date.slice(5),value:l.value}))} color="#34d399" label="Burpees (ครั้ง)"/></div></Crd>}
          {(client.cardioLogs||[]).length===0&&!addMode&&<div style={{textAlign:"center",color:D.dim,padding:"40px 0",fontSize:14}}>ยังไม่มีข้อมูลความฟิต</div>}
        </>)}

        {/* ── BODY TAB ── */}
        {tab==="body"&&(<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
            {[{lbl:"น้ำหนัก",key:"weight",unit:"kg",lb:true},{lbl:"ไขมัน",key:"fat",unit:"%",lb:true},{lbl:"กล้ามเนื้อ",key:"muscle",unit:"%",lb:false}].map(({lbl,key,unit,lb})=>{ const cur=latBs?.[key],prev=fstBs?.[key],delta=cur!==undefined&&prev!==undefined&&latBs!==fstBs?+(cur-prev).toFixed(1):null; return <Crd key={key} style={{textAlign:"center",padding:"14px 8px",background:D.card2}}><div style={{fontSize:10,color:D.sub,fontWeight:700,textTransform:"uppercase",marginBottom:4,letterSpacing:"0.06em"}}>{lbl}</div><div style={{fontSize:20,fontWeight:800,color:key==="weight"?D.orange:key==="fat"?"#60a5fa":"#34d399",fontFamily:"monospace"}}>{cur??<span style={{color:D.dim}}>—</span>}<span style={{fontSize:10,color:D.sub}}>{unit}</span></div>{delta!==null&&<div style={{fontSize:10,marginTop:2,color:((lb&&delta<0)||(!lb&&delta>0))?"#34d399":"#f87171"}}>{delta>0?"+":""}{delta}{unit}</div>}</Crd>; })}
          </div>
          {isAdmin&&(addMode==="body"?(<Crd style={{marginBottom:16}}><div style={{fontWeight:700,fontSize:14,marginBottom:12,color:D.orange}}>บันทึกข้อมูลร่างกาย</div><Lbl>วันที่</Lbl><Inp type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/><Lbl>น้ำหนัก (kg)</Lbl><Inp type="number" value={form.weight||""} onChange={e=>setForm(f=>({...f,weight:e.target.value}))}/><Lbl>ไขมัน (%)</Lbl><Inp type="number" value={form.fat||""} onChange={e=>setForm(f=>({...f,fat:e.target.value}))}/><Lbl>กล้ามเนื้อ (%)</Lbl><Inp type="number" value={form.muscle||""} onChange={e=>setForm(f=>({...f,muscle:e.target.value}))}/><div style={{display:"flex",gap:8,marginTop:16}}><OBtn onClick={saveBody} style={{flex:2}}>💾 บันทึก</OBtn><GBtn onClick={()=>setAddMode(null)} style={{flex:1}}>ยกเลิก</GBtn></div></Crd>):<OBtn onClick={()=>{setForm({date:new Date().toISOString().slice(0,10)});setAddMode("body");}} style={{marginBottom:16}}>+ บันทึกข้อมูลร่างกาย</OBtn>)}
          {bs.length>=2&&<><Crd style={{marginBottom:12}}><MiniChart data={wData} color={D.orange} label="น้ำหนัก (kg)"/></Crd><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}><Crd><MiniChart data={fData} color="#60a5fa" label="ไขมัน (%)"/></Crd><Crd><MiniChart data={mData} color="#34d399" label="กล้ามเนื้อ (%)"/></Crd></div></>}
          {bs.length>0&&<Crd><div style={{fontSize:11,fontWeight:700,color:D.sub,marginBottom:10,letterSpacing:"0.06em",textTransform:"uppercase"}}>ประวัติ</div>{[...bs].reverse().slice(0,8).map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${D.border}`,fontSize:12}}><span style={{color:D.sub}}>{s.date}</span><span style={{color:D.orange,fontWeight:600}}>{s.weight}kg</span><span style={{color:"#60a5fa"}}>{s.fat}%🔥</span><span style={{color:"#34d399"}}>{s.muscle}%💪</span></div>)}</Crd>}
        </>)}

        {tab==="photos"&&<PhotoSection photos={client.photos||[]} onAdd={p=>upd(client.id,c=>({...c,photos:[...(c.photos||[]),p]}))} onDelete={id=>upd(client.id,c=>({...c,photos:(c.photos||[]).filter(p=>p.id!==id)}))} isAdmin={isAdmin}/>}
        {tab==="program"&&<Crd><div style={{fontWeight:700,fontSize:14,marginBottom:10}}>📝 โปรแกรมการฝึก</div><textarea value={client.program||""} onChange={isAdmin?e=>upd(client.id,c=>({...c,program:e.target.value})):undefined} readOnly={!isAdmin} placeholder={"วันจันทร์: Chest + Triceps\n- Bench Press 4×8\n\nวันพุธ: Back + Biceps"} style={{width:"100%",minHeight:240,background:"#111",border:`1.5px solid ${D.border}`,borderRadius:10,padding:14,color:D.text,fontSize:13,fontFamily:"inherit",resize:isAdmin?"vertical":"none",boxSizing:"border-box",lineHeight:1.8,outline:"none"}}/><div style={{fontSize:11,color:D.sub,marginTop:6}}>{isAdmin?"บันทึกอัตโนมัติ":"ดูได้อย่างเดียว"}</div></Crd>}
      </Screen>
    );
  }

  // ─── DASHBOARD ─────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:D.bg,color:D.text,fontFamily:"'Sarabun',sans-serif",paddingBottom:80}}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet"/>

      {/* Add Client Modal */}
      {isAdmin&&showAddClient&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <Crd style={{maxWidth:340,width:"100%"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><VectorLogo size={28}/><div style={{fontWeight:800,fontSize:16}}>เพิ่มลูกค้าใหม่</div></div>
            <Lbl>ชื่อ</Lbl><Inp placeholder="ชื่อลูกค้า" value={newCF.name} onChange={e=>setNewCF(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addClient()}/>
            <Lbl>เพศ</Lbl><div style={{display:"flex",gap:8}}>{["male","female"].map(g=><button key={g} onClick={()=>setNewCF(f=>({...f,gender:g}))} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${newCF.gender===g?D.orange:D.border}`,cursor:"pointer",background:newCF.gender===g?D.orange:"transparent",color:newCF.gender===g?"#fff":D.sub,fontWeight:600,fontSize:13,fontFamily:"inherit"}}>{g==="male"?"♂ ชาย":"♀ หญิง"}</button>)}</div>
            <Lbl>อายุ</Lbl><Inp type="number" placeholder="25" value={newCF.age} onChange={e=>setNewCF(f=>({...f,age:e.target.value}))}/>
            <div style={{display:"flex",gap:10,marginTop:20}}><GBtn onClick={()=>setShowAddClient(false)} style={{flex:1}}>ยกเลิก</GBtn><OBtn onClick={addClient} style={{flex:2}}>✓ เพิ่มลูกค้า</OBtn></div>
          </Crd>
        </div>
      )}

      {/* Header */}
      <div style={{background:D.card,borderBottom:`1px solid ${D.border}`,padding:"20px 18px 16px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <VectorLogo size={40}/>
            <div><div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.02em",lineHeight:1}}>VECTOR</div><div style={{fontSize:10,color:D.orange,letterSpacing:"0.16em",textTransform:"uppercase",fontWeight:700}}>Fitness Studio</div><div style={{fontSize:10,color:D.sub,marginTop:2}}>Personal Trainer CTAM</div></div>
          </div>
          {isAdmin&&<button onClick={()=>setShowAddClient(true)} style={{background:`linear-gradient(135deg,${D.orange},#EA580C)`,color:"#fff",border:"none",borderRadius:12,padding:"9px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(249,115,22,0.4)",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:18,lineHeight:1}}>+</span> เพิ่มลูกค้า</button>}
        </div>
        <div style={{height:2,background:`linear-gradient(90deg,${D.orange},transparent)`,borderRadius:2,marginBottom:18}}/>
        <div style={{display:"flex",gap:8,marginBottom:18,overflowX:"auto",paddingBottom:2}}>
          {[{label:"ลูกค้าทั้งหมด",val:clients.length,color:D.orange},{label:"PR วันนี้",val:clients.reduce((s,c)=>s+c.strengthLogs.filter(l=>l.date===new Date().toISOString().slice(0,10)).length,0),color:"#60a5fa"},{label:"เป้าหมายรวม",val:clients.reduce((s,c)=>s+(c.targets||[]).length,0),color:"#34d399"}].map(({label,val,color})=>(
            <div key={label} style={{flexShrink:0,background:"#111",border:`1px solid ${D.border}`,borderRadius:12,padding:"10px 16px",textAlign:"center",minWidth:90}}>
              <div style={{fontSize:20,fontWeight:800,color,fontFamily:"monospace"}}>{val}</div>
              <div style={{fontSize:10,color:D.sub,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{background:"#111",border:`1px solid ${D.border}`,borderRadius:16,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:700,color:D.sub,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>🏆 Leaderboard</div>
          {leaderboard.slice(0,5).map((c,i)=>{ const r=getRank(c.total),M=["🥇","🥈","🥉","4","5"]; return (
            <div key={c.id} onClick={()=>{setSelId(c.id);setView("client");setTab("score");}} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"7px 8px",borderRadius:10,marginBottom:2,background:i===0?"rgba(249,115,22,0.08)":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"} onMouseLeave={e=>e.currentTarget.style.background=i===0?"rgba(249,115,22,0.08)":"transparent"}>
              <span style={{fontSize:15,width:22,textAlign:"center",flexShrink:0}}>{M[i]}</span>
              <div style={{width:32,height:32,borderRadius:9,background:avatarGrad(c.id),display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",flexShrink:0}}>{c.name.slice(-1)}</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{c.name}</div><div style={{fontSize:10,color:D.sub}}>{(c.goals||[]).join(" + ")||"—"}</div></div>
              <Ring pts={c.total} size={42}/>
            </div>
          ); })}
        </div>
      </div>

      <div style={{padding:"14px 18px 8px"}}><div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:D.sub,fontSize:15}}>🔍</span><Inp placeholder="ค้นหาลูกค้า..." value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:38}}/></div></div>
      <div style={{padding:"0 18px 8px",fontSize:12,color:D.sub,fontWeight:600}}>ลูกค้า {filtered.length} คน{filtered.length!==clients.length&&` (จาก ${clients.length} คน)`}</div>

      <div style={{padding:"0 18px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(158px,1fr))",gap:10}}>
        {filtered.map(c=>{
          const sc=calcScores(c),rnk=getRank(sc.total);
          const bw=c.bodyStats.length?c.bodyStats[c.bodyStats.length-1].weight:null;
          const latBs=c.bodyStats[c.bodyStats.length-1],fstBs=c.bodyStats[0];
          const bestEx=EXERCISES.map(ex=>{ const logs=c.strengthLogs.filter(l=>l.exercise===ex);if(!logs.length)return null;const best=Math.max(...logs.map(l=>l.weight));const lv=bw?getLevel(ex,c.gender||"male",bw,c.age||25,best):null;return{ex,best,lv}; }).filter(Boolean).sort((a,b)=>(b.lv?.level??-1)-(a.lv?.level??-1))[0];
          const bBest=(c.cardioLogs||[]).filter(l=>l.type==="Burpees 3min");
          const topB=bBest.length?Math.max(...bBest.map(l=>l.value)):null;
          const doneTargets=(c.targets||[]).filter(t=>calcTargetProgress(t,c).done).length;
          const totalTargets=(c.targets||[]).length;

          return (
            <div key={c.id} onClick={()=>{setSelId(c.id);setView("client");setTab("score");}} style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:16,padding:14,cursor:"pointer",transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=D.orange;e.currentTarget.style.boxShadow=`0 4px 20px rgba(249,115,22,0.15)`;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=D.border;e.currentTarget.style.boxShadow="none";}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{width:38,height:38,borderRadius:11,background:avatarGrad(c.id),display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff"}}>{c.name.slice(-1)}</div>
                <Ring pts={sc.total} size={40}/>
              </div>
              <div style={{fontWeight:800,fontSize:14,marginBottom:2}}>{c.name}</div>
              <div style={{fontSize:10,color:D.sub,marginBottom:8}}>{c.gender==="female"?"♀":"♂"} {c.age}ปี</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{(c.goals||[]).map(g=><span key={g} style={{fontSize:9,background:D.orangeDim,color:D.orange,padding:"2px 7px",borderRadius:10,fontWeight:600}}>{g}</span>)}</div>
              {latBs&&<div style={{fontSize:11,color:D.sub,marginBottom:6,fontFamily:"monospace"}}>{latBs.weight}kg · {latBs.fat}%fat{latBs&&fstBs&&latBs!==fstBs&&<span style={{color:latBs.fat<fstBs.fat?"#34d399":"#f87171"}}> {latBs.fat<fstBs.fat?"▼":"▲"}{Math.abs(latBs.fat-fstBs.fat).toFixed(1)}%</span>}</div>}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                {bestEx&&<span style={{fontSize:10,background:bestEx.lv?.level>=0?`${LEVEL_COLORS[bestEx.lv.level]}1A`:D.card2,color:bestEx.lv?.level>=0?LEVEL_COLORS[bestEx.lv.level]:D.sub,padding:"2px 7px",borderRadius:8,fontWeight:700}}>💪{bestEx.best}kg</span>}
                {topB&&<span style={{fontSize:10,background:"rgba(52,211,153,0.12)",color:"#34d399",padding:"2px 7px",borderRadius:8,fontWeight:700}}>🫀{topB}</span>}
                {totalTargets>0&&<span style={{fontSize:10,background:"rgba(249,115,22,0.12)",color:D.orange,padding:"2px 7px",borderRadius:8,fontWeight:700}}>🎯{doneTargets}/{totalTargets}</span>}
              </div>
              {!latBs&&!bestEx&&<div style={{fontSize:11,color:D.dim}}>ยังไม่มีข้อมูล</div>}
              <div style={{marginTop:8,padding:"5px 8px",background:"rgba(0,0,0,0.3)",borderRadius:8,display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:11}}>{rnk.icon}</span><span style={{fontSize:10,fontWeight:700,color:rnk.color}}>{rnk.rank}</span></div>
            </div>
          );
        })}
        {isAdmin&&<div onClick={()=>setShowAddClient(true)} style={{background:"transparent",border:`1.5px dashed ${D.border}`,borderRadius:16,padding:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,minHeight:180,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=D.orange;e.currentTarget.style.background=D.orangeDim;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=D.border;e.currentTarget.style.background="transparent";}}>
          <div style={{width:40,height:40,borderRadius:12,background:D.card2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:D.orange}}>+</div>
          <div style={{fontSize:12,color:D.sub,fontWeight:600,textAlign:"center"}}>เพิ่มลูกค้าใหม่</div>
        </div>}
      </div>

      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:D.orange,color:"#fff",padding:"11px 24px",borderRadius:100,fontWeight:700,fontSize:14,zIndex:999,boxShadow:"0 4px 20px rgba(249,115,22,0.5)",whiteSpace:"nowrap"}}>{toast}</div>}
    </div>
  );
}
