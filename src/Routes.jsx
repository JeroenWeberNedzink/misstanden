import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes as RouterRoutes, Route } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import MaintenanceModeGuard from "./components/MaintenanceModeGuard";
const NotFound = lazy(() => import("./pages/NotFound"));
const TicketAccessPortal = lazy(() => import('./pages/ticket-access-portal'));
const HandlerDashboard = lazy(() => import('./pages/handler-dashboard'));
const TicketDetailsView = lazy(() => import('./pages/ticket-details-view'));
const AnonymousReportForm = lazy(() => import('./pages/anonymous-report-form'));
const CaseManagementDetail = lazy(() => import('./pages/case-management-detail'));
const ReportConfirmation = lazy(() => import('./pages/report-confirmation'));
const WorkflowConfigurationAdmin = lazy(() => import('./pages/workflow-configuration-admin'));
const HandlerProfileManagement = lazy(() => import('./pages/handler-profile-management'));
const CommunicationDeliveryStatusAdmin = lazy(() => import('./pages/logging'));
const HandlerPriorityWorkflow = lazy(() => import('./pages/handler-priority-workflow'));
const UserManagementAdmin = lazy(() => import('./pages/user-management-admin'));
const Settings = lazy(() => import('./pages/settings'));
const ReporterReplyPage = lazy(() => import('./pages/reporter-reply'));
const GuestTicketViewPage = lazy(() => import('./pages/guest-ticket-view'));
const AnalyticsDashboardPage = lazy(() => import('./pages/analytics-dashboard'));
import { PERMISSIONS } from './utils/permissions';
const PermissionsAdmin = lazy(() => import('./pages/permissions-admin'));
const AdminDashboard = lazy(() => import('./pages/admin-dashboard'));

const RouteLoadingFallback = () => (
  <div className="min-h-screen app-page-gradient bg-background flex items-center justify-center">
    <div className="w-full max-w-sm px-6">
      <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
        <div className="h-4 w-1/2 bg-muted rounded mb-4"></div>
        <div className="h-3 w-full bg-muted/70 rounded mb-2"></div>
        <div className="h-3 w-4/5 bg-muted/70 rounded"></div>
      </div>
    </div>
  </div>
);

const Routes = () => {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ErrorBoundary>
      <MaintenanceModeGuard>
      <ScrollToTop />
      <Suspense fallback={<RouteLoadingFallback />}>
      <RouterRoutes>
        {/* Public Routes */}
        <Route path="/" element={<AnonymousReportForm />} />
        <Route path="/anonymous-report-form" element={<AnonymousReportForm />} />
        <Route path="/report-confirmation" element={<ReportConfirmation />} />
        <Route path="/ticket-access-portal" element={<TicketAccessPortal />} />
        <Route path="/reply/:token" element={<ReporterReplyPage />} />
        <Route path="/guest/:token" element={<GuestTicketViewPage />} />

        {/* Protected Admin/Handler Routes */}
        <Route
          path="/handler-dashboard"
          element={
            <ProtectedRoute permission={PERMISSIONS.VIEW_TICKETS} showAccessDenied>
              <HandlerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ticket-details-view"
          element={
            <ProtectedRoute permission={PERMISSIONS.VIEW_TICKETS} showAccessDenied>
              <TicketDetailsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/case-management-detail"
          element={
            <ProtectedRoute permission={PERMISSIONS.EDIT_TICKETS} showAccessDenied>
              <CaseManagementDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflow-configuration-admin"
          element={
            <ProtectedRoute permission={PERMISSIONS.MANAGE_WORKFLOWS} showAccessDenied>
              <WorkflowConfigurationAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute permission={PERMISSIONS.MANAGE_USERS} showAccessDenied>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-management-admin"
          element={
            <ProtectedRoute permission={PERMISSIONS.MANAGE_USERS} showAccessDenied>
              <UserManagementAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/permissions-admin"
          element={
            <ProtectedRoute permission={PERMISSIONS.MANAGE_USERS} showAccessDenied>
              <PermissionsAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute permission={PERMISSIONS.MANAGE_USERS} showAccessDenied>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics-dashboard"
          element={
            <ProtectedRoute permission={PERMISSIONS.MANAGE_USERS} showAccessDenied>
              <AnalyticsDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/handler-profile-management"
          element={
            <ProtectedRoute>
              <HandlerProfileManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/logging"
          element={
            <ProtectedRoute permission={PERMISSIONS.MANAGE_USERS} showAccessDenied>
              <CommunicationDeliveryStatusAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/handler-priority-workflow"
          element={
            <ProtectedRoute permission={PERMISSIONS.VIEW_TICKETS} showAccessDenied>
              <HandlerPriorityWorkflow />
            </ProtectedRoute>
          }
        />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </RouterRoutes>
      </Suspense>
      </MaintenanceModeGuard>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;
