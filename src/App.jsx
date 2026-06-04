import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line } from "recharts";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────────
const CONCEPTS = ["Honorarios","Consultoría","Mantenimiento","Materiales","Traslado","Capacitación","Otro"];
const CONCEPT_COLORS = {
  "Honorarios":"#6ee7b7","Consultoría":"#93c5fd","Mantenimiento":"#fde68a",
  "Materiales":"#f9a8d4","Traslado":"#c4b5fd","Capacitación":"#fb923c","Otro":"#94a3b8",
};
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DRIVE_FILE_NAME = "clientespro_data.json";

// ─── UTILS ───────────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS"}).format(n||0);
const uid = () => Date.now() + Math.floor(Math.random()*9999);
const today = () => new Date().toISOString().slice(0,10);
const totalItems = (items) => items.reduce((s,i)=>s+i.amount,0);
const paidItems = (items) => items.filter(i=>i.status==="pagado").reduce((s,i)=>s+i.amount,0);
const pendingItems = (items) => items.filter(i=>i.status==="pendiente").reduce((s,i)=>s+i.amount,0);

const SEED = [
  { id:1, name:"María García", cuit:"27-28765432-4", condicionFiscal:"Monotributista", phone:"1155551234", email:"maria@email.com", notes:"Cliente frecuente, prefiere transferencia.",
    items:[
      {id:101,concept:"Honorarios",description:"Consulta mensual",amount:150000,date:"2026-03-10",status:"pagado"},
      {id:102,concept:"Materiales",description:"Insumos",amount:35000,date:"2026-03-10",status:"pagado"},
      {id:103,concept:"Honorarios",description:"Consulta mensual",amount:150000,date:"2026-04-08",status:"pagado"},
      {id:104,concept:"Honorarios",description:"Consulta mensual",amount:150000,date:"2026-05-06",status:"pendiente"},
    ]},
  { id:2, name:"Carlos López", cuit:"20-30456789-1", condicionFiscal:"Responsable Inscripto", phone:"1166667890", email:"carlos@empresa.com", notes:"Requiere factura A.",
    items:[
      {id:201,concept:"Consultoría",description:"Auditoría de procesos",amount:450000,date:"2026-02-15",status:"pagado"},
      {id:202,concept:"Capacitación",description:"Taller 8 hrs",amount:220000,date:"2026-03-20",status:"pagado"},
      {id:203,concept:"Consultoría",description:"Seguimiento Q2",amount:300000,date:"2026-05-01",status:"pendiente"},
    ]},
];

// ─── GOOGLE DRIVE HOOK ───────────────────────────────────────────────────────────
function useDriveSync(clients, setClients) {
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | ok | error
  const [fileId, setFileId] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [driveError, setDriveError] = useState(null);

  const callDriveAPI = useCallback(async (prompt) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        mcp_servers: [{ type: "url", url: "https://drivemcp.googleapis.com/mcp/v1", name: "gdrive" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data;
  }, []);

  // Load from Drive on mount
  useEffect(() => {
    loadFromDrive();
    // eslint-disable-next-line
  }, []);

  const loadFromDrive = async () => {
    setSyncState("syncing");
    setDriveError(null);
    try {
      const data = await callDriveAPI(
        `Search Google Drive for a file named exactly "${DRIVE_FILE_NAME}". If found, return its file ID and full text content. If not found, say "NOT_FOUND". Respond only in JSON like: {"found": true, "fileId": "...", "content": "..."} or {"found": false}`
      );
      const text = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "";
      const clean = text.replace(/```json|```/g,"").trim();
      let parsed;
      try { parsed = JSON.parse(clean); } catch { parsed = null; }

      if (parsed?.found && parsed.content) {
        const clientData = JSON.parse(parsed.content);
        setClients(clientData);
        setFileId(parsed.fileId);
        setLastSync(new Date());
        setSyncState("ok");
      } else {
        // No file yet — use seed data, will create on first save
        setSyncState("ok");
      }
    } catch (e) {
      setDriveError("No se pudo conectar con Drive. Trabajando en modo local.");
      setSyncState("error");
    }
  };

  const saveToDrive = useCallback(async (data) => {
    setSyncState("syncing");
    setDriveError(null);
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      let prompt;
      if (fileId) {
        prompt = `Update the Google Drive file with ID "${fileId}" with this exact content (replace all): ${jsonStr}. Confirm when done.`;
      } else {
        prompt = `Create a new file in Google Drive named "${DRIVE_FILE_NAME}" with this content: ${jsonStr}. Return the new file ID as JSON: {"fileId": "..."}`;
      }
      const res = await callDriveAPI(prompt);
      const text = res.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "";
      if (!fileId) {
        const m = text.match(/"fileId"\s*:\s*"([^"]+)"/);
        if (m) setFileId(m[1]);
      }
      setLastSync(new Date());
      setSyncState("ok");
    } catch (e) {
      setDriveError("Error al guardar en Drive. Los cambios se guardan localmente.");
      setSyncState("error");
    }
  }, [fileId, callDriveAPI]);

  return { syncState, lastSync, driveError, saveToDrive, loadFromDrive };
}

