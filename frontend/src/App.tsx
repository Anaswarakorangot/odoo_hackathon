import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppShell from './components/layout/AppShell';
import LandingPage from './pages/LandingPage';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import ForgetPassword from './pages/auth/ForgetPassword';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import ProductsList from './pages/products/ProductsList';
import SalesOrdersList from './pages/sales/SalesOrdersList';
import SalesOrderForm from './pages/sales/SalesOrderForm';
import PurchaseOrdersList from './pages/purchase/PurchaseOrdersList';
import PurchaseOrderForm from './pages/purchase/PurchaseOrderForm';
import ManufacturingOrdersList from './pages/manufacturing/ManufacturingOrdersList';
import ManufacturingOrderForm from './pages/manufacturing/ManufacturingOrderForm';
import BomList from './pages/bom/BomList';
import BomForm from './pages/bom/BomForm';
import AuditLogs from './pages/admin/AuditLogs';
import UserManagement from './pages/admin/UserManagement';
import RecallLookup from './pages/recall/RecallLookup';
import Profile from './pages/auth/Profile';
import AiInsights from './pages/ai/AiInsights';

// Placeholder pages for future implementation
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
        <p className="text-slate-400">This module will be implemented in a future sprint.</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Landing page */}
          <Route path="/" element={<LandingPage />} />

          {/* Public auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/login/admin" element={<Login isAdminLogin />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forget-password" element={<ForgetPassword />} />

          {/* Protected routes with app shell */}
          <Route element={<AppShell />}>
            {/* User dashboard */}
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Admin dashboard */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/permissions" element={<PlaceholderPage title="Role Permissions" />} />
            <Route path="/admin/audit" element={<AuditLogs />} />

            {/* Business modules */}
            <Route path="/sales" element={<SalesOrdersList />} />
            <Route path="/sales/new" element={<SalesOrderForm />} />
            <Route path="/sales/:id" element={<SalesOrderForm />} />
            <Route path="/purchase" element={<PurchaseOrdersList />} />
            <Route path="/purchase/new" element={<PurchaseOrderForm />} />
            <Route path="/purchase/:id" element={<PurchaseOrderForm />} />
            <Route path="/manufacturing" element={<ManufacturingOrdersList />} />
            <Route path="/manufacturing/new" element={<ManufacturingOrderForm />} />
            <Route path="/manufacturing/:id" element={<ManufacturingOrderForm />} />
            <Route path="/products" element={<ProductsList />} />
            <Route path="/bom" element={<BomList />} />
            <Route path="/bom/new" element={<BomForm />} />
            <Route path="/bom/:id" element={<BomForm />} />
            <Route path="/inventory" element={<PlaceholderPage title="Inventory" />} />
            <Route path="/recall" element={<RecallLookup />} />
            <Route path="/ai-insights" element={<AiInsights />} />

            {/* Profile and settings */}
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
