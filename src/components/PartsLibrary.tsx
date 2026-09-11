"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CustomPartFilePreview } from "@/components/CustomPartFilePreview";
import { CUSTOM_PART_MATERIALS } from "@/constants/custom-part-materials";
import { CUSTOM_PART_PROCESSES, CUSTOM_PART_PROCESS_LABELS, type CustomPartProcess } from "@/constants/custom-part-processes";
import type { CustomPartOrderLineChoice, PartLibraryGroup, PartLibraryItem } from "@/types/custom-part";

const STANDARD_COLORS = ["Black", "Yellow", "No Color"] as const;
type OrderChoice = { order: string; customer: string };
type LibraryViewMode = "cards" | "list";
type GroupPropagation = {
  available: boolean;
  assignmentsUpdated: number;
  partsCreated: number;
  skippedClosedAssignments: number;
  errors: string[];
};

function propagationMessage(propagation?: GroupPropagation | null) {
  if (!propagation) return "";
  if (!propagation.available) return " Automatic updates to prior group assignments are awaiting the tracking migration.";
  const updates = propagation.assignmentsUpdated
    ? ` Added ${propagation.partsCreated} custom part${propagation.partsCreated === 1 ? "" : "s"} across ${propagation.assignmentsUpdated} prior group assignment${propagation.assignmentsUpdated === 1 ? "" : "s"}.`
    : "";
  const warning = propagation.errors.length
    ? ` ${propagation.errors.length} assignment update${propagation.errors.length === 1 ? "" : "s"} could not be completed.`
    : "";
  return `${updates}${warning}`;
}

