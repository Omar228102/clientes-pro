import { useState, useMemo, useEffect } from "react";
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

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────────
const DEFAULT_CONCEPTS = ["Honorarios","Consultoría","Mantenimiento","Materiales","Traslado","Capacitación","Otro"];
const CONCEPT_COLORS = ["#6ee7b7","#93c5fd","#fde68a","#f9a8d4","#c4b5fd","#fb923c","#94a3b8","#67e8f9","#a78bfa","#fdba74"];
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DEFAULT_PROFILE = { name:"", cuit:"", address:"", phone:"", email:"", web:"", extra:"" };

// ─── UTILS ───────────────────────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS"}).format(n||0);
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2);
const today = () => new Date().toISOString().slice(0,10);
const totalItems = (items=[]) => items.reduce((s,i)=>s+(i.amount||0),0);
const paidItems = (items=[]) => items.filter(i=>i.status==="pagado").reduce((s,i)=>s+(i.amount||0),0);
const pendingItems = (items=[]) => items.filter(i=>i.status==="pendiente").reduce((s,i)=>s+(i.amount||0),0);
const formatCuit = v => { const n=v.replace(/\D/g,"").slice(0,11); if(n.length<=2)return n; if(n.length<=10)return `${n.slice(0,2)}-${n.slice(2)}`; return `${n.slice(0,2)}-${n.slice(2,10)}-${n.slice(10)}`; };
const getColor = (concept, concepts) => { const i = concepts.indexOf(concept); return CONCEPT_COLORS[i % CONCEPT_COLORS.length]; };

// ─── LOGIN ───────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, loading }) {
  return (
    <div style={{minHeight:"100vh",background:"#080d1a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{textAlign:"center",padding:40}}>
        <div style={{fontSize:64,color:"#6ee7b7",marginBottom:16}}>◈</div>
        <h1 style={{color:"#f1f5f9",fontSize:32,fontWeight:900,margin:"0 0 8px",letterSpacing:"-1px"}}>ClientesPro</h1>
        <p style={{color:"#475569",fontSize:15,margin:"0 0 40px"}}>Gestión de clientes y tickets profesional</p>
        <button onClick={onLogin} disabled={loading} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",border:"none",borderRadius:12,padding:"14px 28px",fontSize:15,fontWeight:600,cursor:"pointer",margin:"0 auto",boxShadow:"0 4px 24px rgba(0,0,0,0.3)",opacity:loading?0.7:1}}>
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
          {loading?"Iniciando...":"Continuar con Google"}
        </button>
        <p style={{color:"#334155",fontSize:12,marginTop:24}}>Cada usuario accede solo a sus propios datos</p>
      </div>
    </div>
  );
}

// ─── PROFILE MODAL ────────────────────────────────────────────────────────────────
function ProfileModal({ profile, onSave, onClose }) {
  const [f, setF] = useState(profile || DEFAULT_PROFILE);
  const set = k => e => setF({...f,[k]:e.target.value});
  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:500}}>
        <div style={S.modalHead}><span style={S.modalTitle}>🏢 Datos del Estudio / Emisor</span><button onClick={onClose} style={S.xBtn}>✕</button></div>
        <p style={{fontSize:12,color:"#64748b",margin:"0 0 16px"}}>Estos datos aparecerán en todos tus tickets.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[["Nombre / Razón Social","name","text","Estudio Contable XYZ","1/-1"],
            ["CUIT","cuit","text","20-12345678-9",""],
            ["Teléfono","phone","tel","11 1234-5678",""],
            ["Email","email","email","info@estudio.com",""],
            ["Dirección","address","text","Av. Corrientes 1234, CABA","1/-1"],
            ["Sitio web","web","text","www.estudio.com",""],
            ["Info adicional (matrícula, etc.)","extra","text","Mat. Prof. 12345","1/-1"],
          ].map(([l,k,t,p,gc])=>(
            <div key={k} style={{...S.field,gridColumn:gc||"auto"}}>
              <label style={S.lbl}>{l}</label>
              <input type={t} value={f[k]||""} onChange={set(k)} placeholder={p} style={S.inp}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}>
          <button onClick={onClose} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
          <button onClick={()=>onSave(f)} style={{...S.btn,...S.btnPrimary}}>Guardar datos</button>
        </div>
      </div>
    </div>
  );
}

