import { supabase } from "../supabaseClient";
import type { Audit, AuditItem, AuditStatus, AuditStatusHistory, UUID } from "../types";

/** Alle audits voor een tuin ophalen (meest recent eerst) */
export async function listAudits(gardenId: UUID): Promise<Audit[]> {
  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .eq("garden_id", gardenId)
    .order("requested_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Audit[];
}

/**
 * Openstaande/actieve audits ophalen (alles behalve 'goedgekeurd').
 * Dit omvat dus: 'open', 'onderhanden', 'afwachting'.
 */
export async function listOpenAudits(gardenId: UUID): Promise<Audit[]> {
  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .eq("garden_id", gardenId)
    .neq("status", "goedgekeurd")
    .order("requested_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Audit[];
}

/** Historische (afgeronde) audits ophalen (status = 'goedgekeurd') */
export async function listCompletedAudits(gardenId: UUID): Promise<Audit[]> {
  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .eq("garden_id", gardenId)
    .eq("status", "goedgekeurd")
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Audit[];
}

/** Nieuwe audit aanmaken + initiële statuslog */
export async function createAudit(gardenId: UUID, requestedBy: UUID): Promise<Audit> {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);

  const { data, error } = await supabase
    .from("audits")
    .insert({
      garden_id: gardenId,
      requested_by: requestedBy,
      deadline: deadline.toISOString(),
      status: "open",
    })
    .select("*")
    .single();

  if (error) throw error;

  // Eerste history entry
  const { error: histErr } = await supabase.from("audit_status_history").insert({
    audit_id: data.id,
    old_status: null,
    new_status: "open",
    changed_by: requestedBy,
  });
  if (histErr) {
    // Niet laten falen; maar wel loggen in console voor debugging.
    // eslint-disable-next-line no-console
    console.warn("audit_status_history insert failed:", histErr);
  }

  return data as Audit;
}

/** Audit items ophalen (chronologisch) */
export async function listAuditItems(auditId: UUID): Promise<AuditItem[]> {
  const { data, error } = await supabase
    .from("audit_items")
    .select("*")
    .eq("audit_id", auditId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AuditItem[];
}

/** Audit items aanmaken (bulk) */
export async function createAuditItems(
  items: Omit<AuditItem, "id" | "created_at">[]
): Promise<AuditItem[]> {
  const { data, error } = await supabase
    .from("audit_items")
    .insert(items)
    .select("*");

  if (error) throw error;
  return (data ?? []) as AuditItem[];
}

/**
 * Audit item valideren / her-valideren.
 * Je kunt dit herhaald aanroepen om van ✅ naar ❌ (met notities) of andersom te gaan.
 */
export async function validateAuditItem(
  itemId: UUID,
  isCorrect: boolean,
  notes?: string | null
): Promise<AuditItem> {
  const { data, error } = await supabase
    .from("audit_items")
    .update({
      is_validated: true,
      is_correct: isCorrect,
      notes: notes ?? null,
      validated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .select("*")
    .single();

  if (error) throw error;
  return data as AuditItem;
}

/**
 * Audit status updaten + statusgeschiedenis loggen.
 * Bij 'goedgekeurd' wordt 'completed_at' gezet.
 */
export async function updateAuditStatus(
  auditId: UUID,
  newStatus: AuditStatus,
  changedBy: UUID
): Promise<Audit> {
  // Huidige status ophalen voor history
  const { data: current } = await supabase
    .from("audits")
    .select("status")
    .eq("id", auditId)
    .single();

  const oldStatus = (current?.status ?? null) as AuditStatus | null;

  const updateData: Partial<Audit> = { status: newStatus };
  if (newStatus === "goedgekeurd") {
    updateData.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("audits")
    .update(updateData)
    .eq("id", auditId)
    .select("*")
    .single();

  if (error) throw error;

  const { error: histErr } = await supabase.from("audit_status_history").insert({
    audit_id: auditId,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: changedBy,
  });
  if (histErr) throw histErr;

  return data as Audit;
}

/** Statushistorie ophalen (oud→nieuw) */
export async function getAuditStatusHistory(auditId: UUID): Promise<AuditStatusHistory[]> {
  const { data, error } = await supabase
    .from("audit_status_history")
    .select("*")
    .eq("audit_id", auditId)
    .order("changed_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AuditStatusHistory[];
}

/**
 * Audit verwijderen.
 * Werkt out-of-the-box als je FK's met `ON DELETE CASCADE` hebt.
 * Zo niet, dan valt deze functie terug op het handmatig verwijderen van afhankelijke records.
 */
export async function deleteAudit(auditId: UUID): Promise<void> {
  // 1) Probeer directe delete (dekt de CASCADE-case)
  const { error } = await supabase.from("audits").delete().eq("id", auditId);
  if (!error) return;

  // 2) Als het GEEN foreign key violation is → throw
  const code = (error as any)?.code ?? "";
  const message = (error as any)?.message ?? "";
  const isFKViolation =
    code === "23503" ||
    /foreign key|violates foreign key constraint/i.test(message);

  if (!isFKViolation) throw error;

  // 3) Handmatig child-records verwijderen en opnieuw proberen
  const { error: e1 } = await supabase
    .from("audit_items")
    .delete()
    .eq("audit_id", auditId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("audit_status_history")
    .delete()
    .eq("audit_id", auditId);
  if (e2) throw e2;

  const { error: e3 } = await supabase.from("audits").delete().eq("id", auditId);
  if (e3) throw e3;
}
