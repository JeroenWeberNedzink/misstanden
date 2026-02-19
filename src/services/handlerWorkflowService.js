import { workflowService } from './workflowService';

export const handlerWorkflowService = {
  async getHandlerWorkflowIds(handlerId) {
    if (!handlerId) {
      throw new Error('handlerId is required');
    }
    return workflowService.getHandlerWorkflowIds(handlerId);
  },

  // Replace all assignments in one go: delete removed, insert added
  async setHandlerWorkflows(handlerId, workflowIds) {
    if (!handlerId) {
      throw new Error('handlerId is required');
    }

    const safeIds = Array.isArray(workflowIds) ? workflowIds.filter(Boolean) : [];
    await workflowService.setHandlerWorkflows(handlerId, safeIds);
    return true;
  },

  async clearHandlerWorkflows(handlerId) {
    if (!handlerId) {
      throw new Error('handlerId is required');
    }
    await workflowService.clearHandlerWorkflows(handlerId);
    return true;
  },
};