export function PartsLibrary({ signedIn }: { signedIn: boolean }) {
  const [parts, setParts] = useState<PartLibraryItem[]>([]);
  const [groups, setGroups] = useState<PartLibraryGroup[]>([]);
  const [orders, setOrders] = useState<OrderChoice[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(signedIn);
  const [available, setAvailable] = useState(true);
  const [groupsAvailable, setGroupsAvailable] = useState(true);
  const [canEdit, setCanEdit] = useState(true);
  const [groupSyncAvailable, setGroupSyncAvailable] = useState(true);
  const [groupFilesAvailable, setGroupFilesAvailable] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState<{ groupId?: number } | null>(null);
  const [editingPart, setEditingPart] = useState<PartLibraryItem | null>(null);
  const [viewMode, setViewMode] = useState<LibraryViewMode>("list");
  const [assigning, setAssigning] = useState<PartLibraryItem | null>(null);
  const [editingGroup, setEditingGroup] = useState<"new" | PartLibraryGroup | null>(null);
  const [assigningGroup, setAssigningGroup] = useState<PartLibraryGroup | null>(null);
  const [viewingGroup, setViewingGroup] = useState<PartLibraryGroup | null>(null);
  const workflowRef = useRef<HTMLDivElement>(null);

  const loadParts = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/custom-parts/library", { cache: "no-store" });
      const result = await response.json() as { parts?: PartLibraryItem[]; groups?: PartLibraryGroup[]; available?: boolean; groupsAvailable?: boolean; canEdit?: boolean; groupSyncAvailable?: boolean; groupFilesAvailable?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to load the Parts Library.");
      setParts(result.parts || []);
      setGroups(result.groups || []);
      setAvailable(result.available !== false);
      setGroupsAvailable(result.groupsAvailable !== false);
      setCanEdit(result.canEdit !== false);
      setGroupSyncAvailable(result.groupSyncAvailable !== false);
      setGroupFilesAvailable(result.groupFilesAvailable !== false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the Parts Library.");
    } finally { setLoading(false); }
  }, [signedIn]);

  useEffect(() => { void loadParts(); }, [loadParts]);
  useEffect(() => {
    const savedView = window.localStorage.getItem("amgs-parts-library-view");
    if (savedView === "cards" || savedView === "list") setViewMode(savedView);
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/shop-floor-orders", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { orders?: OrderChoice[] };
        if (response.ok) setOrders(result.orders || []);
      }).catch(() => {});
  }, [signedIn]);
  useEffect(() => {
    if (!assigning && !assigningGroup) return;
    const frame = window.requestAnimationFrame(() => workflowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [assigning, assigningGroup]);
  useEffect(() => {
    if (!editingPart) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("parts-library-edit-workflow")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [editingPart]);

  function chooseView(nextView: LibraryViewMode) {
    setViewMode(nextView);
    window.localStorage.setItem("amgs-parts-library-view", nextView);
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return parts.filter((part) => !query || [part.partName, part.description, part.material, part.color]
      .some((value) => value.toLowerCase().includes(query)));
  }, [parts, search]);
  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups.filter((group) => !query || [group.groupName, group.description,
      ...group.members.map((member) => parts.find((part) => part.libraryPartId === member.libraryPartId)?.partName || "")]
      .some((value) => value.toLowerCase().includes(query)));
  }, [groups, parts, search]);

  function openPartAssignment(part: PartLibraryItem) {
    setAssigningGroup(null);
    setAssigning(part);
  }

  function openGroupAssignment(group: PartLibraryGroup) {
    setAssigning(null);
    setViewingGroup(null);
    setAssigningGroup(group);
  }

  if (!signedIn) {
    return <div className="card parts-library-signin"><h2>Sign in to use the Parts Library</h2><p>Library drawings are available to signed-in users and can be assigned directly to active orders.</p><Link className="primary-button link-as-button" href="/login">Sign in</Link></div>;
  }
  if (!available) {
    return <div className="card"><h2>Parts Library setup required</h2><p>Run <code>sql/create_tblcustompartlibrary.sql</code> against the production database, then refresh this page.</p></div>;
  }

  return (
    <div className="parts-library">
      <div className="parts-library-toolbar">
        <label className="parts-library-search"><span>Search library</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, description, material, or color" /></label>
        <div className="parts-library-toolbar-controls">
          <div className="custom-part-view-toggle" role="group" aria-label="Parts Library display">
            <button className={viewMode === "cards" ? "active" : ""} type="button" aria-pressed={viewMode === "cards"} onClick={() => chooseView("cards")}>Cards</button>
            <button className={viewMode === "list" ? "active" : ""} type="button" aria-pressed={viewMode === "list"} onClick={() => chooseView("list")}>List</button>
          </div>
          <div className="parts-library-toolbar-actions"><button className="secondary-button parts-library-action-button" type="button" disabled={!groupsAvailable} onClick={() => setEditingGroup("new")}>Create group</button><button className="primary-button parts-library-action-button" type="button" onClick={() => setAdding({})}>Add library part</button></div>
        </div>
      </div>
      {message && <p className="success-message">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!groupsAvailable && <p className="notice">Library groups require the one-time database migration before they can be created.</p>}
      {!canEdit && <p className="notice">Editing saved library parts requires the one-time database permission grant.</p>}
      {!groupSyncAvailable && groupsAvailable && <p className="notice">Automatic updates to prior group assignments require the one-time group assignment tracking migration.</p>}
      {!groupFilesAvailable && groupsAvailable && <p className="notice">PDF drawings on groups require the one-time group drawing migration.</p>}
      {adding && <AddLibraryPart groups={groups} initialGroupId={adding.groupId} onCancel={() => setAdding(null)} onSaved={(text) => { setAdding(null); setMessage(text); void loadParts(); }} />}
      {editingPart && <div id="parts-library-edit-workflow" className="parts-library-active-workflow"><AddLibraryPart groups={groups} part={editingPart} onCancel={() => setEditingPart(null)} onSaved={(text) => { setEditingPart(null); setMessage(text); void loadParts(); }} /></div>}
      {(assigning || assigningGroup) && <div className="parts-library-active-workflow" ref={workflowRef}>
        {assigning && <AssignLibraryPart part={assigning} orders={orders} onCancel={() => setAssigning(null)} onAssigned={(partNumber) => { setAssigning(null); setMessage(`${partNumber} was created with the library drawings.`); }} />}
        {assigningGroup && <AssignLibraryGroup group={assigningGroup} parts={parts} orders={orders} onCancel={() => setAssigningGroup(null)} onAssigned={(count) => { setAssigningGroup(null); setMessage(`${count} custom parts were created from ${assigningGroup.groupName}.`); }} />}
      </div>}
      {editingGroup && <LibraryGroupEditor group={editingGroup === "new" ? null : editingGroup} parts={parts} onCancel={() => setEditingGroup(null)} onSaved={(text) => { setEditingGroup(null); setMessage(text); void loadParts(); }} />}
      {viewingGroup && <LibraryGroupDetail group={viewingGroup} parts={parts} filesAvailable={groupFilesAvailable} onClose={() => setViewingGroup(null)} onAssign={() => openGroupAssignment(viewingGroup)} onEdit={() => { setEditingGroup(viewingGroup); setViewingGroup(null); }} onCreatePart={() => { setAdding({ groupId: viewingGroup.libraryGroupId }); setViewingGroup(null); }} onChanged={(text) => { setViewingGroup(null); setMessage(text); void loadParts(); }} />}
      {loading && <p>Loading library parts…</p>}
      {!loading && !visible.length && <div className="card empty-state"><h2>{parts.length ? "No matching parts" : "The Parts Library is empty"}</h2><p>{parts.length ? "Try a broader search." : "Add the first reusable part, or select “Save this part to the Parts Library” when creating a custom part."}</p></div>}
      {visibleGroups.length > 0 && <section className="library-groups-section">
        <div><h2>Part groups</h2><p>Assign a complete set of related parts to an order in one step.</p></div>
        {viewMode === "cards" ? <div className="library-groups-grid">{visibleGroups.map((group) => <article className="card library-group-card" key={group.libraryGroupId}>
          <header><div><h3>{group.groupName}</h3><p>{group.description || "Reusable part set"}</p></div></header>
          <p className="library-group-counts">{group.members.length} part{group.members.length === 1 ? "" : "s"} · {group.files.length} group PDF{group.files.length === 1 ? "" : "s"}</p>
          <div className="library-group-actions">
            <button className="secondary-button" type="button" onClick={() => setViewingGroup(group)}>View details</button>
            <button className="primary-button" type="button" disabled={!group.members.length} onClick={() => openGroupAssignment(group)}>Assign group</button>
          </div>
        </article>)}</div> : <div className="library-group-list">
          <div className="library-group-list-heading" aria-hidden="true"><span>Group</span><span>Description</span><span>Contents</span><span>Actions</span></div>
          {visibleGroups.map((group) => <div className="library-group-list-row" key={group.libraryGroupId}>
            <strong>{group.groupName}</strong><span>{group.description || "Reusable part set"}</span>
            <span>{group.members.length} part{group.members.length === 1 ? "" : "s"}<small>{group.files.length} group PDF{group.files.length === 1 ? "" : "s"}</small></span>
            <div className="library-part-list-actions"><button className="secondary-button" type="button" onClick={() => setViewingGroup(group)}>View</button><button className="primary-button" type="button" disabled={!group.members.length} onClick={() => openGroupAssignment(group)}>Assign</button></div>
          </div>)}
        </div>}
      </section>}
      {viewMode === "cards" && <div className="parts-library-grid">
        {visible.map((part) => (
          <article className="card library-part-card" key={part.libraryPartId}>
            <header><div><h2>{part.partName}</h2><p>{part.description}</p></div><div className="library-part-card-actions"><button className="primary-button" type="button" onClick={() => openPartAssignment(part)}>Assign to order</button><button className="secondary-button" type="button" disabled={!canEdit} title={canEdit ? "Edit this library part" : "Database permission grant required"} onClick={() => setEditingPart(part)}>Edit</button></div></header>
            <dl><div><dt>Material</dt><dd>{part.material}</dd></div><div><dt>Color</dt><dd>{part.color}</dd></div><div><dt>Files</dt><dd>{part.files.filter((file) => file.name !== "part-details.txt").length}</dd></div></dl>
            {part.files.length > 0 && <ul className="direct-custom-files">{part.files.filter((file) => file.name !== "part-details.txt").map((file) => <li key={file.id}><CustomPartFilePreview file={file} /></li>)}</ul>}
            <footer><a href={part.folderUrl} target="_blank" rel="noreferrer">Open Drive folder</a><span>Added {new Date(part.createdAt).toLocaleDateString()}</span></footer>
          </article>
        ))}
      </div>}
      {viewMode === "list" && visible.length > 0 && <div className="library-part-list">
        <div className="library-part-list-heading" aria-hidden="true"><span>Part</span><span>Description</span><span>Material / Color</span><span>Files</span><span>Added</span><span>Actions</span></div>
        {visible.map((part) => <div className="library-part-list-row" key={part.libraryPartId}>
          <strong>{part.partName}</strong>
          <span>{part.description}</span>
          <span><b>{part.material}</b><small>{part.color}</small></span>
          <span>{part.files.filter((file) => file.name !== "part-details.txt").length}<small><a href={part.folderUrl} target="_blank" rel="noreferrer">Open folder</a></small></span>
          <span>{new Date(part.createdAt).toLocaleDateString()}</span>
          <div className="library-part-list-actions"><button className="primary-button" type="button" onClick={() => openPartAssignment(part)}>Assign</button><button className="secondary-button" type="button" disabled={!canEdit} title={canEdit ? "Edit this library part" : "Database permission grant required"} onClick={() => setEditingPart(part)}>Edit</button></div>
        </div>)}
      </div>}
    </div>
  );
}

