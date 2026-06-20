import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-blue-500/10 to-emerald-500/10 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-white mb-2">
          Welcome back, {user?.name}!
        </h1>
        <p className="text-slate-400">
          You are logged in as <span className="text-blue-400">{user?.role}</span> user.
        </p>
      </div>

      {/* Quick stats placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Open Sales Orders', value: '0', color: 'blue' },
          { label: 'Pending POs', value: '0', color: 'emerald' },
          { label: 'Active MOs', value: '0', color: 'amber' },
          { label: 'Low Stock Items', value: '0', color: 'red' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5"
          >
            <p className="text-sm text-slate-400 mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold text-${stat.color}-400`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* User info card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Your Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Name</p>
            <p className="text-slate-200">{user?.name}</p>
          </div>
          <div>
            <p className="text-slate-500">Login ID</p>
            <p className="text-slate-200">{user?.login_id}</p>
          </div>
          <div>
            <p className="text-slate-500">Email</p>
            <p className="text-slate-200">{user?.email}</p>
          </div>
          <div>
            <p className="text-slate-500">Role</p>
            <p className="text-slate-200 capitalize">{user?.role || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Placeholder notice */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
        <p className="text-amber-400 text-sm">
          This is a placeholder dashboard. Business modules (Sales, Purchase, Manufacturing)
          will be implemented in upcoming sprints.
        </p>
      </div>
    </div>
  );
}
