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
  lon: number
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

// ─── Filtrage NAF par PRÉFIXES ────────────────────────────────────────────────
//
// Plutôt que de lister chaque code individuellement (ex: 47.11A, 47.11B, 47.11C...),
// on utilise des PRÉFIXES qui couvrent toute une sous-section NAF.
// Ex: préfixe "47" couvre 47.11A, 47.19B, 47.41Z, 47.91A... soit TOUT le commerce de détail.
//
// Logique : naf_code.startsWith(prefix) pour chaque prefix de la liste.

const FORMATION_NAF_PREFIXES: Record<string, string[]> = {

  informatique: [
    // ── Cœur IT ──────────────────────────────────────────────────────────────
    '62',          // Programmation, conseil, activités informatiques (62.01Z à 62.09Z)
    '63.1',        // Traitement données, hébergement, portails (63.11Z, 63.12Z)
    // ── Éditeurs de logiciels ─────────────────────────────────────────────────
    '58.2',        // Édition de logiciels (58.21Z, 58.29A/B/C)
    // ── Télécommunications ────────────────────────────────────────────────────
    '61',          // Tous les opérateurs télécoms (61.10Z à 61.90Z)
    // ── Ingénierie & R&D numérique ────────────────────────────────────────────
    '71.12',       // Ingénierie & études techniques (71.12A/B)
    '72',          // Recherche & développement (72.11Z, 72.19Z, 72.20Z)
    // ── Conseil & management (cabinets avec DSI) ──────────────────────────────
    '70.2',        // Conseil pour les affaires (70.21Z, 70.22Z)
    // ── Industrie électronique & matériel ─────────────────────────────────────
    '26',          // Fabrication de produits informatiques/électroniques (26.11Z à 26.80Z)
    '27.1', '27.9',// Équipements électriques
    // ── Finance & banque (DSI importantes) ───────────────────────────────────
    '64.1', '64.2',// Banques et établissements financiers
    '65.1',        // Assurances
    '66.1',        // Auxiliaires financiers
  ],

  finance: [
    // ── Banques & établissements de crédit ────────────────────────────────────
    '64',          // Toute la section : banques, holdings, OPCVM (64.11Z à 64.99Z)
    // ── Assurances ────────────────────────────────────────────────────────────
    '65',          // Assurance vie, non-vie, réassurance (65.11Z à 65.30Z)
    // ── Auxiliaires financiers & assurance ───────────────────────────────────
    '66',          // Gestion de fonds, courtage, auxiliaires (66.11Z à 66.29Z)
    // ── Audit / expertise comptable ──────────────────────────────────────────
    '69.2',        // Activités comptables (69.20Z)
    // ── Conseil financier & stratégique ──────────────────────────────────────
    '70.2',        // Conseil aux entreprises (70.21Z, 70.22Z)
    // ── Immobilier (asset management, foncières) ──────────────────────────────
    '68',          // Toute la section immobilier (68.10Z à 68.32B)
    // ── Secteur public financier ──────────────────────────────────────────────
    '84.1',        // Administration générale (trésor, collectivités)
  ],

  marketing: [
    // ── Publicité & communication ─────────────────────────────────────────────
    '73',          // Toute la section : agences pub, études de marché, relations publiques
    // ── Conseil & communication corporate ────────────────────────────────────
    '70.2',        // Conseil aux entreprises (70.21Z communication, 70.22Z conseil)
    // ── Médias & édition ──────────────────────────────────────────────────────
    '58',          // Édition (livres, presse, logiciels) — 58.11Z à 58.29C
    '59',          // Production cinéma, vidéo, TV, musique (59.11A à 59.20Z)
    '60',          // Radio et télévision (60.10Z, 60.20A/B)
    // ── Événementiel & arts ───────────────────────────────────────────────────
    '82.3',        // Organisation de salons, congrès (82.30Z)
    '90',          // Arts du spectacle, création artistique (90.01Z à 90.03Z)
    // ── E-commerce & distribution (équipes growth/digital) ───────────────────
    '47.9',        // Commerce de détail hors magasin (e-commerce : 47.91A/B, 47.99A/B)
    // ── Design & création ────────────────────────────────────────────────────
    '74.1',        // Activités spécialisées de design (74.10Z)
    '74.2',        // Activités photographiques (74.20Z)
    // ── Conseil IT (digital marketing / analytics) ────────────────────────────
    '62',          // Développement & conseil IT
    '63.1',        // Data / web analytics
  ],

  ingenierie: [
    // ── Bureaux d'études & ingénierie ─────────────────────────────────────────
    '71',          // Architecture, ingénierie, contrôle (71.11Z à 71.20B)
    // ── Recherche & développement ────────────────────────────────────────────
    '72',          // R&D sciences physiques, naturelles (72.11Z à 72.20Z)
    // ── Industrie manufacturière ──────────────────────────────────────────────
    '24',          // Métallurgie (24.10Z à 24.54Z)
    '25',          // Produits métalliques (25.11Z à 25.99Z)
    '26',          // Électronique & informatique (26.11Z à 26.80Z)
    '27',          // Équipements électriques (27.11Z à 27.90Z)
    '28',          // Machines & équipements (28.11Z à 28.99Z)
    '29',          // Automobile (29.10Z à 29.32Z)
    '30',          // Autres matériels de transport (30.11Z à 30.99Z)
    '33',          // Réparation & installation machines (33.11Z à 33.20Z)
    // ── Construction & génie civil ────────────────────────────────────────────
    '41',          // Promotion & construction immobilière (41.10A à 41.20B)
    '42',          // Génie civil (routes, ponts, réseaux) (42.11Z à 42.99Z)
    '43',          // Travaux de construction spécialisés (43.11Z à 43.99Z)
    // ── Énergie ──────────────────────────────────────────────────────────────
    '35',          // Production & distribution énergie/gaz/vapeur (35.11Z à 35.30Z)
    '19',          // Raffinage pétrole (19.10Z, 19.20Z)
    // ── Extraction & mines ────────────────────────────────────────────────────
    '05', '06', '07', '08', '09', // Extraction
    // ── Aéronautique / Défense / Naval ────────────────────────────────────────
    '30.3',        // Aéronautique (30.30Z)
    '30.4',        // Véhicules militaires (30.40Z)
    '30.1',        // Construction navale (30.11Z, 30.12Z)
  ],

  rh: [
    // ── Recrutement, intérim, placement ──────────────────────────────────────
    '78',          // Toute la section : recrutement (78.10Z), intérim (78.20Z), autres (78.30Z)
    // ── Sécurité & nettoyage (gros employeurs, DRH structurées) ──────────────
    '80',          // Enquêtes & sécurité (80.10Z, 80.20Z, 80.30Z)
    '81',          // Services aux bâtiments : nettoyage, jardinage (81.10Z à 81.30Z)
    // ── Formation professionnelle ─────────────────────────────────────────────
    '85.5',        // Formation pour adultes (85.51Z, 85.52Z, 85.59A/B)
    '85.6',        // Conseil & orientation (85.60Z)
    // ── Conseil RH & management ──────────────────────────────────────────────
    '70.2',        // Conseil aux entreprises (70.22Z inclut conseil RH/organisation)
    '74.9',        // Autres activités professionnelles (74.90A/B — coaching, conseil)
    // ── Secteur public (grandes DRH) ─────────────────────────────────────────
    '84',          // Administration publique (84.11Z à 84.30C)
    // ── Santé & social (gros employeurs avec DRH) ────────────────────────────
    '86',          // Activités hospitalières & médicales (86.10Z à 86.90F)
    '87',          // Hébergement médico-social (87.10A à 87.90B)
    '88',          // Action sociale sans hébergement (88.10A à 88.99B)
    // ── Transport (gros employeurs) ───────────────────────────────────────────
    '49',          // Transport terrestre (SNCF, bus...) (49.10Z à 49.50Z)
  ],

  commerce: [
    // ── Commerce de détail — TOUS les sous-secteurs ───────────────────────────
    // Supermarchés, hypermarchés, épiceries
    '47.1',        // Commerce en magasin non spécialisé (Carrefour, Leclerc, Auchan, Lidl...)
    // Alimentaire spécialisé
    '47.2',        // Alimentation spécialisée (bouchers, boulangers, poissonniers...)
    // High-tech & électroménager
    '47.4',        // Équipements informatiques & électroniques (Fnac, Darty, Apple Store...)
    // Bricolage & jardinage
    '47.5',        // Équipements ménagers (Leroy Merlin, Castorama, Ikea...)
    // Textile, habillement, chaussures
    '47.7',        // Articles d'habillement, chaussures, maroquinerie (Zara, H&M, Nike...)
    // Jeux, jouets, sport, livres, musique
    '47.6',        // Livres, journaux, papeterie, jeux (Cultura, Fnac, Game...)
    // Automobile & accessoires
    '47.3',        // Carburants (stations-service)
    // Pharmacies & soins
    '47.7',        // Pharmacies, optique, parapharmacie
    // E-commerce
    '47.9',        // Vente à distance et e-commerce (Amazon, Cdiscount, Vinted...)
    // ── Commerce de gros ─────────────────────────────────────────────────────
    '46',          // Commerce de gros (agents, grossistes) — 46.11Z à 46.90Z
    // ── Automobile (vente & réparation) ──────────────────────────────────────
    '45',          // Commerce & réparation auto/moto (45.11Z à 45.40Z)
    // ── Hôtellerie & restauration (vente de service client) ──────────────────
    '55',          // Hébergement (hôtels, campings) (55.10Z à 55.90Z)
    '56',          // Restauration (restaurants, fast-food, livraison) (56.10A à 56.30Z)
    // ── Transport & logistique (lié au commerce) ──────────────────────────────
    '49.4',        // Transport routier de marchandises (49.41A/B, 49.42Z)
    '52',          // Entreposage & services auxiliaires des transports (52.10A à 52.29B)
    // ── Conseil commercial & marketing ───────────────────────────────────────
    '70.2',        // Conseil aux entreprises (développement commercial)
    '73.2',        // Études de marché & sondages (73.20Z)
  ],

  autre: [], // Pas de filtre NAF — tout afficher
}

