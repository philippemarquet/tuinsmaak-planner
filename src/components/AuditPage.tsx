import { useEffect, useState, useMemo } from "react";
import { format, isAfter, isBefore, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import type {
  Garden,
  GardenBed,
  Seed,
  Planting,
  Task,
  GardenTask,
  Audit,
  AuditItem,
  AuditStatus,
} from "../lib/types";
import { supabase } from "../lib/supabaseClient";
import {
  listOpenAudits,
  listCompletedAudits,
  createAudit,
  listAuditItems,
  createAuditItems,
  validateAuditItem,
  updateAuditStatus,
  getAuditStatusHistory,
  deleteAudit,
} from "../lib/api/audits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import {
  ClipboardCheck,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Leaf,
  Sprout,
  History,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { toast } from "sonner";

interface AuditPageProps {
  garden: Garden;
  beds: GardenBed[];
  seeds: Seed[];
  plantings: Planting[];
  tasks: Task[];
  gardenTasks: GardenTask[];
  onDataChange: () => Promise<void>;
}

const STATUS_LABELS: Record<AuditStatus, string> = {
  open: "Open",
  onderhanden: "Onderhanden",
  afwachting: "In afwachting",
  goedgekeurd: "Goedgekeurd",
};

const STATUS_COLORS: Record<AuditStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  onderhanden: "bg-amber-100 text-amber-700",
  afwachting: "bg-orange-100 text-orange-700",
  goedgekeurd: "bg-green-100 text-green-700",
};