// ─── CONCEPTS MODAL ───────────────────────────────────────────────────────────────
function ConceptsModal({ concepts, onSave, onClose }) {
  const [list, setList] = useState([...concepts]);
  const [newOne, setNewOne] = useState("");
  const add = () => { if(!newOne.trim()||list.includes(newOne.trim()))return; setList([...list,newOne.trim()]); setNewOne(""); };
  const remove = c => { if(list.length<=1)return alert("Debe haber al menos un concepto."); setList(list.filter(x=>x!==c)); };
  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:420}}>
        <div style={S.modalHead}><span style={S.modalTitle}>🏷 Gestionar Conceptos</span><button onClick={onClose} style={S.xBtn}>✕</button></div>
        <p style={{fontSize:12,color:"#64748b",margin:"0 0 14px"}}>Personalizá las categorías de cobro.</p>
        <div style={{marginBottom:14}}>
          {list.map((c,i)=>(
            <div key={c} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:CONCEPT_COLORS[i%CONCEPT_COLORS.length],flexShrink:0}}/>
              <span style={{flex:1,fontSize:13,color:"#e2e8f0"}}>{c}</span>
              <button onClick={()=>remove(c)} style={{...S.iconBtn,color:"#fca5a5",fontSize:13}}>✕</button>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={newOne} onChange={e=>setNewOne(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Nuevo concepto..." style={{...S.inp,flex:1}}/>
          <button onClick={add} style={{...S.btn,...S.btnPrimary,padding:"8px 14px"}}>+ Agregar</button>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}>
          <button onClick={onClose} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
          <button onClick={()=>onSave(list)} style={{...S.btn,...S.btnPrimary}}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── TICKET MODAL ─────────────────────────────────────────────────────────────────
function TicketModal({ client, profile, concepts, onClose }) {
  const [selected, setSelected] = useState((client.items||[]).map(i=>i.id));
  const [extraItems, setExtraItems] = useState([]);
  const [addingExtra, setAddingExtra] = useState(false);
  const [ef, setEf] = useState({concept:concepts[0]||"Honorarios",description:"",amount:""});
  const toggle = id => setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const allItems = [...(client.items||[]), ...extraItems];
  const chosen = allItems.filter(i=>selected.includes(i.id));
  const total = chosen.reduce((s,i)=>s+(i.amount||0),0);
  const folio = `TK-${Date.now().toString().slice(-6)}`;
  const nowStr = new Date().toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"});

  const addExtra = () => {
    if(!ef.description||!ef.amount) return;
    const item = {...ef, amount:parseFloat(ef.amount), id:uid(), status:"pendiente"};
    setExtraItems(p=>[...p,item]);
    setSelected(s=>[...s,item.id]);
    setEf({concept:concepts[0]||"Honorarios",description:"",amount:""});
    setAddingExtra(false);
  };

  const byConceptLines = concepts.map(c=>{
    const rows = chosen.filter(i=>i.concept===c);
    if(!rows.length) return "";
    return `📂 ${c}\n`+rows.map(i=>`   • ${i.description}: ${fmt(i.amount)}`).join("\n")+`\n   Subtotal: ${fmt(rows.reduce((s,i)=>s+(i.amount||0),0))}`;
  }).filter(Boolean).join("\n\n");

  const emisorLines = [
    profile?.name ? `🏢 ${profile.name}` : "",
    profile?.cuit ? `CUIT: ${profile.cuit}` : "",
    profile?.address ? `📍 ${profile.address}` : "",
    profile?.phone ? `📞 ${profile.phone}` : "",
    profile?.email ? `📧 ${profile.email}` : "",
    profile?.web ? `🌐 ${profile.web}` : "",
    profile?.extra ? `📋 ${profile.extra}` : "",
  ].filter(Boolean).join("\n");

  const ticketText =
    `🧾 *COMPROBANTE DE HONORARIOS*\n━━━━━━━━━━━━━━━━━━━━━\n`+
    (emisorLines ? emisorLines+"\n━━━━━━━━━━━━━━━━━━━━━\n" : "")+
    `📋 Folio: ${folio}\n📅 Fecha: ${nowStr}\n━━━━━━━━━━━━━━━━━━━━━\n`+
    `👤 Cliente: ${client.name}\n`+
    (client.cuit?`📋 CUIT: ${client.cuit}\n`:"")+
    (client.condicionFiscal?`🏦 ${client.condicionFiscal}\n`:"")+
    `━━━━━━━━━━━━━━━━━━━━━\n${byConceptLines}\n━━━━━━━━━━━━━━━━━━━━━\n`+
    `💰 TOTAL: ${fmt(total)}\n━━━━━━━━━━━━━━━━━━━━━\n¡Gracias por su confianza! 🙏`;

  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:560}}>
        <div style={S.modalHead}><span style={S.modalTitle}>🧾 Generar Ticket</span><button onClick={onClose} style={S.xBtn}>✕</button></div>

        {/* Items existentes */}
        <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,fontWeight:700}}>Ítems del cliente</div>
        <div style={{maxHeight:150,overflowY:"auto",marginBottom:10}}>
          {(client.items||[]).length===0 && <div style={{color:"#334155",fontSize:12,padding:"6px 0"}}>Sin ítems cargados.</div>}
          {(client.items||[]).map(item=>(
            <label key={item.id} style={S.checkRow}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggle(item.id)} style={{accentColor:"#6ee7b7"}}/>
              <span style={{...S.ctag,background:getColor(item.concept,concepts)+"22",color:getColor(item.concept,concepts),fontSize:10}}>{item.concept}</span>
              <span style={{flex:1,fontSize:12,color:"#e2e8f0"}}>{item.description}</span>
              <span style={{fontWeight:700,color:"#6ee7b7",fontSize:12,marginLeft:8}}>{fmt(item.amount)}</span>
            </label>
          ))}
        </div>

        {/* Ítems extra del ticket */}
        {extraItems.length>0 && (
          <>
            <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,fontWeight:700}}>Ítems agregados al ticket</div>
            {extraItems.map(item=>(
              <label key={item.id} style={S.checkRow}>
                <input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggle(item.id)} style={{accentColor:"#6ee7b7"}}/>
                <span style={{...S.ctag,background:getColor(item.concept,concepts)+"22",color:getColor(item.concept,concepts),fontSize:10}}>{item.concept}</span>
                <span style={{flex:1,fontSize:12,color:"#e2e8f0"}}>{item.description}</span>
                <span style={{fontWeight:700,color:"#6ee7b7",fontSize:12,marginLeft:8}}>{fmt(item.amount)}</span>
                <button onClick={()=>setExtraItems(p=>p.filter(x=>x.id!==item.id))} style={{...S.iconBtn,color:"#fca5a5",fontSize:12}}>✕</button>
              </label>
            ))}
          </>
        )}

        {/* Agregar ítem extra */}
        {addingExtra ? (
          <div style={{background:"rgba(15,23,42,0.6)",borderRadius:8,padding:12,marginBottom:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div style={S.field}><label style={S.lbl}>Concepto</label>
                <select value={ef.concept} onChange={e=>setEf({...ef,concept:e.target.value})} style={S.inp}>
                  {concepts.map(c=><option key={c}>{c}</option>)}
                </select></div>
              <div style={S.field}><label style={S.lbl}>Monto</label>
                <input type="number" value={ef.amount} onChange={e=>setEf({...ef,amount:e.target.value})} placeholder="0.00" style={S.inp}/></div>
              <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Descripción</label>
                <input value={ef.description} onChange={e=>setEf({...ef,description:e.target.value})} placeholder="Descripción del ítem" style={S.inp}/></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setAddingExtra(false)} style={{...S.btn,...S.btnGhost,padding:"6px 12px",fontSize:12}}>Cancelar</button>
              <button onClick={addExtra} style={{...S.btn,...S.btnPrimary,padding:"6px 12px",fontSize:12}}>Agregar</button>
            </div>
          </div>
        ) : (
          <button onClick={()=>setAddingExtra(true)} style={{...S.btn,...S.btnGhost,width:"100%",marginBottom:12,fontSize:12,padding:"7px"}}>+ Agregar ítem al ticket</button>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"rgba(15,23,42,0.5)",borderRadius:8,marginBottom:12}}>
          <span style={{color:"#94a3b8",fontSize:13}}>Total</span>
          <span style={{fontWeight:800,fontSize:20,color:"#6ee7b7"}}>{fmt(total)}</span>
        </div>

        <pre style={S.ticketPre}>{ticketText}</pre>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <button onClick={()=>window.open(`https://wa.me/${(client.phone||"").replace(/\D/g,"")}?text=${encodeURIComponent(ticketText)}`,"_blank")} style={{...S.btn,...S.btnWa}}>📲 WhatsApp</button>
          <button onClick={()=>{navigator.clipboard.writeText(ticketText);alert("¡Copiado!");}} style={{...S.btn,...S.btnGhost,flex:1}}>📋 Copiar</button>
        </div>
      </div>
    </div>
  );
}

