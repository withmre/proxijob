import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import './App.css'
import {
  Search, MapPin, Building2, Briefcase, GraduationCap, Target,
  ExternalLink, Navigation, ChevronLeft, ChevronRight, ArrowUp, List, Map, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MapView } from '@/components/MapView'
import pako from 'pako'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  siret: string
  name: string
  naf_code: string
  naf_label?: string
  address: string
  postal_code: string
  city: string
  lat: number
  lon: number          // notre script génère "lon", pas "lng"
  arrondissement?: string
}

interface DeptData {
  metadata: {
    dept: string
    name: string
    count: number
    arrondissements?: Record<string, number>
  }
  companies: Company[]
}

interface CityEntry {
  city: string
  dept: string
  lat: number
  lon: number
}

interface CitiesIndex {
  cities: CityEntry[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONTRACT_TYPES = [
  { id: 'stage',      name: 'Stage' },
  { id: 'alternance', name: 'Alternance' },
  { id: 'cdi',        name: 'CDI' },
  { id: 'cdd',        name: 'CDD' },
]

const FORMATIONS = [
  { id: 'informatique', name: 'Informatique / Développement' },
  { id: 'finance',      name: 'Finance / Banque' },
  { id: 'marketing',    name: 'Marketing / Communication' },
  { id: 'ingenierie',   name: 'Ingénierie' },
  { id: 'rh',           name: 'Ressources Humaines' },
  { id: 'commerce',     name: 'Commerce / Vente' },
  { id: 'autre',        name: 'Autre' },
]

const FORMATION_NAF_CODES: Record<string, string[]> = {
  informatique: [
    // Cœur IT
    '62.01Z', '62.02A', '62.02B', '62.03Z', '62.09Z',
    '63.11Z', '63.12Z', '63.91Z',
    // Éditeurs & télécoms
    '58.21Z', '58.29A', '58.29B', '58.29C',
    '61.10Z', '61.20Z', '61.30Z', '61.90Z',
    // Conseil & ingénierie numérique
    '70.22Z', '71.12B', '72.19Z', '74.90B',
    // Finance/banque (grosses DSI)
    '64.19Z', '64.20Z', '65.11Z', '66.19A',
    // Industrie tech
    '26.11Z', '26.20Z', '26.30Z', '27.90Z',
  ],
  finance: [
    // Cœur finance/banque/assurance
    '64.11Z', '64.19Z', '64.20Z', '64.30Z',
    '65.11Z', '65.12Z', '65.20Z',
    '66.11Z', '66.12Z', '66.19A', '66.19B', '66.22Z', '66.29Z',
    // Conseil / audit / expertise comptable
    '69.20Z', '70.22Z', '74.90B',
    // Immobilier
    '68.10Z', '68.20A', '68.20B', '68.31Z', '68.32A',
    // Grandes entreprises cotées (toutes ont une DAF)
    '84.11Z', '84.12Z',
  ],
  marketing: [
    // Cœur pub / com / marketing
    '73.11Z', '73.12Z', '73.20Z',
    '70.21Z', '70.22Z',
    // Médias, édition, événementiel
    '59.11A', '59.11B', '59.11C', '59.12Z', '59.20Z',
    '60.10Z', '60.20A', '60.20B',
    '90.01Z', '90.02Z', '82.30Z',
    // E-commerce & distribution (équipes growth/digital)
    '47.91A', '47.91B', '47.99B',
    '46.90Z', '47.11A', '47.19A',
    // Conseil
    '74.10Z', '74.20Z', '74.90B',
  ],
  ingenierie: [
    // Bureau d'études / ingénierie
    '71.11Z', '71.12A', '71.12B', '72.19Z',
    // Industrie manufacturing
    '24.10Z', '24.20Z', '25.11Z', '25.61Z', '25.62Z',
    '28.11Z', '28.15Z', '28.22Z', '28.29Z',
    '29.10Z', '29.20Z', '29.32Z',
    '30.11Z', '30.20Z', '30.30Z',
    // Construction & énergie
    '41.10A', '41.10B', '41.20A', '41.20B',
    '42.21Z', '42.22Z', '43.21A', '43.22A', '43.22B',
    '35.11Z', '35.12Z', '35.13Z', '35.14Z',
    // Aéronautique / défense
    '30.30Z', '30.40Z', '33.16Z', '33.19Z',
  ],
  rh: [
    // Cœur RH / recrutement / intérim
    '78.10Z', '78.20Z', '78.30Z',
    '80.10Z', '80.20Z', '80.30Z',
    // Formation professionnelle
    '85.59A', '85.59B', '85.60Z',
    // Conseil RH / coaching
    '70.22Z', '74.90B',
    // Grandes entreprises avec DRH structurée
    '84.11Z', '84.12Z', '84.13Z',
    // Santé & social (gros employeurs)
    '86.10Z', '86.21Z', '87.10A', '87.10B', '87.30A', '88.10A', '88.10B',
  ],
  commerce: [
    // Distribution & retail
    '45.11Z', '45.19Z', '45.20A',
    '46.10Z', '46.90Z',
    '47.11A', '47.11B', '47.11C', '47.11D', '47.11E',
    '47.19A', '47.19B',
    '47.41Z', '47.42Z', '47.43Z', '47.51Z', '47.71Z', '47.72A',
    // E-commerce
    '47.91A', '47.91B',
    // Automobile
    '45.11Z', '45.19Z', '45.20A', '45.31Z', '45.32Z',
    // Hôtellerie / restauration (commerce client)
    '55.10Z', '55.20Z', '56.10A', '56.10B', '56.29A',
    // Conseil commercial
    '70.22Z', '73.20Z',
  ],
  autre: [],
}

const PARIS_ARRONDISSEMENTS = [
  { id: 'all', label: 'Tous les arrondissements' },
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `750${String(i + 1).padStart(2, '0')}`,
    label: `${i + 1}${i === 0 ? 'er' : 'e'} arrondissement`,
  })),
]

