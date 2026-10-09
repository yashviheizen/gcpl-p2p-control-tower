import { Outlet } from 'react-router-dom'
import { FilterProvider } from '@/lib/filters'

export function Providers() {
  return (
    <FilterProvider>
      <Outlet />
    </FilterProvider>
  )
}