// ─── CUENTA CORRIENTE ─────────────────────────────────────────────────────────────
function CuentaCorriente({ client, concepts, onUpdate, onBack }) {
  const [addingItem, setAddingItem] = useState(false);
  const [ticketing, setTicketing] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(()=>{ /* profile loaded from parent */ },[]);

  const items = client.items || [];
  const toggleStatus = id => onUpdate({...client,items:items.map(i=>i.id===id?{...i,status:i.status==="pagado"?"pendiente":"pagado"}:i)});
  const deleteItem = id => { if(confirm("¿Eliminar este ítem?")) onUpdate({...client,items:items.filter(i=>i.id!==id)}); };
  const addItem = item => { onUpdate({...client,items:[...items,item]}); setAddingItem(false); };

  const saldo = paidItems(items) - 0; // pagado menos nada (podría ser contra pagos recibidos)
  const balance = totalItems(items) - paidItems(items);

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{...S.btn,...S.btnGhost,padding:"7px 14px"}}>← Volver</button>
        <div style={{flex:1}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:900,color:"#f1f5f9"}}>{client.name}</h2>
          {client.cuit&&<div style={{fontSize:12,color:"#475569"}}>CUIT {client.cuit} {client.condicionFiscal&&`· ${client.condicionFiscal}`}</div>}
        </div>
        <button onClick={()=>setTicketing(true)} style={{...S.btn,...S.btnPrimary}}>🧾 Emitir Ticket</button>
      </div>

      {/* Resumen cuenta corriente */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20}}>
        {[
          ["Total facturado", fmt(totalItems(items)), "#93c5fd"],
          ["Cobrado", fmt(paidItems(items)), "#6ee7b7"],
          ["Saldo pendiente", fmt(pendingItems(items)), pendingItems(items)>0?"#fca5a5":"#6ee7b7"],
          ["Ítems", items.length, "#fde68a"],
        ].map(([l,v,c])=>(
          <div key={l} style={{...S.card,padding:"14px 16px"}}>
            <div style={{fontWeight:800,fontSize:18,color:c}}>{v}</div>
            <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Barra de progreso */}
      {items.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#475569",marginBottom:4}}>
            <span>Progreso de cobro</span>
            <span>{totalItems(items)>0?((paidItems(items)/totalItems(items))*100).toFixed(0):0}%</span>
          </div>
          <div style={{height:6,background:"rgba(255,255,255,0.05)",borderRadius:99}}>
            <div style={{height:6,borderRadius:99,background:"linear-gradient(90deg,#6ee7b7,#3b82f6)",width:`${totalItems(items)>0?(paidItems(items)/totalItems(items))*100:0}%`,transition:"width 0.4s"}}/>
          </div>
        </div>
      )}

      {/* Encabezado movimientos */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:12,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>Cuenta Corriente</span>
        <button onClick={()=>setAddingItem(!addingItem)} style={{...S.btn,...S.btnPrimary,padding:"6px 13px",fontSize:12}}>{addingItem?"Cancelar":"+ Nuevo ítem"}</button>
      </div>

      {addingItem&&<ItemForm concepts={concepts} onAdd={addItem} onCancel={()=>setAddingItem(false)}/>}

      {/* Tabla de movimientos */}
      <div style={{...S.card,padding:0,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 100px 110px 90px 40px",padding:"8px 16px",background:"rgba(15,23,42,0.8)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          {["Concepto","Descripción","Monto","Fecha","Estado",""].map(h=>(
            <div key={h} style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{h}</div>
          ))}
        </div>
        {items.length===0&&<div style={S.empty}>Sin movimientos. Agregá el primero ↑</div>}
        {[...items].sort((a,b)=>b.date?.localeCompare(a.date||"")||0).map(item=>(
          <div key={item.id} style={{display:"grid",gridTemplateColumns:"1fr 2fr 100px 110px 90px 40px",padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.03)",alignItems:"center"}}>
            <span style={{...S.ctag,background:getColor(item.concept,concepts)+"22",color:getColor(item.concept,concepts),fontSize:10,width:"fit-content"}}>{item.concept}</span>
            <span style={{fontSize:13,color:"#e2e8f0"}}>{item.description}</span>
            <span style={{fontWeight:700,color:"#f1f5f9",fontSize:13}}>{fmt(item.amount)}</span>
            <span style={{fontSize:11,color:"#475569"}}>{item.date}</span>
            <button onClick={()=>toggleStatus(item.id)} style={{...S.badge,...(item.status==="pagado"?S.bPaid:S.bPend),fontSize:10}}>
              {item.status==="pagado"?"✓ Cobrado":"⏳ Pendiente"}
            </button>
            <button onClick={()=>deleteItem(item.id)} style={{...S.iconBtn,color:"#fca5a5"}}>🗑</button>
          </div>
        ))}
        {items.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 100px 110px 90px 40px",padding:"10px 16px",background:"rgba(15,23,42,0.6)",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
            <span style={{gridColumn:"1/3",fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>TOTAL</span>
            <span style={{fontWeight:800,color:"#93c5fd",fontSize:14}}>{fmt(totalItems(items))}</span>
          </div>
        )}
      </div>

      {ticketing&&<TicketModal client={client} profile={profile} concepts={concepts} onClose={()=>setTicketing(false)}/>}
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
          <input value={f.description} onChange={set("description")} placeholder="Ej. Consulta mensual" style={S.inp}/></div>
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

// ─── CLIENT FORM ──────────────────────────────────────────────────────────────────
function ClientForm({ initial, onSave, onCancel }) {
  const [f,setF] = useState(initial||{name:"",cuit:"",condicionFiscal:"",phone:"",email:"",notes:"",items:[]});
  const [arcaLoading,setArcaLoading] = useState(false);
  const [arcaMsg,setArcaMsg] = useState("");
  const set = k=>e=>setF({...f,[k]:e.target.value});
  const consultarARCA = async () => {
    const cuitLimpio = f.cuit.replace(/\D/g,"");
    if(cuitLimpio.length!==11) return setArcaMsg("⚠ Ingresá un CUIT válido de 11 dígitos");
    setArcaLoading(true); setArcaMsg("Consultando ARCA...");
    try {
      const res = await fetch(`https://afip.tangofactura.com/Rest/GetContribuyenteFull?cuit=${cuitLimpio}`);
      const data = await res.json();
      if(data?.Contribuyente?.nombre) {
        const c = data.Contribuyente;
        setF(prev=>({...prev,name:c.nombre,condicionFiscal:c.categoriasMonotributo?.length>0?"Monotributista":"Responsable Inscripto"}));
        setArcaMsg(`✓ ${c.nombre}`);
      } else setArcaMsg("⚠ No encontrado. Completá manualmente.");
    } catch { setArcaMsg("⚠ No se pudo conectar con ARCA."); }
    setArcaLoading(false);
  };
  return (
    <div style={{...S.card,maxWidth:600,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 20px",fontSize:18,fontWeight:800,color:"#f1f5f9"}}>{initial?"✏️ Editar Cliente":"➕ Nuevo Cliente"}</h2>
      <div style={{...S.field,marginBottom:14}}>
        <label style={S.lbl}>CUIT</label>
        <div style={{display:"flex",gap:8}}>
          <input value={f.cuit||""} onChange={e=>setF({...f,cuit:formatCuit(e.target.value)})} placeholder="20-12345678-9" maxLength={13} style={{...S.inp,flex:1}}/>
          <button onClick={consultarARCA} disabled={arcaLoading} style={{...S.btn,...S.btnPrimary,padding:"8px 14px",fontSize:13,opacity:arcaLoading?0.6:1}}>{arcaLoading?"...":"🔍 ARCA"}</button>
        </div>
        {arcaMsg&&<div style={{fontSize:12,marginTop:6,padding:"5px 10px",borderRadius:6,background:arcaMsg.startsWith("✓")?"rgba(110,231,183,0.1)":"rgba(252,165,165,0.1)",color:arcaMsg.startsWith("✓")?"#6ee7b7":"#fca5a5"}}>{arcaMsg}</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Nombre / Razón Social *</label>
          <input value={f.name||""} onChange={set("name")} placeholder="Nombre del cliente" style={S.inp}/></div>
        <div style={S.field}><label style={S.lbl}>Condición fiscal</label>
          <select value={f.condicionFiscal||""} onChange={set("condicionFiscal")} style={S.inp}>
            <option value="">Seleccionar...</option>
            <option>Responsable Inscripto</option><option>Monotributista</option><option>Consumidor Final</option><option>Exento</option>
          </select></div>
        <div style={S.field}><label style={S.lbl}>Teléfono</label><input type="tel" value={f.phone||""} onChange={set("phone")} placeholder="11 1234-5678" style={S.inp}/></div>
        <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Email</label><input type="email" value={f.email||""} onChange={set("email")} placeholder="correo@ejemplo.com" style={S.inp}/></div>
        <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Notas</label><textarea value={f.notes||""} onChange={set("notes")} placeholder="Observaciones..." style={{...S.inp,resize:"vertical",minHeight:50}}/></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}>
        <button onClick={onCancel} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
        <button onClick={()=>{if(!f.name)return alert("El nombre es obligatorio.");onSave(f);}} style={{...S.btn,...S.btnPrimary}}>{initial?"Guardar cambios":"Crear cliente"}</button>
      </div>
    </div>
  );
}

// ─── CHART VIEW ───────────────────────────────────────────────────────────────────
function ChartView({ clients, concepts }) {
  const [chartType,setChartType] = useState("bar");
  const [year,setYear] = useState(new Date().getFullYear());
  const monthlyData = useMemo(()=>MONTHS.map((m,mi)=>{
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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,flexWrap:"wrap",gap:10}}>
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
        <div style={{fontSize:12,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontWeight:700}}>Ingresos cobrados {year} — por concepto</div>
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
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
        {totals.map(({concept,color,total})=>(
          <div key={concept} style={{...S.card,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:color,display:"inline-block"}}/>
              <span style={{fontSize:12,color:"#94a3b8"}}>{concept}</span>
            </div>
            <div style={{fontWeight:800,fontSize:18,color}}>{fmt(total)}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:3}}>{grand>0?((total/grand)*100).toFixed(1):0}% del total</div>
            <div style={{height:3,background:"rgba(255,255,255,0.05)",borderRadius:99,marginTop:10}}>
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
  const [user,setUser] = useState(null);
  const [authLoading,setAuthLoading] = useState(true);
  const [clients,setClients] = useState([]);
  const [dbLoading,setDbLoading] = useState(false);
  const [profile,setProfile] = useState(DEFAULT_PROFILE);
  const [concepts,setConcepts] = useState(DEFAULT_CONCEPTS);
  const [view,setView] = useState("list");
  const [selected,setSelected] = useState(null);
  const [search,setSearch] = useState("");
  const [showProfile,setShowProfile] = useState(false);
  const [showConcepts,setShowConcepts] = useState(false);
  const [sortBy,setSortBy] = useState("name");

  useEffect(()=>{ const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false);}); return unsub; },[]);

  useEffect(()=>{
    if(!user) return;
    setDbLoading(true);
    const unsub1 = onSnapshot(collection(db,"users",user.uid,"clients"), snap=>{
      setClients(snap.docs.map(d=>({id:d.id,...d.data()})));
      setDbLoading(false);
    });
    const unsub2 = onSnapshot(doc(db,"users",user.uid,"settings","profile"), snap=>{
      if(snap.exists()) setProfile(snap.data());
    });
    const unsub3 = onSnapshot(doc(db,"users",user.uid,"settings","concepts"), snap=>{
      if(snap.exists()&&snap.data().list) setConcepts(snap.data().list);
    });
    return ()=>{ unsub1(); unsub2(); unsub3(); };
  },[user]);

  const login = async()=>{ setAuthLoading(true); try{await signInWithPopup(auth,new GoogleAuthProvider());}catch{setAuthLoading(false);} };
  const logout = async()=>{ await signOut(auth); setClients([]); setView("list"); setSelected(null); };
  const saveClient = async c=>{ await setDoc(doc(db,"users",user.uid,"clients",c.id),c); };
  const addClient = async d=>{ const c={...d,id:uid(),items:[]}; await saveClient(c); setView("list"); };
  const updateClient = async u=>{ await saveClient(u); setSelected(u); };
  const deleteClient = async id=>{ if(!confirm("¿Eliminar cliente?"))return; await deleteDoc(doc(db,"users",user.uid,"clients",id)); setView("list"); };
  const saveProfile = async p=>{ setProfile(p); await setDoc(doc(db,"users",user.uid,"settings","profile"),p); setShowProfile(false); };
  const saveConcepts = async list=>{ setConcepts(list); await setDoc(doc(db,"users",user.uid,"settings","concepts"),{list}); setShowConcepts(false); };

  if(authLoading) return <div style={{minHeight:"100vh",background:"#080d1a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#6ee7b7",fontSize:40}}>◈</div></div>;
  if(!user) return <LoginScreen onLogin={login} loading={authLoading}/>;

  const sorted = [...clients].filter(c=>
    c.name?.toLowerCase().includes(search.toLowerCase())||
    (c.cuit||"").includes(search)||
    (c.items||[]).some(i=>i.description?.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b)=>{
    if(sortBy==="name") return (a.name||"").localeCompare(b.name||"");
    if(sortBy==="pending") return pendingItems(b.items)-pendingItems(a.items);
    if(sortBy==="total") return totalItems(b.items)-totalItems(a.items);
    return 0;
  });

  const allPaid = clients.reduce((s,c)=>s+paidItems(c.items),0);
  const allPend = clients.reduce((s,c)=>s+pendingItems(c.items),0);

  return (
    <div style={S.root}>
      <style>{`* { box-sizing:border-box; } ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#334155;border-radius:99px;} input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5);}`}</style>

      <nav style={S.nav}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <span style={{fontSize:24,color:"#6ee7b7"}}>◈</span>
          <div><div style={{fontWeight:800,fontSize:14,color:"#f1f5f9"}}>ClientesPro</div><div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:"0.1em"}}>v5.0</div></div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18,padding:"8px 10px",background:"rgba(110,231,183,0.06)",borderRadius:9,border:"1px solid rgba(110,231,183,0.1)"}}>
          <img src={user.photoURL} alt="" style={{width:26,height:26,borderRadius:"50%"}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.displayName}</div>
            <div style={{fontSize:9,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</div>
          </div>
        </div>

        {[["👥","Clientes","list"],["📊","Análisis","chart"]].map(([ic,lb,v])=>(
          <button key={v} onClick={()=>setView(v)} style={{...S.navBtn,...((view===v||view==="cuenta"&&v==="list")?S.navActive:{})}}>
            <span>{ic}</span><span>{lb}</span>
          </button>
        ))}

        <div style={{margin:"16px 0",borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:16}}>
          <div style={{fontSize:10,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontWeight:700}}>Resumen</div>
          {[["Cobrado",fmt(allPaid),"#6ee7b7"],["Pendiente",fmt(allPend),"#fca5a5"],["Clientes",clients.length,"#93c5fd"]].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:12}}>
              <span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:6}}>
          <button onClick={()=>setShowProfile(true)} style={{...S.btn,...S.btnGhost,fontSize:11,padding:"7px",width:"100%"}}>🏢 Datos del estudio</button>
          <button onClick={()=>setShowConcepts(true)} style={{...S.btn,...S.btnGhost,fontSize:11,padding:"7px",width:"100%"}}>🏷 Gestionar conceptos</button>
          <button onClick={()=>{ const rows=[["Cliente","CUIT","Concepto","Descripción","Monto","Fecha","Estado"]]; clients.forEach(c=>(c.items||[]).forEach(i=>rows.push([c.name,c.cuit||"",i.concept,i.description,i.amount,i.date,i.status]))); const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n"); const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));a.download="clientes_pro.csv";a.click(); }} style={{...S.btn,...S.btnGhost,fontSize:11,padding:"7px",width:"100%"}}>📥 Exportar CSV</button>
          <button onClick={logout} style={{...S.btn,background:"rgba(252,165,165,0.08)",color:"#fca5a5",border:"1px solid rgba(252,165,165,0.15)",fontSize:11,padding:"7px",width:"100%"}}>↩ Cerrar sesión</button>
        </div>
      </nav>

      <div style={S.main}>
        {dbLoading&&<div style={{textAlign:"center",padding:40,color:"#475569"}}>Cargando...</div>}

        {/* LISTA DE CLIENTES */}
        {!dbLoading&&view==="list"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#f1f5f9",letterSpacing:"-0.5px"}}>Clientes <span style={{fontSize:14,color:"#475569",fontWeight:400}}>({clients.length})</span></h1>
              <button onClick={()=>setView("add")} style={{...S.btn,...S.btnPrimary}}>+ Nuevo cliente</button>
            </div>

            {/* Búsqueda y orden */}
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200,display:"flex",alignItems:"center",background:"rgba(30,41,59,0.6)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:"0 12px"}}>
                <span style={{opacity:0.35,marginRight:8,fontSize:13}}>🔍</span>
                <input placeholder="Buscar por nombre, CUIT..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,background:"none",border:"none",outline:"none",color:"#e2e8f0",fontSize:13,padding:"9px 0"}}/>
              </div>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...S.inp,padding:"8px 12px",fontSize:12,width:"auto"}}>
                <option value="name">Ordenar: Nombre</option>
                <option value="pending">Ordenar: Mayor deuda</option>
                <option value="total">Ordenar: Mayor facturado</option>
              </select>
            </div>

            {/* Encabezado tabla */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 110px 110px 100px 80px",padding:"8px 16px",background:"rgba(15,23,42,0.8)",borderRadius:"10px 10px 0 0",border:"1px solid rgba(255,255,255,0.06)"}}>
              {["Cliente","CUIT","Condición","Total","Cobrado","Pendiente",""].map(h=>(
                <div key={h} style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{h}</div>
              ))}
            </div>

            {/* Filas de clientes */}
            <div style={{border:"1px solid rgba(255,255,255,0.06)",borderTop:"none",borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
              {sorted.length===0&&<div style={S.empty}>{clients.length===0?"¡Agregá tu primer cliente!":"Sin resultados."}</div>}
              {sorted.map((c,idx)=>(
                <div key={c.id} onClick={()=>{setSelected(c);setView("cuenta");}} style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 110px 110px 100px 80px",padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.04)",background:idx%2===0?"rgba(15,23,42,0.3)":"rgba(20,30,50,0.4)",cursor:"pointer",alignItems:"center",transition:"background 0.15s"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{c.name}</div>
                    {c.notes&&<div style={{fontSize:10,color:"#334155",marginTop:1}}>{c.notes.slice(0,40)}{c.notes.length>40?"...":""}</div>}
                  </div>
                  <div style={{fontSize:12,color:"#64748b"}}>{c.cuit||"—"}</div>
                  <div>
                    {c.condicionFiscal
                      ? <span style={{...S.ctag,background:"rgba(147,197,253,0.1)",color:"#93c5fd",fontSize:10}}>{c.condicionFiscal}</span>
                      : <span style={{color:"#334155",fontSize:12}}>—</span>}
                  </div>
                  <div style={{fontWeight:700,color:"#93c5fd",fontSize:13}}>{fmt(totalItems(c.items))}</div>
                  <div style={{fontWeight:700,color:"#6ee7b7",fontSize:13}}>{fmt(paidItems(c.items))}</div>
                  <div style={{fontWeight:700,color:pendingItems(c.items)>0?"#fca5a5":"#6ee7b7",fontSize:13}}>{fmt(pendingItems(c.items))}</div>
                  <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>{setSelected(c);setView("edit");}} style={{...S.iconBtn,color:"#fde68a",fontSize:13}}>✏️</button>
                    <button onClick={()=>deleteClient(c.id)} style={{...S.iconBtn,color:"#fca5a5",fontSize:13}}>🗑</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totales */}
            {clients.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 110px 110px 100px 80px",padding:"10px 16px",background:"rgba(15,23,42,0.8)",borderRadius:10,marginTop:8,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{gridColumn:"1/4",fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>TOTALES</div>
                <div style={{fontWeight:800,color:"#93c5fd",fontSize:13}}>{fmt(clients.reduce((s,c)=>s+totalItems(c.items),0))}</div>
                <div style={{fontWeight:800,color:"#6ee7b7",fontSize:13}}>{fmt(allPaid)}</div>
                <div style={{fontWeight:800,color:"#fca5a5",fontSize:13}}>{fmt(allPend)}</div>
              </div>
            )}
          </>
        )}

        {!dbLoading&&view==="add"&&<ClientForm onSave={addClient} onCancel={()=>setView("list")}/>}
        {!dbLoading&&view==="edit"&&selected&&<ClientForm initial={selected} onSave={async d=>{await updateClient({...selected,...d});setView("list");}} onCancel={()=>setView("list")}/>}
        {!dbLoading&&view==="cuenta"&&selected&&(
          <CuentaCorriente
            client={clients.find(c=>c.id===selected?.id)||selected}
            concepts={concepts}
            profile={profile}
            onBack={()=>setView("list")}
            onUpdate={updateClient}
          />
        )}
        {!dbLoading&&view==="chart"&&<ChartView clients={clients} concepts={concepts}/>}
      </div>

      {showProfile&&<ProfileModal profile={profile} onSave={saveProfile} onClose={()=>setShowProfile(false)}/>}
      {showConcepts&&<ConceptsModal concepts={concepts} onSave={saveConcepts} onClose={()=>setShowConcepts(false)}/>}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────────
const S = {
  root:{display:"flex",minHeight:"100vh",background:"#080d1a",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e2e8f0"},
  nav:{width:210,flexShrink:0,background:"rgba(10,18,35,0.98)",borderRight:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",padding:"18px 12px",position:"sticky",top:0,height:"100vh",overflowY:"auto"},
  navBtn:{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,border:"none",background:"none",color:"#475569",fontSize:13,fontWeight:500,cursor:"pointer",textAlign:"left",width:"100%"},
  navActive:{background:"rgba(110,231,183,0.08)",color:"#6ee7b7",fontWeight:700},
  main:{flex:1,padding:"26px 28px",overflowY:"auto",minHeight:"100vh"},
  card:{background:"rgba(20,30,50,0.7)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"16px"},
  field:{display:"flex",flexDirection:"column",gap:5},
  lbl:{fontSize:10,color:"#475569",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"},
  inp:{background:"rgba(8,13,26,0.7)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:7,padding:"8px 12px",color:"#f1f5f9",fontSize:13,outline:"none"},
  btn:{border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer"},
  btnPrimary:{background:"linear-gradient(135deg,#6ee7b7,#3b82f6)",color:"#050a14"},
  btnGhost:{background:"rgba(255,255,255,0.05)",color:"#64748b",border:"1px solid rgba(255,255,255,0.08)"},
  btnWa:{background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",flex:1},
  iconBtn:{background:"none",border:"none",cursor:"pointer",fontSize:14,padding:"4px 6px",borderRadius:6},
  badge:{border:"none",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,cursor:"pointer"},
  bPaid:{background:"rgba(110,231,183,0.1)",color:"#6ee7b7"},
  bPend:{background:"rgba(252,165,165,0.1)",color:"#fca5a5"},
  ctag:{display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600},
  empty:{padding:40,textAlign:"center",color:"#334155",fontSize:13},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16},
  modal:{background:"#0e1829",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:24,width:"100%",maxHeight:"92vh",overflowY:"auto"},
  modalHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  modalTitle:{fontWeight:800,fontSize:16,color:"#f1f5f9"},
  xBtn:{background:"none",border:"none",color:"#475569",fontSize:17,cursor:"pointer"},
  checkRow:{display:"flex",alignItems:"center",gap:8,padding:"7px 2px",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer"},
  ticketPre:{background:"#050a14",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,padding:14,fontSize:11,color:"#94a3b8",lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"monospace",margin:0},
};