function AddLibraryPart({ groups, initialGroupId, part, onCancel, onSaved }: { groups: PartLibraryGroup[]; initialGroupId?: number; part?: PartLibraryItem; onCancel: () => void; onSaved: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customColor, setCustomColor] = useState(Boolean(part?.hasCustomColor));
  const [requiredProcesses, setRequiredProcesses] = useState<CustomPartProcess[]>(part?.requiredProcesses || []);
  const initialGroup = groups.find((group) => group.libraryGroupId === initialGroupId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const data = new FormData(event.currentTarget);
      requiredProcesses.forEach((process) => data.append("requiredProcesses", process));
      const response = await fetch("/api/custom-parts/library", { method: part ? "PATCH" : "POST", body: data });
      const result = await response.json() as {
        error?: string;
        libraryPartId?: number;
        drawingsChanged?: boolean;
        assignedCopyCount?: number;
        propagation?: GroupPropagation | null;
      };
      if (!response.ok) throw new Error(result.error || "Unable to save the library part.");
      if (part && result.drawingsChanged && result.assignedCopyCount) {
        const shouldUpdate = window.confirm(
          `This part has ${result.assignedCopyCount} active assigned ${result.assignedCopyCount === 1 ? "copy" : "copies"}. Update those copies with the revised drawing files now?`,
        );
        if (!shouldUpdate) {
          onSaved("Library part updated. Existing assigned copies were left unchanged.");
          return;
        }
        const syncResponse = await fetch("/api/custom-parts/library/sync-assigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ libraryPartId: part.libraryPartId }),
        });
        const syncResult = await syncResponse.json() as { updatedCopies?: number; errors?: string[]; error?: string };
        if (!syncResponse.ok) throw new Error(syncResult.error || "The library part was saved, but assigned copies could not be updated.");
        const updated = syncResult.updatedCopies || 0;
        const warning = syncResult.errors?.length
          ? ` ${syncResult.errors.length} assigned ${syncResult.errors.length === 1 ? "copy" : "copies"} could not be updated.`
          : "";
        onSaved(`Library part updated. Revised drawings were copied to ${updated} active assigned ${updated === 1 ? "copy" : "copies"}.${warning}`);
        return;
      }
      onSaved(part ? "Library part updated." : `Part saved to the library.${propagationMessage(result.propagation)}`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save the library part."); }
    finally { setSaving(false); }
  }
  return <form className="card form-card library-part-form" onSubmit={submit}>
    <div className="copy-order-heading"><div><h2>{part ? `Edit ${part.partName}` : initialGroup ? `Add a part to ${initialGroup.groupName}` : "Add a library part"}</h2><p>{part ? "Update the reusable specifications and manage its saved drawing files." : "Save prepared drawings and specifications without tying them to an order."}</p></div><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div>
    {part && <input name="libraryPartId" type="hidden" value={part.libraryPartId} />}
    <label>Library part name<input name="partName" required defaultValue={part?.partName || ""} placeholder="A recognizable reusable name" /></label>
    <label>Description<textarea name="description" required rows={3} defaultValue={part?.description || ""} /></label>
    <label>Material<select name="material" required defaultValue={part?.material || ""}><option value="">Select material</option>{CUSTOM_PART_MATERIALS.map((item) => <option key={item}>{item}</option>)}</select></label>
    <fieldset className="custom-part-process-picker"><legend>Required processes <span className="field-optional">(optional)</span></legend><p className="hint field-hint">With none selected, assigned copies use one Complete checkbox.</p><div>{CUSTOM_PART_PROCESSES.map((process) => <label key={process}><input type="checkbox" checked={requiredProcesses.includes(process)} onChange={(event) => setRequiredProcesses((current) => event.target.checked ? [...current, process] : current.filter((value) => value !== process))} /><span>{CUSTOM_PART_PROCESS_LABELS[process]}</span></label>)}</div></fieldset>
    <label className="checkbox-label"><input name="hasCustomColor" type="checkbox" value="true" checked={customColor} onChange={(event) => setCustomColor(event.target.checked)} />Custom color</label>
    {customColor ? <label>Custom color<input name="customColor" required defaultValue={part?.hasCustomColor ? part.color : ""} placeholder="e.g. RAL 5015" /></label> : <label>Standard color<select name="standardColor" required defaultValue={part && !part.hasCustomColor ? part.color : ""}><option value="">Select color</option>{STANDARD_COLORS.map((color) => <option key={color}>{color}</option>)}</select></label>}
    {part && <fieldset className="library-existing-files"><legend>Saved drawings</legend>{part.files.length ? part.files.map((file) => <div key={file.id}><CustomPartFilePreview file={file} /><label><input name="removeFileIds" type="checkbox" value={file.id} /> Remove</label></div>) : <p>No saved drawings found.</p>}</fieldset>}
    <label>{part ? "Add drawing files (optional)" : "Drawing files"}<input name="drawings" type="file" multiple required={!part} /></label>
    {!part && groups.length > 0 && <div className="library-new-part-group-fields"><label>Add to group <span className="field-optional">(optional)</span><select name="libraryGroupId" defaultValue={initialGroupId ? String(initialGroupId) : ""}><option value="">No group</option>{groups.map((group) => <option value={group.libraryGroupId} key={group.libraryGroupId}>{group.groupName}</option>)}</select></label><label>Qty per set<input name="qtyPerSet" type="number" min={1} step={1} defaultValue={1} /></label></div>}
    {error && <p className="error">{error}</p>}
    <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : part ? "Save library part" : "Save to Parts Library"}</button>
  </form>;
}