// ─── SYNC BADGE ──────────────────────────────────────────────────────────────────
function SyncBadge({ syncState, lastSync, driveError, onSync }) {
  const map = {
    idle:    { color:"#475569", icon:"☁️",  label:"Sin sincronizar" },
    syncing: { color:"#fde68a", icon:"⟳",   label:"Sincronizando..." },
    ok:      { color:"#6ee7b7", icon:"✓",   label: lastSync ? `Guardado ${lastSync.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}` : "Sincronizado" },
    error:   { color:"#fca5a5", icon:"⚠",   label:"Error Drive" },
  };
  const { color, icon, label } = map[syncState] || map.idle;
  return (
    <div title={driveError||label} onClick={onSync} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"5px 10px",borderRadius:20,background:"rgba(255,255,255,0.05)",border:`1px solid ${color}33`}}>
      <span style={{color, fontSize:14, animation: syncState==="syncing"?"spin 1s linear infinite":undefined}}>{icon}</span>
      <span style={{fontSize:11, color, fontWeight:600}}>{label}</span>
      <span style={{fontSize:10, color:"#475569", marginLeft:2}}>Drive</span>
    </div>
  );
}

// ─── TICKET MODAL ────────────────────────────────────────────────────────────────
function TicketModal({ client, onClose }) {
  const [selected, setSelected] = useState(client.items.map(i=>i.id));
  const toggle = (id) => setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const chosen = client.items.filter(i=>selected.includes(i.id));
  const total = chosen.reduce((s,i)=>s+i.amount,0);
  const folio = `TK-${String(client.id).padStart(3,"0")}-${Date.now().toString().slice(-5)}`;
  const nowStr = new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"});
  const byConceptLines = CONCEPTS.map(c=>{
    const rows = chosen.filter(i=>i.concept===c);
    if(!rows.length) return "";
    return `📂 ${c}\n`+rows.map(i=>`   • ${i.description}: ${fmt(i.amount)}`).join("\n")+`\n   Subtotal: ${fmt(rows.reduce((s,i)=>s+i.amount,0))}`;
  }).filter(Boolean).join("\n\n");
  const ticketText =
    `🧾 *TICKET DE COBRO*\n━━━━━━━━━━━━━━━━━━━━━\n`+
    `📋 Folio: ${folio}\n📅 Fecha: ${nowStr}\n━━━━━━━━━━━━━━━━━━━━━\n`+
    `👤 ${client.name}\n`+(client.cuit?`📋 CUIT: ${client.cuit}\n`:"")+`📞 ${client.phone}\n`+(client.email?`📧 ${client.email}\n`:"")+
    `━━━━━━━━━━━━━━━━━━━━━\n${byConceptLines}\n━━━━━━━━━━━━━━━━━━━━━\n`+
    `💰 TOTAL: ${fmt(total)}\n━━━━━━━━━━━━━━━━━━━━━\n¡Gracias por su confianza! 🙏`;

  return (
    <div style={S.overlay}>
      <div style={{...S.modal,maxWidth:520}}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>🧾 Generar Ticket</span>
          <button onClick={onClose} style={S.xBtn}>✕</button>
        </div>
        <p style={{fontSize:13,color:"#64748b",margin:"0 0 10px"}}>Selecciona los ítems a incluir:</p>
        <div style={{maxHeight:170,overflowY:"auto",marginBottom:14}}>
          {client.items.map(item=>(
            <label key={item.id} style={S.checkRow}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggle(item.id)} style={{accentColor:"#6ee7b7"}}/>
              <span style={{...S.ctag,background:CONCEPT_COLORS[item.concept]+"22",color:CONCEPT_COLORS[item.concept],fontSize:10}}>{item.concept}</span>
              <span style={{flex:1,fontSize:13,color:"#e2e8f0"}}>{item.description}</span>
              <span style={{fontWeight:700,color:"#6ee7b7",fontSize:13}}>{fmt(item.amount)}</span>
            </label>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"rgba(15,23,42,0.5)",borderRadius:8,marginBottom:14}}>
          <span style={{color:"#94a3b8",fontSize:13}}>Total seleccionado</span>
          <span style={{fontWeight:800,fontSize:18,color:"#6ee7b7"}}>{fmt(total)}</span>
        </div>
        <pre style={S.ticketPre}>{ticketText}</pre>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <button onClick={()=>window.open(`https://wa.me/${client.phone.replace(/\D/g,"")}?text=${encodeURIComponent(ticketText)}`,"_blank")} style={{...S.btn,...S.btnWa}}>📲 WhatsApp</button>
          <button onClick={()=>{navigator.clipboard.writeText(ticketText);alert("¡Copiado!");}} style={{...S.btn,...S.btnGhost,flex:1}}>📋 Copiar</button>
        </div>
      </div>
    </div>
  );
}

