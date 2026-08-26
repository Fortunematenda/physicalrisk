'use client';
import { useEffect, useState } from 'react';

function parseZar(raw: unknown): number | null {
  const cleaned = String(raw ?? '').replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}
function formatZar(value: unknown): string {
  const n = parseZar(value);
  return n == null ? '' : `R ${n.toLocaleString('en-ZA')}`;
}
export function ZarCurrencyInput({ value, onCommit, id, step = 100000 }:{value:unknown;onCommit:(value:number)=>void;id?:string;step?:number}){
  const [display,setDisplay]=useState(formatZar(value));
  useEffect(()=>setDisplay(formatZar(value)),[value]);
  function commit(){const n=parseZar(display); if(n==null){setDisplay('');return;} const rounded=step>0?Math.round(n/step)*step:n; setDisplay(formatZar(rounded)); onCommit(rounded)}
  return <div style={{display:'flex',gap:8,alignItems:'center'}}>
    <input id={id} inputMode="numeric" value={display} placeholder="R 19,000,000" onFocus={()=>{const n=parseZar(display);setDisplay(n==null?'':String(n))}} onChange={e=>setDisplay(e.target.value)} onBlur={commit}/>
    <button type="button" className="btn secondary" aria-label="Decrease by R100,000" onClick={()=>{const n=Math.max(0,(parseZar(display)||0)-step);setDisplay(formatZar(n));onCommit(n)}}>−</button>
    <button type="button" className="btn secondary" aria-label="Increase by R100,000" onClick={()=>{const n=(parseZar(display)||0)+step;setDisplay(formatZar(n));onCommit(n)}}>+</button>
  </div>
}