function LibraryGroupEditor({ group, parts, onCancel, onSaved }: { group: PartLibraryGroup | null; parts: PartLibraryItem[]; onCancel: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(group?.groupName || "");
  const [description, setDescription] = useState(group?.description || "");
  const [members, setMembers] = useState<Record<number, number>>(() => Object.fromEntries((group?.members || []).map((member) => [member.libraryPartId, member.qtyPerSet])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/custom-parts/library/groups", { method: group ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ libraryGroupId: group?.libraryGroupId, groupName: name, description, members: Object.entries(members).map(([libraryPartId, qtyPerSet]) => ({ libraryPartId: Number(libraryPartId), qtyPerSet })) }) });
      const result = await response.json() as { error?: string; propagation?: GroupPropagation | null };
      if (!response.ok) throw new Error(result.error || "Unable to save this group.");
      onSaved(group ? `${name} was updated.${propagationMessage(result.propagation)}` : `${name} was created.`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save this group."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!group || !window.confirm(`Delete ${group.groupName}? The library parts themselves will be kept.`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/custom-parts/library/groups", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ libraryGroupId: group.libraryGroupId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete this group.");
      onSaved(`${group.groupName} was deleted.`);
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to delete this group."); setSaving(false); }
  }
  return <section className="card library-group-editor"><div className="copy-order-heading"><div><h2>{group ? `Edit ${group.groupName}` : "Create a part group"}</h2><p>{group ? "Choose existing parts and set the quantity needed for one complete set." : "Name the group now; parts can be selected here or created directly inside it afterward."}</p></div><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div><label>Group name<input value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Description<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{parts.length > 0 ? <div className="library-group-member-list">{parts.map((part) => <label className={members[part.libraryPartId] ? "selected" : ""} key={part.libraryPartId}><input type="checkbox" checked={Boolean(members[part.libraryPartId])} onChange={(event) => setMembers((current) => { const next = { ...current }; if (event.target.checked) next[part.libraryPartId] = 1; else delete next[part.libraryPartId]; return next; })} /><span><strong>{part.partName}</strong><small>{part.material} · {part.color}</small></span><input aria-label={`Quantity of ${part.partName} per set`} type="number" min={1} step={1} disabled={!members[part.libraryPartId]} value={members[part.libraryPartId] || 1} onChange={(event) => setMembers((current) => ({ ...current, [part.libraryPartId]: Math.max(1, Number(event.target.value) || 1) }))} /></label>)}</div> : <p className="library-group-empty">There are no existing library parts yet. Save this empty group, then use “Create new part” on its card.</p>}{error && <p className="error">{error}</p>}<div className="action-row"><button className="primary-button" type="button" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save group"}</button>{group && <button className="custom-part-delete-button" type="button" disabled={saving} onClick={() => void remove()}>Delete group</button>}</div></section>;
}

function LibraryGroupDetail({ group, parts, filesAvailable, onClose, onAssign, onEdit, onCreatePart, onChanged }: {
  group: PartLibraryGroup; parts: PartLibraryItem[]; filesAvailable: boolean; onClose: () => void;
  onAssign: () => void; onEdit: () => void; onCreatePart: () => void; onChanged: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const data = new FormData(event.currentTarget);
      data.set("libraryGroupId", String(group.libraryGroupId));
      const response = await fetch("/api/custom-parts/library/groups/files", { method: "POST", body: data });
      const result = await response.json() as { uploadedCount?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to upload group PDFs.");
      onChanged(`${result.uploadedCount || 0} PDF drawing${result.uploadedCount === 1 ? "" : "s"} added to ${group.groupName}.`);
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Unable to upload group PDFs."); }
    finally { setSaving(false); }
  }
  async function removeFile(fileId: string, fileName: string) {
    if (!window.confirm(`Remove ${fileName} from ${group.groupName}?`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/custom-parts/library/groups/files", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryGroupId: group.libraryGroupId, fileId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to remove the group PDF.");
      onChanged(`${fileName} was removed from ${group.groupName}.`);
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Unable to remove the group PDF."); setSaving(false); }
  }
  return <div className="parts-library-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="parts-library-dialog" role="dialog" aria-modal="true" aria-labelledby="library-group-detail-title">
      <div className="copy-order-heading"><div><h2 id="library-group-detail-title">{group.groupName}</h2><p>{group.description || "Reusable part set"}</p></div><button className="secondary-button" type="button" onClick={onClose}>Close</button></div>
      <div className="library-group-detail-actions"><button className="primary-button" type="button" disabled={!group.members.length} onClick={onAssign}>Assign group</button><button className="secondary-button" type="button" onClick={onEdit}>Edit members</button><button className="secondary-button" type="button" onClick={onCreatePart}>Create new part</button></div>
      <section><h3>Parts in this group</h3>{group.members.length ? <div className="library-group-detail-members">{group.members.map((member) => {
        const part = parts.find((item) => item.libraryPartId === member.libraryPartId);
        return <article key={member.libraryPartId}><div><strong>{part?.partName || "Missing library part"}</strong><span>{member.qtyPerSet} per set</span></div><p>{part?.description}</p><small>{part ? `${part.material} · ${part.color}` : ""}</small>{part?.files.filter((file) => file.name !== "part-details.txt").length ? <ul className="direct-custom-files">{part.files.filter((file) => file.name !== "part-details.txt").map((file) => <li key={file.id}><CustomPartFilePreview file={file} /></li>)}</ul> : <p className="hint">No part drawings found.</p>}</article>;
      })}</div> : <p className="library-group-empty">This group does not have any parts yet.</p>}</section>
      <section><h3>Group PDF drawings</h3><p className="hint">These PDFs belong to the group and are copied with every generated member—no separate custom part is created.</p>
        {group.files.length ? <ul className="library-group-files">{group.files.map((file) => <li key={file.id}><CustomPartFilePreview file={file} /><button className="custom-part-delete-button" type="button" disabled={saving} onClick={() => void removeFile(file.id, file.name)}>Remove</button></li>)}</ul> : <p className="library-group-empty">No group-level PDF drawings yet.</p>}
        <form className="library-group-file-upload" onSubmit={upload}><label>Add PDF drawings<input name="drawings" type="file" accept="application/pdf,.pdf" multiple required disabled={!filesAvailable || saving} /></label><button className="secondary-button" type="submit" disabled={!filesAvailable || saving}>{saving ? "Uploading…" : "Upload PDFs"}</button></form>
        {!filesAvailable && <p className="notice">Run the group drawing migration to enable uploads.</p>}{error && <p className="error">{error}</p>}
      </section>
    </section>
  </div>;
}

function ActiveOrderPicker({ orders, value, onChange }: { orders: OrderChoice[]; value: string; onChange: (order: string) => void }) {
  const [query, setQuery] = useState("");
  const sortedOrders = useMemo(() => [...orders].sort((left, right) => left.order.localeCompare(right.order, undefined, { numeric: true })), [orders]);
  const filteredOrders = useMemo(() => {
    const search = query.trim().toLowerCase();
    return sortedOrders.filter((order) => !search || order.order.toLowerCase().includes(search) || order.customer.toLowerCase().includes(search));
  }, [query, sortedOrders]);
  return <div className="library-order-picker"><label>Search active orders<input type="search" value={query} placeholder="Order # or customer" onChange={(event) => { setQuery(event.target.value); onChange(""); }} /></label><label>Active order<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Choose order ({filteredOrders.length})</option>{filteredOrders.map((order) => <option value={order.order} key={order.order}>#{order.order} · {order.customer}</option>)}</select></label></div>;
}

function AssignLibraryPart({ part, orders, onCancel, onAssigned }: { part: PartLibraryItem; orders: OrderChoice[]; onCancel: () => void; onAssigned: (partNumber: string) => void }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<CustomPartOrderLineChoice[]>([]);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setLineIds([]);
    if (!orderNumber) { setLines([]); return; }
    const controller = new AbortController();
    fetch(`/api/custom-parts/order-lines?order=${encodeURIComponent(orderNumber)}`, { signal: controller.signal })
      .then(async (response) => { const result = await response.json() as { lines?: CustomPartOrderLineChoice[] }; if (response.ok) setLines(result.lines || []); }).catch(() => {});
    return () => controller.abort();
  }, [orderNumber]);
  async function assign() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/custom-parts/library/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ libraryPartId: part.libraryPartId, orderNumber, qtyNeeded: Number(qty), mappedOrderLineIds: lineIds }) });
      const result = await response.json() as { partNumber?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to assign this part.");
      onAssigned(result.partNumber || "Custom part");
    } catch (assignError) { setError(assignError instanceof Error ? assignError.message : "Unable to assign this part."); }
    finally { setSaving(false); }
  }
  return <section className="card library-assign-card">
    <div className="copy-order-heading"><div><h2>Assign {part.partName}</h2><p>Its saved details and drawings will be copied into a new custom part.</p></div><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div>
    <div className="copy-order-selectors"><ActiveOrderPicker orders={orders} value={orderNumber} onChange={setOrderNumber} /><span aria-hidden="true">→</span><label>Qty needed<input type="number" min={1} step={1} value={qty} onChange={(event) => setQty(event.target.value)} /></label></div>
    {orderNumber && <fieldset className="custom-part-line-picker"><legend>Related order lines <span className="field-optional">(optional)</span></legend>{lines.length ? lines.map((line) => <label key={line.rowId}><input type="checkbox" checked={lineIds.includes(line.rowId)} onChange={(event) => setLineIds((current) => event.target.checked ? [...current, line.rowId] : current.filter((id) => id !== line.rowId))} /><span>{line.lineNumber ? `Line ${line.lineNumber} · ` : ""}<strong>{line.partNumber}</strong>{line.description ? ` · ${line.description}` : ""}</span></label>) : <p className="hint">No order lines found.</p>}</fieldset>}
    {error && <p className="error">{error}</p>}
    <button className="primary-button" type="button" disabled={saving || !orderNumber || Number(qty) < 1} onClick={() => void assign()}>{saving ? "Copying drawings…" : "Create custom part on order"}</button>
  </section>;
}