export function AuditPage({
  garden,
  beds,
  seeds,
  plantings,
  tasks,
  gardenTasks,
  onDataChange,
}: AuditPageProps) {
  const [activeTab, setActiveTab] = useState("new");
  const [openAudits, setOpenAudits] = useState<Audit[]>([]);
  const [completedAudits, setCompletedAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Selected audit state
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);

  // Notes modal state (for ❌ items)
  const [notesModal, setNotesModal] = useState<{ item: AuditItem; notes: string } | null>(null);

  const seedMap = useMemo(() => new Map(seeds.map((s) => [s.id, s])), [seeds]);
  const bedMap = useMemo(() => new Map(beds.map((b) => [b.id, b])), [beds]);

  // Load audits
  useEffect(() => {
    loadAudits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garden.id]);

  const loadAudits = async () => {
    try {
      const [open, completed] = await Promise.all([
        listOpenAudits(garden.id),
        listCompletedAudits(garden.id),
      ]);
      setOpenAudits(open);
      setCompletedAudits(completed);
    } catch (err) {
      console.error("Failed to load audits:", err);
    } finally {
      setLoading(false);
    }
  };

  // Generate audit items based on current garden state
  const generateAuditItems = (): Omit<AuditItem, "id" | "created_at">[] => {
    const now = new Date(); // avoid duplicate 'today'
    const items: Omit<AuditItem, "id" | "created_at">[] = [];

    // 1. Active plantings (groeiend or in oogst)
    plantings.forEach((p) => {
      const seed = seedMap.get(p.seed_id);
      const bed = bedMap.get(p.garden_bed_id);
      if (!seed || !bed) return;

      const groundDate = p.actual_ground_date || p.planned_date;
      const harvestStart = p.actual_harvest_start || p.planned_harvest_start;
      const harvestEnd = p.actual_harvest_end || p.planned_harvest_end;

      if (!groundDate) return;

      const ground = new Date(groundDate);
      const hStart = harvestStart ? new Date(harvestStart) : null;
      const hEnd = harvestEnd ? new Date(harvestEnd) : null;

      // Determine phase
      let phase: string | null = null;
      if (hEnd && isAfter(now, hEnd)) {
        return; // Past harvest, skip
      } else if (hStart && isAfter(now, hStart)) {
        phase = "in_oogst";
      } else if (isAfter(now, ground)) {
        phase = "groeiend";
      } else {
        return; // Not yet planted
      }

      const segmentInfo =
        p.start_segment != null && p.segments_used != null
          ? p.segments_used > 1
            ? `Segment ${p.start_segment + 1}-${p.start_segment + p.segments_used}`
            : `Segment ${p.start_segment + 1}`
          : null;

      items.push({
        audit_id: "",
        item_type: "planting",
        reference_id: p.id,
        bed_name: bed.name,
        segment_info: segmentInfo,
        description: `${seed.name} - ${phase === "in_oogst" ? "In oogst" : "Groeiend"}`,
        phase,
        is_validated: false,
        is_correct: null,
        notes: null,
        validated_at: null,
      });
    });

    // 2. Plantings in voorzaai phase
    plantings.forEach((p) => {
      if (p.method !== "presow") return;

      const seed = seedMap.get(p.seed_id);
      if (!seed) return;

      const presowDate = p.actual_presow_date || p.planned_presow_date;
      const groundDate = p.actual_ground_date || p.planned_date;

      if (!presowDate) return;

      const presow = new Date(presowDate);
      const ground = groundDate ? new Date(groundDate) : null;

      // If currently in presow phase (after presow, before ground, and not yet planted out)
      if (isAfter(now, presow) && ground && isBefore(now, ground) && !p.actual_ground_date) {
        items.push({
          audit_id: "",
          item_type: "voorzaai",
          reference_id: p.id,
          bed_name: null,
          segment_info: null,
          description: `${seed.name} - In voorzaai`,
          phase: "voorzaai",
          is_validated: false,
          is_correct: null,
          notes: null,
          validated_at: null,
        });
      }
    });

    // 3. Overdue moestuin tasks
    const pendingTasks = tasks.filter((t) => t.status === "pending");
    pendingTasks.forEach((t) => {
      const dueDate = new Date(t.due_date);
      if (isAfter(now, dueDate)) {
        const planting = plantings.find((p) => p.id === t.planting_id);
        const seed = planting ? seedMap.get(planting.seed_id) : null;
        const bed = planting ? bedMap.get(planting.garden_bed_id) : null;

        const typeLabels: Record<string, string> = {
          sow: "Zaaien",
          plant_out: "Uitplanten",
          harvest_start: "Start oogst",
          harvest_end: "Eind oogst",
        };

        items.push({
          audit_id: "",
          item_type: "moestuin_task",
          reference_id: t.id,
          bed_name: bed?.name || null,
          segment_info: null,
          description: `${typeLabels[t.type] || t.type}: ${seed?.name || "Onbekend"} (over datum)`,
          phase: "overdue",
          is_validated: false,
          is_correct: null,
          notes: null,
          validated_at: null,
        });
      }
    });

    // 4. Overdue garden tasks
    const currentWeek = getISOWeek(now);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    gardenTasks
      .filter((gt) => gt.status === "pending")
      .forEach((gt) => {
        let isOverdue = false;

        if (gt.due_year < currentYear) {
          isOverdue = true;
        } else if (gt.due_year === currentYear) {
          if (gt.due_month < currentMonth) {
            isOverdue = true;
          } else if (gt.due_month === currentMonth && gt.due_week != null && gt.due_week < currentWeek) {
            isOverdue = true;
          }
        }

        if (isOverdue) {
          items.push({
            audit_id: "",
            item_type: "garden_task",
            reference_id: gt.id,
            bed_name: null,
            segment_info: null,
            description: `${gt.title} (over datum)`,
            phase: "overdue",
            is_validated: false,
            is_correct: null,
            notes: null,
            validated_at: null,
          });
        }
      });

    return items;
  };

  // Request new audit
  const handleRequestAudit = async () => {
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      // Get user display name
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const audit = await createAudit(garden.id, user.id);

      // Generate and create items
      const itemsData = generateAuditItems().map((item) => ({
        ...item,
        audit_id: audit.id,
      }));

      if (itemsData.length > 0) {
        await createAuditItems(itemsData);
      }

      // Send email notification (best-effort)
      try {
        await supabase.functions.invoke("send-audit-notification", {
          body: {
            requesterName: profile?.display_name || user.email || "Onbekend",
            deadline: audit.deadline,
          },
        });
      } catch (emailError) {
        console.error("Failed to send audit email:", emailError);
      }

      toast.success("Audit aangevraagd!");
      await loadAudits();
    } catch (err: any) {
      console.error("Failed to create audit:", err);
      toast.error("Kon audit niet aanmaken");
    } finally {
      setCreating(false);
    }
  };

  // Open audit detail
  const handleOpenAudit = async (audit: Audit) => {
    setSelectedAudit(audit);
    try {
      const [items, history] = await Promise.all([listAuditItems(audit.id), getAuditStatusHistory(audit.id)]);
      setAuditItems(items);
      setStatusHistory(history);
    } catch (err) {
      console.error("Failed to load audit details:", err);
    }
  };

  // Validate / re-validate item
  const handleValidateItem = async (item: AuditItem, isCorrect: boolean) => {
    if (selectedAudit?.status === "goedgekeurd") return; // read-only when completed

    if (!isCorrect) {
      // Require notes via modal
      setNotesModal({ item, notes: item.notes || "" });
      return;
    }

    try {
      const updated = await validateAuditItem(item.id, true, null);
      setAuditItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      console.error("Failed to validate item:", err);
      toast.error("Kon item niet valideren");
    }
  };

  // Save notes and mark as incorrect (NOTES REQUIRED)
  const handleSaveNotes = async () => {
    if (!notesModal) return;

    const note = notesModal.notes?.trim() ?? "";
    if (!note) {
      toast.error("Opmerking is verplicht voor ❌.");
      return;
    }

    try {
      const updated = await validateAuditItem(notesModal.item.id, false, note);
      setAuditItems((prev) => prev.map((i) => (i.id === notesModal.item.id ? updated : i)));
      setNotesModal(null);
    } catch (err) {
      console.error("Failed to save notes:", err);
      toast.error("Kon notities niet opslaan");
    }
  };

  // Update audit status (Onderhanden/Afwachting/Goedgekeurd)
  const handleUpdateStatus = async (status: AuditStatus) => {
    if (!selectedAudit) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      await updateAuditStatus(selectedAudit.id, status, user.id);

      if (status === "goedgekeurd") {
        toast.success("Audit goedgekeurd!");
        setSelectedAudit(null);
        await loadAudits();
      } else {
        toast.success(`Status gewijzigd naar: ${STATUS_LABELS[status]}`);
        setSelectedAudit({ ...selectedAudit, status });
        await loadAudits();
      }
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Kon status niet wijzigen");
    }
  };

  // Delete audit
  const handleDeleteAudit = async (audit: Audit, fromDetail = false) => {
    const proceed = confirm("Weet je zeker dat je deze audit wilt verwijderen?");
    if (!proceed) return;

    try {
      await deleteAudit(audit.id);
      toast.success("Audit verwijderd.");
      if (fromDetail) {
        setSelectedAudit(null);
      }
      await loadAudits();
    } catch (err: any) {
      console.error("Failed to delete audit:", err);
      toast.error("Kon audit niet verwijderen");
    }
  };

  // Render audit list item (with trailing delete)
  const renderAuditListItem = (audit: Audit, showStatus = true) => {
    const deadline = new Date(audit.deadline);
    const isOverdue = isAfter(new Date(), deadline) && audit.status === "open";

    return (
      <div
        key={audit.id}
        className={cn(
          "w-full p-4 rounded-lg border transition-all hover:border-primary/50 flex items-center justify-between gap-3",
          isOverdue ? "bg-red-50 border-red-200" : "bg-card border-border"
        )}
        onClick={() => handleOpenAudit(audit)}
        role="button"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
              audit.status === "goedgekeurd" ? "bg-green-100" : isOverdue ? "bg-red-100" : "bg-blue-100"
            )}
          >
            {audit.status === "goedgekeurd" ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <ClipboardCheck className={cn("w-5 h-5", isOverdue ? "text-red-600" : "text-blue-600")} />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">
              Audit van {format(new Date(audit.requested_at), "d MMMM yyyy", { locale: nl })}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="w-3 h-3" />
              Deadline: {format(deadline, "d MMM yyyy", { locale: nl })}
              {isOverdue && <span className="text-red-600 font-medium">(verlopen)</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {showStatus && (
            <span className={cn("text-xs px-2 py-1 rounded-full", STATUS_COLORS[audit.status])}>
              {STATUS_LABELS[audit.status]}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />

          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteAudit(audit);
            }}
            className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Verwijderen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  // Render audit detail view
  const renderAuditDetail = () => {
    if (!selectedAudit) return null;

    const plantingItems = auditItems.filter((i) => i.item_type === "planting" || i.item_type === "voorzaai");
    const overdueMoestuin = auditItems.filter((i) => i.item_type === "moestuin_task");
    const overdueGarden = auditItems.filter((i) => i.item_type === "garden_task");

    const isCompleted = selectedAudit.status === "goedgekeurd";

    // Enable approval only if all items validated, and all ❌ have notes
    const allReadyForApproval =
      auditItems.length === 0
        ? true
        : auditItems.every(
            (i) =>
              i.is_validated &&
              (i.is_correct === true || (i.is_correct === false && !!(i.notes && i.notes.trim().length)))
          );

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedAudit(null)}>
              ← Terug
            </Button>
            <span className={cn("text-xs px-2 py-1 rounded-full", STATUS_COLORS[selectedAudit.status])}>
              {STATUS_LABELS[selectedAudit.status]}
            </span>
          </div>

          <button
            onClick={() => handleDeleteAudit(selectedAudit, true)}
            className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Audit verwijderen"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {/* Audit info */}
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm font-medium mb-2">
            Audit van {format(new Date(selectedAudit.requested_at), "d MMMM yyyy", { locale: nl })}
          </div>
          <div className="text-xs text-muted-foreground">
            Deadline: {format(new Date(selectedAudit.deadline), "d MMMM yyyy", { locale: nl })}
          </div>
        </div>

        {/* Plantings section (only if present) */}
        {plantingItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="w-4 h-4 text-green-600" />
              <h3 className="text-sm font-semibold">Plantingen & Voorzaai</h3>
            </div>
            <div className="space-y-2">
              {plantingItems.map((item) => renderAuditItemRow(item, isCompleted))}
            </div>
          </div>
        )}

        {/* Overdue moestuin tasks (always show section) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold">Over-datum moestuin taken</h3>
          </div>
          {overdueMoestuin.length > 0 ? (
            <div className="space-y-2">{overdueMoestuin.map((item) => renderAuditItemRow(item, isCompleted))}</div>
          ) : (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-3">
              Geen moestuin taken over datum.
            </div>
          )}
        </div>

        {/* Overdue garden tasks (always show section) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sprout className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Over-datum tuin taken</h3>
          </div>
          {overdueGarden.length > 0 ? (
            <div className="space-y-2">{overdueGarden.map((item) => renderAuditItemRow(item, isCompleted))}</div>
          ) : (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-3">Geen tuin taken over datum.</div>
          )}
        </div>

        {auditItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Geen items gevonden voor deze audit.
          </div>
        )}

        {/* Status history (only for completed audits) */}
        {isCompleted && statusHistory.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Status historie</h3>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {statusHistory.map((h, idx) => (
                <div key={h.id || idx} className="flex items-center gap-2">
                  <span>{format(new Date(h.changed_at), "d MMM yyyy HH:mm", { locale: nl })}</span>
                  <span>→</span>
                  <span className="font-medium">{STATUS_LABELS[h.new_status as AuditStatus]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions (for non-completed audits) */}
        {!isCompleted && (
          <div className="pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground mb-3">Audit afronden:</div>
            <div className="flex flex-wrap gap-2">
              {/* Always enabled per requirement */}
              <Button size="sm" variant="outline" onClick={() => handleUpdateStatus("onderhanden")}>
                Onderhanden
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleUpdateStatus("afwachting")}>
                In afwachting
              </Button>
              <Button
                size="sm"
                onClick={() => handleUpdateStatus("goedgekeurd")}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={!allReadyForApproval}
                title={
                  allReadyForApproval
                    ? "Audit goedkeuren"
                    : "Kies eerst voor alle regels ✅ of ❌ (met opmerking)."
                }
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Goedkeuren
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render individual audit item row
  const renderAuditItemRow = (item: AuditItem, readOnly: boolean) => {
    const phaseColors: Record<string, string> = {
      groeiend: "bg-green-100 text-green-700",
      in_oogst: "bg-amber-100 text-amber-700",
      voorzaai: "bg-blue-100 text-blue-700",
      overdue: "bg-red-100 text-red-700",
    };

    const isCorrect = item.is_validated && item.is_correct === true;
    const isIncorrect = item.is_validated && item.is_correct === false;

    return (
      <div
        key={item.id}
        className={cn(
          "p-3 rounded-lg border",
          item.is_validated
            ? item.is_correct
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
            : "bg-card border-border"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{item.description}</div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {item.bed_name && (
                <span className="text-xs text-muted-foreground">
                  {item.bed_name}
                  {item.segment_info && ` • ${item.segment_info}`}
                </span>
              )}
              {item.phase && (
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    phaseColors[item.phase] || "bg-gray-100"
                  )}
                >
                  {item.phase === "groeiend" && "Groeiend"}
                  {item.phase === "in_oogst" && "In oogst"}
                  {item.phase === "voorzaai" && "Voorzaai"}
                  {item.phase === "overdue" && "Over datum"}
                </span>
              )}
            </div>
            {item.notes && (
              <div className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <FileText className="w-3 h-3 inline mr-1" />
                {item.notes}
              </div>
            )}
          </div>

          {/* Action buttons — always available until approved */}
          {!readOnly && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleValidateItem(item, true)}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  isCorrect ? "bg-green-100" : "hover:bg-green-100"
                )}
                title="Klopt"
              >
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </button>
              <button
                onClick={() => handleValidateItem(item, false)}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  isIncorrect ? "bg-red-100" : "hover:bg-red-100"
                )}
                title={isIncorrect ? "Bewerk opmerking" : "Klopt niet (opmerking toevoegen)"}
              >
                <XCircle className="w-5 h-5 text-red-500" />
              </button>
            </div>
          )}

          {/* Read-only icon when completed */}
          {readOnly && (
            <div className="flex items-center">
              {item.is_correct ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If viewing audit detail
  if (selectedAudit) {
    const noteValid = (notesModal?.notes?.trim()?.length ?? 0) > 0;

    return (
      <div className="space-y-4">
        {renderAuditDetail()}

        {/* Notes modal (comment REQUIRED for ❌) */}
        <Dialog open={!!notesModal} onOpenChange={(open) => !open && setNotesModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Opmerking verplicht bij ❌</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-3">
                Wat klopt er niet bij: <strong>{notesModal?.item.description}</strong>?
              </p>
              <Textarea
                value={notesModal?.notes || ""}
                onChange={(e) =>
                  setNotesModal((prev) => (prev ? { ...prev, notes: e.target.value } : null))
                }
                placeholder="Beschrijf wat er niet klopt… (verplicht)"
                rows={4}
              />
              {!noteValid && (
                <div className="mt-2 text-xs text-red-600">Voeg een korte opmerking toe om ❌ te kunnen opslaan.</div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotesModal(null)}>
                Annuleren
              </Button>
              <Button onClick={handleSaveNotes} disabled={!noteValid} title={!noteValid ? "Opmerking is verplicht" : ""}>
                Opslaan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-2 h-10 p-1 bg-muted rounded-lg">
          <TabsTrigger
            value="new"
            className="rounded-md text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <ClipboardCheck className="w-4 h-4 mr-2" />
            Nieuwe Audit
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-md text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <History className="w-4 h-4 mr-2" />
            Audit historie
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4 mt-4">
          {/* Request new audit */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">Audit aanvragen</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Vraag een audit aan om de huidige stand van de moestuin te controleren. Er wordt een
              overzicht gemaakt van alle plantingen, voorzaai en openstaande taken.
            </p>
            <Button onClick={handleRequestAudit} disabled={creating} size="sm">
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Aanvragen...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Audit aanvragen
                </>
              )}
            </Button>
          </div>

          {/* Open audits */}
          {openAudits.length > 0 ? (
            <div className="space-y-2">{openAudits.map((audit) => renderAuditListItem(audit))}</div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Geen open audits. Vraag een nieuwe audit aan om te beginnen.
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          {completedAudits.length > 0 ? (
            <div className="space-y-2">
              {completedAudits.map((audit) => renderAuditListItem(audit, false))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Geen afgeronde audits gevonden.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AuditPage;
