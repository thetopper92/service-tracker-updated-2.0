export function exportCSV(transactions, fileName = "ServiceTracker.csv") {
  if (!transactions.length) { alert("No transactions to export."); return; }
  const rows = [
    ["Date","Type","Category","Description","Amount","Received"],
    ...transactions.map(t => [t.date, t.type, t.category, t.description||"", Number(t.amount).toFixed(2), t.type === "income" ? (t.unpaid ? "No" : "Yes") : ""])
  ];
  const inc = transactions.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0);
  const exp = transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  const pro = inc - exp;
  const owed = transactions.filter(t=>t.type==="income"&&t.unpaid).reduce((s,t)=>s+Number(t.amount),0);
  rows.push([],[" --- SUMMARY ---"],["Total Revenue",inc.toFixed(2)],["Not received yet",owed.toFixed(2)],["Total Expenses",exp.toFixed(2)],
    ["Net Profit",pro.toFixed(2)],["ROI %",exp>0?((pro/exp)*100).toFixed(2):0],
    ["Profit Margin %",inc>0?((pro/inc)*100).toFixed(2):0]);
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
