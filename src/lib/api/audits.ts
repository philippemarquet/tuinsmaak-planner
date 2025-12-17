import { supabase } from "../supabaseClient";
import type { Audit, AuditItem, AuditStatus, AuditStatusHistory, UUID } from "../types";

/** Alle audits voor een tuin ophalen */
export async function listAudits(gardenId: UUID): Promise<Audit[]> {
  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .eq("garden_id", gardenId)
    .order("requested_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Audit[];
}

/** Open audits ophalen (status = 'open') */
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

/** Historische audits ophalen (status = 'goedgekeurd') */
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

/** Nieuwe audit aanmaken */
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

  // Initial status history entry
  await supabase.from("audit_status_history").insert({
    audit_id: data.id,
    old_status: null,
    new_status: "open",
    changed_by: requestedBy,
  });

  return data as Audit;
}

/** Audit items ophalen */
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
export async function createAuditItems(items: Omit<AuditItem, "id" | "created_at">[]): Promise<AuditItem[]> {
  const { data, error } = await supabase
    .from("audit_items")
    .insert(items)
    .select("*");

  if (error) throw error;
  return (data ?? []) as AuditItem[];
}

/** Audit item valideren */
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
      notes: notes || null,
      validated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .select("*")
    .single();

  if (error) throw error;
  return data as AuditItem;
}

/** Audit status updaten */
export async function updateAuditStatus(
  auditId: UUID,
  newStatus: AuditStatus,
  changedBy: UUID
): Promise<Audit> {
  // Get current status for history
  const { data: current } = await supabase
    .from("audits")
    .select("status")
    .eq("id", auditId)
    .single();

  const oldStatus = current?.status as AuditStatus | null;

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

  // Add status history entry
  await supabase.from("audit_status_history").insert({
    audit_id: auditId,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: changedBy,
  });

  return data as Audit;
}

/** Audit status history ophalen */
export async function getAuditStatusHistory(auditId: UUID): Promise<AuditStatusHistory[]> {
  const { data, error } = await supabase
    .from("audit_status_history")
    .select("*")
    .eq("audit_id", auditId)
    .order("changed_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AuditStatusHistory[];
}

/** Audit verwijderen */
export async function deleteAudit(auditId: UUID): Promise<void> {
  const { error } = await supabase.from("audits").delete().eq("id", auditId);
  if (error) throw error;
}
