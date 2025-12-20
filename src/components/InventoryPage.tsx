// src/components/InventoryPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { Garden, Seed, CropType } from "../lib/types";
import { createSeed, deleteSeed } from "../lib/api/seeds";
import { listCropTypes, createCropType, updateCropType, deleteCropType } from "../lib/api/cropTypes";
import { Copy, Trash2, PlusCircle, ChevronDown, Search, Carrot, Leaf, Apple, Cherry, Flower2, Salad, Bean, Wheat, Edit2 } from "lucide-react";
import { SeedModal } from "./SeedModal";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/* ---------- helpers ---------- */

function nextCopyName(name: string) {
  if (!name) return "Nieuw zaad (kopie)";
  if (/\(kopie\)$/i.test(name)) return `${name} 2`;
  return `${name} (kopie)`;
}

// Fallback naar Lucide wanneer geen icon_slug staat / of ophalen faalt
function getCropTypeLucideIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("wortel") || lower.includes("knol")) return Carrot;
  if (lower.includes("sla") || lower.includes("blad")) return Salad;
  if (lower.includes("fruit") || lower.includes("bes")) return Cherry;
  if (lower.includes("appel") || lower.includes("peer")) return Apple;
  if (lower.includes("boon") || lower.includes("erwt")) return Bean;
  if (lower.includes("graan") || lower.includes("mais")) return Wheat;
  if (lower.includes("bloem")) return Flower2;
  return Leaf;
}

/* ---------- Iconify REST helpers + renderer ---------- */

function iconSrcFromSlug(slug: string, size = 16, color?: string) {
  const safe = (slug || "").trim();
  if (!safe) return null;

  // Ondersteun zowel 'mdi:carrot' als absolute URL's (Supabase/GitHub)
  if (/^https?:\/\//i.test(safe)) return safe;

  const path = safe.replace(":", "/");
  const params = new URLSearchParams({ height: String(size) });
  if (color) params.set("color", color.startsWith("#") ? `%23${color.slice(1)}` : color);
  return `https://api.iconify.design/${path}.svg?${params.toString()}`;
}

/** Render eerst een <img> vanaf Iconify REST (of absolute URL), anders Lucide fallback */
function CropIcon({
  iconSlug,
  fallbackName,
  className,
  size = 16,
}: {
  iconSlug?: string | null;
  fallbackName: string;
  className?: string;
  size?: number;
}) {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    setOk(true);
  }, [iconSlug]);

  const src = iconSrcFromSlug(iconSlug || "", size);
  if (src && ok) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("inline-block", className)}
        onError={() => setOk(false)}
        loading="lazy"
      />
    );
  }

  const Fallback = getCropTypeLucideIcon(fallbackName);
  return <Fallback className={cn("text-primary/70", className)} size={size} />;
}

/* ---------- kaartje ---------- */

function SeedCard({
  seed,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  seed: Seed;
  onEdit: (s: Seed) => void;
  onDelete: (s: Seed) => void;
  onDuplicate: (s: Seed) => void;
}) {
  const inStock = (seed as any).in_stock !== false;

  const colorDot =
    seed.default_color && seed.default_color.startsWith("#") ? (
      <span
        className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
        style={{ backgroundColor: seed.default_color }}
      />
    ) : (
      <span className={`inline-block w-3 h-3 rounded-sm flex-shrink-0 ${seed.default_color ?? "bg-green-500"}`} />
    );

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 border rounded-lg bg-card hover:bg-accent/50 transition cursor-pointer group",
        !inStock && "opacity-60"
      )}
      onClick={() => onEdit(seed)}
    >
      {colorDot}
      <span className="font-medium text-sm truncate flex-1">{seed.name}</span>

      {seed.greenhouse_compatible && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-green-600 text-white flex-shrink-0">Kas</span>
      )}

      {!inStock && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">✗</span>
      )}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(seed);
          }}
          className="p-1 text-muted-foreground hover:text-primary"
          title="Dupliceren"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(seed);
          }}
          className="p-1 text-muted-foreground hover:text-destructive"
          title="Verwijderen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ---------- stapel groep ---------- */

