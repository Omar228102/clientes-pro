import { useState, useMemo, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line } from "recharts";

// ─── FIREBASE ─────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB794bra6s_OsgBhLrHREKLoLUUJ3wsMvg",
  authDomain: "clientes-pro-366dc.firebaseapp.com",
  projectId: "clientes-pro-366dc",
  storageBucket: "clientes-pro-366dc.firebasestorage.app",
  messagingSenderId: "440858411586",
  appId: "1:440858411586:web:42b5bc5b61df34b3f923db"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ─── CONSTANTS ───────────────────────────────────────────────────────────────────
const DEFAULT_CONCEPTS = ["Honorarios","Consultoría","Mantenimiento","Materiales","Traslado","Capacitación","Otro"];
const CONCEPT_COLORS = ["#6ee7b7","#93c5fd","#fde68a","#f9a8d4","#c4b5fd","#fb923c","#94a3b8","#67e8f9","#a78bfa","#fdba74"];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DEFAULT_COMPANY = { name:"", cuit:"", address:"", phone:"", email:"", web:"", extra:"" };

// ─── UTILS ───────────────────────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS"}).format(n||0);
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2);
const today = () => new Date().toISOString().slice(0,10);
const totalItems = (items=[]) => items.reduce((s,i)=>s+(i.amount||0),0);
const paidItems = (items=[]) => items.filter(i=>i.status==="pagado").reduce((s,i)=>s+(i.amount||0),0);
const pendingItems = (items=[]) => items.filter(i=>i.status==="pendiente").reduce((s,i)=>s+(i.amount||0),0);
const formatCuit = v => { const n=v.replace(/\D/g,"").slice(0,11); if(n.length<=2)return n; if(n.length<=10)return `${n.slice(0,2)}-${n.slice(2)}`; return `${n.slice(0,2)}-${n.slice(2,10)}-${n.slice(10)}`; };
const getColor = (concept, concepts) => CONCEPT_COLORS[concepts.indexOf(concept) % CONCEPT_COLORS.length];

