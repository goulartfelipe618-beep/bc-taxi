export function renderAdminDashboardHtml(apiBase: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>BC Taxi — Admin</title>
  <style>
    *{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;background:#0f1115;color:#e8eaed}
    header{padding:20px 24px;border-bottom:1px solid #2a2f3a;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    h1{font-size:1.25rem;margin:0}input,button{padding:10px 12px;border-radius:8px;border:1px solid #3a4250;background:#1a1f28;color:#fff}
    button{cursor:pointer;background:#276ef1;border:none;font-weight:600}
    main{padding:24px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
    .card{background:#1a1f28;border:1px solid #2a2f3a;border-radius:12px;padding:16px}
    .card h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#9aa0a6;margin:0 0 8px}
    .card p{font-size:1.75rem;font-weight:700;margin:0}
    section{padding:0 24px 24px}table{width:100%;border-collapse:collapse;font-size:14px}
    th,td{padding:10px;border-bottom:1px solid #2a2f3a;text-align:left}
    .err{color:#ff6b6b;padding:24px}
  </style>
</head>
<body>
  <header>
    <h1>BC Taxi Admin</h1>
    <input id="key" type="password" placeholder="Admin API Key" style="flex:1;min-width:200px"/>
    <button onclick="load()">Atualizar</button>
  </header>
  <main id="kpis"></main>
  <section><h3>Corridas recentes</h3><table><thead><tr><th>ID</th><th>Status</th><th>Categoria</th><th>Criada</th></tr></thead><tbody id="rides"></tbody></table></section>
  <section><h3>Fraudes abertas</h3><table><thead><tr><th>Usuário</th><th>Risco</th><th>Resumo</th></tr></thead><tbody id="fraud"></tbody></table></section>
  <section><h3>Alertas operacionais</h3><table><thead><tr><th>Severidade</th><th>Resumo</th><th>Métrica</th></tr></thead><tbody id="alerts"></tbody></table></section>
  <section><h3>Eventos surge ativos</h3><table><thead><tr><th>Nome</th><th>Tipo</th><th>Intensidade</th><th>Até</th></tr></thead><tbody id="events"></tbody></table></section>
  <script>
    const base = ${JSON.stringify(apiBase)};
    function hdr(){const k=document.getElementById('key').value;return {'X-Admin-Key':k};}
    async function load(){
      try{
        const ov=await fetch(base+'/v1/admin/overview',{headers:hdr()}).then(r=>r.json());
        if(ov.error) throw new Error(ov.error);
        const o=ov.overview;
        document.getElementById('kpis').innerHTML=[
          ['Corridas hoje',o.ridesToday],['Ativas',o.activeRides],['Motoristas online',o.onlineDrivers],
          ['Fraudes abertas',o.openFraudCases],['Push hoje',o.pushSentToday],['Recibos hoje',o.receiptsIssuedToday],
          ['Faturas corp. pendentes',o.pendingCorporateInvoices],['Entregas ativas',o.activeDeliveries],
          ['Eventos surge',o.activeSurgeEvents],['Alertas ops',o.openOpsAlerts]
        ].map(([l,v])=>'<div class="card"><h2>'+l+'</h2><p>'+v+'</p></div>').join('');
        const rides=await fetch(base+'/v1/admin/rides?limit=15',{headers:hdr()}).then(r=>r.json());
        document.getElementById('rides').innerHTML=(rides.rides||[]).map(r=>'<tr><td>'+r.id.slice(0,8)+'…</td><td>'+r.status+'</td><td>'+r.categoryCode+'</td><td>'+r.createdAt.slice(0,16)+'</td></tr>').join('');
        const fraud=await fetch(base+'/v1/admin/fraud/cases',{headers:hdr()}).then(r=>r.json());
        document.getElementById('fraud').innerHTML=(fraud.cases||[]).map(c=>'<tr><td>'+c.userId.slice(0,8)+'…</td><td>'+c.riskScore+'</td><td>'+c.summary+'</td></tr>').join('')||'<tr><td colspan="3">Nenhum caso</td></tr>';
        const alerts=await fetch(base+'/v1/admin/ops/alerts',{headers:hdr()}).then(r=>r.json());
        document.getElementById('alerts').innerHTML=(alerts.alerts||[]).map(a=>'<tr><td>'+a.severity+'</td><td>'+a.summary+'</td><td>'+(a.metricValue??'—')+'</td></tr>').join('')||'<tr><td colspan="3">Nenhum alerta</td></tr>';
        const events=await fetch(base+'/v1/admin/events',{headers:hdr()}).then(r=>r.json());
        document.getElementById('events').innerHTML=(events.events||[]).map(e=>'<tr><td>'+e.eventName+'</td><td>'+e.eventType+'</td><td>'+e.intensityIndex+'</td><td>'+e.endsAt.slice(0,16)+'</td></tr>').join('')||'<tr><td colspan="4">Nenhum evento</td></tr>';
      }catch(e){document.getElementById('kpis').innerHTML='<p class="err">'+e.message+'</p>';}
    }
  </script>
</body>
</html>`;
}
