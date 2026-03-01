import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Upload, Settings, ChevronRight, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/studio', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/studio/assessments', label: 'Assessments', icon: FileText },
  { href: '/studio/assessments/new', label: 'Neu erstellen', icon: Upload },
  { href: '/studio/sessions', label: 'Auswertungen', icon: ClipboardList },
  { href: '/studio/settings', label: 'Einstellungen', icon: Settings },
]

interface Props {
  children: React.ReactNode
}

export default function StudioLayout({ children }: Props) {
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-alma-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <div>
              <span className="font-semibold text-gray-900">ALMA</span>
              <span className="ml-1 text-xs bg-alma-100 text-alma-700 px-1.5 py-0.5 rounded font-medium">
                Studio
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = location.pathname === href ||
              (href !== '/studio' && location.pathname.startsWith(href))
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-alma-50 text-alma-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
                {active && <ChevronRight className="w-3 h-3 ml-auto" />}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">ALMA Studio v0.1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
