import { clsx as cx } from 'clsx'
import { FilterIcon } from '../icons'
import { FilterPill } from './FilterPill'
import { fieldBox } from './fieldBox'
import { useStrings } from './Provider'

interface FilterOption {
  label: string
  value: string
}

interface FilterProps {
  filter: string
  setFilter: (value: string) => void
  placeholder?: string
  /** Optional filter pills rendered before the search input */
  pills?: FilterOption[]
  activePill?: string
  onPillChange?: (value: string) => void
}

export default function Filter({
  filter,
  setFilter,
  placeholder,
  pills,
  activePill,
  onPillChange,
}: FilterProps) {
  const { common } = useStrings()
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        <input
          aria-label={placeholder ?? common.filterPlaceholder}
          placeholder={placeholder ?? common.filterPlaceholder}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
          className={cx(fieldBox(), 'pl-8')}
        />
        <div className="absolute inset-y-0 left-0 flex py-2.5 pl-2">
          <FilterIcon />
        </div>
      </div>
      {pills && onPillChange && (
        <div className="flex gap-1">
          {pills.map((pill) => (
            <FilterPill
              key={pill.value}
              active={activePill === pill.value}
              onClick={() => onPillChange(pill.value)}
            >
              {pill.label}
            </FilterPill>
          ))}
        </div>
      )}
    </div>
  )
}
