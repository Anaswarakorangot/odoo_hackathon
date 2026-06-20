import { useAuth } from '../contexts/AuthContext';

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-white mb-2">
          System Administrator Dashboard
        </h1>
        <p className="text-slate-400">
          Logged in as <span className="text-purple-400">{user?.name}</span>
        </p>
      </div>

      {/* Admin quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            label: 'User Management',
            description: 'Manage user accounts, roles, and permissions',
            icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
            color: 'blue',
          },
          {
            label: 'Role Permissions',
            description: 'Configure module access for each role',
            icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
            color: 'emerald',
          },
          {
            label: 'Audit Logs',
            description: 'Review system activity and changes',
            icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
            color: 'amber',
          },
        ].map((action) => (
          <div
            key={action.label}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-lg bg-${action.color}-500/10 flex items-center justify-center mb-3`}>
              <svg className={`w-5 h-5 text-${action.color}-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={action.icon} />
              </svg>
            </div>
            <h3 className="text-white font-medium mb-1">{action.label}</h3>
            <p className="text-sm text-slate-400">{action.description}</p>
          </div>
        ))}
      </div>

      {/* System stats placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: '1', color: 'blue' },
          { label: 'Active Sessions', value: '1', color: 'emerald' },
          { label: 'Roles Configured', value: '5', color: 'purple' },
          { label: 'Audit Events (24h)', value: '0', color: 'amber' },
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

      {/* Admin info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Administrator Profile</h2>
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
            <p className="text-slate-500">Access Level</p>
            <p className="text-purple-400">System Administrator</p>
          </div>
        </div>
      </div>

      {/* Placeholder notice */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 text-center">
        <p className="text-purple-400 text-sm">
          System Administrator features (User Management, Permission Configuration)
          will be implemented in upcoming sprints.
        </p>
      </div>
    </div>
  );
}
