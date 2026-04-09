import { analyticsApiService } from './analyticsApiService';

export const analyticsService = {
  setTokenProvider(provider) {
    analyticsApiService.setTokenProvider(provider);
  },

  async getVolumeTrends(dateFrom, dateTo) {
    const data = await analyticsApiService.getDashboardMetrics({ dateFrom, dateTo });
    return data?.volumeTrends || data?.volume || [];
  },

  async getResolutionTimeStats(dateFrom, dateTo) {
    const data = await analyticsApiService.getDashboardMetrics({ dateFrom, dateTo });
    return data?.resolutionTimeStats || data?.resolution || {};
  },

  async getSeverityDistribution(dateFrom, dateTo) {
    const data = await analyticsApiService.getDashboardMetrics({ dateFrom, dateTo });
    return data?.severityDistribution || data?.severity || [];
  },

  async getWorkflowPerformance(dateFrom, dateTo) {
    const data = await analyticsApiService.getDashboardMetrics({ dateFrom, dateTo });
    return data?.workflowPerformance || data?.workflows || [];
  },

  async getSummaryMetrics(dateFrom, dateTo) {
    const data = await analyticsApiService.getDashboardMetrics({ dateFrom, dateTo });
    return data?.summaryMetrics || data?.summary || {};
  },

  async getHandlerPerformance(dateFrom, dateTo) {
    const data = await analyticsApiService.getDashboardMetrics({ dateFrom, dateTo });
    return data?.handlerPerformance || data?.handlers || [];
  },

  async getDeadlineStatistics(dateFrom, dateTo) {
    const data = await analyticsApiService.getDashboardMetrics({ dateFrom, dateTo });
    return data?.deadlineStatistics || data?.deadlines || {};
  },
};

export default analyticsService;