function AssignLibraryGroup({ group, parts, orders, onCancel, onAssigned }: { group: PartLibraryGroup; parts: PartLibraryItem[]; orders: OrderChoice[]; onCancel: () => void; onAssigned: (count: number) => void }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [setQuantity, setSetQuantity] = useState("1");
  const [lines, setLines] = useState<CustomPartOrderLineChoice[]>([]);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setLineIds([]);
    if (!orderNumber) { setLines([]); return; }
    const controller = new AbortController();
    fetch(`/api/custom-parts/order-lines?order=${encodeURIComponent(orderNumber)}`, { signal: controller.signal })
      .then(async (response) => { const result = await response.json() as { lines?: CustomPartOrderLineChoice[] }; if (response.ok) setLines(result.lines || []); }).catch(() => {});
    return () => controller.abort();
  }, [orderNumber]);
  async function assign() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/custom-parts/library/groups/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ libraryGroupId: group.libraryGroupId, orderNumber, setQuantity: Number(setQuantity), mappedOrderLineIds: lineIds }) });
      const result = await response.json() as { createdParts?: { partNumber: string }[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to assign this group.");
      onAssigned(result.createdParts?.length || group.members.length);
    } catch (assignError) { setError(assignError instanceof Error ? assignError.message : "Unable to assign this group."); }
    finally { setSaving(false); }
  }
  return <section className="card library-assign-card"><div className="copy-order-heading"><div><h2>Assign group: {group.groupName}</h2><p>Every member becomes its own custom part and is linked to the selected order lines. Group PDFs are copied into each generated part.</p></div><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div><ul className="library-group-assignment-summary">{group.members.map((member) => <li key={member.libraryPartId}><span>{parts.find((part) => part.libraryPartId === member.libraryPartId)?.partName || "Missing part"}</span><strong>{member.qtyPerSet} per set</strong></li>)}</ul><div className="copy-order-selectors"><ActiveOrderPicker orders={orders} value={orderNumber} onChange={setOrderNumber} /><span aria-hidden="true">→</span><label>Number of sets<input type="number" min={1} step={1} value={setQuantity} onChange={(event) => setSetQuantity(event.target.value)} /></label></div>{orderNumber && <fieldset className="custom-part-line-picker"><legend>Related order lines <span className="field-optional">(optional)</span></legend>{lines.length ? lines.map((line) => <label key={line.rowId}><input type="checkbox" checked={lineIds.includes(line.rowId)} onChange={(event) => setLineIds((current) => event.target.checked ? [...current, line.rowId] : current.filter((id) => id !== line.rowId))} /><span>{line.lineNumber ? `Line ${line.lineNumber} · ` : ""}<strong>{line.partNumber}</strong>{line.description ? ` · ${line.description}` : ""}</span></label>) : <p className="hint">No order lines found.</p>}</fieldset>}{error && <p className="error">{error}</p>}<button className="primary-button" type="button" disabled={saving || !orderNumber || Number(setQuantity) < 1} onClick={() => void assign()}>{saving ? "Creating group parts…" : `Create ${group.members.length} custom parts`}</button></section>;
}
