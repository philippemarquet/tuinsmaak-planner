// src/components/CapacityTimelineView.tsx
import React, { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight } from "lucide-react";

/* helpers */
const toISO=(d:Date)=>{ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const dd=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; };
const parseISO=(x?:string|null)=>{ if(!x) return null; const [y,m,dd]=x.split("-").map(Number); return new Date(y,m-1,dd); };
const addDays=(d:Date,n:number)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const daysInMonth=(y:number,m0:number)=> new Date(y,m0+1,0).getDate();

/* 0..1 -> wit→donkergroen */
function occupancyColor(t:number){
  const tt=clamp(t,0,1);
  const dark={r:6,g:78,b:59}; // #064e3b
  const r=Math.round(255-(255-dark.r)*tt);
  const g=Math.round(255-(255-dark.g)*tt);
  const b=Math.round(255-(255-dark.b)*tt);
  return `rgb(${r}, ${g}, ${b})`;
}

function DroppableCell({ id }: { id:string }){
  const { setNodeRef, isOver } = useDroppable({ id });
  // pointer-events: none zodat clicks op blokken erdoor gaan; dnd-kit gebruikt bounding rects
  return <div ref={setNodeRef} className={`relative h-full w-full pointer-events-none ${isOver?"outline outline-2 outline-primary/60 bg-primary/5":""}`}/>;
}

function DraggablePlanting({
  planting, label, gridColumnStart, gridColumnEnd, gridRowStart, gridRowEnd, color, onClick,
}:{
  planting:Planting; label:string;
  gridColumnStart:number; gridColumnEnd:number;
  gridRowStart:number; gridRowEnd:number;
  color:string; onClick:()=>void;
}){
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id:`planting-${planting.id}` });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`text-[10px] rounded px-1 py-0.5 cursor-grab active:cursor-grabbing select-none z-10 ${isDragging?"opacity-60 scale-[0.98]":""}`}
      style={{ gridColumnStart, gridColumnEnd, gridRowStart, gridRowEnd, background:color, color:"#fff" } as React.CSSProperties}
      onClick={(e)=>{ e.stopPropagation(); onClick(); }}
      role="button"
      title={label}
    >
      <div className="truncate">{label}</div>
    </div>
  );
}

