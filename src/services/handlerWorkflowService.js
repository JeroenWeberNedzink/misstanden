import { supabase } from '../lib/supabase';

export const handlerWorkflowService = {
  async getHandlerWorkflowIds(handlerId) {
    if (!handlerId) {
      throw new Error('handlerId is required');
    }

    const { data, error } = await supabase
      .from('handler_workflows')
      .select('workflow_id')
      .eq('handler_id', handlerId);

    if (error) {
      console.error('[handlerWorkflowService] Failed to fetch handler workflows:', error);
      throw error;
    }
    return (data || []).map(r => r.workflow_id);
  },

  // Replace all assignments in one go: delete removed, insert added
  async setHandlerWorkflows(handlerId, workflowIds) {
    if (!handlerId) {
      throw new Error('handlerId is required');
    }

    const safeIds = Array.isArray(workflowIds) ? workflowIds.filter(Boolean) : [];

    // Load current assignments
    const { data: currentRows, error: fetchErr } = await supabase
      .from('handler_workflows')
      .select('id, workflow_id')
      .eq('handler_id', handlerId);

    if (fetchErr) {
      console.error('[handlerWorkflowService] Failed to fetch current workflows:', fetchErr);
      throw fetchErr;
    }

    const currentIds = new Set((currentRows || []).map(r => r.workflow_id));
    const nextIds = new Set(safeIds);

    const toDelete = (currentRows || [])
      .filter(r => !nextIds.has(r.workflow_id))
      .map(r => r.id);

    const toInsert = safeIds
      .filter(id => !currentIds.has(id))
      .map(workflow_id => ({ handler_id: handlerId, workflow_id }));

    // Delete removed assignments
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('handler_workflows')
        .delete()
        .in('id', toDelete);

      if (delErr) {
        console.error('[handlerWorkflowService] Failed to delete workflows:', delErr);
        console.error('[handlerWorkflowService] Handler may have inconsistent workflow assignments');
        throw delErr;
      }
    }

    // Insert new assignments
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from('handler_workflows')
        .insert(toInsert);

      if (insErr) {
        console.error('[handlerWorkflowService] Failed to insert workflows:', insErr);
        console.error('[handlerWorkflowService] Deleted workflows but failed to add new ones - handler may be missing assignments');
        throw insErr;
      }
    }

    console.log(`[handlerWorkflowService] Updated handler ${handlerId} workflows: -${toDelete.length} +${toInsert.length}`);
    return true;
  }
};