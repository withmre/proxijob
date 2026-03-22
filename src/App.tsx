import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import './App.css'
import { 
  Search, MapPin, Building2, Briefcase, GraduationCap, Target, 
  ExternalLink, Navigation, ChevronLeft, ChevronRight, ArrowUp, List, Map 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MapView } from '@/components/MapView'
import pako from 'pako'

interface Company {
  siret: string
  name: string
  naf_code: string
  naf_label: string
  address: string
  postal_code: string
  city: string
  lat: number
  lng: number
}

interface CityData {
  metadata: {
    city: string
    department: string
    count: number
  }
  companies: Company[]
}

const AVAILABLE_CITIES = [
  { id: 'paris', name: 'Paris', label: 'Paris (75)' },
  { id: 'lyon', name: 'Lyon', label: 'Lyon (69)' },
]

const CONTRACT_TYPES = [
  { id: 'stage', name: 'Stage', label: 'Stage' },
  { id: 'alternance', name: 'Alternance', label: 'Alternance' },
  { id: 'cdi', name: 'CDI', label: 'CDI' },
  { id: 'cdd', name: 'CDD', label: 'CDD' },
]

const FORMATIONS = [
  { id: 'informatique', name: 'Informatique / Développement' },
  { id: 'finance', name: 'Finance / Banque' },
  { id: 'marketing', name: 'Marketing / Communication' },
  { id: 'ingenierie', name: 'Ingénierie' },
  { id: 'rh', name: 'Ressources Humaines' },
  { id: 'commerce', name: 'Commerce / Vente' },
  { id: 'autre', name: 'Autre' },
]

// Map des codes NAF par formation
const FORMATION_NAF_CODES: Record<string, string[]> = {
  informatique: ['62.01Z', '62.02A', '62.02B', '62.03Z', '63.11Z', '63.12Z'],
  finance:      ['64.19Z', '64.20Z', '64.30Z', '65.11Z', '66.19A', '66.19B'],
  marketing:    ['73.11Z', '73.12Z', '73.20Z', '70.21Z'],
  ingenierie:   ['71.12B', '72.19Z', '28.15Z', '25.11Z', '43.21A'],
  rh:           ['78.10Z', '78.20Z', '78.30Z', '74.90B'],
  commerce:     ['46.90Z', '47.11A', '47.11B', '47.19A', '45.11Z'],
  autre:        [], // pas de filtre NAF si "Autre"
}

// Coordonnées des villes
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  paris: { lat: 48.8566, lng: 2.3522 },
  lyon: { lat: 45.7640, lng: 4.8357 },
}

// Générer les options d'arrondissements pour Paris
const PARIS_ARRONDISSEMENTS = [
  { id: 'all', label: 'Tous' },
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `750${String(i + 1).padStart(2, '0')}`,
    label: `${i + 1}${i === 0 ? 'er' : 'e'}`,
  })),
]

// Pagination
const PAGE_SIZE = 20

