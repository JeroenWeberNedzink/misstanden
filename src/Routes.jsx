import React from "react";
import { BrowserRouter, Routes as RouterRoutes, Route } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import MaintenanceModeGuard from "./components/MaintenanceModeGuard";
import NotFound from "./pages/NotFound";
import TicketAccessPortal from './pages/ticket-access-portal';
import HandlerDashboard from './pages/handler-dashboard';
import TicketDetailsView from './pages/ticket-details-view';
import AnonymousReportForm from './pages/anonymous-report-form';
import CaseManagementDetail from './pages/case-management-detail';
import ReportConfirmation from './pages/report-confirmation';
import WorkflowConfigurationAdmin from './pages/workflow-configuration-admin';
import HandlerProfileManagement from './pages/handler-profile-management';
import CommunicationDeliveryStatusAdmin from './pages/logging';
import HandlerPriorityWorkflow from './pages/handler-priority-workflow';
import UserManagementAdmin from './pages/user-management-admin';
import Settings from './pages/settings';
import { PERMISSIONS, ROLES } from './utils/permissions';
import PermissionsAdmin from './pages/permissions-admin';
import AdminDashboard from './pages/admin-dashboard';

const Routes = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <MaintenanceModeGuard>
      <ScrollToTop />
      <RouterRoutes>
        {/* Public Routes */}
        <Route path="/" element={<AnonymousReportForm />} />
        <Route path="/anonymous-report-form" element={<AnonymousReportForm />} />
        <Route path="/report-confirmation" element={<ReportConfirmation />} />
        <Route path="/ticket-access-portal" element={<TicketAccessPortal />} />

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
      </MaintenanceModeGuard>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;