// ─── ITEM FORM ───────────────────────────────────────────────────────────────────
function ItemForm({ onAdd, onCancel }) {
  const [f,setF] = useState({concept:"Honorarios",description:"",amount:"",date:today(),status:"pendiente"});
  const set = k=>e=>setF({...f,[k]:e.target.value});
  const submit = ()=>{
    if(!f.description||!f.amount) return alert("Completa descripción y monto.");
    onAdd({...f,amount:parseFloat(f.amount),id:uid()});
  };
  return (
    <div style={{...S.card,marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={S.field}><label style={S.lbl}>Concepto</label>
          <select value={f.concept} onChange={set("concept")} style={S.inp}>
            {CONCEPTS.map(c=><option key={c}>{c}</option>)}
          </select></div>
        <div style={S.field}><label style={S.lbl}>Monto ($)</label>
          <input type="number" value={f.amount} onChange={set("amount")} placeholder="0.00" style={S.inp}/></div>
        <div style={{...S.field,gridColumn:"1/-1"}}><label style={S.lbl}>Descripción</label>
          <input value={f.description} onChange={set("description")} placeholder="Ej. Consulta mensual" style={S.inp}/></div>
        <div style={S.field}><label style={S.lbl}>Fecha</label>
          <input type="date" value={f.date} onChange={set("date")} style={S.inp}/></div>
        <div style={S.field}><label style={S.lbl}>Estado</label>
          <select value={f.status} onChange={set("status")} style={S.inp}>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
          </select></div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"flex-end"}}>
        <button onClick={onCancel} style={{...S.btn,...S.btnGhost,padding:"7px 14px",fontSize:13}}>Cancelar</button>
        <button onClick={submit} style={{...S.btn,...S.btnPrimary,padding:"7px 14px",fontSize:13}}>+ Agregar ítem</button>
      </div>
    </div>
  );
}