// ─── Fonction de match par préfixe ────────────────────────────────────────────

function matchesNafPrefixes(nafCode: string, prefixes: string[]): boolean {
  if (!nafCode || prefixes.length === 0) return true
  // Normalise le code : "47.11A" -> on teste si startsWith("47.1"), "47.", "47" etc.
  const code = nafCode.trim()
  return prefixes.some(prefix => {
    const p = prefix.trim()
    // Préfixe avec point (ex: "47.1") → match exact du début
    // Préfixe sans point (ex: "47") → match la section entière
    if (p.includes('.')) {
      return code.startsWith(p)
    } else {
      // Préfixe numérique seul : "47" doit matcher "47.xxxx" mais pas "471.xxx"
      return code.startsWith(p + '.') || code === p
    }
  })
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
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)
  const containerRef          = useRef<HTMLDivElement>(null)

  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const suggestions = useMemo(() => {
    if (query.length < 2) return []
    const q = normalize(query)
    return cities.filter(c => normalize(c.city).includes(q)).slice(0, 8)
  }, [query, cities])

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
    if (value) onChange(null)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
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
  const [citiesIndex, setCitiesIndex]   = useState<CityEntry[]>([])
  const [indexLoading, setIndexLoading] = useState(true)

  const [selectedCity,           setSelectedCity]           = useState<CityEntry | null>(null)
  const [selectedContract,       setSelectedContract]       = useState('')
  const [selectedFormation,      setSelectedFormation]      = useState('')
  const [selectedArrondissement, setSelectedArrondissement] = useState('all')
  const [radius,                 setRadius]                 = useState(10)
  const [includeAllLarge,        setIncludeAllLarge]        = useState(false)

  const [companies,         setCompanies]         = useState<Company[]>([])
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([])
  const [loading,           setLoading]           = useState(false)
  const [loadError,         setLoadError]         = useState<string | null>(null)
  const [hasSearched,       setHasSearched]       = useState(false)
  const [selectedCompany,   setSelectedCompany]   = useState<Company | null>(null)
  const [currentPage,       setCurrentPage]       = useState(1)
  const [showScrollTop,     setShowScrollTop]     = useState(false)
  const [activeTab,         setActiveTab]         = useState('list')

  const resultsRef      = useRef<HTMLDivElement>(null)
  const companyCardsRef = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Chargement index villes ─────────────────────────────────────────────────
  useEffect(() => {
    fetchGz<CitiesIndex>('./data/cities_index.json.gz')
      .then(d => setCitiesIndex(d.cities))
      .catch(() => {
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

  // ── Chargement département ──────────────────────────────────────────────────
  const loadDeptData = useCallback(async (dept: string): Promise<Company[]> => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchGz<DeptData>(`./data/${dept}.json.gz`)
      setCompanies(data.companies)
      return data.companies
    } catch (err) {
      const msg = `Impossible de charger les données du département ${dept}. Vérifiez votre connexion.`
      setLoadError(msg)
      setCompanies([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Haversine ───────────────────────────────────────────────────────────────
  const haversine = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R   = 6371
    const dLa = (lat2 - lat1) * Math.PI / 180
    const dLo = (lon2 - lon1) * Math.PI / 180
    const a   = Math.sin(dLa / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }, [])

  // ── Filtres ─────────────────────────────────────────────────────────────────
  const applyFilters = useCallback((
    all: Company[],
    city: CityEntry,
    rad: number,
    formation: string,
    arrondissement: string,
    largeToo: boolean,
  ): Company[] => {
    let out = all

    // 1. Arrondissement (Paris uniquement)
    if (city.dept === '75' && arrondissement !== 'all') {
      out = out.filter(c => c.arrondissement === arrondissement || c.postal_code === arrondissement)
    }

    // 2. Rayon Haversine
    out = out.filter(c => {
      if (!c.lat || !c.lon) return false
      return haversine(city.lat, city.lon, c.lat, c.lon) <= rad
    })

    // 3. Filtre NAF par préfixes — bypassé si "hors secteur" coché
    if (!largeToo && formation && formation !== 'autre') {
      const prefixes = FORMATION_NAF_PREFIXES[formation] ?? []
      if (prefixes.length > 0) {
        out = out.filter(c => matchesNafPrefixes(c.naf_code, prefixes))
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
    const filtered = applyFilters(all, selectedCity, radius, selectedFormation, selectedArrondissement, includeAllLarge)
    setFilteredCompanies(filtered)
    setTimeout(scrollToResults, 150)
  }, [selectedCity, selectedFormation, selectedArrondissement, radius, includeAllLarge, loadDeptData, applyFilters, scrollToResults])

  // ── Re-filtre en temps réel ─────────────────────────────────────────────────
  useEffect(() => {
    if (!hasSearched || !selectedCity || companies.length === 0) return
    const filtered = applyFilters(companies, selectedCity, radius, selectedFormation, selectedArrondissement, includeAllLarge)
    setFilteredCompanies(filtered)
    setCurrentPage(1)
  }, [radius, selectedArrondissement, selectedFormation, includeAllLarge, companies, hasSearched, selectedCity, applyFilters])

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
  const totalPages     = Math.ceil(filteredCompanies.length / PAGE_SIZE)
  const paginatedItems = useMemo(() => {
    const s = (currentPage - 1) * PAGE_SIZE
    return filteredCompanies.slice(s, s + PAGE_SIZE)
  }, [filteredCompanies, currentPage])

  const rangeLabel = filteredCompanies.length === 0
    ? '0'
    : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredCompanies.length)}`

  const isFormValid = !!selectedCity && !!selectedFormation
  const selectedFormationName = FORMATIONS.find(f => f.id === selectedFormation)?.name ?? 'ce domaine'

  // ── Sous-composants ─────────────────────────────────────────────────────────
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
            <h3 className="font-semibold text-slate-900 text-sm sm:text-base truncate">
              {company.name.charAt(0).toUpperCase() + company.name.slice(1).toLowerCase()}
            </h3>
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

  const PaginationBar = ({ mobile = false }: { mobile?: boolean }) => totalPages > 1 ? (
    <div className="flex items-center justify-center gap-2 pt-4">
      <Button variant="outline" size="sm"
        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="w-4 h-4" />
        {!mobile && ' Précédent'}
      </Button>
      <span className="text-sm text-slate-600 min-w-[80px] text-center">
        {mobile ? `${currentPage}/${totalPages}` : `Page ${currentPage} / ${totalPages}`}
      </span>
      <Button variant="outline" size="sm"
        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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

              {/* Ville */}
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

            {/* Option grandes entreprises */}
            <div className="mt-3 pt-3 border-t">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={includeAllLarge}
                  onChange={e => setIncludeAllLarge(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 cursor-pointer flex-shrink-0"
                />
                <div className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 leading-none">
                    Afficher les résultats hors secteur spécialisé
                  </span>
                  {includeAllLarge ? (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200
                                    rounded-md px-3 py-2 text-xs text-amber-800">
                      <span className="flex-shrink-0 mt-0.5">⚠️</span>
                      <span>
                        Toutes les entreprises du rayon sont affichées, sans filtre de secteur.
                        Les établissements de <strong>30 salariés et plus</strong> sont susceptibles
                        d'avoir un département <strong>{selectedFormationName}</strong> en interne,
                        même si leur activité principale est différente.
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Cochez pour voir aussi les entreprises d'autres secteurs — elles ont souvent
                      un département {selectedFormationName.toLowerCase()} en interne.
                    </p>
                  )}
                </div>
              </label>
            </div>

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

            {/* Message d'erreur chargement */}
            {loadError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-800">
                <span className="flex-shrink-0">⚠️</span>
                <span>{loadError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Entreprises trouvées</h2>
              <Badge variant="secondary" className="w-fit">
                {rangeLabel} sur {filteredCompanies.length} résultat{filteredCompanies.length > 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Desktop : côte à côte */}
            <div className="hidden lg:grid lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                {filteredCompanies.length === 0 && !loadError ? (
                  <Card className="p-8 text-center">
                    <p className="text-slate-500">Aucune entreprise trouvée avec ces critères</p>
                    <p className="text-sm text-slate-400 mt-2">
                      Essayez d'augmenter le rayon, de changer la formation, ou d'activer l'option "hors secteur"
                    </p>
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
                  {filteredCompanies.length === 0 && !loadError ? (
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
