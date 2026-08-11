'use client'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'

function avatar(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const NAV_LINKS = [
  {
    href: '/dashboard',
    label: 'Board',
    icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7',
  },
  {
    href: '/dashboard/open',
    label: 'Open tasks',
    icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0l-2 5a2 2 0 01-2 2H8a2 2 0 01-2-2l-2-5m16 0h-4a2 2 0 00-2 2 2 2 0 01-2 2h-0a2 2 0 01-2-2 2 2 0 00-2-2H4',
  },
  {
    href: '/dashboard/my-tasks',
    label: 'My tasks',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
]

export default function Sidebar({ userEmail, userName, isSuperAdmin }: { userEmail: string; userName: string; isSuperAdmin: boolean }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  const navLinks = isSuperAdmin
    ? [...NAV_LINKS, {
        href: '/dashboard/admins',
        label: 'Manage admins',
        icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      }]
    : NAV_LINKS

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="px-4 py-5 border-b border-gray-100">
        <span className="font-semibold text-gray-900 text-lg">TaskFlow</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navLinks.map(link => {
          const active = pathname === link.href
          return (
            <a
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={link.icon} />
              </svg>
              {link.label}
            </a>
          )
        })}
      </nav>

      <div className="border-t border-gray-100 px-4 py-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {avatar(userName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{userName}</p>
            <p className="text-xs text-gray-400 truncate">{userEmail}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full text-left text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded hover:bg-gray-100 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