// ─── PDF RECEIPT ──────────────────────────────────────────────────────────────────
function generatePDF(client, company, items, folio, status="pendiente") {
  const total = items.reduce((s,i)=>s+(i.amount||0),0);
  const nowStr = new Date().toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"});
  const byConceptRows = items.map(i=>`
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151;font-weight:600">${i.concept}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#94a3b8;font-style:italic">${i.description||""}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151;text-align:right;font-weight:700">${fmt(i.amount)}</td>
    </tr>
    <tr>
      <td colspan="3" style="padding:4px 12px 12px 12px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Observaciones</div>
        <div style="height:28px;border-bottom:1px solid #cbd5e1;width:100%"></div>
      </td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: Arial, sans-serif; background:#fff; color:#111; }
  .page { max-width:700px; margin:0 auto; padding:40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:24px; border-bottom:3px solid #0f172a; }
  .company-name { font-size:22px; font-weight:800; color:#0f172a; margin-bottom:4px; }
  .company-detail { font-size:11px; color:#64748b; line-height:1.8; }
  .recibo-box { text-align:right; }
  .recibo-title { font-size:28px; font-weight:900; color:#0f172a; letter-spacing:-1px; }
  .recibo-num { font-size:13px; color:#64748b; margin-top:4px; }
  .recibo-date { font-size:13px; color:#64748b; }
  .client-section { background:#f8fafc; border-radius:8px; padding:16px 20px; margin-bottom:28px; }
  .client-label { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.08em; font-weight:700; margin-bottom:8px; }
  .client-name { font-size:16px; font-weight:700; color:#0f172a; margin-bottom:4px; }
  .client-detail { font-size:12px; color:#64748b; line-height:1.8; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr { background:#0f172a; }
  thead th { padding:10px 12px; text-align:left; font-size:11px; color:#fff; text-transform:uppercase; letter-spacing:0.06em; }
  thead th:last-child { text-align:right; }
  .total-row { background:#f8fafc; }
  .total-row td { padding:12px; font-weight:800; font-size:15px; color:#0f172a; }
  .total-row td:last-child { text-align:right; color:#0f172a; font-size:18px; }
  .estado-pendiente { display:inline-block; background:#fef3c7; color:#92400e; border:1px solid #fcd34d; border-radius:20px; padding:3px 12px; font-size:11px; font-weight:700; margin-top:8px; }
  .footer { margin-top:40px; padding-top:20px; border-top:1px solid #e2e8f0; text-align:center; font-size:11px; color:#94a3b8; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body><div class="page">
  <div class="header">
    <div>
      <div class="company-name">${company.name||"Mi Empresa"}</div>
      <div class="company-detail">
        ${company.cuit?`CUIT: ${company.cuit}<br>`:""}
        ${company.address?`${company.address}<br>`:""}
        ${company.phone?`Tel: ${company.phone}<br>`:""}
        ${company.email?`${company.email}<br>`:""}
        ${company.web?`${company.web}<br>`:""}
        ${company.extra?`${company.extra}`:""}
      </div>
    </div>
    <div class="recibo-box">
      <div class="recibo-title">RECIBO</div>
      <div class="recibo-num">N° ${folio}</div>
      <div class="recibo-date">${nowStr}</div>
      <div class="estado-pendiente">⏳ PENDIENTE DE COBRO</div>
    </div>
  </div>

  <div class="client-section">
    <div class="client-label">Recibimos de:</div>
    <div class="client-name">${client.name}</div>
    <div class="client-detail">
      ${client.cuit?`CUIT: ${client.cuit}<br>`:""}
      ${client.condicionFiscal?`Condición: ${client.condicionFiscal}<br>`:""}
      ${client.email?`${client.email}`:""}
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Concepto</th>
      <th>Detalle</th>
      <th style="text-align:right">Importe</th>
    </tr></thead>
    <tbody>${byConceptRows}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td>${fmt(total)}</td>
    </tr></tfoot>
  </table>

  <div class="footer">
    ${company.name||""} ${company.extra?`· ${company.extra}`:""}<br>
    Gracias por su confianza
  </div>
</div></body></html>`;

  const win = window.open("","_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>{ win.print(); }, 500);
}

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: Arial, sans-serif; background:#fff; color:#111; }
  .page { max-width:700px; margin:0 auto; padding:40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:24px; border-bottom:3px solid #0f172a; }
  .company-name { font-size:22px; font-weight:800; color:#0f172a; margin-bottom:4px; }
  .company-detail { font-size:11px; color:#64748b; line-height:1.8; }
  .recibo-box { text-align:right; }
  .recibo-title { font-size:28px; font-weight:900; color:#0f172a; letter-spacing:-1px; }
  .recibo-num { font-size:13px; color:#64748b; margin-top:4px; }
  .recibo-date { font-size:13px; color:#64748b; }
  .client-section { background:#f8fafc; border-radius:8px; padding:16px 20px; margin-bottom:28px; }
  .client-label { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.08em; font-weight:700; margin-bottom:8px; }
  .client-name { font-size:16px; font-weight:700; color:#0f172a; margin-bottom:4px; }
  .client-detail { font-size:12px; color:#64748b; line-height:1.8; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr { background:#0f172a; }
  thead th { padding:10px 12px; text-align:left; font-size:11px; color:#fff; text-transform:uppercase; letter-spacing:0.06em; }
  thead th:last-child { text-align:right; }
  .total-row { background:#f8fafc; }
  .total-row td { padding:12px; font-weight:800; font-size:15px; color:#0f172a; }
  .total-row td:last-child { text-align:right; color:#0f172a; font-size:18px; }
  .footer { margin-top:40px; padding-top:20px; border-top:1px solid #e2e8f0; text-align:center; font-size:11px; color:#94a3b8; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body><div class="page">
  <div class="header">
    <div>
      <div class="company-name">${company.name||"Mi Empresa"}</div>
      <div class="company-detail">
        ${company.cuit?`CUIT: ${company.cuit}<br>`:""}
        ${company.address?`${company.address}<br>`:""}
        ${company.phone?`Tel: ${company.phone}<br>`:""}
        ${company.email?`${company.email}<br>`:""}
        ${company.web?`${company.web}<br>`:""}
        ${company.extra?`${company.extra}`:""}
      </div>
    </div>
    <div class="recibo-box">
      <div class="recibo-title">RECIBO</div>
      <div class="recibo-num">N° ${folio}</div>
      <div class="recibo-date">${nowStr}</div>
    </div>
  </div>

  <div class="client-section">
    <div class="client-label">Recibimos de:</div>
    <div class="client-name">${client.name}</div>
    <div class="client-detail">
      ${client.cuit?`CUIT: ${client.cuit}<br>`:""}
      ${client.condicionFiscal?`Condición: ${client.condicionFiscal}<br>`:""}
      ${client.email?`${client.email}`:""}
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Concepto</th>
      <th>Descripción</th>
      <th style="text-align:right">Importe</th>
    </tr></thead>
    <tbody>${byConceptRows}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td>${fmt(total)}</td>
    </tr></tfoot>
  </table>

  <div class="footer">
    ${company.name||""} ${company.extra?`· ${company.extra}`:""}<br>
    Gracias por su confianza
  </div>
</div></body></html>`;

  const win = window.open("","_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  // No auto-print: el usuario decide si imprime desde el navegador
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, loading }) {
  return (
    <div style={{minHeight:"100vh",background:"#080d1a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{textAlign:"center",padding:40}}>
        <div style={{fontSize:64,color:"#6ee7b7",marginBottom:16}}>◈</div>
        <h1 style={{color:"#f1f5f9",fontSize:32,fontWeight:900,margin:"0 0 8px",letterSpacing:"-1px"}}>ClientesPro</h1>
        <p style={{color:"#475569",fontSize:15,margin:"0 0 40px"}}>Gestión de clientes y recibos profesional</p>
        <button onClick={onLogin} disabled={loading} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",border:"none",borderRadius:12,padding:"14px 28px",fontSize:15,fontWeight:600,cursor:"pointer",margin:"0 auto",boxShadow:"0 4px 24px rgba(0,0,0,0.3)",opacity:loading?0.7:1}}>
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
          {loading?"Iniciando...":"Continuar con Google"}
        </button>
      </div>
    </div>
  );
}

// ─── COMPANY MODAL ────────────────────────────────────────────────────────────────
function CompanyModal({ company, onSave, onClose }) {
  const [f,setF] = useState(company||DEFAULT_COMPANY);
  const set = k=>e=>setF({...f,[k]:e.target.value});
  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:500}}>
        <div style={S.modalHead}><span style={S.modalTitle}>🏢 Datos de la Empresa</span><button onClick={onClose} style={S.xBtn}>✕</button></div>
        <p style={{fontSize:12,color:"#64748b",margin:"0 0 16px"}}>Estos datos aparecen en todos tus recibos.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[["Nombre / Razón Social","name","text","Mi Estudio SA","1/-1"],["CUIT","cuit","text","20-12345678-9",""],["Teléfono","phone","tel","11 1234-5678",""],["Email","email","email","info@empresa.com",""],["Dirección","address","text","Av. Corrientes 1234, CABA","1/-1"],["Sitio web","web","text","www.empresa.com",""],["Info adicional (matrícula, etc.)","extra","text","Mat. CPCE 12345","1/-1"]].map(([l,k,t,p,gc])=>(
            <div key={k} style={{...S.field,gridColumn:gc||"auto"}}>
              <label style={S.lbl}>{l}</label>
              <input type={t} value={f[k]||""} onChange={set(k)} placeholder={p} style={S.inp}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}>
          <button onClick={onClose} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
          <button onClick={()=>onSave(f)} style={{...S.btn,...S.btnPrimary}}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── CONCEPTS MODAL ───────────────────────────────────────────────────────────────
function ConceptsModal({ concepts, onSave, onClose }) {
  const [list,setList] = useState([...concepts]);
  const [newOne,setNewOne] = useState("");
  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:400}}>
        <div style={S.modalHead}><span style={S.modalTitle}>🏷 Gestionar Conceptos</span><button onClick={onClose} style={S.xBtn}>✕</button></div>
        <div style={{marginBottom:14}}>
          {list.map((c,i)=>(
            <div key={c} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:CONCEPT_COLORS[i%CONCEPT_COLORS.length],flexShrink:0}}/>
              <span style={{flex:1,fontSize:13,color:"#e2e8f0"}}>{c}</span>
              <button onClick={()=>{if(list.length>1)setList(list.filter(x=>x!==c));}} style={{...S.iconBtn,color:"#fca5a5",fontSize:12}}>✕</button>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={newOne} onChange={e=>setNewOne(e.target.value)} onKeyDown={e=>e.key==="Enter"&&newOne.trim()&&!list.includes(newOne.trim())&&(setList([...list,newOne.trim()]),setNewOne(""))} placeholder="Nuevo concepto..." style={{...S.inp,flex:1}}/>
          <button onClick={()=>{if(newOne.trim()&&!list.includes(newOne.trim())){setList([...list,newOne.trim()]);setNewOne("");}}} style={{...S.btn,...S.btnPrimary,padding:"8px 14px"}}>+</button>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}>
          <button onClick={onClose} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
          <button onClick={()=>onSave(list)} style={{...S.btn,...S.btnPrimary}}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── COPY MONTH MODAL ─────────────────────────────────────────────────────────────
function CopyMonthModal({ client, onCopy, onClose }) {
  const now = new Date();
  const [fromMonth, setFromMonth] = useState(now.getMonth());
  const [fromYear, setFromYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState((now.getMonth()+1)%12);
  const [toYear, setToYear] = useState(now.getMonth()===11?now.getFullYear()+1:now.getFullYear());
  const [preview, setPreview] = useState([]);

  useEffect(()=>{
    const items = (client.items||[]).filter(i=>{
      const d = new Date(i.date);
      return d.getFullYear()===fromYear && d.getMonth()===fromMonth;
    });
    setPreview(items);
  },[fromMonth,fromYear,client.items]);

  const handleCopy = () => {
    if(!preview.length) return alert("No hay ítems en el mes seleccionado.");
    const copied = preview.map(i=>({
      ...i,
      id: uid(),
      date: `${toYear}-${String(toMonth+1).padStart(2,"0")}-${i.date.slice(8,10)}`,
      status: "pendiente"
    }));
    onCopy(copied);
  };

  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:460}}>
        <div style={S.modalHead}><span style={S.modalTitle}>📋 Copiar ítems de un mes a otro</span><button onClick={onClose} style={S.xBtn}>✕</button></div>
        <p style={{fontSize:12,color:"#64748b",margin:"0 0 16px"}}>Los ítems se copian como <strong style={{color:"#fca5a5"}}>pendientes</strong> en el mes destino.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
          <div style={S.field}>
            <label style={S.lbl}>Mes origen</label>
            <select value={fromMonth} onChange={e=>setFromMonth(Number(e.target.value))} style={S.inp}>
              {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.lbl}>Año origen</label>
            <select value={fromYear} onChange={e=>setFromYear(Number(e.target.value))} style={S.inp}>
              {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.lbl}>Mes destino</label>
            <select value={toMonth} onChange={e=>setToMonth(Number(e.target.value))} style={S.inp}>
              {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.lbl}>Año destino</label>
            <select value={toYear} onChange={e=>setToYear(Number(e.target.value))} style={S.inp}>
              {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div style={{background:"rgba(15,23,42,0.5)",borderRadius:8,padding:12,marginBottom:16}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:8,fontWeight:700,textTransform:"uppercase"}}>
            Ítems a copiar ({preview.length})
          </div>
          {preview.length===0
            ? <div style={{fontSize:12,color:"#334155"}}>No hay ítems en {MONTHS[fromMonth]} {fromYear}</div>
            : preview.map(i=>(
              <div key={i.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                <span style={{color:"#94a3b8"}}>{i.concept} — {i.description}</span>
                <span style={{color:"#6ee7b7",fontWeight:700}}>{fmt(i.amount)}</span>
              </div>
            ))}
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
          <button onClick={onClose} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
          <button onClick={handleCopy} style={{...S.btn,...S.btnPrimary}} disabled={!preview.length}>
            Copiar {preview.length} ítem{preview.length!==1?"s":""} → {MONTHS[toMonth]} {toYear}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RECIBO MODAL ─────────────────────────────────────────────────────────────────
function ReciboModal({ client, company, concepts, onClose, onSaveRecibo }) {
  const [selected,setSelected] = useState((client.items||[]).filter(i=>i.status==="pendiente").map(i=>i.id));
  const [extraItems,setExtraItems] = useState([]);
  const [addingExtra,setAddingExtra] = useState(false);
  const [ef,setEf] = useState({concept:concepts[0]||"Honorarios",description:"",amount:""});
  const [saved,setSaved] = useState(false);
  const toggle = id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const allItems = [...(client.items||[]),...extraItems];
  const chosen = allItems.filter(i=>selected.includes(i.id));
  const total = chosen.reduce((s,i)=>s+(i.amount||0),0);
  const folio = `R-${Date.now().toString().slice(-6)}`;
  const nowDate = new Date();
  const nowStr = nowDate.toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"});

  const addExtra = ()=>{
    if(!ef.description||!ef.amount)return;
    const item={...ef,amount:parseFloat(ef.amount),id:uid(),status:"pendiente"};
    setExtraItems(p=>[...p,item]);
    setSelected(s=>[...s,item.id]);
    setEf({concept:concepts[0]||"Honorarios",description:"",amount:""});
    setAddingExtra(false);
  };

  const reciboText =
    `🧾 *RECIBO DE PAGO*\n━━━━━━━━━━━━━━━━━━━━━\n`+
    (company?.name?`🏢 ${company.name}\n`:"")+
    (company?.cuit?`CUIT: ${company.cuit}\n`:"")+
    (company?.extra?`${company.extra}\n`:"")+
    `━━━━━━━━━━━━━━━━━━━━━\n`+
    `N° ${folio} | ${nowStr}\n`+
    `━━━━━━━━━━━━━━━━━━━━━\n`+
    `Recibimos de: ${client.name}\n`+
    (client.cuit?`CUIT: ${client.cuit}\n`:"")+
    `━━━━━━━━━━━━━━━━━━━━━\n`+
    chosen.map(i=>`• ${i.concept} — ${i.description}: ${fmt(i.amount)}`).join("\n")+
    `\n━━━━━━━━━━━━━━━━━━━━━\n💰 TOTAL: ${fmt(total)}\n━━━━━━━━━━━━━━━━━━━━━\n¡Gracias por su confianza! 🙏`;

  const handleEmit = async (action) => {
    if(!chosen.length) return alert("Seleccioná al menos un ítem.");
    // Save recibo to Firebase
    const recibo = {
      id: uid(),
      folio,
      date: nowDate.toISOString().slice(0,10),
      month: nowDate.getMonth(),
      year: nowDate.getFullYear(),
      clientId: client.id,
      clientName: client.name,
      clientCuit: client.cuit||"",
      items: chosen,
      total,
    };
    await onSaveRecibo(recibo);
    setSaved(true);
    if(action==="pdf") generatePDF(client,company,chosen,folio);
    else if(action==="whatsapp") window.open(`https://wa.me/${(client.phone||"").replace(/\D/g,"")}?text=${encodeURIComponent(reciboText)}`,"_blank");
    else if(action==="copy") { navigator.clipboard.writeText(reciboText); alert("¡Copiado!"); }
  };

  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:560}}>
        <div style={S.modalHead}><span style={S.modalTitle}>🧾 Emitir Recibo</span><button onClick={onClose} style={S.xBtn}>✕</button></div>
        {saved&&<div style={{background:"rgba(110,231,183,0.1)",border:"1px solid rgba(110,231,183,0.2)",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#6ee7b7"}}>✓ Recibo guardado en el historial</div>}
        <p style={{fontSize:12,color:"#64748b",margin:"0 0 10px"}}>Seleccioná los ítems a incluir:</p>
        <div style={{maxHeight:160,overflowY:"auto",marginBottom:10}}>
          {(client.items||[]).length===0&&<div style={{color:"#334155",fontSize:12,padding:"6px 0"}}>Sin ítems cargados.</div>}
          {(client.items||[]).map(item=>(
            <label key={item.id} style={S.checkRow}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggle(item.id)} style={{accentColor:"#6ee7b7"}}/>
              <span style={{...S.ctag,background:getColor(item.concept,concepts)+"22",color:getColor(item.concept,concepts),fontSize:10}}>{item.concept}</span>
              <span style={{flex:1,fontSize:12,color:"#e2e8f0"}}>{item.description}</span>
              <span style={{fontSize:11,color:"#475569",marginRight:8}}>{item.date}</span>
              <span style={{...S.badge,...(item.status==="pagado"?S.bPaid:S.bPend),fontSize:10,marginRight:8}}>{item.status==="pagado"?"✓":"⏳"}</span>
              <span style={{fontWeight:700,color:"#6ee7b7",fontSize:12}}>{fmt(item.amount)}</span>
            </label>
          ))}
        </div>
        {extraItems.length>0&&(
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6,fontWeight:700}}>Ítems adicionales</div>
            {extraItems.map(item=>(
              <label key={item.id} style={S.checkRow}>
                <input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggle(item.id)} style={{accentColor:"#6ee7b7"}}/>
                <span style={{...S.ctag,background:getColor(item.concept,concepts)+"22",color:getColor(item.concept,concepts),fontSize:10}}>{item.concept}</span>
                <span style={{flex:1,fontSize:12,color:"#e2e8f0"}}>{item.description}</span>
                <span style={{fontWeight:700,color:"#6ee7b7",fontSize:12,marginRight:8}}>{fmt(item.amount)}</span>
                <button onClick={()=>setExtraItems(p=>p.filter(x=>x.id!==item.id))} style={{...S.iconBtn,color:"#fca5a5",fontSize:11}}>✕</button>
              </label>
            ))}
          </div>
        )}
        {addingExtra?(
          <div style={{background:"rgba(15,23,42,0.6)",borderRadius:8,padding:12,marginBottom:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div style={S.field}><label style={S.lbl}>Concepto</label>
                <select value={ef.concept} onChange={e=>setEf({...ef,concept:e.target.value})} style={S.inp}>{concepts.map(c=><option key={c}>{c}</option>)}</select></div>
              <div style={S.field}><label style={S.lbl}>Monto</label>
                <input type="number" value={ef.amount} onChange={e=>setEf({...ef,amount:e.target.value})} placeholder="0.00" style={S.inp}/></div>
              <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Descripción</label>
                <input value={ef.description} onChange={e=>setEf({...ef,description:e.target.value})} placeholder="Descripción" style={S.inp}/></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setAddingExtra(false)} style={{...S.btn,...S.btnGhost,padding:"6px 12px",fontSize:12}}>Cancelar</button>
              <button onClick={addExtra} style={{...S.btn,...S.btnPrimary,padding:"6px 12px",fontSize:12}}>Agregar</button>
            </div>
          </div>
        ):(
          <button onClick={()=>setAddingExtra(true)} style={{...S.btn,...S.btnGhost,width:"100%",marginBottom:12,fontSize:12,padding:"7px"}}>+ Agregar ítem al recibo</button>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"rgba(15,23,42,0.5)",borderRadius:8,marginBottom:12}}>
          <span style={{color:"#94a3b8",fontSize:13}}>{chosen.length} ítem{chosen.length!==1?"s":""} seleccionado{chosen.length!==1?"s":""}</span>
          <span style={{fontWeight:800,fontSize:20,color:"#6ee7b7"}}>{fmt(total)}</span>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <button onClick={()=>handleEmit("pdf")} style={{...S.btn,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",flex:1}}>📄 PDF</button>
          <button onClick={()=>handleEmit("copy")} style={{...S.btn,...S.btnGhost,flex:1}}>📋 Copiar</button>
        </div>
        <button onClick={()=>handleEmit("whatsapp")} style={{...S.btn,...S.btnWa,width:"100%",textAlign:"center"}}>📲 Enviar por WhatsApp</button>
      </div>
    </div>
  );
}

// ─── PRINT UTILS ─────────────────────────────────────────────────────────────────
function printList({ title, company, headers, rows, totals }) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;color:#111;padding:32px;}
  h1{font-size:20px;font-weight:800;margin-bottom:4px;}
  .sub{font-size:12px;color:#64748b;margin-bottom:20px;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th{background:#0f172a;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;}
  td{padding:7px 10px;border-bottom:1px solid #f1f5f9;}
  tr:nth-child(even) td{background:#f8fafc;}
  .total-row td{font-weight:800;background:#f1f5f9;font-size:13px;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
  <h1>${title}</h1>
  <div class="sub">${company?.name||""} ${company?.cuit?`· CUIT ${company.cuit}`:""} · ${new Date().toLocaleDateString("es-AR")}</div>
  <table>
    <thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}
      ${totals?`<tr class="total-row">${totals.map(c=>`<td>${c}</td>`).join("")}</tr>`:""}
    </tbody>
  </table>
</body></html>`;
  const w=window.open("","_blank");w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),400);
}

// ─── RECIBO EDITOR (crear/editar recibo manualmente) ─────────────────────────────
function ReciboEditor({ recibo, clients, concepts, company, onSave, onClose }) {
  const isNew = !recibo;
  const now = new Date();
  const [clientId, setClientId] = useState(recibo?.clientId||"");
  const [items, setItems] = useState(recibo?.items||[]);
  const [date, setDate] = useState(recibo?.date||today());
  const [addingItem, setAddingItem] = useState(false);
  const [ef, setEf] = useState({concept:concepts[0]||"Honorarios",description:"",amount:""});
  const [clientSearch, setClientSearch] = useState("");

  const [status, setStatus] = useState(recibo?.status||"pendiente");

  const client = clients.find(c=>c.id===clientId);
  const total = items.reduce((s,i)=>s+(i.amount||0),0);
  const folio = recibo?.folio||`R-${Date.now().toString().slice(-6)}`;

  const addItem = () => {
    if(!ef.description||!ef.amount) return alert("Completá descripción y monto.");
    setItems(p=>[...p,{...ef,amount:parseFloat(ef.amount),id:uid(),status,date}]);
    setEf({concept:concepts[0]||"Honorarios",description:"",amount:""});
    setAddingItem(false);
  };

  const removeItem = id => setItems(p=>p.filter(i=>i.id!==id));
  const updateItem = (id,k,v) => setItems(p=>p.map(i=>i.id===id?{...i,[k]:k==="amount"?parseFloat(v)||0:v}:i));

  const handleSave = async (action) => {
    if(!clientId) return alert("Seleccioná un cliente.");
    if(!items.length) return alert("Agregá al menos un ítem.");
    const d = new Date(date);
    const finalItems = items.map(i=>({...i,status}));
    const r = {
      id: recibo?.id||uid(),
      folio,
      date,
      month: d.getMonth(),
      year: d.getFullYear(),
      clientId: client.id,
      clientName: client.name,
      clientCuit: client.cuit||"",
      items: finalItems,
      total,
      status,
    };
    await onSave(r, client, finalItems);
    if(action==="pdf") generatePDF(client,company,finalItems,folio,status);
    else if(action==="whatsapp") {
      const txt = `🧾 *RECIBO*\n${company?.name?`🏢 ${company.name}\n`:""}N° ${folio} | ${date}\nCliente: ${client.name}\n${finalItems.map(i=>`• ${i.concept} — ${i.description}: ${fmt(i.amount)}`).join("\n")}\n💰 TOTAL: ${fmt(total)}\n${status==="pendiente"?"⏳ PENDIENTE DE COBRO":"✅ COBRADO"}`;
      window.open(`https://wa.me/${(client.phone||"").replace(/\D/g,"")}?text=${encodeURIComponent(txt)}`,"_blank");
    }
  };

  const filteredClients = [...clients].filter(c=>(c.name||"").toLowerCase().includes(clientSearch.toLowerCase())).sort((a,b)=>(a.name||"").localeCompare(b.name||""));

  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:620}}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{isNew?"➕ Nuevo Recibo":"✏️ Editar Recibo"}</span>
          <button onClick={onClose} style={S.xBtn}>✕</button>
        </div>

        {/* Selector de cliente */}
        <div style={{...S.field,marginBottom:14}}>
          <label style={S.lbl}>Cliente *</label>
          {!clientId ? (
            <div>
              <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Buscar cliente..." style={{...S.inp,marginBottom:6}}/>
              <div style={{maxHeight:180,overflowY:"auto",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,overflow:"hidden"}}>
                {filteredClients.length===0&&<div style={{padding:12,fontSize:12,color:"#475569"}}>Sin clientes.</div>}
                {filteredClients.map(c=>(
                  <div key={c.id} onClick={()=>setClientId(c.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",background:"rgba(15,23,42,0.4)"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{c.name}</div>
                      <div style={{fontSize:10,color:"#475569"}}>{c.cuit||""}{c.condicionFiscal?` · ${c.condicionFiscal}`:""}</div>
                    </div>
                    <span style={{fontSize:11,color:"#fca5a5",fontWeight:600}}>{fmt(pendingItems(c.items))} pend.</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(110,231,183,0.08)",border:"1px solid rgba(110,231,183,0.2)",borderRadius:8,padding:"10px 14px"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:"#f1f5f9"}}>{client?.name}</div>
                <div style={{fontSize:11,color:"#475569"}}>{client?.cuit||""}{client?.condicionFiscal?` · ${client.condicionFiscal}`:""}</div>
              </div>
              <button onClick={()=>{setClientId("");setClientSearch("");}} style={{...S.btn,...S.btnGhost,padding:"4px 10px",fontSize:11}}>Cambiar</button>
            </div>
          )}
        </div>

        {/* Fecha y estado */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div style={S.field}>
            <label style={S.lbl}>Fecha del recibo</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={S.inp}/>
          </div>
          <div style={S.field}>
            <label style={S.lbl}>Estado</label>
            <div style={{display:"flex",gap:8,marginTop:2}}>
              <button onClick={()=>setStatus("pendiente")} style={{...S.btn,flex:1,padding:"8px",fontSize:12,...(status==="pendiente"?{background:"rgba(252,165,165,0.2)",color:"#fca5a5",border:"1px solid rgba(252,165,165,0.4)"}:{...S.btnGhost})}}>
                ⏳ Pendiente
              </button>
              <button onClick={()=>setStatus("pagado")} style={{...S.btn,flex:1,padding:"8px",fontSize:12,...(status==="pagado"?{background:"rgba(110,231,183,0.2)",color:"#6ee7b7",border:"1px solid rgba(110,231,183,0.4)"}:{...S.btnGhost})}}>
                ✓ Cobrado
              </button>
            </div>
          </div>
        </div>

        {/* Ítems */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <label style={S.lbl}>Ítems del recibo</label>
          <button onClick={()=>setAddingItem(!addingItem)} style={{...S.btn,...S.btnPrimary,padding:"5px 12px",fontSize:12}}>{addingItem?"Cancelar":"+ Agregar ítem"}</button>
        </div>

        {addingItem&&(
          <div style={{background:"rgba(15,23,42,0.6)",borderRadius:8,padding:12,marginBottom:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div style={S.field}><label style={S.lbl}>Concepto</label>
                <select value={ef.concept} onChange={e=>setEf({...ef,concept:e.target.value})} style={S.inp}>{concepts.map(c=><option key={c}>{c}</option>)}</select></div>
              <div style={S.field}><label style={S.lbl}>Monto ($)</label>
                <input type="number" value={ef.amount} onChange={e=>setEf({...ef,amount:e.target.value})} placeholder="0.00" style={S.inp}/></div>
              <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Descripción / Observaciones</label>
                <input value={ef.description} onChange={e=>setEf({...ef,description:e.target.value})} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Ej. Honorarios enero 2026" style={S.inp}/></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setAddingItem(false)} style={{...S.btn,...S.btnGhost,padding:"6px 12px",fontSize:12}}>Cancelar</button>
              <button onClick={addItem} style={{...S.btn,...S.btnPrimary,padding:"6px 12px",fontSize:12}}>+ Agregar</button>
            </div>
          </div>
        )}

        <div style={{border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,overflow:"hidden",marginBottom:12}}>
          {items.length===0&&<div style={{padding:16,textAlign:"center",color:"#334155",fontSize:12}}>Sin ítems. Agregá al menos uno.</div>}
          {items.map((item,idx)=>(
            <div key={item.id} style={{display:"grid",gridTemplateColumns:"120px 1fr 110px 36px",gap:8,padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.04)",alignItems:"center",background:idx%2===0?"rgba(15,23,42,0.3)":"transparent"}}>
              <select value={item.concept} onChange={e=>updateItem(item.id,"concept",e.target.value)} style={{...S.inp,fontSize:11,padding:"4px 6px"}}>
                {concepts.map(c=><option key={c}>{c}</option>)}
              </select>
              <input value={item.description} onChange={e=>updateItem(item.id,"description",e.target.value)} placeholder="Observaciones..." style={{...S.inp,fontSize:12,padding:"5px 8px"}}/>
              <input type="number" value={item.amount} onChange={e=>updateItem(item.id,"amount",e.target.value)} style={{...S.inp,fontSize:12,padding:"5px 8px",textAlign:"right"}}/>
              <button onClick={()=>removeItem(item.id)} style={{...S.iconBtn,color:"#fca5a5",fontSize:13}}>🗑</button>
            </div>
          ))}
          {items.length>0&&(
            <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:"rgba(15,23,42,0.6)"}}>
              <span style={{fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>TOTAL</span>
              <span style={{fontWeight:800,color:"#6ee7b7",fontSize:15}}>{fmt(total)}</span>
            </div>
          )}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <button onClick={()=>handleSave("save")} style={{...S.btn,...S.btnGhost,fontSize:12,padding:"9px"}}>💾 Solo guardar</button>
          <button onClick={()=>handleSave("pdf")} style={{...S.btn,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",fontSize:12,padding:"9px"}}>📄 Guardar + PDF</button>
          <button onClick={()=>handleSave("whatsapp")} style={{...S.btn,...S.btnWa,fontSize:12,padding:"9px",textAlign:"center"}}>📲 Guardar + WA</button>
        </div>
      </div>
    </div>
  );
}

// ─── RECIBOS VIEW ─────────────────────────────────────────────────────────────────
function RecibosView({ recibos, clients, company, concepts, onDeleteRecibo, onSaveRecibo, onUpdateClient }) {
  const now = new Date();
  const [filterMonth,setFilterMonth] = useState(now.getMonth());
  const [filterYear,setFilterYear] = useState(now.getFullYear());
  const [toMonth,setToMonth] = useState((now.getMonth()+1)%12);
  const [toYear,setToYear] = useState(now.getMonth()===11?now.getFullYear()+1:now.getFullYear());
  const [showEditor,setShowEditor] = useState(false);
  const [editingRecibo,setEditingRecibo] = useState(null);
  const [showCopyAll,setShowCopyAll] = useState(false);

  const filtered = recibos.filter(r=>r.month===filterMonth&&r.year===filterYear)
    .sort((a,b)=>b.date?.localeCompare(a.date||"")||0);
  const totalMes = filtered.reduce((s,r)=>s+(r.total||0),0);

  const handleCopyAll = async () => {
    if(!filtered.length) return alert("No hay recibos en el mes seleccionado.");
    for(const r of filtered) {
      const newDate = `${toYear}-${String(toMonth+1).padStart(2,"0")}-${r.date.slice(8,10)}`;
      const nr = {
        ...r,
        id: uid(),
        folio: `R-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2,5)}`,
        date: newDate,
        month: toMonth,
        year: toYear,
        items: r.items.map(i=>({...i,id:uid(),status:"pendiente",date:newDate})),
      };
      await onSaveRecibo(nr);
    }
    setShowCopyAll(false);
    alert(`✓ ${filtered.length} recibo${filtered.length!==1?"s":""} copiado${filtered.length!==1?"s":""} a ${MONTHS[toMonth]} ${toYear}`);
  };

  const handlePrint = () => {
    printList({
      title:`Recibos — ${MONTHS[filterMonth]} ${filterYear}`,
      company,
      headers:["Folio","Fecha","Cliente","CUIT","Detalle","Total"],
      rows: filtered.map(r=>[r.folio,r.date,r.clientName,r.clientCuit||"—",(r.items||[]).map(i=>`${i.concept}: ${i.description}`).join(" / "),fmt(r.total)]),
      totals:["","","","","TOTAL",fmt(totalMes)],
    });
  const [selected, setSelected] = useState([]);
  const toggleSelect = id => setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const toggleAll = () => setSelected(selected.length===filtered.length&&filtered.length>0?[]:filtered.map(r=>r.id));
  const selectedRecibos = filtered.filter(r=>selected.includes(r.id));
  const activeSet = selectedRecibos.length>0 ? selectedRecibos : filtered;

  const handlePrintSelected = () => {
    printList({
      title:`Recibos${selectedRecibos.length>0?` (${selectedRecibos.length} sel.)`:""} — ${MONTHS[filterMonth]} ${filterYear}`,
      company,
      headers:["Folio","Fecha","Cliente","CUIT","Detalle","Total","Estado"],
      rows: activeSet.map(r=>[r.folio,r.date,r.clientName,r.clientCuit||"—",(r.items||[]).map(i=>`${i.concept}${i.description?`: ${i.description}`:""}`).join(" / "),fmt(r.total),r.status==="pagado"?"Cobrado":"Pendiente"]),
      totals:["","","","","TOTAL",fmt(activeSet.reduce((s,r)=>s+(r.total||0),0)),""],
    });
  };

  const handleCopyText = () => {
    const text = activeSet.map(r=>
      `🧾 ${r.folio} | ${r.date}\n👤 ${r.clientName}${r.clientCuit?` · CUIT ${r.clientCuit}`:""}\n`+
      (r.items||[]).map(i=>`   • ${i.concept}${i.description?` — ${i.description}`:""}: ${fmt(i.amount)}`).join("\n")+
      `\n💰 TOTAL: ${fmt(r.total)} · ${r.status==="pagado"?"✓ Cobrado":"⏳ Pendiente"}`
    ).join("\n\n━━━━━━━━━━━━━━\n\n");
    navigator.clipboard.writeText(text);
    alert(`✓ ${activeSet.length} recibo${activeSet.length!==1?"s":""} copiado${activeSet.length!==1?"s":""} al portapapeles`);
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:"#f1f5f9"}}>🧾 Recibos</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select value={filterMonth} onChange={e=>{setFilterMonth(Number(e.target.value));setSelected([]);}} style={{...S.inp,padding:"6px 10px",fontSize:12,width:"auto"}}>
            {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={e=>{setFilterYear(Number(e.target.value));setSelected([]);}} style={{...S.inp,padding:"6px 10px",fontSize:12,width:"auto"}}>
            {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
          </select>
          {filtered.length>0&&<button onClick={()=>setShowCopyAll(true)} style={{...S.btn,...S.btnGhost,padding:"6px 12px",fontSize:12}}>📋 Copiar mes →</button>}
          <button onClick={()=>{setEditingRecibo(null);setShowEditor(true);}} style={{...S.btn,...S.btnPrimary}}>+ Nuevo Recibo</button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:12}}>
        {[["Total emitido",fmt(totalMes),"#6ee7b7"],["Recibos",filtered.length,"#93c5fd"],["Clientes",new Set(filtered.map(r=>r.clientId)).size,"#fde68a"]].map(([l,v,c])=>(
          <div key={l} style={{...S.card,padding:"12px 16px"}}>
            <div style={{fontWeight:800,fontSize:18,color:c}}>{v}</div>
            <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3}}>{l} — {MONTHS[filterMonth]}</div>
          </div>
        ))}
      </div>

      {/* Barra de selección y acciones masivas */}
      {filtered.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:"rgba(30,41,59,0.8)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,marginBottom:10,flexWrap:"wrap"}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={selected.length===filtered.length&&filtered.length>0} onChange={toggleAll} style={{accentColor:"#6ee7b7",width:15,height:15}}/>
            <span style={{fontSize:12,color:"#94a3b8"}}>
              {selected.length===0?"Seleccionar todos":
               selected.length===filtered.length?"✓ Todos":
               `${selected.length} de ${filtered.length}`}
            </span>
            {selected.length>0&&<span style={{fontSize:12,color:"#6ee7b7",fontWeight:700}}>{fmt(selectedRecibos.reduce((s,r)=>s+(r.total||0),0))}</span>}
          </label>
          <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={handlePrintSelected} style={{...S.btn,...S.btnGhost,padding:"6px 11px",fontSize:12}}>
              🖨 {selected.length>0?`Imprimir (${selected.length})`:"Imprimir todos"}
            </button>
            <button onClick={handleCopyText} style={{...S.btn,...S.btnGhost,padding:"6px 11px",fontSize:12}}>
              📋 {selected.length>0?`Copiar (${selected.length})`:"Copiar todos"}
            </button>
            {selected.length>0&&(
              <button onClick={()=>{selectedRecibos.forEach(r=>generatePDF({name:r.clientName,cuit:r.clientCuit},company,r.items,r.folio,r.status));}} style={{...S.btn,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",padding:"6px 11px",fontSize:12}}>
                📄 PDF ({selected.length})
              </button>
            )}
            {selected.length>0&&<button onClick={()=>setSelected([])} style={{...S.iconBtn,color:"#64748b",fontSize:12}}>✕</button>}
          </div>
        </div>
      )}

      {/* Tabla con checkboxes */}
      <div style={{...S.card,padding:0,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"36px 95px 1fr 1fr 110px 175px",padding:"8px 14px",background:"rgba(15,23,42,0.8)",borderBottom:"1px solid rgba(255,255,255,0.06)",alignItems:"center"}}>
          <input type="checkbox" checked={selected.length===filtered.length&&filtered.length>0} onChange={toggleAll} style={{accentColor:"#6ee7b7",width:14,height:14,cursor:"pointer"}}/>
          {["Folio","Cliente","Ítems","Total","Acciones"].map(h=>(
            <div key={h} style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{h}</div>
          ))}
        </div>
        {filtered.length===0&&<div style={S.empty}>Sin recibos en {MONTHS[filterMonth]} {filterYear}<br/><span style={{fontSize:12,color:"#334155"}}>Creá uno con "+ Nuevo Recibo"</span></div>}
        {filtered.map((r,idx)=>(
          <div key={r.id} style={{display:"grid",gridTemplateColumns:"36px 95px 1fr 1fr 110px 175px",padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.03)",background:selected.includes(r.id)?"rgba(110,231,183,0.06)":idx%2===0?"rgba(15,23,42,0.2)":"transparent",alignItems:"center",transition:"background 0.15s"}}>
            <input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggleSelect(r.id)} style={{accentColor:"#6ee7b7",width:14,height:14,cursor:"pointer"}}/>
            <div>
              <div style={{fontWeight:700,fontSize:12,color:"#6ee7b7"}}>{r.folio}</div>
              <div style={{fontSize:10,color:"#475569"}}>{r.date}</div>
              <button onClick={async()=>await onSaveRecibo({...r,status:r.status==="pendiente"?"pagado":"pendiente"})} style={{...S.badge,...(r.status==="pendiente"?S.bPend:S.bPaid),fontSize:10,marginTop:3,cursor:"pointer"}}>
                {r.status==="pendiente"?"⏳ Pendiente":"✓ Cobrado"}
              </button>
            </div>
            <div style={{fontSize:13,color:"#f1f5f9",fontWeight:600}}>{r.clientName}{r.clientCuit&&<div style={{fontSize:10,color:"#475569"}}>{r.clientCuit}</div>}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>
              {(r.items||[]).slice(0,2).map(i=>(<div key={i.id}>{i.concept}{i.description?` — ${i.description}`:""}</div>))}
              {(r.items||[]).length>2&&<div style={{color:"#475569"}}>+{r.items.length-2} más</div>}
            </div>
            <div style={{fontWeight:800,color:"#6ee7b7",fontSize:14}}>{fmt(r.total)}</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              <button onClick={()=>generatePDF({name:r.clientName,cuit:r.clientCuit},company,r.items,r.folio,r.status)} style={{...S.btn,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",padding:"4px 8px",fontSize:11}}>📄</button>
              <button onClick={()=>{setEditingRecibo(r);setShowEditor(true);}} style={{...S.btn,...S.btnGhost,padding:"4px 8px",fontSize:11}}>✏️</button>
              <button onClick={()=>{if(confirm("¿Eliminar?"))onDeleteRecibo(r.id);}} style={{...S.iconBtn,color:"#fca5a5",fontSize:13}}>🗑</button>
            </div>
          </div>
        ))}
        {filtered.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"36px 95px 1fr 1fr 110px 175px",padding:"9px 14px",background:"rgba(15,23,42,0.6)",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
            <span style={{gridColumn:"1/5",fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>TOTAL {MONTHS[filterMonth].toUpperCase()}</span>
            <span style={{fontWeight:800,color:"#6ee7b7",fontSize:14}}>{fmt(totalMes)}</span>
          </div>
        )}
      </div>

      {/* Editor de recibo */}
      {showEditor&&(
        <ReciboEditor
          recibo={editingRecibo}
          clients={clients}
          concepts={concepts}
          company={company}
          onSave={async (r, client, finalItems)=>{
            await onSaveRecibo(r);
            if(onUpdateClient && client) {
              const existingClient = clients.find(c=>c.id===r.clientId);
              if(existingClient) {
                const existingIds = (existingClient.items||[]).map(i=>i.id);
                const newItems = finalItems.filter(i=>!existingIds.includes(i.id));
                if(newItems.length>0) await onUpdateClient({...existingClient,items:[...(existingClient.items||[]),...newItems]});
              }
            }
            setShowEditor(false);setEditingRecibo(null);
          }}
          onClose={()=>{setShowEditor(false);setEditingRecibo(null);}}
        />
      )}

      {/* Copiar mes completo */}
      {showCopyAll&&(
        <div style={S.overlay}>
          <div style={{...S.modal,maxWidth:440}}>
            <div style={S.modalHead}><span style={S.modalTitle}>📋 Copiar todos los recibos</span><button onClick={()=>setShowCopyAll(false)} style={S.xBtn}>✕</button></div>
            <div style={{background:"rgba(15,23,42,0.5)",borderRadius:8,padding:14,marginBottom:16}}>
              <div style={{fontSize:13,color:"#f1f5f9",fontWeight:700,marginBottom:8}}>{filtered.length} recibo{filtered.length!==1?"s":""} de {MONTHS[filterMonth]} {filterYear}:</div>
              {filtered.map(r=>(
                <div key={r.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                  <span style={{color:"#94a3b8"}}>{r.clientName}</span>
                  <span style={{color:"#6ee7b7",fontWeight:700}}>{fmt(r.total)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontWeight:800,fontSize:13}}>
                <span style={{color:"#64748b"}}>Total</span>
                <span style={{color:"#6ee7b7"}}>{fmt(totalMes)}</span>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div style={S.field}><label style={S.lbl}>Mes destino</label>
                <select value={toMonth} onChange={e=>setToMonth(Number(e.target.value))} style={S.inp}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
              <div style={S.field}><label style={S.lbl}>Año destino</label>
                <select value={toYear} onChange={e=>setToYear(Number(e.target.value))} style={S.inp}>{[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}</select></div>
            </div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>Los recibos se copiarán como <strong style={{color:"#fca5a5"}}>pendientes</strong>. Después podés editarlos uno por uno.</div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
              <button onClick={()=>setShowCopyAll(false)} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
              <button onClick={handleCopyAll} style={{...S.btn,...S.btnPrimary}}>Copiar {filtered.length} recibo{filtered.length!==1?"s":""} → {MONTHS[toMonth]} {toYear}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ITEM FORM ────────────────────────────────────────────────────────────────────
function ItemForm({ concepts, onAdd, onCancel }) {
  const [f,setF] = useState({concept:concepts[0]||"Honorarios",description:"",amount:"",date:today(),status:"pendiente"});
  const set = k=>e=>setF({...f,[k]:e.target.value});
  return (
    <div style={{...S.card,marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={S.field}><label style={S.lbl}>Concepto</label>
          <select value={f.concept} onChange={set("concept")} style={S.inp}>{concepts.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={S.field}><label style={S.lbl}>Monto ($)</label>
          <input type="number" value={f.amount} onChange={set("amount")} placeholder="0.00" style={S.inp}/></div>
        <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Descripción</label>
          <input value={f.description} onChange={set("description")} placeholder="Ej. Honorarios mes de enero" style={S.inp}/></div>
        <div style={S.field}><label style={S.lbl}>Fecha</label>
          <input type="date" value={f.date} onChange={set("date")} style={S.inp}/></div>
        <div style={S.field}><label style={S.lbl}>Estado</label>
          <select value={f.status} onChange={set("status")} style={S.inp}>
            <option value="pendiente">Pendiente</option><option value="pagado">Pagado</option>
          </select></div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"flex-end"}}>
        <button onClick={onCancel} style={{...S.btn,...S.btnGhost,padding:"7px 14px",fontSize:13}}>Cancelar</button>
        <button onClick={()=>{if(!f.description||!f.amount)return alert("Completá descripción y monto.");onAdd({...f,amount:parseFloat(f.amount),id:uid()});}} style={{...S.btn,...S.btnPrimary,padding:"7px 14px",fontSize:13}}>+ Agregar</button>
      </div>
    </div>
  );
}

// ─── CUENTA CORRIENTE ─────────────────────────────────────────────────────────────
function CuentaCorriente({ client, concepts, company, onBack, onUpdate, onSaveRecibo }) {
  const [addingItem,setAddingItem] = useState(false);
  const [showRecibo,setShowRecibo] = useState(false);
  const [showCopy,setShowCopy] = useState(false);
  const [filterMonth,setFilterMonth] = useState("all");
  const [filterYear,setFilterYear] = useState(new Date().getFullYear());

  const items = client.items||[];
  const toggleStatus = id=>onUpdate({...client,items:items.map(i=>i.id===id?{...i,status:i.status==="pagado"?"pendiente":"pagado"}:i)});
  const deleteItem = id=>{if(confirm("¿Eliminar ítem?"))onUpdate({...client,items:items.filter(i=>i.id!==id)});};
  const addItem = item=>{onUpdate({...client,items:[...items,item]});setAddingItem(false);};
  const copyItems = copied=>{onUpdate({...client,items:[...items,...copied]});setShowCopy(false);};

  const filtered = items.filter(i=>{
    if(filterMonth==="all") return true;
    const d = new Date(i.date);
    return d.getMonth()===Number(filterMonth) && d.getFullYear()===filterYear;
  }).sort((a,b)=>b.date?.localeCompare(a.date||"")||0);

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{...S.btn,...S.btnGhost,padding:"7px 14px"}}>← Volver</button>
        <div style={{flex:1}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:900,color:"#f1f5f9"}}>{client.name}</h2>
          {client.cuit&&<div style={{fontSize:11,color:"#475569"}}>CUIT {client.cuit} {client.condicionFiscal&&`· ${client.condicionFiscal}`}</div>}
        </div>
        <button onClick={()=>setShowCopy(true)} style={{...S.btn,...S.btnGhost,fontSize:12,padding:"7px 12px"}}>📋 Copiar mes</button>
        <button onClick={()=>setShowRecibo(true)} style={{...S.btn,...S.btnPrimary}}>🧾 Emitir Recibo</button>
      </div>

      {/* Resumen */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>
        {[["Total facturado",fmt(totalItems(items)),"#93c5fd"],["Cobrado",fmt(paidItems(items)),"#6ee7b7"],["Pendiente",fmt(pendingItems(items)),pendingItems(items)>0?"#fca5a5":"#6ee7b7"],["Movimientos",items.length,"#fde68a"]].map(([l,v,c])=>(
          <div key={l} style={{...S.card,padding:"12px 14px"}}>
            <div style={{fontWeight:800,fontSize:16,color:c}}>{v}</div>
            <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Barra progreso */}
      {items.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#475569",marginBottom:3}}>
            <span>Progreso de cobro</span><span>{totalItems(items)>0?((paidItems(items)/totalItems(items))*100).toFixed(0):0}%</span>
          </div>
          <div style={{height:5,background:"rgba(255,255,255,0.05)",borderRadius:99}}>
            <div style={{height:5,borderRadius:99,background:"linear-gradient(90deg,#6ee7b7,#3b82f6)",width:`${totalItems(items)>0?(paidItems(items)/totalItems(items))*100:0}%`,transition:"width 0.4s"}}/>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Cuenta Corriente</span>
        <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{...S.inp,padding:"5px 10px",fontSize:12,width:"auto",marginLeft:"auto"}}>
          <option value="all">Todos los meses</option>
          {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
        </select>
        <select value={filterYear} onChange={e=>setFilterYear(Number(e.target.value))} style={{...S.inp,padding:"5px 10px",fontSize:12,width:"auto"}}>
          {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
        </select>
        <button onClick={()=>setAddingItem(!addingItem)} style={{...S.btn,...S.btnPrimary,padding:"6px 12px",fontSize:12}}>{addingItem?"Cancelar":"+ Nuevo"}</button>
      </div>

      {addingItem&&<ItemForm concepts={concepts} onAdd={addItem} onCancel={()=>setAddingItem(false)}/>}

      <div style={{...S.card,padding:0,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"100px 2fr 100px 100px 110px 36px",padding:"8px 14px",background:"rgba(15,23,42,0.8)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          {["Concepto","Descripción","Monto","Fecha","Estado",""].map(h=>(
            <div key={h} style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{h}</div>
          ))}
        </div>
        {filtered.length===0&&<div style={S.empty}>Sin movimientos{filterMonth!=="all"?` en ${MONTHS[filterMonth]} ${filterYear}`:""}</div>}
        {filtered.map((item,idx)=>(
          <div key={item.id} style={{display:"grid",gridTemplateColumns:"100px 2fr 100px 100px 110px 36px",padding:"9px 14px",borderBottom:"1px solid rgba(255,255,255,0.03)",background:idx%2===0?"rgba(15,23,42,0.2)":"transparent",alignItems:"center"}}>
            <span style={{...S.ctag,background:getColor(item.concept,concepts)+"22",color:getColor(item.concept,concepts),fontSize:10}}>{item.concept}</span>
            <span style={{fontSize:12,color:"#e2e8f0"}}>{item.description}</span>
            <span style={{fontWeight:700,color:"#f1f5f9",fontSize:12}}>{fmt(item.amount)}</span>
            <span style={{fontSize:11,color:"#475569"}}>{item.date}</span>
            <button onClick={()=>toggleStatus(item.id)} style={{...S.badge,...(item.status==="pagado"?S.bPaid:S.bPend),fontSize:10}}>
              {item.status==="pagado"?"✓ Cobrado":"⏳ Pendiente"}
            </button>
            <button onClick={()=>deleteItem(item.id)} style={{...S.iconBtn,color:"#fca5a5",fontSize:12}}>🗑</button>
          </div>
        ))}
        {filtered.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"100px 2fr 100px 100px 110px 36px",padding:"9px 14px",background:"rgba(15,23,42,0.6)",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
            <span style={{gridColumn:"1/3",fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>Subtotal</span>
            <span style={{fontWeight:800,color:"#93c5fd",fontSize:13}}>{fmt(filtered.reduce((s,i)=>s+(i.amount||0),0))}</span>
          </div>
        )}
      </div>

      {showRecibo&&<ReciboModal client={client} company={company} concepts={concepts} onClose={()=>setShowRecibo(false)} onSaveRecibo={async r=>{if(onSaveRecibo)await onSaveRecibo(r);}}/>}
      {showCopy&&<CopyMonthModal client={client} onCopy={copyItems} onClose={()=>setShowCopy(false)}/>}
    </div>
  );
}

// ─── CLIENT FORM ──────────────────────────────────────────────────────────────────
function ClientForm({ initial, onSave, onCancel }) {
  const [f,setF] = useState(initial||{name:"",cuit:"",condicionFiscal:"",phone:"",email:"",notes:"",items:[]});
  const [arcaLoading,setArcaLoading] = useState(false);
  const [arcaMsg,setArcaMsg] = useState("");
  const set = k=>e=>setF({...f,[k]:e.target.value});
  const consultarARCA = async()=>{
    const c=f.cuit.replace(/\D/g,"");
    if(c.length!==11)return setArcaMsg("⚠ CUIT inválido");
    setArcaLoading(true);setArcaMsg("Consultando...");
    try{const r=await fetch(`https://afip.tangofactura.com/Rest/GetContribuyenteFull?cuit=${c}`);const d=await r.json();if(d?.Contribuyente?.nombre){setF(p=>({...p,name:d.Contribuyente.nombre,condicionFiscal:d.Contribuyente.categoriasMonotributo?.length>0?"Monotributista":"Responsable Inscripto"}));setArcaMsg(`✓ ${d.Contribuyente.nombre}`);}else setArcaMsg("⚠ No encontrado");}catch{setArcaMsg("⚠ Error de conexión");}
    setArcaLoading(false);
  };
  return (
    <div style={{...S.card,maxWidth:600,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 18px",fontSize:18,fontWeight:800,color:"#f1f5f9"}}>{initial?"✏️ Editar Cliente":"➕ Nuevo Cliente"}</h2>
      <div style={{...S.field,marginBottom:12}}>
        <label style={S.lbl}>CUIT</label>
        <div style={{display:"flex",gap:8}}>
          <input value={f.cuit||""} onChange={e=>setF({...f,cuit:formatCuit(e.target.value)})} placeholder="20-12345678-9" maxLength={13} style={{...S.inp,flex:1}}/>
          <button onClick={consultarARCA} disabled={arcaLoading} style={{...S.btn,...S.btnPrimary,padding:"8px 12px",fontSize:12,opacity:arcaLoading?0.6:1}}>{arcaLoading?"...":"🔍 ARCA"}</button>
        </div>
        {arcaMsg&&<div style={{fontSize:11,marginTop:5,padding:"4px 8px",borderRadius:6,background:arcaMsg.startsWith("✓")?"rgba(110,231,183,0.1)":"rgba(252,165,165,0.1)",color:arcaMsg.startsWith("✓")?"#6ee7b7":"#fca5a5"}}>{arcaMsg}</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Nombre / Razón Social *</label><input value={f.name||""} onChange={set("name")} placeholder="Nombre del cliente" style={S.inp}/></div>
        <div style={S.field}><label style={S.lbl}>Condición fiscal</label>
          <select value={f.condicionFiscal||""} onChange={set("condicionFiscal")} style={S.inp}>
            <option value="">Seleccionar...</option><option>Responsable Inscripto</option><option>Monotributista</option><option>Consumidor Final</option><option>Exento</option>
          </select></div>
        <div style={S.field}><label style={S.lbl}>Teléfono</label><input type="tel" value={f.phone||""} onChange={set("phone")} placeholder="11 1234-5678" style={S.inp}/></div>
        <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Email</label><input type="email" value={f.email||""} onChange={set("email")} placeholder="correo@ejemplo.com" style={S.inp}/></div>
        <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Notas</label><textarea value={f.notes||""} onChange={set("notes")} placeholder="Observaciones..." style={{...S.inp,resize:"vertical",minHeight:50}}/></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:16}}>
        <button onClick={onCancel} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
        <button onClick={()=>{if(!f.name)return alert("El nombre es obligatorio.");onSave(f);}} style={{...S.btn,...S.btnPrimary}}>{initial?"Guardar":"Crear cliente"}</button>
      </div>
    </div>
  );
}

// ─── PENDIENTES / COBRADO VIEW ────────────────────────────────────────────────────
function MovimientosView({ clients, status, concepts, company, onUpdateClient }) {
  const [filterMonth,setFilterMonth] = useState("all");
  const [filterYear,setFilterYear] = useState(new Date().getFullYear());
  const [showRecibo,setShowRecibo] = useState(null);

  const allItems = useMemo(()=>{
    const rows = [];
    clients.forEach(c=>{
      (c.items||[]).forEach(i=>{
        if(i.status!==status) return;
        const d = new Date(i.date);
        if(filterMonth!=="all"&&(d.getMonth()!==Number(filterMonth)||d.getFullYear()!==filterYear)) return;
        rows.push({...i, clientName:c.name, clientId:c.id, client:c});
      });
    });
    return rows.sort((a,b)=>b.date?.localeCompare(a.date||"")||0);
  },[clients,status,filterMonth,filterYear]);

  const totalAmt = allItems.reduce((s,i)=>s+(i.amount||0),0);

  const toggleStatus = (clientId, itemId)=>{
    const c = clients.find(x=>x.id===clientId);
    if(!c) return;
    onUpdateClient({...c,items:(c.items||[]).map(i=>i.id===itemId?{...i,status:i.status==="pagado"?"pendiente":"pagado"}:i)});
  };

  const isPending = status==="pendiente";

  const handlePrint = () => {
    printList({
      title: isPending?"Pendientes de cobro":"Cobrado",
      company,
      headers:["Cliente","Concepto","Descripción","Monto","Fecha"],
      rows: allItems.map(i=>[i.clientName, i.concept, i.description, fmt(i.amount), i.date]),
      totals:["","","TOTAL",fmt(totalAmt),""],
    });
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:"#f1f5f9"}}>
          {isPending?"⏳ Pendientes de cobro":"✅ Cobrado"}
        </h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{...S.inp,padding:"6px 10px",fontSize:12,width:"auto"}}>
            <option value="all">Todos los meses</option>
            {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={e=>setFilterYear(Number(e.target.value))} style={{...S.inp,padding:"6px 10px",fontSize:12,width:"auto"}}>
            {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
          </select>
          <button onClick={handlePrint} style={{...S.btn,...S.btnGhost,padding:"6px 12px",fontSize:12}}>🖨 Imprimir</button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20}}>
        <div style={{...S.card,padding:"14px 16px"}}>
          <div style={{fontWeight:800,fontSize:20,color:isPending?"#fca5a5":"#6ee7b7"}}>{fmt(totalAmt)}</div>
          <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3}}>{isPending?"Total pendiente":"Total cobrado"}</div>
        </div>
        <div style={{...S.card,padding:"14px 16px"}}>
          <div style={{fontWeight:800,fontSize:20,color:"#93c5fd"}}>{allItems.length}</div>
          <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3}}>Movimientos</div>
        </div>
        <div style={{...S.card,padding:"14px 16px"}}>
          <div style={{fontWeight:800,fontSize:20,color:"#fde68a"}}>{new Set(allItems.map(i=>i.clientId)).size}</div>
          <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3}}>Clientes</div>
        </div>
      </div>

      {/* Tabla */}
      <div style={{...S.card,padding:0,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 100px 2fr 100px 100px 110px",padding:"8px 14px",background:"rgba(15,23,42,0.8)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          {["Cliente","Concepto","Descripción","Monto","Fecha","Acción"].map(h=>(
            <div key={h} style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{h}</div>
          ))}
        </div>
        {allItems.length===0&&<div style={S.empty}>No hay {isPending?"pendientes":"cobros"}{filterMonth!=="all"?` en ${MONTHS[filterMonth]} ${filterYear}`:""}</div>}
        {allItems.map((item,idx)=>(
          <div key={item.id} style={{display:"grid",gridTemplateColumns:"1.5fr 100px 2fr 100px 100px 110px",padding:"9px 14px",borderBottom:"1px solid rgba(255,255,255,0.03)",background:idx%2===0?"rgba(15,23,42,0.2)":"transparent",alignItems:"center"}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"#f1f5f9"}}>{item.clientName}</div>
            </div>
            <span style={{...S.ctag,background:getColor(item.concept,concepts)+"22",color:getColor(item.concept,concepts),fontSize:10}}>{item.concept}</span>
            <span style={{fontSize:12,color:"#e2e8f0"}}>{item.description}</span>
            <span style={{fontWeight:700,color:isPending?"#fca5a5":"#6ee7b7",fontSize:12}}>{fmt(item.amount)}</span>
            <span style={{fontSize:11,color:"#475569"}}>{item.date}</span>
            <button onClick={()=>toggleStatus(item.clientId,item.id)} style={{...S.badge,...(isPending?S.bPend:S.bPaid),fontSize:10}}>
              {isPending?"✓ Marcar cobrado":"↩ Marcar pend."}
            </button>
          </div>
        ))}
        {allItems.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1.5fr 100px 2fr 100px 100px 110px",padding:"9px 14px",background:"rgba(15,23,42,0.6)",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
            <span style={{gridColumn:"1/4",fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>TOTAL</span>
            <span style={{fontWeight:800,color:isPending?"#fca5a5":"#6ee7b7",fontSize:13}}>{fmt(totalAmt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CHART VIEW ───────────────────────────────────────────────────────────────────
function ChartView({ clients, concepts }) {
  const [chartType,setChartType] = useState("bar");
  const [year,setYear] = useState(new Date().getFullYear());
  const monthlyData = useMemo(()=>MONTHS_SHORT.map((m,mi)=>{
    const row={month:m}; let total=0;
    concepts.forEach(c=>{
      let sum=0;
      clients.forEach(cl=>(cl.items||[]).forEach(item=>{
        const d=new Date(item.date);
        if(d.getFullYear()===year&&d.getMonth()===mi&&item.concept===c&&item.status==="pagado") sum+=item.amount;
      }));
      if(sum>0) row[c]=sum; total+=sum;
    }); row.Total=total; return row;
  }),[clients,year,concepts]);
  const active = concepts.filter(c=>monthlyData.some(r=>r[c]));
  const totals = concepts.map((c,ci)=>({concept:c,color:CONCEPT_COLORS[ci%CONCEPT_COLORS.length],total:clients.reduce((s,cl)=>s+(cl.items||[]).filter(i=>i.concept===c&&i.status==="pagado").reduce((a,b)=>a+(b.amount||0),0),0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total);
  const grand = totals.reduce((s,c)=>s+c.total,0);
  const Tip = ({active:a,payload,label})=>a&&payload?.length?(<div style={{background:"#1e293b",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 14px"}}><div style={{fontWeight:700,marginBottom:6,color:"#f1f5f9",fontSize:13}}>{label}</div>{payload.map(p=>(<div key={p.name} style={{display:"flex",justifyContent:"space-between",gap:14,fontSize:12}}><span style={{color:getColor(p.name,concepts)}}>{p.name}</span><span style={{fontWeight:700,color:"#f1f5f9"}}>{fmt(p.value)}</span></div>))}</div>):null;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:"#f1f5f9"}}>📊 Análisis de Ingresos</h2>
        <div style={{display:"flex",gap:8}}>
          <select value={year} onChange={e=>setYear(Number(e.target.value))} style={{...S.inp,padding:"7px 12px",fontSize:13,width:"auto"}}>
            {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
          </select>
          <button onClick={()=>setChartType("bar")} style={{...S.btn,...(chartType==="bar"?S.btnPrimary:S.btnGhost),padding:"7px 14px",fontSize:13}}>▐ Barras</button>
          <button onClick={()=>setChartType("line")} style={{...S.btn,...(chartType==="line"?S.btnPrimary:S.btnGhost),padding:"7px 14px",fontSize:13}}>↗ Líneas</button>
        </div>
      </div>
      <div style={{...S.card,marginBottom:20}}>
        <div style={{fontSize:12,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontWeight:700}}>Ingresos cobrados {year}</div>
        {!monthlyData.some(r=>r.Total>0)?<div style={S.empty}>Sin datos para {year}</div>:(
          <ResponsiveContainer width="100%" height={280}>
            {chartType==="bar"?(
              <BarChart data={monthlyData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="month" tick={{fill:"#64748b",fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`}/>
                <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11,paddingTop:8}}/>
                {active.map((c,i)=><Bar key={c} dataKey={c} stackId="a" fill={getColor(c,concepts)} radius={i===active.length-1?[4,4,0,0]:[0,0,0,0]}/>)}
              </BarChart>
            ):(
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="month" tick={{fill:"#64748b",fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`}/>
                <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/>
                {active.map(c=><Line key={c} type="monotone" dataKey={c} stroke={getColor(c,concepts)} strokeWidth={2} dot={{r:3}}/>)}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12}}>
        {totals.map(({concept,color,total})=>(
          <div key={concept} style={{...S.card,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:color,flexShrink:0}}/>
              <span style={{fontSize:12,color:"#94a3b8"}}>{concept}</span>
            </div>
            <div style={{fontWeight:800,fontSize:17,color}}>{fmt(total)}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:3}}>{grand>0?((total/grand)*100).toFixed(1):0}% del total</div>
            <div style={{height:3,background:"rgba(255,255,255,0.05)",borderRadius:99,marginTop:8}}>
              <div style={{height:3,borderRadius:99,background:color,width:`${grand>0?(total/grand)*100:0}%`}}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [recibos,setRecibos] = useState([]);
  const [user,setUser] = useState(null);
  const [authLoading,setAuthLoading] = useState(true);
  const [clients,setClients] = useState([]);
  const [dbLoading,setDbLoading] = useState(false);
  const [company,setCompany] = useState(DEFAULT_COMPANY);
  const [concepts,setConcepts] = useState(DEFAULT_CONCEPTS);
  const [view,setView] = useState("chart");
  const [selected,setSelected] = useState(null);
  const [search,setSearch] = useState("");
  const [sortBy,setSortBy] = useState("name");
  const [showCompany,setShowCompany] = useState(false);
  const [showConcepts,setShowConcepts] = useState(false);

  useEffect(()=>{ const u=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false);}); return u; },[]);
  useEffect(()=>{
    if(!user)return;
    setDbLoading(true);
    const u1=onSnapshot(collection(db,"users",user.uid,"clients"),s=>{setClients(s.docs.map(d=>({id:d.id,...d.data()})));setDbLoading(false);});
    const u2=onSnapshot(doc(db,"users",user.uid,"settings","company"),s=>{if(s.exists())setCompany(s.data());});
    const u3=onSnapshot(doc(db,"users",user.uid,"settings","concepts"),s=>{if(s.exists()&&s.data().list)setConcepts(s.data().list);});
    const u4=onSnapshot(collection(db,"users",user.uid,"recibos"),s=>{setRecibos(s.docs.map(d=>({id:d.id,...d.data()})));});
    return()=>{u1();u2();u3();u4();};
  },[user]);

  const login=async()=>{setAuthLoading(true);try{await signInWithPopup(auth,new GoogleAuthProvider());}catch{setAuthLoading(false);}};
  const logout=async()=>{await signOut(auth);setClients([]);setView("list");setSelected(null);};
  const saveClient=async c=>await setDoc(doc(db,"users",user.uid,"clients",c.id),c);
  const addClient=async d=>{const c={...d,id:uid(),items:[]};await saveClient(c);setView("list");};
  const updateClient=async u=>{await saveClient(u);setSelected(u);};
  const deleteClient=async id=>{if(!confirm("¿Eliminar cliente?"))return;await deleteDoc(doc(db,"users",user.uid,"clients",id));setView("list");};
  const saveRecibo=async r=>await setDoc(doc(db,"users",user.uid,"recibos",r.id),r);
  const deleteRecibo=async id=>await deleteDoc(doc(db,"users",user.uid,"recibos",id));
  const copyRecibo=async r=>await saveRecibo(r);
  const saveCompany=async p=>{setCompany(p);await setDoc(doc(db,"users",user.uid,"settings","company"),p);setShowCompany(false);};
  const saveConcepts=async l=>{setConcepts(l);await setDoc(doc(db,"users",user.uid,"settings","concepts"),{list:l});setShowConcepts(false);};

  if(authLoading)return<div style={{minHeight:"100vh",background:"#080d1a",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#6ee7b7",fontSize:40}}>◈</span></div>;
  if(!user)return<LoginScreen onLogin={login} loading={authLoading}/>;

  const sorted=[...clients].filter(c=>c.name?.toLowerCase().includes(search.toLowerCase())||(c.cuit||"").includes(search)).sort((a,b)=>{
    if(sortBy==="name")return(a.name||"").localeCompare(b.name||"");
    if(sortBy==="pending")return pendingItems(b.items)-pendingItems(a.items);
    if(sortBy==="total")return totalItems(b.items)-totalItems(a.items);
    return 0;
  });

  const allPaid=clients.reduce((s,c)=>s+paidItems(c.items),0);
  const allPend=clients.reduce((s,c)=>s+pendingItems(c.items),0);

  const NAV = [
    ["👥","Clientes","list"],
    ["🧾","Recibos","recibos"],
    ["⏳","Pendientes","pendientes"],
    ["✅","Cobrado","cobrado"],
    ["📊","Análisis","chart"],
  ];

  return (
    <div style={S.root}>
      <style>{`*{box-sizing:border-box;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#334155;border-radius:99px;}input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5);}`}</style>
      <nav style={S.nav}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
          <span style={{fontSize:22,color:"#6ee7b7"}}>◈</span>
          <div><div style={{fontWeight:800,fontSize:14,color:"#f1f5f9"}}>ClientesPro</div><div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:"0.1em"}}>v6.0</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,padding:"8px 10px",background:"rgba(110,231,183,0.06)",borderRadius:9,border:"1px solid rgba(110,231,183,0.1)"}}>
          <img src={user.photoURL} alt="" style={{width:24,height:24,borderRadius:"50%"}}/>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.displayName}</div></div>
        </div>
        {NAV.map(([ic,lb,v])=>(
          <button key={v} onClick={()=>setView(v)} style={{...S.navBtn,...((view===v||view==="cuenta"&&v==="list")?S.navActive:{})}}>
            <span>{ic}</span><span>{lb}</span>
            {v==="pendientes"&&allPend>0&&<span style={{marginLeft:"auto",fontSize:10,color:"#fca5a5",fontWeight:700}}>{fmt(allPend)}</span>}
          </button>
        ))}
        <div style={{margin:"14px 0",borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:14}}>
          {[["Cobrado",fmt(allPaid),"#6ee7b7"],["Pendiente",fmt(allPend),"#fca5a5"],["Clientes",clients.length,"#93c5fd"]].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:11}}>
              <span style={{color:"#475569"}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:6}}>
          <button onClick={()=>setShowCompany(true)} style={{...S.btn,...S.btnGhost,fontSize:11,padding:"6px",width:"100%"}}>🏢 Datos de la empresa</button>
          <button onClick={()=>setShowConcepts(true)} style={{...S.btn,...S.btnGhost,fontSize:11,padding:"6px",width:"100%"}}>🏷 Conceptos</button>
          <button onClick={()=>{const rows=[["Cliente","CUIT","Concepto","Descripción","Monto","Fecha","Estado"]];clients.forEach(c=>(c.items||[]).forEach(i=>rows.push([c.name,c.cuit||"",i.concept,i.description,i.amount,i.date,i.status])));const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));a.download="clientes_pro.csv";a.click();}} style={{...S.btn,...S.btnGhost,fontSize:11,padding:"6px",width:"100%"}}>📥 Exportar CSV</button>
          <button onClick={logout} style={{...S.btn,background:"rgba(252,165,165,0.08)",color:"#fca5a5",border:"1px solid rgba(252,165,165,0.15)",fontSize:11,padding:"6px",width:"100%"}}>↩ Salir</button>
        </div>
      </nav>

      <div style={S.main}>
        {dbLoading&&<div style={{textAlign:"center",padding:40,color:"#475569"}}>Cargando...</div>}

        {/* LISTA */}
        {!dbLoading&&view==="list"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
              <h1 style={{margin:0,fontSize:20,fontWeight:900,color:"#f1f5f9"}}>Clientes <span style={{fontSize:13,color:"#475569",fontWeight:400}}>({clients.length})</span></h1>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>printList({title:"Lista de Clientes",company,headers:["Cliente","CUIT","Condición","Total","Cobrado","Pendiente"],rows:sorted.map(c=>[c.name,c.cuit||"—",c.condicionFiscal||"—",fmt(totalItems(c.items)),fmt(paidItems(c.items)),fmt(pendingItems(c.items))]),totals:["TOTALES","","",fmt(clients.reduce((s,c)=>s+totalItems(c.items),0)),fmt(allPaid),fmt(allPend)]})} style={{...S.btn,...S.btnGhost,fontSize:12,padding:"7px 12px"}}>🖨 Imprimir</button>
                <button onClick={()=>setView("add")} style={{...S.btn,...S.btnPrimary}}>+ Nuevo cliente</button>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:180,display:"flex",alignItems:"center",background:"rgba(30,41,59,0.6)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:"0 12px"}}>
                <span style={{opacity:0.3,marginRight:8,fontSize:12}}>🔍</span>
                <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,background:"none",border:"none",outline:"none",color:"#e2e8f0",fontSize:13,padding:"8px 0"}}/>
              </div>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...S.inp,padding:"7px 10px",fontSize:12,width:"auto"}}>
                <option value="name">A–Z</option>
                <option value="pending">Mayor deuda</option>
                <option value="total">Mayor facturado</option>
              </select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 110px 110px 100px 70px",padding:"7px 14px",background:"rgba(15,23,42,0.8)",borderRadius:"9px 9px 0 0",border:"1px solid rgba(255,255,255,0.06)"}}>
              {["Cliente","CUIT","Condición","Total","Cobrado","Pendiente",""].map(h=>(
                <div key={h} style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{h}</div>
              ))}
            </div>
            <div style={{border:"1px solid rgba(255,255,255,0.06)",borderTop:"none",borderRadius:"0 0 9px 9px",overflow:"hidden"}}>
              {sorted.length===0&&<div style={S.empty}>{clients.length===0?"¡Agregá tu primer cliente!":"Sin resultados."}</div>}
              {sorted.map((c,idx)=>(
                <div key={c.id} onClick={()=>{setSelected(c);setView("cuenta");}} style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 110px 110px 100px 70px",padding:"11px 14px",borderBottom:"1px solid rgba(255,255,255,0.04)",background:idx%2===0?"rgba(15,23,42,0.3)":"rgba(20,30,50,0.4)",cursor:"pointer",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{c.name}</div>
                    {c.notes&&<div style={{fontSize:10,color:"#334155",marginTop:1}}>{c.notes.slice(0,35)}{c.notes.length>35?"...":""}</div>}
                  </div>
                  <div style={{fontSize:11,color:"#64748b"}}>{c.cuit||"—"}</div>
                  <div>{c.condicionFiscal?<span style={{...S.ctag,background:"rgba(147,197,253,0.1)",color:"#93c5fd",fontSize:10}}>{c.condicionFiscal}</span>:<span style={{color:"#334155",fontSize:11}}>—</span>}</div>
                  <div style={{fontWeight:700,color:"#93c5fd",fontSize:12}}>{fmt(totalItems(c.items))}</div>
                  <div style={{fontWeight:700,color:"#6ee7b7",fontSize:12}}>{fmt(paidItems(c.items))}</div>
                  <div style={{fontWeight:700,color:pendingItems(c.items)>0?"#fca5a5":"#6ee7b7",fontSize:12}}>{fmt(pendingItems(c.items))}</div>
                  <div style={{display:"flex",gap:3}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>{setSelected(c);setView("edit");}} style={{...S.iconBtn,color:"#fde68a",fontSize:12}}>✏️</button>
                    <button onClick={()=>deleteClient(c.id)} style={{...S.iconBtn,color:"#fca5a5",fontSize:12}}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
            {clients.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 110px 110px 100px 70px",padding:"9px 14px",background:"rgba(15,23,42,0.8)",borderRadius:8,marginTop:6,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{gridColumn:"1/4",fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>TOTALES</div>
                <div style={{fontWeight:800,color:"#93c5fd",fontSize:12}}>{fmt(clients.reduce((s,c)=>s+totalItems(c.items),0))}</div>
                <div style={{fontWeight:800,color:"#6ee7b7",fontSize:12}}>{fmt(allPaid)}</div>
                <div style={{fontWeight:800,color:"#fca5a5",fontSize:12}}>{fmt(allPend)}</div>
              </div>
            )}
          </>
        )}

        {!dbLoading&&view==="add"&&<ClientForm onSave={addClient} onCancel={()=>setView("list")}/>}
        {!dbLoading&&view==="edit"&&selected&&<ClientForm initial={selected} onSave={async d=>{await updateClient({...selected,...d});setView("list");}} onCancel={()=>setView("list")}/>}
        {!dbLoading&&view==="cuenta"&&selected&&(
          <CuentaCorriente
            client={clients.find(c=>c.id===selected?.id)||selected}
            concepts={concepts} company={company}
            onBack={()=>setView("list")}
            onUpdate={updateClient}
            onSaveRecibo={saveRecibo}
          />
        )}
        {!dbLoading&&view==="recibos"&&<RecibosView recibos={recibos} clients={clients} company={company} concepts={concepts} onDeleteRecibo={deleteRecibo} onSaveRecibo={saveRecibo} onUpdateClient={updateClient}/>}
        {!dbLoading&&view==="pendientes"&&<MovimientosView clients={clients} status="pendiente" concepts={concepts} company={company} onUpdateClient={updateClient}/>}
        {!dbLoading&&view==="cobrado"&&<MovimientosView clients={clients} status="pagado" concepts={concepts} company={company} onUpdateClient={updateClient}/>}
        {!dbLoading&&view==="chart"&&<ChartView clients={clients} concepts={concepts}/>}
      </div>

      {showCompany&&<CompanyModal company={company} onSave={saveCompany} onClose={()=>setShowCompany(false)}/>}
      {showConcepts&&<ConceptsModal concepts={concepts} onSave={saveConcepts} onClose={()=>setShowConcepts(false)}/>}
    </div>
  );
}

const S = {
  root:{display:"flex",minHeight:"100vh",background:"#080d1a",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e2e8f0"},
  nav:{width:205,flexShrink:0,background:"rgba(10,18,35,0.98)",borderRight:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",padding:"16px 12px",position:"sticky",top:0,height:"100vh",overflowY:"auto"},
  navBtn:{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:8,border:"none",background:"none",color:"#475569",fontSize:13,fontWeight:500,cursor:"pointer",textAlign:"left",width:"100%"},
  navActive:{background:"rgba(110,231,183,0.08)",color:"#6ee7b7",fontWeight:700},
  main:{flex:1,padding:"24px 28px",overflowY:"auto",minHeight:"100vh"},
  card:{background:"rgba(20,30,50,0.7)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"16px"},
  field:{display:"flex",flexDirection:"column",gap:5},
  lbl:{fontSize:10,color:"#475569",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"},
  inp:{background:"rgba(8,13,26,0.7)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:7,padding:"8px 12px",color:"#f1f5f9",fontSize:13,outline:"none"},
  btn:{border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer"},
  btnPrimary:{background:"linear-gradient(135deg,#6ee7b7,#3b82f6)",color:"#050a14"},
  btnGhost:{background:"rgba(255,255,255,0.05)",color:"#64748b",border:"1px solid rgba(255,255,255,0.08)"},
  btnWa:{background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff"},
  iconBtn:{background:"none",border:"none",cursor:"pointer",fontSize:14,padding:"4px 6px",borderRadius:6},
  badge:{border:"none",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,cursor:"pointer"},
  bPaid:{background:"rgba(110,231,183,0.1)",color:"#6ee7b7"},
  bPend:{background:"rgba(252,165,165,0.1)",color:"#fca5a5"},
  ctag:{display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600},
  empty:{padding:36,textAlign:"center",color:"#334155",fontSize:13},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16},
  modal:{background:"#0e1829",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:24,width:"100%",maxHeight:"92vh",overflowY:"auto"},
  modalHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  modalTitle:{fontWeight:800,fontSize:16,color:"#f1f5f9"},
  xBtn:{background:"none",border:"none",color:"#475569",fontSize:17,cursor:"pointer"},
  checkRow:{display:"flex",alignItems:"center",gap:8,padding:"6px 2px",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer"},
  ticketPre:{background:"#050a14",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,padding:14,fontSize:11,color:"#94a3b8",lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"monospace",margin:0},
};
