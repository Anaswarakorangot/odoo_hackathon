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
            <Route path="/admin/users" element={<PlaceholderPage title="User Management" />} />
            <Route path="/admin/permissions" element={<PlaceholderPage title="Role Permissions" />} />
            <Route path="/admin/audit" element={<PlaceholderPage title="Audit Logs" />} />

            {/* Business modules (placeholders) */}
            <Route path="/sales" element={<PlaceholderPage title="Sales Orders" />} />
            <Route path="/purchase" element={<PlaceholderPage title="Purchase Orders" />} />
            <Route path="/manufacturing" element={<PlaceholderPage title="Manufacturing Orders" />} />
            <Route path="/products" element={<ProductsList />} />
            <Route path="/bom" element={<PlaceholderPage title="Bill of Materials" />} />
            <Route path="/inventory" element={<PlaceholderPage title="Inventory" />} />

            {/* Profile and settings */}
            <Route path="/profile" element={<PlaceholderPage title="My Profile" />} />
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