function SeedGroup({
  group,
  cropTypesById,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  group: { id: string; label: string; items: Seed[] };
  cropTypesById: Map<string, CropType>;
  onEdit: (s: Seed) => void;
  onDelete: (s: Seed) => void;
  onDuplicate: (s: Seed) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const count = group.items.length;

  const ct = group.id !== "__none__" ? cropTypesById.get(group.id) : undefined;
  const iconSlug = (ct as any)?.icon_slug as string | undefined;

  return (
    <section className="space-y-2">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-left group">
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-300",
            isOpen && "rotate-180"
          )}
        />
        <CropIcon iconSlug={iconSlug} fallbackName={group.label} className="text-primary/70" />
        <h3 className="text-base font-semibold group-hover:text-primary transition-colors">
          {group.label} <span className="text-sm text-muted-foreground font-normal">({count})</span>
        </h3>
      </button>

      {isOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {group.items.map((seed, index) => (
            <div
              key={seed.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 20}ms`, animationFillMode: "backwards" }}
            >
              <SeedCard seed={seed} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- IconPicker (met Iconify REST <img> previews) ---------- */

const ICON_CHOICES = [
  "mdi:carrot",
  "mdi:food-apple",
  "mdi:fruit-cherries",
  "mdi:fruit-grapes",
  "mdi:fruit-citrus",
  "mdi:fruit-pineapple",
  "mdi:fruit-watermelon",
  "mdi:fruit-strawberry",
  "mdi:pepper",
  "mdi:corn",
  "mdi:mushroom-outline",
  "mdi:leaf",
  "mdi:sprout",
  "mdi:wheat",
  "mdi:eggplant",
  "mdi:fruit-pear",
  "mdi:seed-outline",
  "mdi:flower",
  "mdi:pumpkin",
  "mdi:cabbage",
  "mdi:garlic",
  "mdi:onion",
  "mdi:tomato",
  "mdi:cucumber",
];

function IconPicker({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (slug: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ICON_CHOICES;
    return ICON_CHOICES.filter((s) => s.toLowerCase().includes(t));
  }, [q]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek icoon…"
          className="w-full px-3 py-2 text-sm bg-muted/30 border-0 rounded-lg focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="px-2 py-2 text-xs rounded-lg bg-muted hover:bg-muted/70"
          title="Zonder icoon"
        >
          Geen
        </button>
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-60 overflow-y-auto">
        {filtered.map((slug) => {
          const active = value === slug;
          const src = iconSrcFromSlug(slug, 24);
          return (
            <button
              key={slug}
              type="button"
              onClick={() => onChange(slug)}
              className={cn(
                "aspect-square rounded-lg border flex items-center justify-center hover:bg-muted transition-colors",
                active ? "border-primary ring-2 ring-primary/30" : "border-border/60"
              )}
              title={slug}
            >
              {src ? <img src={src} alt={slug} width={24} height={24} loading="lazy" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Categoriebeheer (tab) ---------- */

function CategoriesManager({
  cropTypes,
  onReload,
}: {
  cropTypes: CropType[];
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<null | { id?: string; name: string; icon_slug: string | null }>(null);
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setEditing({ name: "", icon_slug: null });
  }
  function startEdit(ct: CropType) {
    setEditing({
      id: (ct as any).id,
      name: ct.name,
      icon_slug: ((ct as any).icon_slug ?? null) as string | null,
    });
  }

  async function handleSave() {
    if (!editing) return;
    const { id, name, icon_slug } = editing;
    if (!name.trim()) {
      alert("Voer een naam in.");
      return;
    }
    try {
      setBusy(true);
      if (id) {
        await updateCropType(id as any, { name: name.trim(), icon_slug: icon_slug ?? null });
      } else {
        await createCropType({ name: name.trim(), icon_slug: icon_slug ?? null });
      }
      setEditing(null);
      await onReload();
    } catch (e: any) {
      alert("Opslaan mislukt: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Categorie verwijderen?")) return;
    try {
      setBusy(true);
      await deleteCropType(id as any);
      await onReload();
    } catch (e: any) {
      alert("Verwijderen mislukt: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Categorieën beheren</h3>
        <button
          onClick={startCreate}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          Nieuwe categorie
        </button>
      </div>

      {/* lijst */}
      <div className="grid gap-2">
        {cropTypes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nog geen categorieën.</p>
        )}
        {cropTypes.map((ct) => {
          const slug = (ct as any).icon_slug as string | undefined;
          const preview = slug ? iconSrcFromSlug(slug, 16) : null;
          return (
            <div key={ct.id} className="flex items-center gap-3 px-3 py-2 border rounded-lg bg-card">
              {preview ? (
                <img src={preview} alt="" width={16} height={16} loading="lazy" />
              ) : (
                <Leaf className="h-4 w-4 text-primary/70" />
              )}
              <span className="text-sm font-medium flex-1 truncate">{ct.name}</span>
              <button
                onClick={() => startEdit(ct)}
                className="p-1.5 rounded hover:bg-muted transition-colors"
                title="Bewerken"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete((ct as any).id)}
                className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                title="Verwijderen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* modal */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !busy && setEditing(null)}
        >
          <div
            className="bg-card rounded-2xl w-full max-w-lg border border-border/50 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
              <h4 className="text-lg font-semibold">{editing.id ? "Categorie bewerken" : "Nieuwe categorie"}</h4>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Naam</label>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full mt-1.5 bg-muted/30 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Bijv. Koolgewassen"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Icoon (Iconify slug of URL)</label>
                <IconPicker value={editing.icon_slug ?? null} onChange={(slug) => setEditing({ ...editing, icon_slug: slug })} />
                {editing.icon_slug && (
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    Voorbeeld:
                    {iconSrcFromSlug(editing.icon_slug, 20) ? (
                      <img
                        src={iconSrcFromSlug(editing.icon_slug, 20)!}
                        alt=""
                        width={20}
                        height={20}
                        loading="lazy"
                      />
                    ) : null}
                    <code className="px-1.5 py-0.5 rounded bg-muted">{editing.icon_slug}</code>
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border/30 bg-muted/20 flex justify-end gap-2">
              <button
                onClick={() => !busy && setEditing(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                disabled={busy}
              >
                Annuleren
              </button>
              <button
                onClick={handleSave}
                disabled={busy || !editing.name.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {busy ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- pagina ---------- */

type InvView = "seeds" | "categories";

export function InventoryPage({
  garden,
  seeds: initialSeeds,
  cropTypes: initialCropTypes,
  onDataChange,
}: {
  garden: Garden;
  seeds: Seed[];
  cropTypes: CropType[];
  onDataChange: () => Promise<void>;
}) {
  const [view, setView] = useState<InvView>(() => (localStorage.getItem("inventoryView") as InvView) || "seeds");

  const [seeds, setSeeds] = useState<Seed[]>(initialSeeds);
  const [cropTypes, setCropTypes] = useState<CropType[]>(initialCropTypes);
  const [editorOpen, setEditorOpen] = useState<{ seed: Seed | null } | null>(null);

  // filters
  const [inStockOnly, setInStockOnly] = useState<boolean>(true);
  const [cropTypeFilter, setCropTypeFilter] = useState<string>("all");
  const [q, setQ] = useState<string>(() => localStorage.getItem("inventoryQ") ?? "");

  useEffect(() => {
    localStorage.setItem("inventoryView", view);
  }, [view]);

  // Sync met centrale data + lokale fetch als fallback
  useEffect(() => {
    setSeeds(initialSeeds);
    if (initialCropTypes.length > 0) {
      setCropTypes(initialCropTypes);
    }
  }, [initialSeeds, initialCropTypes]);

  // Fetch cropTypes lokaal als ze leeg zijn (fallback of na wijzigingen)
  const reloadCropTypes = async () => {
    try {
      const types = await listCropTypes();
      setCropTypes(types);
    } catch (err) {
      console.error("Failed to fetch crop types:", err);
    }
  };
  useEffect(() => {
    if (cropTypes.length === 0) {
      reloadCropTypes();
    }
  }, [cropTypes.length]);

  useEffect(() => {
    localStorage.setItem("inventoryQ", q);
  }, [q]);

  function upsertLocal(updated: Seed) {
    setSeeds((prev) => {
      const i = prev.findIndex((s) => s.id === updated.id);
      if (i === -1) return [...prev, updated];
      const next = prev.slice();
      next[i] = updated;
      return next;
    });
  }

  async function handleDelete(seed: Seed) {
    if (!confirm(`Zaad “${seed.name}” verwijderen?`)) return;
    try {
      await deleteSeed(seed.id);
      setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
      await onDataChange();
    } catch (e: any) {
      alert("Kon zaad niet verwijderen: " + (e.message ?? String(e)));
    }
  }

  async function handleDuplicate(seed: Seed) {
    try {
      const payload: Partial<Seed> = {
        garden_id: garden.id,
        name: nextCopyName(seed.name),
        crop_type_id: seed.crop_type_id ?? null,
        purchase_date: seed.purchase_date ?? null,
        row_spacing_cm: seed.row_spacing_cm ?? null,
        plant_spacing_cm: seed.plant_spacing_cm ?? null,
        greenhouse_compatible: !!seed.greenhouse_compatible,
        sowing_type: seed.sowing_type ?? "direct",
        presow_duration_weeks: seed.presow_duration_weeks ?? null,
        grow_duration_weeks: seed.grow_duration_weeks ?? null,
        harvest_duration_weeks: seed.harvest_duration_weeks ?? null,
        presow_months: seed.presow_months ?? [],
        direct_plant_months: (seed as any).direct_plant_months ?? (seed as any).direct_sow_months ?? [],
        harvest_months: seed.harvest_months ?? [],
        notes: seed.notes ?? null,
        default_color: seed.default_color ?? "#22c55e",
      };
      const created = await createSeed(payload);
      upsertLocal(created);
      await onDataChange();
    } catch (e: any) {
      alert("Dupliceren mislukt: " + (e.message ?? String(e)));
    }
  }

  // filters toepassen
  const filtered = useMemo(() => {
    let arr = seeds.slice();

    if (q.trim()) {
      const term = q.trim().toLowerCase();
      arr = arr.filter((s) => s.name.toLowerCase().includes(term));
    }

    if (inStockOnly) {
      arr = arr.filter((s: any) => (s as any).in_stock !== false);
    }
    if (cropTypeFilter !== "all") {
      if (cropTypeFilter === "__none__") {
        arr = arr.filter((s) => !s.crop_type_id);
      } else {
        arr = arr.filter((s) => s.crop_type_id === cropTypeFilter);
      }
    }

    return arr;
  }, [seeds, inStockOnly, cropTypeFilter, q]);

  // groepering op gewastype
  const groups = useMemo(() => {
    const byId = new Map<string, CropType>(cropTypes.map((ct) => [ct.id, ct]));
    const map = new Map<string, { label: string; items: Seed[] }>();

    for (const s of filtered) {
      const key = s.crop_type_id || "__none__";
      const label = s.crop_type_id ? byId.get(s.crop_type_id)?.name || "Onbekend" : "Overig";
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(s);
    }

    const out = Array.from(map.entries())
      .sort(([, A], [, B]) => A.label.localeCompare(B.label, "nl"))
      .map(([id, g]) => ({
        id,
        label: g.label,
        items: g.items.slice().sort((a, b) => a.name.localeCompare(b.name, "nl")),
      }));

    return { groups: out, cropTypesById: byId };
  }, [filtered, cropTypes]);

  return (
    <div className="space-y-6">
      {/* header + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Voorraad</h2>

        <div className="flex items-center gap-2">
          <div className="p-0.5 bg-muted/40 rounded-lg">
            <button
              onClick={() => setView("seeds")}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-md",
                view === "seeds" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Zaden
            </button>
            <button
              onClick={() => setView("categories")}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-md",
                view === "categories" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Categorieën
            </button>
          </div>
        </div>
      </div>

      {view === "seeds" ? (
        <>
          {/* filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Zoek op naam…"
                className="w-48 md:w-56 pl-9 pr-3 py-2 text-sm bg-muted/30 border-0 rounded-lg focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all placeholder:text-muted-foreground/50"
              />
            </div>

            <button
              onClick={() => setInStockOnly(!inStockOnly)}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-lg transition-all",
                inStockOnly
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              In voorraad
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button className="px-3 py-2 text-sm rounded-lg flex items-center gap-2 bg-muted/30 hover:bg-muted/50 transition-all">
                  <span
                    className={cn(
                      "truncate max-w-32",
                      cropTypeFilter === "all" ? "text-muted-foreground" : "text-foreground font-medium"
                    )}
                  >
                    {cropTypeFilter === "all"
                      ? "Gewastype"
                      : cropTypeFilter === "__none__"
                      ? "Overig"
                      : cropTypes.find((ct) => ct.id === cropTypeFilter)?.name || "Gewastype"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto bg-popover/95 backdrop-blur-sm border-border/50">
                <div className="space-y-0.5">
                  <button
                    onClick={() => setCropTypeFilter("all")}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors",
                      cropTypeFilter === "all" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
                    )}
                  >
                    Alle gewastypen
                  </button>
                  {cropTypes.map((ct) => {
                    const slug = (ct as any).icon_slug as string | undefined;
                    const src = slug ? iconSrcFromSlug(slug, 16) : null;
                    return (
                      <button
                        key={ct.id}
                        onClick={() => setCropTypeFilter(ct.id)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2",
                          cropTypeFilter === ct.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
                        )}
                      >
                        {src ? (
                          <img src={src} alt="" width={16} height={16} loading="lazy" />
                        ) : (
                          <Leaf className="h-4 w-4 text-primary/70" />
                        )}
                        {ct.name}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCropTypeFilter("__none__")}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors text-muted-foreground flex items-center gap-2",
                      cropTypeFilter === "__none__" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
                    )}
                  >
                    <Leaf className="h-4 w-4" />
                    Overig (geen soort)
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <button
              onClick={() => setEditorOpen({ seed: null })}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors ml-auto"
            >
              <PlusCircle className="h-4 w-4" />
              Nieuw zaad
            </button>
          </div>

          {/* gegroepeerde kaarten */}
          {groups.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen zaden gevonden.</p>
          ) : (
            <div className="space-y-6">
              {groups.groups.map((g) => (
                <SeedGroup
                  key={g.id}
                  group={g}
                  cropTypesById={groups.cropTypesById}
                  onEdit={(s) => setEditorOpen({ seed: s })}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </div>
          )}

          {editorOpen && (
            <SeedModal
              gardenId={garden.id}
              seed={(editorOpen.seed as any) || ({} as any)}
              onClose={() => setEditorOpen(null)}
              onSaved={async (saved) => {
                upsertLocal(saved);
                setEditorOpen(null);
                await onDataChange();
              }}
            />
          )}
        </>
      ) : (
        <CategoriesManager cropTypes={cropTypes} onReload={reloadCropTypes} />
      )}
    </div>
  );
}

export default InventoryPage;
