import React from 'react';
import { Navigate } from 'react-router-dom';

const AdminDashboard = () => <Navigate to="/settings?mode=admin" replace />;

export default AdminDashboard;
