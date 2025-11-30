import { useEffect, useState } from "react";
import type { Seed, CropType, UUID } from "../lib/types";
import { createSeed, updateSeed } from "../lib/api/seeds";
import { listCropTypes } from "../lib/api/cropTypes";
import { MonthSelector } from "./MonthSelector";
import { ColorField } from "./ColorField";
import { supabase } from "@/integrations/supabase/client";

interface SeedModalProps {
  gardenId: UUID;
  seed: Partial<Seed>;            // leeg bij nieuw
  onClose: () => void;
  onSaved: (seed: Seed) => void;  // geeft aangemaakte/geüpdatete seed terug
}

export function SeedModal({ gardenId, seed, onClose, onSaved }: SeedModalProps) {
  const editing = !!seed.id;
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // EAN Lookup state
  const [eanCode, setEanCode] = useState("");
  const [eanLoading, setEanLoading] = useState(false);
  const [eanMessage, setEanMessage] = useState<{type: 'success' | 'info' | 'error', text: string} | null>(null);

  const [form, setForm] = useState<Partial<Seed>>({
    garden_id: gardenId,
    name: seed.name ?? "",
    crop_type_id: seed.crop_type_id ?? null,
    purchase_date: seed.purchase_date ?? "",
    row_spacing_cm: seed.row_spacing_cm ?? null,
    plant_spacing_cm: seed.plant_spacing_cm ?? null,
    greenhouse_compatible: seed.greenhouse_compatible ?? false, // ← al aanwezig in state
    sowing_type: (seed.sowing_type === "presow" ? "presow" : "direct"),

    presow_duration_weeks: seed.presow_duration_weeks ?? null,
    grow_duration_weeks: seed.grow_duration_weeks ?? null,
    harvest_duration_weeks: seed.harvest_duration_weeks ?? null,

    presow_months: seed.presow_months ?? [],
    greenhouse_months: (seed as any).greenhouse_months ?? [],
    direct_plant_months: (seed as any).direct_plant_months ?? (seed as any).direct_sow_months ?? [],
    harvest_months: seed.harvest_months ?? [],

    default_color: seed.default_color ?? null,
    notes: seed.notes ?? "",
    in_stock: (seed as any).in_stock !== false,
  });

  useEffect(() => {
    // Haal cropTypes op en sla ze op in localStorage als backup
    const fetchCropTypes = async () => {
      try {
        const types = await listCropTypes();
        setCropTypes(types);
        localStorage.setItem('cached_crop_types', JSON.stringify(types));
      } catch (err) {
        console.error('Failed to fetch crop types:', err);
        // Gebruik cached data als fallback
        const cached = localStorage.getItem('cached_crop_types');
        if (cached) {
          setCropTypes(JSON.parse(cached));
        }
      }
    };

    fetchCropTypes();

    // Herlaad cropTypes wanneer de tab weer actief wordt
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCropTypes();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  function handleChange<K extends keyof Seed>(field: K, value: Seed[K] | any) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleEanLookup() {
    if (!eanCode.trim()) return;
    
    setEanLoading(true);
    setEanMessage(null);
    
    try {
      const { data, error: lookupError } = await supabase.functions.invoke('ean-seed-lookup', {
        body: { ean: eanCode.trim() }
      });

      if (lookupError) throw lookupError;

      if (data?.found && data?.data) {
        const extracted = data.data;
        
        // Update form met gevonden data
        setForm(prev => ({
          ...prev,
          name: extracted.name || prev.name,
          crop_type_id: extracted.crop_type_id || prev.crop_type_id,
          sowing_type: extracted.sowing_type || prev.sowing_type,
          presow_months: extracted.presow_months || prev.presow_months,
          direct_plant_months: extracted.direct_plant_months || prev.direct_plant_months,
          greenhouse_months: extracted.greenhouse_months || prev.greenhouse_months,
          harvest_months: extracted.harvest_months || prev.harvest_months,
          presow_duration_weeks: extracted.presow_duration_weeks ?? prev.presow_duration_weeks,
          grow_duration_weeks: extracted.grow_duration_weeks ?? prev.grow_duration_weeks,
          harvest_duration_weeks: extracted.harvest_duration_weeks ?? prev.harvest_duration_weeks,
          plant_spacing_cm: extracted.plant_spacing_cm ?? prev.plant_spacing_cm,
          row_spacing_cm: extracted.row_spacing_cm ?? prev.row_spacing_cm,
          greenhouse_compatible: extracted.greenhouse_compatible ?? prev.greenhouse_compatible,
          notes: extracted.notes || prev.notes,
        }));
        
        setEanMessage({ 
          type: 'success', 
          text: 'Gevonden! Controleer de ingevulde gegevens en pas aan waar nodig.' 
        });
      } else {
        setEanMessage({ 
          type: 'info', 
          text: data?.message || `Geen informatie gevonden voor EAN ${eanCode}. Je kunt de gegevens handmatig invullen.` 
        });
      }
    } catch (err: any) {
      console.error('EAN lookup error:', err);
      setEanMessage({ 
        type: 'error', 
        text: err?.message || 'Er ging iets mis bij het zoeken. Probeer het opnieuw of vul handmatig in.' 
      });
    } finally {
      setEanLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<Seed> = {
        ...form,
        crop_type_id: form.crop_type_id || null,
        purchase_date: form.purchase_date || null,
        row_spacing_cm:
          !form.row_spacing_cm || String(form.row_spacing_cm) === ""
            ? null
            : Number(form.row_spacing_cm),
        plant_spacing_cm:
          !form.plant_spacing_cm || String(form.plant_spacing_cm) === ""
            ? null
            : Number(form.plant_spacing_cm),
        presow_duration_weeks: !form.presow_duration_weeks || String(form.presow_duration_weeks) === "" ? null : Number(form.presow_duration_weeks),
        grow_duration_weeks: !form.grow_duration_weeks || String(form.grow_duration_weeks) === "" ? null : Number(form.grow_duration_weeks),
        harvest_duration_weeks: !form.harvest_duration_weeks || String(form.harvest_duration_weeks) === "" ? null : Number(form.harvest_duration_weeks),
        greenhouse_months: form.greenhouse_compatible ? ((form as any).greenhouse_months ?? []) : [],
        notes: form.notes || null,
        // greenhouse_compatible + in_stock gaan al mee via ...form
        // default_color verwacht #hex (ColorField regelt conversie)
      };

      const saved = editing
        ? await updateSeed(seed.id as UUID, payload)
        : await createSeed(payload);

      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-index-50 z-50">
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-3xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">
          {editing ? "Zaad bewerken" : "Nieuw zaad"}
        </h3>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* EAN Lookup */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">EAN / Barcode</label>
            <input
              type="text"
              value={eanCode}
              onChange={(e) => setEanCode(e.target.value)}
              placeholder="Bijv. 8717202604869"
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <button
            onClick={handleEanLookup}
            disabled={!eanCode.trim() || eanLoading}
            className="px-3 py-1 rounded-md border border-border bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {eanLoading ? "Zoeken..." : "🔍 Zoeken"}
          </button>
        </div>
        {eanMessage && (
          <div className={`text-sm rounded px-3 py-2 ${
            eanMessage.type === 'success' ? 'text-green-700 bg-green-50 border border-green-200' :
            eanMessage.type === 'error' ? 'text-red-600 bg-red-50 border border-red-200' :
            'text-amber-700 bg-amber-50 border border-amber-200'
          }`}>
            {eanMessage.text}
          </div>
        )}

        {/* Naam + type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Naam</label>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full border rounded-md px-2 py-1"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gewastype</label>
            <select
              value={form.crop_type_id ?? ""}
              onChange={(e) => handleChange("crop_type_id", e.target.value || null)}
              className="w-full border rounded-md px-2 py-1"
            >
              <option value="">— Kies type —</option>
              {cropTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Aankoopdatum + In voorraad + Geschikt voor kas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Aankoopdatum</label>
            <input
              type="date"
              value={form.purchase_date ?? ""}
              onChange={(e) => handleChange("purchase_date", e.target.value || null)}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.in_stock ?? true}
                onChange={(e) => handleChange("in_stock", e.target.checked)}
              />
              <span className="text-sm font-medium">In voorraad</span>
            </label>

            {/* ✅ nieuwe checkbox, zelfde rij en stijl */}
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.greenhouse_compatible}
                onChange={(e) => handleChange("greenhouse_compatible", e.target.checked)}
              />
              <span className="text-sm font-medium">Geschikt voor kas</span>
            </label>
          </div>
        </div>

        {/* Afstanden + Zaaitype */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Rijafstand (cm)</label>
            <input
              type="number"
              value={form.row_spacing_cm ?? ""}
              onChange={(e) => handleChange("row_spacing_cm", e.target.value === '' ? null : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Plantafstand (cm)</label>
            <input
              type="number"
              value={form.plant_spacing_cm ?? ""}
              onChange={(e) => handleChange("plant_spacing_cm", e.target.value === '' ? null : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Zaaitype</label>
            <select
              value={form.sowing_type ?? "direct"}
              onChange={(e) => handleChange("sowing_type", e.target.value)}
              className="w-full border rounded-md px-2 py-1"
            >
              <option value="direct">Direct zaaien</option>
              <option value="presow">Voorzaaien</option>
            </select>
          </div>
        </div>

        {/* Duur */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Voorzaai (weken)</label>
            <input
              type="number"
              value={form.presow_duration_weeks ?? ""}
              onChange={(e) => handleChange("presow_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
              disabled={form.sowing_type === 'direct'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Groei (weken)</label>
            <input
              type="number"
              value={form.grow_duration_weeks ?? ""}
              onChange={(e) => handleChange("grow_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Oogstduur (weken)</label>
            <input
              type="number"
              value={form.harvest_duration_weeks ?? ""}
              onChange={(e) => handleChange("harvest_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
        </div>

        {/* Maanden-selectors */}
        <MonthSelector
          label="Voorzaaien"
          value={(form.presow_months ?? []) as number[]}
          onChange={(val) => handleChange("presow_months", val)}
          disabled={form.sowing_type === 'direct'}
        />
        <MonthSelector
          label="In de kas"
          value={((form as any).greenhouse_months ?? []) as number[]}
          onChange={(val) => handleChange("greenhouse_months", val)}
          disabled={!form.greenhouse_compatible}
        />
        <MonthSelector
          label="In volle grond"
          value={(form.direct_plant_months ?? []) as number[]}
          onChange={(val) => handleChange("direct_plant_months", val)}
        />
        <MonthSelector
          label="Oogsten"
          value={(form.harvest_months ?? []) as number[]}
          onChange={(val) => handleChange("harvest_months", val)}
        />

        {/* Kleur */}
        <ColorField
          label="Standaardkleur (kaart & planner)"
          value={form.default_color ?? undefined}
          onChange={(hex) => handleChange("default_color", hex)}
          helperText="Je kunt #RRGGBB of rgb(r,g,b) invoeren. We slaan #hex op."
        />

        {/* Notities */}
        <div>
          <label className="block text-sm font-medium mb-1">Notities</label>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => handleChange("notes", e.target.value)}
            className="w-full border rounded-md px-2 py-1"
          />
        </div>

        {/* Acties */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md border border-border bg-muted"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name?.trim()}
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Opslaan..." : editing ? "Opslaan" : "Toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
