import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

const ADMIN_EMAIL = "nattapongklamphak@gmail.com";

function LoginScreen({ onLogin, error, loading }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const D = {
    bg:"#080810", card:"#161616", border:"#2A2A2A",
    orange:"#F97316", text:"#F5F5F5", sub:"#888"
  };
  const inp = {
    background:"#1E1E1E", border:"1.5px solid #2A2A2A", borderRadius:10,
    padding:"12px 16px", color:D.text, fontSize:15, fontFamily:"inherit",
    outline:"none", width:"100%", boxSizing:"border-box", marginTop:8,
  };
  return (
    <div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Sarabun',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet"/>
      <div style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:20,padding:32,width:"100%",maxWidth:360,boxShadow:"0 8px 40px rgba(0,0,0,0.5)"}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <svg width="52" height="52" viewBox="0 0 100 100" fill="none" style={{marginBottom:12}}>
            <defs><linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F97316"/><stop offset="100%" stopColor="#FDBA74"/>
            </linearGradient></defs>
            <polygon points="50,8 92,75 8,75" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
            <polygon points="50,30 72,60 50,82 28,60" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
          </svg>
          <div style={{fontSize:22,fontWeight:800,color:D.text,letterSpacing:"-0.02em"}}>VECTOR</div>
          <div style={{fontSize:11,color:D.orange,letterSpacing:"0.16em",fontWeight:700}}>FITNESS STUDIO</div>
          <div style={{fontSize:13,color:D.sub,marginTop:8}}>Trainer Dashboard</div>
        </div>

        {/* Form */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,color:D.sub,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>อีเมล</div>
          <input style={inp} type="email" placeholder="your@email.com" value={email}
            onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin(email,pass)}/>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,color:D.sub,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>รหัสผ่าน</div>
          <input style={inp} type="password" placeholder="••••••••" value={pass}
            onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin(email,pass)}/>
        </div>

        {error && <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#f87171",marginBottom:16,textAlign:"center"}}>{error}</div>}

        <button onClick={()=>onLogin(email,pass)} disabled={loading} style={{
          background:`linear-gradient(135deg,#F97316,#EA580C)`,color:"#fff",
          border:"none",borderRadius:12,padding:"13px 20px",fontWeight:700,
          fontSize:15,cursor:loading?"not-allowed":"pointer",width:"100%",
          fontFamily:"inherit",boxShadow:"0 4px 16px rgba(249,115,22,0.35)",
          opacity:loading?0.7:1
        }}>
          {loading?"กำลังเข้าสู่ระบบ...":"🔐 เข้าสู่ระบบ"}
        </button>

        <div style={{textAlign:"center",marginTop:20,fontSize:12,color:"#444"}}>
          VECTOR Fitness Studio © 2026
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => setUser(u || null));
    return ()=>unsub();
  },[]);

  const handleLogin = async (email, pass) => {
    if (!email || !pass) { setError("กรุณาใส่อีเมลและรหัสผ่าน"); return; }
    setLoading(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }
    setLoading(false);
  };

  // Loading state
  if (user === undefined) return (
    <div style={{minHeight:"100vh",background:"#080810",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <svg width="52" height="52" viewBox="0 0 100 100" fill="none">
        <defs><linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F97316"/><stop offset="100%" stopColor="#FDBA74"/>
        </linearGradient></defs>
        <polygon points="50,8 92,75 8,75" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
        <polygon points="50,30 72,60 50,82 28,60" fill="none" stroke="url(#vg)" strokeWidth="7" strokeLinejoin="round"/>
      </svg>
      <div style={{color:"#F97316",fontFamily:"sans-serif",fontWeight:700,fontSize:16}}>กำลังโหลด...</div>
    </div>
  );

  // Not logged in
  if (!user) return <LoginScreen onLogin={handleLogin} error={error} loading={loading}/>;

  // Logged in — show dashboard with logout button
  const isAdmin = user?.email === ADMIN_EMAIL;
  const Dashboard = require("./trainer-dashboard").default;
  return (
    <div>
      {/* Logout bar */}
      <div style={{position:"fixed",top:0,right:0,zIndex:999,padding:"8px 12px"}}>
        <button onClick={()=>signOut(auth)} style={{
          background:"rgba(0,0,0,0.6)",color:"#888",border:"1px solid #333",
          borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,
          fontFamily:"sans-serif",backdropFilter:"blur(8px)"
        }}>ออกจากระบบ</button>
      </div>
      <Dashboard isAdmin={isAdmin}/>
    </div>
  );
}