const PAGE_SIZE = 20

// ─── Helper : décompression .json.gz ──────────────────────────────────────────

async function fetchGz<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  const buf = await res.arrayBuffer()
  const txt = pako.inflate(new Uint8Array(buf), { to: 'string' })
  return JSON.parse(txt) as T
}

// ─── Composant CityAutocomplete ───────────────────────────────────────────────

interface CityAutocompleteProps {
  cities: CityEntry[]
  value: CityEntry | null
  onChange: (city: CityEntry | null) => void
}

function CityAutocomplete({ cities, value, onChange }: CityAutocompleteProps) {
  const [query, setQuery]         = useState('')
  const [open, setOpen]           = useState(false)
  const [focused, setFocused]     = useState(false)
  const inputRef                  = useRef<HTMLInputElement>(null)
  const containerRef              = useRef<HTMLDivElement>(null)

  // Normalise une chaîne pour la comparaison (accents, casse)
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const suggestions = useMemo(() => {
    if (query.length < 2) return []
    const q = normalize(query)
    return cities
      .filter(c => normalize(c.city).includes(q))
      .slice(0, 8)
  }, [query, cities])

  // Sync display quand value change depuis l'extérieur
  useEffect(() => {
    if (value) setQuery(`${value.city} (${value.dept})`)
    else if (!focused) setQuery('')
  }, [value, focused])

  const handleSelect = (city: CityEntry) => {
    onChange(city)
    setQuery(`${city.city} (${city.dept})`)
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleClear = () => {
    onChange(null)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setOpen(true)
    if (value) onChange(null)   // invalide la sélection si l'user retape
  }

  // Ferme le dropdown si clic en dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Remet le nom de la ville sélectionnée si l'input est "sale"
        if (value) setQuery(`${value.city} (${value.dept})`)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [value])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => { setFocused(true); if (query.length >= 2) setOpen(true) }}
          onBlur={() => setFocused(false)}
          placeholder="Ex : Lyon, Nantes, Bordeaux..."
          className="w-full h-10 px-3 pr-8 rounded-md border border-input bg-background text-sm
                     ring-offset-background placeholder:text-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg
                       max-h-60 overflow-auto text-sm">
          {suggestions.map(city => (
            <li
              key={`${city.city}-${city.dept}`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(city) }}
              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-blue-50"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-3 h-3 text-blue-400 flex-shrink-0" />
                <span className="font-medium text-slate-800">{city.city}</span>
              </div>
              <span className="text-xs text-slate-400 ml-2">Dép. {city.dept}</span>
            </li>
          ))}
        </ul>
      )}

      {open && query.length >= 2 && suggestions.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg px-3 py-2 text-sm text-slate-500">
          Aucune ville trouvée
        </div>
      )}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  // Index des villes (chargé au démarrage)
  const [citiesIndex, setCitiesIndex]   = useState<CityEntry[]>([])
  const [indexLoading, setIndexLoading] = useState(true)

  // Formulaire
  const [selectedCity,           setSelectedCity]           = useState<CityEntry | null>(null)
  const [selectedContract,       setSelectedContract]       = useState('')
  const [selectedFormation,      setSelectedFormation]      = useState('')
  const [selectedArrondissement, setSelectedArrondissement] = useState('all')
  const [radius,                 setRadius]                 = useState(10)

  // Résultats
  const [companies,         setCompanies]         = useState<Company[]>([])
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([])
  const [loading,           setLoading]           = useState(false)
  const [hasSearched,       setHasSearched]       = useState(false)
  const [selectedCompany,   setSelectedCompany]   = useState<Company | null>(null)
  const [currentPage,       setCurrentPage]       = useState(1)
  const [showScrollTop,     setShowScrollTop]     = useState(false)
  const [activeTab,         setActiveTab]         = useState('list')

  const resultsRef      = useRef<HTMLDivElement>(null)
  const companyCardsRef = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Chargement de l'index des villes au démarrage ──────────────────────────
  useEffect(() => {
    fetchGz<CitiesIndex>('./data/cities_index.json.gz')
      .then(d => setCitiesIndex(d.cities))
      .catch(() => {
        // fallback : essai sans base path
        fetch('./data/cities_index.json')
          .then(r => r.json())
          .then((d: CitiesIndex) => setCitiesIndex(d.cities))
          .catch(console.error)
      })
      .finally(() => setIndexLoading(false))
  }, [])

  // ── Scroll ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  const scrollToResults = useCallback(() => {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const scrollToCompany = useCallback((siret: string) => {
    companyCardsRef.current[siret]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  // ── Chargement des données du département ───────────────────────────────────
  const loadDeptData = useCallback(async (dept: string): Promise<Company[]> => {
    setLoading(true)
    try {
      const data = await fetchGz<DeptData>(`./data/${dept}.json.gz`)
      setCompanies(data.companies)
      return data.companies
    } catch (err) {
      console.error('Erreur chargement département:', err)
      setCompanies([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Calcul Haversine ────────────────────────────────────────────────────────
  const haversine = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R   = 6371
    const dLa = (lat2 - lat1) * Math.PI / 180
    const dLo = (lon2 - lon1) * Math.PI / 180
    const a   = Math.sin(dLa/2)**2 +
                Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLo/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }, [])

  // ── Filtres ─────────────────────────────────────────────────────────────────
  const applyFilters = useCallback((
    all: Company[],
    city: CityEntry,
    rad: number,
    formation: string,
    arrondissement: string
  ): Company[] => {
    let out = all

    // 1. Arrondissement (Paris uniquement)
    if (city.dept === '75' && arrondissement !== 'all') {
      out = out.filter(c => c.arrondissement === arrondissement || c.postal_code === arrondissement)
    }

    // 2. Rayon Haversine — note: on filtre sur les entreprises du département entier
    //    donc le rayon sert à exclure les villes trop loin du centre choisi
    out = out.filter(c => {
      if (!c.lat || !c.lon) return false
      return haversine(city.lat, city.lon, c.lat, c.lon) <= rad
    })

    // 3. Formation / NAF
    if (formation && formation !== 'autre') {
      const codes = FORMATION_NAF_CODES[formation] ?? []
      if (codes.length > 0) {
        out = out.filter(c => codes.includes(c.naf_code))
      }
    }

    return out
  }, [haversine])

  // ── Recherche principale ────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!selectedCity || !selectedFormation) return

    setHasSearched(true)
    setSelectedCompany(null)
    setCurrentPage(1)

    const all      = await loadDeptData(selectedCity.dept)
    const filtered = applyFilters(all, selectedCity, radius, selectedFormation, selectedArrondissement)
    setFilteredCompanies(filtered)

    setTimeout(scrollToResults, 150)
  }, [selectedCity, selectedFormation, selectedArrondissement, radius, loadDeptData, applyFilters, scrollToResults])

  // ── Re-filtre en temps réel quand rayon / arrondissement / formation changent ──
  useEffect(() => {
    if (!hasSearched || !selectedCity || companies.length === 0) return
    const filtered = applyFilters(companies, selectedCity, radius, selectedFormation, selectedArrondissement)
    setFilteredCompanies(filtered)
    setCurrentPage(1)
  }, [radius, selectedArrondissement, selectedFormation, companies, hasSearched, selectedCity, applyFilters])

  // ── Actions entreprise ──────────────────────────────────────────────────────
  const openGoogleMaps = useCallback((c: Company) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`, '_blank')
  }, [])

  const searchJobs = useCallback((c: Company) => {
    const contract  = CONTRACT_TYPES.find(ct => ct.id === selectedContract)?.name ?? ''
    const formation = FORMATIONS.find(f => f.id === selectedFormation)?.name ?? ''
    const q = encodeURIComponent(`${c.name} ${contract} ${formation} recrutement`.trim())
    window.open(`https://www.google.com/search?q=${q}`, '_blank')
  }, [selectedContract, selectedFormation])

  const handleSelectCompany = useCallback((c: Company) => {
    setSelectedCompany(c)
    scrollToCompany(c.siret)
  }, [scrollToCompany])

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages      = Math.ceil(filteredCompanies.length / PAGE_SIZE)
  const paginatedItems  = useMemo(() => {
    const s = (currentPage - 1) * PAGE_SIZE
    return filteredCompanies.slice(s, s + PAGE_SIZE)
  }, [filteredCompanies, currentPage])

  const rangeLabel = filteredCompanies.length === 0
    ? '0'
    : `${(currentPage-1)*PAGE_SIZE + 1}–${Math.min(currentPage*PAGE_SIZE, filteredCompanies.length)}`

  // ── Validité formulaire ─────────────────────────────────────────────────────
  const isFormValid = !!selectedCity && !!selectedFormation

  // ── Carte entreprise (partagé desktop + mobile) ─────────────────────────────
  const CompanyCard = ({ company }: { company: Company }) => (
    <Card
      ref={(el) => { if (el) companyCardsRef.current[company.siret] = el }}
      className={`cursor-pointer transition-all hover:shadow-md ${
        selectedCompany?.siret === company.siret ? 'ring-2 ring-blue-500' : ''
      }`}
      onClick={() => handleSelectCompany(company)}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm sm:text-base truncate">{company.name}</h3>
            {company.naf_label && (
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{company.naf_label}</p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">{company.naf_code}</p>
            <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-600">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{company.address}, {company.postal_code} {company.city}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <Button
              variant="outline" size="sm"
              className="text-xs px-2 py-1 h-auto"
              onClick={(e) => { e.stopPropagation(); openGoogleMaps(company) }}
            >
              <ExternalLink className="w-3 h-3 mr-1" />Voir
            </Button>
            <Button
              size="sm"
              className="text-xs px-2 py-1 h-auto"
              onClick={(e) => { e.stopPropagation(); searchJobs(company) }}
            >
              <Search className="w-3 h-3 mr-1" />Postuler
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const PaginationBar = ({ mobile = false }) => totalPages > 1 ? (
    <div className="flex items-center justify-center gap-2 pt-4">
      <Button variant="outline" size="sm"
        onClick={() => setCurrentPage(p => Math.max(1, p-1))}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="w-4 h-4" />
        {!mobile && ' Précédent'}
      </Button>
      <span className="text-sm text-slate-600 min-w-[80px] text-center">
        {mobile ? `${currentPage}/${totalPages}` : `Page ${currentPage} / ${totalPages}`}
      </span>
      <Button variant="outline" size="sm"
        onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))}
        disabled={currentPage === totalPages}
      >
        {!mobile && 'Suivant '}
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  ) : null

  // ── Rendu ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">ProxiJob</h1>
              <p className="hidden sm:block text-sm text-slate-500">
                Trouvez les entreprises qui recrutent près de chez vous
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {/* Formulaire */}
        <Card className="mb-4 sm:mb-6 shadow-lg">
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              Votre recherche
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

              {/* Formation */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />Votre formation *
                </label>
                <Select value={selectedFormation} onValueChange={setSelectedFormation}>
                  <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
                  <SelectContent>
                    {FORMATIONS.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedFormation && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                    Requis pour filtrer par secteur
                  </Badge>
                )}
                {selectedFormation === 'autre' && (
                  <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-200">
                    Tous les secteurs
                  </Badge>
                )}
              </div>

              {/* Contrat */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />Type de contrat
                </label>
                <Select value={selectedContract} onValueChange={setSelectedContract}>
                  <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ville — autocomplétion */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />Votre ville *
                </label>
                {indexLoading ? (
                  <div className="h-10 bg-slate-100 rounded-md animate-pulse" />
                ) : (
                  <CityAutocomplete
                    cities={citiesIndex}
                    value={selectedCity}
                    onChange={(city) => {
                      setSelectedCity(city)
                      setSelectedArrondissement('all')
                    }}
                  />
                )}
                {selectedCity && (
                  <p className="text-xs text-slate-400">
                    Département {selectedCity.dept} · {selectedCity.lat.toFixed(4)}, {selectedCity.lon.toFixed(4)}
                  </p>
                )}
              </div>

              {/* Rayon */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Navigation className="w-4 h-4" />Rayon : {radius} km
                </label>
                <Slider
                  value={[radius]}
                  onValueChange={([v]) => setRadius(v)}
                  min={1} max={50} step={1}
                  className="py-2 touch-none"
                />
              </div>
            </div>

            {/* Arrondissements Paris */}
            {selectedCity?.dept === '75' && (
              <div className="mt-3 pt-3 border-t">
                <div className="max-w-xs">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-1.5">
                    <Building2 className="w-4 h-4" />Arrondissement
                  </label>
                  <Select value={selectedArrondissement} onValueChange={setSelectedArrondissement}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tous les arrondissements" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARIS_ARRONDISSEMENTS.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Button
              onClick={handleSearch}
              className="w-full mt-4 sm:mt-5 bg-blue-600 hover:bg-blue-700"
              size="lg"
              disabled={!isFormValid || loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>Chargement...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="w-4 h-4" />Rechercher les entreprises
                </span>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Résultats */}
        {hasSearched && (
          <div ref={resultsRef} className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Entreprises trouvées</h2>
              <Badge variant="secondary" className="w-fit">
                {rangeLabel} sur {filteredCompanies.length} résultat{filteredCompanies.length > 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Desktop : côte à côte */}
            <div className="hidden lg:grid lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                {filteredCompanies.length === 0 ? (
                  <Card className="p-8 text-center">
                    <p className="text-slate-500">Aucune entreprise trouvée avec ces critères</p>
                    <p className="text-sm text-slate-400 mt-2">Essayez d'augmenter le rayon ou de changer la formation</p>
                  </Card>
                ) : (
                  <>
                    {paginatedItems.map(c => <CompanyCard key={c.siret} company={c} />)}
                    <PaginationBar />
                  </>
                )}
              </div>
              <div className="lg:sticky lg:top-6">
                <Card className="overflow-hidden h-[calc(100vh-180px)] min-h-[500px]">
                  <MapView
                    companies={filteredCompanies}
                    selectedCompany={selectedCompany}
                    onSelectCompany={handleSelectCompany}
                    onOpenGoogleMaps={openGoogleMaps}
                    onSearchJobs={searchJobs}
                  />
                </Card>
              </div>
            </div>

            {/* Mobile / tablette : onglets */}
            <div className="lg:hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="list" className="flex items-center gap-2">
                    <List className="w-4 h-4" />Liste
                  </TabsTrigger>
                  <TabsTrigger value="map" className="flex items-center gap-2">
                    <Map className="w-4 h-4" />Carte
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-3">
                  {filteredCompanies.length === 0 ? (
                    <Card className="p-8 text-center">
                      <p className="text-slate-500">Aucune entreprise trouvée</p>
                    </Card>
                  ) : (
                    <>
                      {paginatedItems.map(c => <CompanyCard key={c.siret} company={c} />)}
                      <PaginationBar mobile />
                    </>
                  )}
                </TabsContent>

                <TabsContent value="map">
                  <Card className="overflow-hidden h-[50vh]">
                    <MapView
                      companies={filteredCompanies}
                      selectedCompany={selectedCompany}
                      onSelectCompany={handleSelectCompany}
                      onOpenGoogleMaps={openGoogleMaps}
                      onSearchJobs={searchJobs}
                    />
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}

        {/* Message d'accueil */}
        {!hasSearched && (
          <div className="text-center py-12 sm:py-16">
            <div className="bg-blue-50 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-3">
              Prêt à trouver votre prochain emploi ?
            </h2>
            <p className="text-slate-600 max-w-lg mx-auto mb-8 px-4">
              Tapez votre ville, choisissez votre formation et découvrez toutes les entreprises
              qui recrutent à proximité — données INSEE, 27 700 établissements en France.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 text-sm text-slate-500 px-4">
              <div className="flex items-center justify-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span>+30 salariés · France entière</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <span>4 700 villes indexées</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                <span>Filtrage par secteur NAF</span>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
          <p className="text-center text-xs sm:text-sm text-slate-500">
            ProxiJob · Données INSEE Sirene · Établissements de +30 salariés · France entière
          </p>
        </div>
      </footer>

      {showScrollTop && (
        <Button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 rounded-full shadow-lg z-50"
          size="icon"
        >
          <ArrowUp className="w-5 h-5" />
        </Button>
      )}
    </div>
  )
}

export default App