export default function CapacityTimelineView({
  beds, plantings, seeds, currentWeek, onReload, onPlantClick,
}:{
  beds:GardenBed[]; plantings:Planting[]; seeds:Seed[]; currentWeek:Date;
  onReload:()=>Promise<void>;
  onPlantClick:(p:Planting)=>void;
}){
  // maandbasis = maand van currentWeek
  const initialMonthStart = useMemo(()=> new Date(currentWeek.getFullYear(), currentWeek.getMonth(), 1), [currentWeek]);
  const [monthStart, setMonthStart] = useState<Date>(initialMonthStart);

  const year=monthStart.getFullYear();
  const month0=monthStart.getMonth();
  const totalDays=daysInMonth(year,month0);
  const dayDates=useMemo(()=> Array.from({length:totalDays},(_,i)=> addDays(monthStart,i)), [monthStart,totalDays]);
  const DAY_W=28; const ROW_H=22;
  const daysWidth = totalDays * DAY_W;

  const seedsById=useMemo(()=> Object.fromEntries(seeds.map(s=>[s.id,s])), [seeds]);

  // occupancy per bed per dag
  const occupancyByBedDay = useMemo(()=>{
    const map=new Map<string, number[]>();
    for(const bed of beds){
      const arr=new Array<number>(totalDays).fill(0);
      const segTotal=Math.max(1, bed.segments||1);
      for(const p of plantings){
        if(p.garden_bed_id!==bed.id) continue;
        const s=parseISO(p.planned_date), e=parseISO(p.planned_harvest_end); if(!s||!e) continue;
        for(let di=0; di<totalDays; di++){
          const d=dayDates[di];
          if(s<=d && d<=e) arr[di]+=Math.max(1,p.segments_used??1);
        }
      }
      for(let i=0;i<totalDays;i++) arr[i]=Math.min(1, arr[i]/segTotal);
      map.set(bed.id, arr);
    }
    return map;
  },[beds, plantings, dayDates, totalDays]);

  // expand/collapse
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const allExpanded = expanded.size===beds.length;
  const expandAll=()=> setExpanded(new Set(beds.map(b=>b.id)));
  const collapseAll=()=> setExpanded(new Set());
  const toggleBed=(id:string)=> setExpanded(prev=>{ const n=new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; });

  // navigatie
  const prevMonth=()=> setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth()-1, 1));
  const nextMonth=()=> setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth()+1, 1));
  const thisMonth=()=> setMonthStart(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // groepen: buiten/kas
  const groups = useMemo(()=>[
    { key:"outdoor", label:"Buiten", items:beds.filter(b=>!b.is_greenhouse) },
    { key:"greenhouse", label:"Kas", items:beds.filter(b=> b.is_greenhouse) },
  ],[beds]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded border bg-secondary hover:bg-secondary/80" onClick={prevMonth}>←</button>
          <div className="text-sm font-semibold">
            {monthStart.toLocaleString("nl-NL", { month:"long", year:"numeric" })}
          </div>
          <button className="px-2 py-1 rounded border bg-secondary hover:bg-secondary/80" onClick={nextMonth}>→</button>
          <button className="ml-2 px-2 py-1 rounded border bg-muted hover:bg-muted/70 text-xs" onClick={thisMonth}>Vandaag</button>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded border bg-muted hover:bg-muted/70 text-xs" onClick={allExpanded?collapseAll:expandAll}>
            {allExpanded?"Alles inklappen":"Alles uitklappen"}
          </button>
          <div className="text-xs text-muted-foreground">Sleep seeds naar dag×segment of versleep blokken. Klik op een blok om te bewerken.</div>
        </div>
      </div>

      {/* Scrollcontainer zodat alle 28/29/30/31 dagen zichtbaar zijn */}
      <div className="overflow-x-auto rounded-lg border">
        {/* Dag-header */}
        <div style={{ minWidth: 240 + daysWidth }}>
          <div className="grid sticky top-0 z-10 bg-background" style={{ gridTemplateColumns:`240px repeat(${totalDays}, ${DAY_W}px)` }}>
            <div className="h-8 flex items-end pl-3 text-xs text-muted-foreground">Dag</div>
            {dayDates.map((d,idx)=>(
              <div key={idx} className="h-8 text-[10px] flex items-end justify-center text-muted-foreground">
                <div className="pb-1">{d.getDate()}</div>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns:`240px repeat(${totalDays}, ${DAY_W}px)` }}>
            <div className="h-1 border-t border-dashed border-muted-foreground/30"></div>
            {dayDates.map((_,idx)=>(<div key={idx} className="h-1 border-t border-dashed border-muted-foreground/30"/>))}
          </div>
        </div>

        {/* Content per groep (Buiten / Kas) */}
        {groups.map(group=>(
          <div key={group.key} style={{ minWidth: 240 + daysWidth }}>
            {group.items.length>0 && (
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide bg-muted/40 border-y">{group.label}</div>
            )}

            {/* Per bed */}
            {group.items.map((bed)=>{
              const segCount=Math.max(1, bed.segments||1);
              const occ=occupancyByBedDay.get(bed.id)!;
              const isOpen=expanded.has(bed.id);
              const gridCols=`repeat(${totalDays}, ${DAY_W}px)`;
              const gridRows=`repeat(${segCount}, ${ROW_H}px)`;

              return (
                <div key={bed.id} className="border-b bg-card/50">
                  {/* Collapsed row: bezetting */}
                  <button className="w-full px-3 py-2 text-sm font-medium flex items-center justify-between border-b bg-muted/40"
                          onClick={()=>toggleBed(bed.id)} title={isOpen?"Inklappen":"Uitklappen"}>
                    <span className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
                      <span className="truncate">{bed.name}</span>
                      {bed.is_greenhouse && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white">Kas</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round((occ.reduce((a,b)=>a+b,0)/occ.length)*100)}% gemiddeld bezet
                    </span>
                  </button>

                  <div className="grid" style={{ gridTemplateColumns:`240px repeat(${totalDays}, ${DAY_W}px)` }}>
                    <div className="bg-background/60 border-r px-3 py-2 text-[11px] text-muted-foreground">{isOpen?"Segmenten":"Bezetting per dag"}</div>
                    {occ.map((t,i)=>(
                      <div key={i} className="h-[22px] border-r border-muted-foreground/10" style={{ background: occupancyColor(t) }}
                           title={`${toISO(dayDates[i])}: ${Math.round(t*100)}%`}/>
                    ))}
                  </div>

                  {/* Expanded: segmenten + blokken */}
                  {isOpen && (
                    <div className="relative" style={{ display:"grid", gridTemplateColumns:`240px 1fr` }}>
                      <div className="border-r bg-background/60">
                        <div className="grid" style={{ gridTemplateRows: gridRows }}>
                          {Array.from({length:segCount},(_,r)=>(
                            <div key={r} className="h-[22px] text-[10px] text-muted-foreground flex items-center justify-end pr-2 border-b border-dashed border-muted-foreground/20" title={`Segment ${r+1}`}>
                              Seg {r+1}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rechterpaneel met vaste breedte voor alle dagen */}
                      <div className="relative" style={{ width: daysWidth }}>
                        {/* droppable cells */}
                        <div className="grid" style={{ gridTemplateColumns: gridCols, gridTemplateRows: gridRows }}>
                          {Array.from({length:segCount},(_,r)=>
                            dayDates.map((d,c)=>{
                              const id=`timeline__${bed.id}__segment__${r}__date__${toISO(d)}`;
                              return <div key={`${r}-${c}`} className="border-b border-r border-transparent hover:border-muted-foreground/20">
                                <DroppableCell id={id}/>
                              </div>;
                            })
                          )}
                        </div>

                        {/* blokken */}
                        <div className="grid absolute inset-0" style={{ gridTemplateColumns: gridCols, gridTemplateRows: gridRows }}>
                          {(plantings||[]).filter(p=>p.garden_bed_id===bed.id).map(p=>{
                            const seed=seedsById[p.seed_id]; const s=parseISO(p.planned_date); const e=parseISO(p.planned_harvest_end);
                            if(!s||!e) return null;

                            // clip aan de zichtbare maand
                            const startIdx = Math.max(0, Math.floor((s.getTime()-monthStart.getTime())/86400000));
                            const endIdx   = Math.min(totalDays-1, Math.floor((e.getTime()-monthStart.getTime())/86400000));
                            if(endIdx<0 || startIdx>totalDays-1) return null;

                            const gridColumnStart = Math.max(1, startIdx+1);
                            const gridColumnEnd   = Math.min(totalDays, endIdx+1) + 1; // exclusief

                            const used=Math.max(1, p.segments_used??1);
                            const rStart=(p.start_segment??0)+1;
                            const rEnd=Math.min(segCount+1, rStart + used); // exclusief, geclipped

                            const label=seed?.name ?? "—";
                            const color=(p.color && p.color.startsWith("#")) ? p.color : (seed?.default_color?.startsWith("#") ? seed.default_color! : "#16a34a");

                            return (
                              <DraggablePlanting key={p.id} planting={p} label={label}
                                gridColumnStart={gridColumnStart} gridColumnEnd={gridColumnEnd}
                                gridRowStart={rStart} gridRowEnd={rEnd}
                                color={color}
                                onClick={()=>onPlantClick(p)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