// ─── CLIENT DETAIL ───────────────────────────────────────────────────────────────
function ClientDetail({ client, onBack, onUpdate }) {
  const [addingItem,setAddingItem] = useState(false);
  const [ticketing,setTicketing] = useState(false);
  const toggleStatus = id=>onUpdate({...client,items:client.items.map(i=>i.id===id?{...i,status:i.status==="pagado"?"pendiente":"pagado"}:i)});
  const deleteItem = id=>{if(confirm("¿Eliminar ítem?"))onUpdate({...client,items:client.items.filter(i=>i.id!==id)});};
  const addItem = item=>{onUpdate({...client,items:[...client.items,item]});setAddingItem(false);};
  const byConcept = CONCEPTS.map(c=>({concept:c,items:client.items.filter(i=>i.concept===c)})).filter(g=>g.items.length);

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{...S.btn,...S.btnGhost,padding:"8px 14px"}}>← Volver</button>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:"#f1f5f9",flex:1}}>{client.name}</h2>
        <button onClick={()=>setTicketing(true)} style={{...S.btn,...S.btnPrimary}}>🧾 Ticket</button>
      </div>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:14}}>
          {[["📋 CUIT",client.cuit||"—"],["🏦",client.condicionFiscal||"—"],["📞",client.phone||"—"],["📧",client.email||"—"],["📝",client.notes||"Sin notas"]].map(([ic,v])=>(
            <div key={ic} style={{display:"flex",gap:8}}><span style={{opacity:0.4,fontSize:12}}>{ic}</span><span style={{fontSize:13,color:"#cbd5e1"}}>{v}</span></div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          {[["Total",fmt(totalItems(client.items)),"#93c5fd"],["Cobrado",fmt(paidItems(client.items)),"#6ee7b7"],["Pendiente",fmt(pendingItems(client.items)),"#fca5a5"]].map(([l,v,c])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontWeight:800,fontSize:17,color:c}}>{v}</div>
              <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"0 0 10px"}}>
        <span style={{fontSize:12,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>Ítems de cobro</span>
        <button onClick={()=>setAddingItem(!addingItem)} style={{...S.btn,...S.btnPrimary,padding:"6px 13px",fontSize:12}}>
          {addingItem?"Cancelar":"+ Nuevo ítem"}
        </button>
      </div>
      {addingItem && <ItemForm onAdd={addItem} onCancel={()=>setAddingItem(false)}/>}
      {byConcept.map(({concept,items})=>(
        <div key={concept} style={{...S.card,padding:0,overflow:"hidden",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",padding:"10px 16px",background:"rgba(30,41,59,0.8)",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            <span style={{...S.ctag,background:CONCEPT_COLORS[concept]+"22",color:CONCEPT_COLORS[concept]}}>{concept}</span>
            <span style={{marginLeft:"auto",fontWeight:700,color:CONCEPT_COLORS[concept]}}>{fmt(items.reduce((s,i)=>s+i.amount,0))}</span>
          </div>
          {items.map(item=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
              <div style={{flex:1}}>
                <span style={{fontSize:13,color:"#e2e8f0"}}>{item.description}</span>
                <span style={{fontSize:11,color:"#475569",marginLeft:8}}>{item.date}</span>
              </div>
              <span style={{fontWeight:700,color:"#f1f5f9",marginRight:12,fontSize:13}}>{fmt(item.amount)}</span>
              <button onClick={()=>toggleStatus(item.id)} style={{...S.badge,...(item.status==="pagado"?S.bPaid:S.bPend),marginRight:6}}>
                {item.status==="pagado"?"✓ Pagado":"⏳ Pend."}
              </button>
              <button onClick={()=>deleteItem(item.id)} style={{...S.iconBtn,color:"#fca5a5"}}>🗑</button>
            </div>
          ))}
        </div>
      ))}
      {byConcept.length===0 && <div style={S.empty}>Sin ítems. Agrega el primero ↑</div>}
      {ticketing && <TicketModal client={client} onClose={()=>setTicketing(false)}/>}
    </div>
  );
}

// ─── CUIT FORMATTER ──────────────────────────────────────────────────────────────
function formatCuit(v) {
  const n = v.replace(/\D/g,"").slice(0,11);
  if(n.length<=2) return n;
  if(n.length<=10) return `${n.slice(0,2)}-${n.slice(2)}`;
  return `${n.slice(0,2)}-${n.slice(2,10)}-${n.slice(10)}`;
}

// ─── CLIENT FORM ─────────────────────────────────────────────────────────────────
function ClientForm({ initial, onSave, onCancel }) {
  const [f,setF] = useState(initial||{name:"",cuit:"",condicionFiscal:"",phone:"",email:"",notes:"",items:[]});
  const [arcaLoading, setArcaLoading] = useState(false);
  const [arcaMsg, setArcaMsg] = useState("");
  const set = k=>e=>setF({...f,[k]:e.target.value});

  const consultarARCA = async () => {
    const cuitLimpio = f.cuit.replace(/\D/g,"");
    if(cuitLimpio.length !== 11) return setArcaMsg("⚠ Ingresá un CUIT válido de 11 dígitos");
    setArcaLoading(true);
    setArcaMsg("Consultando ARCA...");
    try {
      // Usamos la API pública de ARCA/AFIP a través de un proxy CORS
      const res = await fetch(`https://afip.tangofactura.com/Rest/GetContribuyenteFull?cuit=${cuitLimpio}`);
      const data = await res.json();
      if(data && data.Contribuyente) {
        const c = data.Contribuyente;
        const nombre = c.nombre || c.razonSocial || "";
        const condicion = c.tipoClave === "CUIT" ? (c.categoriasMonotributo?.length > 0 ? "Monotributista" : "Responsable Inscripto") : "Consumidor Final";
        setF(prev=>({...prev, name: nombre, condicionFiscal: condicion}));
        setArcaMsg(`✓ Datos cargados: ${nombre} — ${condicion}`);
      } else {
        setArcaMsg("⚠ CUIT no encontrado en ARCA. Completá los datos manualmente.");
      }
    } catch(e) {
      // Fallback: intentar con otra API pública
      try {
        const res2 = await fetch(`https://api.afip.services/v1/contribuyente/${cuitLimpio}`);
        const data2 = await res2.json();
        if(data2?.nombre) {
          setF(prev=>({...prev, name: data2.nombre, condicionFiscal: data2.condicion || ""}));
          setArcaMsg(`✓ Datos cargados: ${data2.nombre}`);
        } else {
          setArcaMsg("⚠ No se pudo conectar con ARCA. Completá los datos manualmente.");
        }
      } catch {
        setArcaMsg("⚠ No se pudo conectar con ARCA. Completá los datos manualmente.");
      }
    }
    setArcaLoading(false);
  };

  return (
    <div style={{...S.card,maxWidth:600,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 20px",fontSize:18,fontWeight:800,color:"#f1f5f9"}}>{initial?"✏️ Editar Cliente":"➕ Nuevo Cliente"}</h2>

      {/* CUIT con botón ARCA */}
      <div style={{...S.field,marginBottom:14}}>
        <label style={S.lbl}>CUIT</label>
        <div style={{display:"flex",gap:8}}>
          <input
            value={f.cuit||""}
            onChange={e=>setF({...f,cuit:formatCuit(e.target.value)})}
            placeholder="20-12345678-9"
            maxLength={13}
            style={{...S.inp,flex:1,letterSpacing:"0.05em"}}
          />
          <button
            onClick={consultarARCA}
            disabled={arcaLoading}
            style={{...S.btn,...S.btnPrimary,padding:"8px 14px",fontSize:13,whiteSpace:"nowrap",opacity:arcaLoading?0.6:1}}
          >
            {arcaLoading?"Consultando...":"🔍 Consultar ARCA"}
          </button>
        </div>
        {arcaMsg && (
          <div style={{fontSize:12,marginTop:6,padding:"6px 10px",borderRadius:6,
            background: arcaMsg.startsWith("✓")?"rgba(110,231,183,0.1)":"rgba(252,165,165,0.1)",
            color: arcaMsg.startsWith("✓")?"#6ee7b7":"#fca5a5"}}>
            {arcaMsg}
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{...S.field,gridColumn:"1/-1"}}>
          <label style={S.lbl}>Nombre / Razón Social *</label>
          <input value={f.name||""} onChange={set("name")} placeholder="Se completa automáticamente con ARCA" style={S.inp}/>
        </div>
        <div style={S.field}>
          <label style={S.lbl}>Condición fiscal</label>
          <select value={f.condicionFiscal||""} onChange={set("condicionFiscal")} style={S.inp}>
            <option value="">Seleccionar...</option>
            <option>Responsable Inscripto</option>
            <option>Monotributista</option>
            <option>Consumidor Final</option>
            <option>Exento</option>
          </select>
        </div>
        <div style={S.field}>
          <label style={S.lbl}>Teléfono</label>
          <input type="tel" value={f.phone||""} onChange={set("phone")} placeholder="11 1234-5678" style={S.inp}/>
        </div>
        <div style={{...S.field,gridColumn:"1/-1"}}>
          <label style={S.lbl}>Correo electrónico</label>
          <input type="email" value={f.email||""} onChange={set("email")} placeholder="correo@ejemplo.com" style={S.inp}/>
        </div>
        <div style={{...S.field,gridColumn:"1/-1"}}>
          <label style={S.lbl}>Notas internas</label>
          <textarea value={f.notes||""} onChange={set("notes")} placeholder="Preferencias, observaciones..." style={{...S.inp,resize:"vertical",minHeight:60}}/>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}>
        <button onClick={onCancel} style={{...S.btn,...S.btnGhost}}>Cancelar</button>
        <button onClick={()=>{if(!f.name)return alert("El nombre es obligatorio.");onSave(f);}} style={{...S.btn,...S.btnPrimary}}>
          {initial?"Guardar cambios":"Crear cliente"}
        </button>
      </div>
    </div>
  );
}

// ─── CHART VIEW ──────────────────────────────────────────────────────────────────
function ChartView({ clients }) {
  const [chartType,setChartType] = useState("bar");
  const [year,setYear] = useState(new Date().getFullYear());

  const monthlyData = useMemo(()=>MONTHS.map((m,mi)=>{
    const row={month:m}; let total=0;
    CONCEPTS.forEach(c=>{
      let sum=0;
      clients.forEach(cl=>cl.items.forEach(item=>{
        const d=new Date(item.date);
        if(d.getFullYear()===year&&d.getMonth()===mi&&item.concept===c&&item.status==="pagado") sum+=item.amount;
      }));
      if(sum>0) row[c]=sum; total+=sum;
    }); row.Total=total; return row;
  }),[clients,year]);

  const active = CONCEPTS.filter(c=>monthlyData.some(r=>r[c]));
  const totals = CONCEPTS.map(c=>({concept:c,total:clients.reduce((s,cl)=>s+cl.items.filter(i=>i.concept===c&&i.status==="pagado").reduce((a,b)=>a+b.amount,0),0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total);
  const grand = totals.reduce((s,c)=>s+c.total,0);
  const Tip = ({active:a,payload,label})=>a&&payload?.length?(<div style={{background:"#1e293b",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 14px"}}><div style={{fontWeight:700,marginBottom:6,color:"#f1f5f9",fontSize:13}}>{label}</div>{payload.map(p=>(<div key={p.name} style={{display:"flex",justifyContent:"space-between",gap:14,fontSize:12}}><span style={{color:CONCEPT_COLORS[p.name]||"#6ee7b7"}}>{p.name}</span><span style={{fontWeight:700,color:"#f1f5f9"}}>{fmt(p.value)}</span></div>))}</div>):null;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:"#f1f5f9"}}>📊 Análisis de Ingresos</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select value={year} onChange={e=>setYear(Number(e.target.value))} style={{...S.inp,padding:"7px 12px",fontSize:13,width:"auto"}}>
            {[2024,2025,2026].map(y=><option key={y}>{y}</option>)}
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
                {active.map((c,i)=><Bar key={c} dataKey={c} stackId="a" fill={CONCEPT_COLORS[c]} radius={i===active.length-1?[4,4,0,0]:[0,0,0,0]}/>)}
              </BarChart>
            ):(
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="month" tick={{fill:"#64748b",fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`}/>
                <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/>
                {active.map(c=><Line key={c} type="monotone" dataKey={c} stroke={CONCEPT_COLORS[c]} strokeWidth={2} dot={{r:3,fill:CONCEPT_COLORS[c]}}/>)}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12}}>
        {totals.map(({concept,total})=>(
          <div key={concept} style={{...S.card,padding:"16px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:CONCEPT_COLORS[concept],display:"inline-block"}}/>
              <span style={{fontSize:12,color:"#94a3b8"}}>{concept}</span>
            </div>
            <div style={{fontWeight:800,fontSize:18,color:CONCEPT_COLORS[concept]}}>{fmt(total)}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:3}}>{grand>0?((total/grand)*100).toFixed(1):0}% del total</div>
            <div style={{height:3,background:"rgba(255,255,255,0.05)",borderRadius:99,marginTop:10}}>
              <div style={{height:3,borderRadius:99,background:CONCEPT_COLORS[concept],width:`${grand>0?(total/grand)*100:0}%`}}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────────
function exportCSV(clients) {
  const rows=[["Cliente","Teléfono","Email","Concepto","Descripción","Monto","Fecha","Estado"]];
  clients.forEach(c=>c.items.forEach(i=>rows.push([c.name,c.phone,c.email,i.concept,i.description,i.amount,i.date,i.status])));
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));a.download="clientes_pro.csv";a.click();
}

// ─── PWA INSTALL BUTTON ──────────────────────────────────────────────────────────
function PWAInstallBtn() {
  const [prompt,setPrompt] = useState(null);
  const [installed,setInstalled] = useState(false);
  useEffect(()=>{
    const h=(e)=>{e.preventDefault();setPrompt(e);};
    window.addEventListener("beforeinstallprompt",h);
    window.addEventListener("appinstalled",()=>setInstalled(true));
    return ()=>window.removeEventListener("beforeinstallprompt",h);
  },[]);
  if(installed) return <div style={{fontSize:12,color:"#6ee7b7",padding:"5px 10px"}}>✓ App instalada</div>;
  if(!prompt) return null;
  return (
    <button onClick={async()=>{prompt.prompt();const r=await prompt.userChoice;if(r.outcome==="accepted")setInstalled(true);}} style={{...S.btn,background:"linear-gradient(135deg,#6ee7b7,#3b82f6)",color:"#0f172a",padding:"8px 14px",fontSize:12}}>
      📲 Instalar App
    </button>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────────
export default function App() {
  const [clients,setClients] = useState(SEED);
  const [view,setView] = useState("list");
  const [selected,setSelected] = useState(null);
  const [search,setSearch] = useState("");
  const [pendingSave,setPendingSave] = useState(false);

  const { syncState, lastSync, driveError, saveToDrive, loadFromDrive } = useDriveSync(clients, setClients);

  // Auto-save to Drive whenever clients change (debounced)
  useEffect(()=>{
    if(!pendingSave) return;
    const t = setTimeout(()=>{ saveToDrive(clients); setPendingSave(false); }, 1500);
    return ()=>clearTimeout(t);
  },[clients, pendingSave, saveToDrive]);

  const persist = (newClients) => { setClients(newClients); setPendingSave(true); };

  const filtered = clients.filter(c=>
    c.name.toLowerCase().includes(search.toLowerCase())||
    c.items.some(i=>i.description.toLowerCase().includes(search.toLowerCase()))
  );

  const updateClient = (u) => persist(clients.map(c=>c.id===u.id?u:c));
  const addClient = (data) => { persist([...clients,{...data,id:uid(),items:[]}]); setView("list"); };
  const deleteClient = (id) => { if(confirm("¿Eliminar cliente?")) persist(clients.filter(c=>c.id!==id)); };

  const allPaid = clients.reduce((s,c)=>s+paidItems(c.items),0);
  const allPend = clients.reduce((s,c)=>s+pendingItems(c.items),0);

  return (
    <div style={S.root}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 99px; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
      `}</style>

      {/* Sidebar */}
      <nav style={S.nav}>
        <div style={S.brand}>
          <span style={{fontSize:26,color:"#6ee7b7"}}>◈</span>
          <div><div style={{fontWeight:800,fontSize:15,color:"#f1f5f9",letterSpacing:"-0.5px"}}>ClientesPro</div>
          <div style={{fontSize:10,color:"#475569",letterSpacing:"0.1em",textTransform:"uppercase"}}>v3.0 · Drive</div></div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:16}}>
          {[["👥","Clientes","list"],["📊","Análisis","chart"]].map(([ic,lb,v])=>(
            <button key={v} onClick={()=>setView(v)} style={{...S.navBtn,...((view===v||view==="detail"&&v==="list")?S.navActive:{})}}>
              <span>{ic}</span><span>{lb}</span>
            </button>
          ))}
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontWeight:700}}>Resumen</div>
          {[["Cobrado",fmt(allPaid),"#6ee7b7"],["Pendiente",fmt(allPend),"#fca5a5"]].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:13}}>
              <span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:8}}>
          <SyncBadge syncState={syncState} lastSync={lastSync} driveError={driveError} onSync={loadFromDrive}/>
          {driveError && <div style={{fontSize:11,color:"#fca5a5",padding:"6px 8px",background:"rgba(252,165,165,0.08)",borderRadius:6}}>{driveError}</div>}
          <PWAInstallBtn/>
          <button onClick={()=>exportCSV(clients)} style={{...S.btn,...S.btnGhost,fontSize:11,padding:"7px",width:"100%"}}>📥 Exportar CSV</button>
        </div>
      </nav>

      {/* Main content */}
      <div style={S.main}>
        {/* LIST */}
        {view==="list" && (
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,flexWrap:"wrap",gap:10}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#f1f5f9",letterSpacing:"-0.5px"}}>Clientes</h1>
              <button onClick={()=>setView("add")} style={{...S.btn,...S.btnPrimary}}>+ Nuevo cliente</button>
            </div>
            <div style={{display:"flex",alignItems:"center",background:"rgba(30,41,59,0.6)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"0 14px",marginBottom:18}}>
              <span style={{opacity:0.35,marginRight:8}}>🔍</span>
              <input placeholder="Buscar cliente o servicio..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,background:"none",border:"none",outline:"none",color:"#e2e8f0",fontSize:14,padding:"11px 0"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
              {filtered.map(c=>(
                <div key={c.id} style={{...S.card,cursor:"pointer"}} onClick={()=>{setSelected(c);setView("detail");}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:15,color:"#f1f5f9"}}>{c.name}</div>
                      <div style={{fontSize:11,color:"#475569",marginTop:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        {c.cuit && <span>CUIT {c.cuit}</span>}
                        {c.condicionFiscal && <span style={{...S.ctag,background:"rgba(147,197,253,0.12)",color:"#93c5fd",fontSize:10,padding:"1px 7px"}}>{c.condicionFiscal}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>{setSelected(c);setView("edit");}} style={{...S.iconBtn,color:"#fde68a"}}>✏️</button>
                      <button onClick={()=>deleteClient(c.id)} style={{...S.iconBtn,color:"#fca5a5"}}>🗑</button>
                    </div>
                  </div>
                  <div style={{marginTop:10,display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[...new Set(c.items.map(i=>i.concept))].map(con=>(
                      <span key={con} style={{...S.ctag,background:CONCEPT_COLORS[con]+"22",color:CONCEPT_COLORS[con],fontSize:10}}>{con}</span>
                    ))}
                  </div>
                  <div style={{marginTop:12,display:"flex",justifyContent:"space-between"}}>
                    <div><div style={{fontSize:10,color:"#334155"}}>Total</div><div style={{fontWeight:800,color:"#93c5fd",fontSize:15}}>{fmt(totalItems(c.items))}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#334155"}}>Pendiente</div><div style={{fontWeight:800,color:pendingItems(c.items)>0?"#fca5a5":"#6ee7b7",fontSize:15}}>{fmt(pendingItems(c.items))}</div></div>
                  </div>
                  {c.items.length>0&&(
                    <div style={{height:3,background:"rgba(255,255,255,0.05)",borderRadius:99,marginTop:10}}>
                      <div style={{height:3,borderRadius:99,background:"linear-gradient(90deg,#6ee7b7,#3b82f6)",width:`${totalItems(c.items)>0?(paidItems(c.items)/totalItems(c.items))*100:0}%`,transition:"width 0.4s"}}/>
                    </div>
                  )}
                </div>
              ))}
              {filtered.length===0&&<div style={{...S.empty,gridColumn:"1/-1"}}>Sin clientes. ¡Agrega el primero!</div>}
            </div>
          </>
        )}
        {view==="add" && <ClientForm onSave={addClient} onCancel={()=>setView("list")}/>}
        {view==="edit" && selected && <ClientForm initial={selected} onSave={d=>{updateClient({...selected,...d});setView("list");}} onCancel={()=>setView("list")}/>}
        {view==="detail" && selected && (
          <ClientDetail
            client={clients.find(c=>c.id===selected.id)||selected}
            onBack={()=>setView("list")}
            onUpdate={u=>{updateClient(u);setSelected(u);}}
          />
        )}
        {view==="chart" && <ChartView clients={clients}/>}
      </div>
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────────
const S = {
  root:{display:"flex",minHeight:"100vh",background:"#080d1a",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e2e8f0"},
  nav:{width:210,flexShrink:0,background:"rgba(10,18,35,0.98)",borderRight:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",padding:"20px 14px",position:"sticky",top:0,height:"100vh",overflowY:"auto"},
  brand:{display:"flex",alignItems:"center",gap:10,marginBottom:28},
  navBtn:{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:9,border:"none",background:"none",color:"#475569",fontSize:13,fontWeight:500,cursor:"pointer",textAlign:"left",width:"100%"},
  navActive:{background:"rgba(110,231,183,0.08)",color:"#6ee7b7",fontWeight:700},
  main:{flex:1,padding:"28px 30px",overflowY:"auto",minHeight:"100vh"},
  card:{background:"rgba(20,30,50,0.7)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"18px"},
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
  ctag:{display:"inline-flex",alignItems:"center",padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:600},
  empty:{padding:44,textAlign:"center",color:"#334155",fontSize:13},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16},
  modal:{background:"#0e1829",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:24,width:"100%",maxHeight:"90vh",overflowY:"auto"},
  modalHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  modalTitle:{fontWeight:800,fontSize:16,color:"#f1f5f9"},
  xBtn:{background:"none",border:"none",color:"#475569",fontSize:17,cursor:"pointer"},
  checkRow:{display:"flex",alignItems:"center",gap:8,padding:"7px 2px",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer"},
  ticketPre:{background:"#050a14",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,padding:14,fontSize:11,color:"#94a3b8",lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"monospace",margin:0},
};