function App() {
  const [selectedCity, setSelectedCity] = useState<string>('')
  const [selectedContract, setSelectedContract] = useState<string>('')
  const [selectedFormation, setSelectedFormation] = useState<string>('')
  const [selectedArrondissement, setSelectedArrondissement] = useState<string>('all')
  const [radius, setRadius] = useState<number>(10)
  const [companies, setCompanies] = useState<Company[]>([])
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [activeTab, setActiveTab] = useState('list')

  // Refs pour le scroll
  const resultsRef = useRef<HTMLDivElement>(null)
  const companyCardsRef = useRef<Record<string, HTMLDivElement | null>>({})

  // Détecter le scroll pour le bouton retour en haut
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Scroll vers les résultats
  const scrollToResults = useCallback(() => {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Scroll vers une entreprise
  const scrollToCompany = useCallback((siret: string) => {
    const card = companyCardsRef.current[siret]
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [])

  // Retour en haut
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Charger les données de la ville (avec pako pour .json.gz et fallback .json)
  const loadCityData = useCallback(async (cityId: string): Promise<Company[]> => {
    setLoading(true)
    try {
      let response: Response
      let data: CityData

      // Essayer .json.gz d'abord
      try {
        response = await fetch(`/data/${cityId}.json.gz`)
        if (!response.ok) throw new Error('Gzip not found')
        const buffer = await response.arrayBuffer()
        const decompressed = pako.inflate(new Uint8Array(buffer), { to: 'string' })
        data = JSON.parse(decompressed)
      } catch {
        // Fallback vers .json
        response = await fetch(`/data/${cityId}.json`)
        data = await response.json()
      }

      setCompanies(data.companies)
      return data.companies
    } catch (error) {
      console.error('Erreur chargement données:', error)
      setCompanies([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // Calcul de distance Haversine
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }, [])

  // Filtrer les entreprises par rayon
  const filterByRadius = useCallback((companies: Company[], center: { lat: number; lng: number }, radiusKm: number) => {
    return companies.filter((company) => {
      const distance = calculateDistance(center.lat, center.lng, company.lat, company.lng)
      return distance <= radiusKm
    })
  }, [calculateDistance])

  // Filtrer par arrondissement (Paris uniquement)
  const filterByArrondissement = useCallback((companies: Company[], arrondissement: string) => {
    if (arrondissement === 'all') return companies
    return companies.filter((company) => company.postal_code === arrondissement)
  }, [])

  // Filtrer par formation (codes NAF)
  const filterByFormation = useCallback((companies: Company[], formation: string) => {
    if (formation === 'autre' || !formation) return companies
    const nafCodes = FORMATION_NAF_CODES[formation]
    if (!nafCodes || nafCodes.length === 0) return companies
    return companies.filter((company) => nafCodes.includes(company.naf_code))
  }, [])

  // Ouvrir Google Maps pour une entreprise (useCallback pour éviter les re-renders)
  const openGoogleMaps = useCallback((company: Company) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${company.lat},${company.lng}`
    window.open(url, '_blank')
  }, [])

  // Rechercher des offres d'emploi pour une entreprise (useCallback)
  const searchJobs = useCallback((company: Company) => {
    const contractType = CONTRACT_TYPES.find(c => c.id === selectedContract)?.name || ''
    const formation = FORMATIONS.find(f => f.id === selectedFormation)?.name || ''
    const query = `${company.name} ${contractType} ${formation}`.trim()
    const url = `https://www.google.com/search?q=${encodeURIComponent(query + ' recrutement')}`
    window.open(url, '_blank')
  }, [selectedContract, selectedFormation])

  // Sélectionner une entreprise avec scroll
  const handleSelectCompany = useCallback((company: Company) => {
    setSelectedCompany(company)
    scrollToCompany(company.siret)
  }, [scrollToCompany])

  // Pagination
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredCompanies.slice(start, start + PAGE_SIZE)
  }, [filteredCompanies, currentPage])

  const totalPages = useMemo(() => 
    Math.ceil(filteredCompanies.length / PAGE_SIZE)
  , [filteredCompanies])

  const paginationInfo = useMemo(() => {
    const start = filteredCompanies.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
    const end = Math.min(currentPage * PAGE_SIZE, filteredCompanies.length)
    return { start, end }
  }, [filteredCompanies, currentPage])

  // Lancer la recherche
  const handleSearch = useCallback(async () => {
    if (!selectedCity || !selectedFormation) return
    
    setHasSearched(true)
    setSelectedCompany(null)
    setCurrentPage(1)
    
    const loadedCompanies = await loadCityData(selectedCity)
    
    let filtered = [...loadedCompanies]

    // 1. Filtre par arrondissement (si Paris)
    if (selectedCity === 'paris' && selectedArrondissement !== 'all') {
      filtered = filterByArrondissement(filtered, selectedArrondissement)
    }

    // 2. Filtre par rayon
    const cityCenter = CITY_COORDINATES[selectedCity]
    if (cityCenter) {
      filtered = filterByRadius(filtered, cityCenter, radius)
    }

    // 3. Filtre par formation (NAF)
    if (selectedFormation && selectedFormation !== 'autre') {
      filtered = filterByFormation(filtered, selectedFormation)
    }

    setFilteredCompanies(filtered)
    
    // Scroll vers les résultats après un court délai
    setTimeout(scrollToResults, 100)
  }, [selectedCity, selectedFormation, selectedArrondissement, radius, loadCityData, filterByArrondissement, filterByRadius, filterByFormation, scrollToResults])

  // Mettre à jour les filtres quand les critères changent (après une recherche)
  useEffect(() => {
    if (hasSearched && companies.length > 0) {
      let filtered = [...companies]

      if (selectedCity === 'paris' && selectedArrondissement !== 'all') {
        filtered = filterByArrondissement(filtered, selectedArrondissement)
      }

      const cityCenter = CITY_COORDINATES[selectedCity]
      if (cityCenter) {
        filtered = filterByRadius(filtered, cityCenter, radius)
      }

      if (selectedFormation && selectedFormation !== 'autre') {
        filtered = filterByFormation(filtered, selectedFormation)
      }

      setFilteredCompanies(filtered)
      setCurrentPage(1)
    }
  }, [radius, selectedArrondissement, selectedFormation, companies, hasSearched, selectedCity, filterByArrondissement, filterByRadius, filterByFormation])

  // Réinitialiser l'arrondissement quand on change de ville
  const handleCityChange = useCallback((value: string) => {
    setSelectedCity(value)
    setSelectedArrondissement('all')
  }, [])

  // Vérifier si le formulaire est valide
  const isFormValid = selectedCity && selectedFormation

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
              <p className="hidden sm:block text-sm text-slate-500">Trouvez les entreprises qui recrutent près de chez vous</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {/* Formulaire de recherche */}
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
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  Votre formation *
                </label>
                <Select value={selectedFormation} onValueChange={setSelectedFormation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez..." />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATIONS.map((formation) => (
                      <SelectItem key={formation.id} value={formation.id}>
                        {formation.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Badge d'état pour la formation */}
                {!selectedFormation && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                    Requis pour filtrer par secteur
                  </Badge>
                )}
                {selectedFormation === 'autre' && (
                  <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">
                    Tous les secteurs — aucun filtre NAF appliqué
                  </Badge>
                )}
              </div>

              {/* Type de contrat */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Type de contrat
                </label>
                <Select value={selectedContract} onValueChange={setSelectedContract}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ville */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Ville *
                </label>
                <Select value={selectedCity} onValueChange={handleCityChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_CITIES.map((city) => (
                      <SelectItem key={city.id} value={city.id}>
                        {city.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rayon */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Navigation className="w-4 h-4" />
                  Rayon : {radius} km
                </label>
                <Slider
                  value={[radius]}
                  onValueChange={(value) => setRadius(value[0])}
                  min={1}
                  max={50}
                  step={1}
                  className="py-2 touch-none"
                />
              </div>
            </div>

            {/* Arrondissement Paris */}
            {selectedCity === 'paris' && (
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
                <div className="max-w-xs">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4" />
                    Arrondissement
                  </label>
                  <Select value={selectedArrondissement} onValueChange={setSelectedArrondissement}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tous les arrondissements" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARIS_ARRONDISSEMENTS.map((arr) => (
                        <SelectItem key={arr.id} value={arr.id}>
                          {arr.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Button 
              onClick={handleSearch}
              className="w-full mt-4 sm:mt-6 bg-blue-600 hover:bg-blue-700"
              size="lg"
              disabled={!isFormValid || loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Chargement...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Rechercher les entreprises
                </span>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Résultats */}
        {hasSearched && (
          <div ref={resultsRef} className="space-y-4">
            {/* Header des résultats */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Entreprises trouvées
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">
                  {paginationInfo.start}-{paginationInfo.end} sur {filteredCompanies.length}
                </Badge>
              </div>
            </div>

            {/* Desktop: Layout côte à côte */}
            <div className="hidden lg:grid lg:grid-cols-2 gap-6">
              {/* Liste des entreprises */}
              <div className="space-y-3">
                {filteredCompanies.length === 0 ? (
                  <Card className="p-8 text-center">
                    <p className="text-slate-500">Aucune entreprise trouvée avec ces critères</p>
                    <p className="text-sm text-slate-400 mt-2">Essayez d'élargir votre recherche</p>
                  </Card>
                ) : (
                  <>
                    <div className="space-y-3">
                      {paginatedCompanies.map((company) => (
                        <Card 
                          key={company.siret}
                          ref={(el) => {
                            if (el) companyCardsRef.current[company.siret] = el
                          }}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            selectedCompany?.siret === company.siret ? 'ring-2 ring-blue-500' : ''
                          }`}
                          onClick={() => handleSelectCompany(company)}
                        >
                          <CardContent className="p-3 sm:p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-slate-900 text-sm sm:text-base truncate">{company.name}</h3>
                                <p className="text-xs sm:text-sm text-slate-500 mt-1">{company.naf_label}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs sm:text-sm text-slate-600">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{company.address}, {company.postal_code}</span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 flex-shrink-0">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="text-xs px-2 py-1 h-auto"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openGoogleMaps(company)
                                  }}
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  Voir
                                </Button>
                                <Button 
                                  size="sm"
                                  className="text-xs px-2 py-1 h-auto"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    searchJobs(company)
                                  }}
                                >
                                  <Search className="w-3 h-3 mr-1" />
                                  Postuler
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 pt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="w-4 h-4 mr-1" />
                          Précédent
                        </Button>
                        <span className="text-sm text-slate-600">
                          Page {currentPage} / {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Suivant
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Carte Leaflet - sticky */}
              <div className="lg:sticky lg:top-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Carte</h2>
                <Card className="overflow-hidden h-[calc(100vh-200px)] min-h-[500px]">
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

            {/* Mobile & Tablette: Onglets */}
            <div className="lg:hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="list" className="flex items-center gap-2">
                    <List className="w-4 h-4" />
                    Liste
                  </TabsTrigger>
                  <TabsTrigger value="map" className="flex items-center gap-2">
                    <Map className="w-4 h-4" />
                    Carte
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-3">
                  {filteredCompanies.length === 0 ? (
                    <Card className="p-8 text-center">
                      <p className="text-slate-500">Aucune entreprise trouvée avec ces critères</p>
                      <p className="text-sm text-slate-400 mt-2">Essayez d'élargir votre recherche</p>
                    </Card>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {paginatedCompanies.map((company) => (
                          <Card 
                            key={company.siret}
                            ref={(el) => {
                              if (el) companyCardsRef.current[company.siret] = el
                            }}
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              selectedCompany?.siret === company.siret ? 'ring-2 ring-blue-500' : ''
                            }`}
                            onClick={() => handleSelectCompany(company)}
                          >
                            <CardContent className="p-3">
                              <h3 className="font-semibold text-slate-900 text-sm">{company.name}</h3>
                              <p className="text-xs text-slate-500 mt-1">{company.naf_label}</p>
                              <p className="text-xs text-slate-600 mt-1">{company.address}</p>
                              <div className="flex flex-col gap-2 mt-3">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openGoogleMaps(company)
                                  }}
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  Voir sur Google Maps
                                </Button>
                                <Button 
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    searchJobs(company)
                                  }}
                                >
                                  <Search className="w-3 h-3 mr-1" />
                                  Postuler
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Pagination mobile */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm text-slate-600">
                            {currentPage} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
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
              Renseignez vos critères ci-dessus pour découvrir les entreprises qui recrutent 
              dans votre domaine et à proximité de chez vous.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 text-sm text-slate-500 px-4">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span>Entreprises de +30 salariés</span>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <span>Recherche géolocalisée</span>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                <span>Ciblage par secteur</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
          <p className="text-center text-xs sm:text-sm text-slate-500">
            ProxiJob - Données : INSEE Sirene (entreprises de +30 salariés)
          </p>
        </div>
      </footer>

      {/* Bouton retour en haut */}
      {showScrollTop && (
        <Button
          onClick={scrollToTop}
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
