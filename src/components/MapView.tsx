import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
}

interface MapViewProps {
  companies: Company[]
  selectedCompany: Company | null
  onSelectCompany: (company: Company) => void
  onOpenGoogleMaps: (company: Company) => void
  onSearchJobs: (company: Company) => void
}

// Icône personnalisée pour les marqueurs
const createMarkerIcon = (isSelected: boolean = false) => {
  const size = isSelected ? 40 : 32
  const borderWidth = isSelected ? 4 : 3
  const iconSize = isSelected ? 20 : 16
  
  return L.divIcon({
    className: isSelected ? 'custom-marker-selected' : 'custom-marker',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background: ${isSelected ? '#dc2626' : '#2563eb'};
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: ${borderWidth}px solid white;
      box-shadow: 0 ${isSelected ? '3px 10px' : '2px 6px'} rgba(0,0,0,${isSelected ? '0.4' : '0.3'});
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

export function MapView({ 
  companies, 
  selectedCompany, 
  onSelectCompany,
  onOpenGoogleMaps,
  onSearchJobs 
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map())

  // Initialiser la carte (une seule fois)
  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [48.8566, 2.3522],
      zoom: 13,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markersMapRef.current.clear()
    }
  }, [])

  // Créer les marqueurs quand les entreprises changent
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Supprimer les anciens marqueurs
    markersMapRef.current.forEach(marker => marker.remove())
    markersMapRef.current.clear()

    if (companies.length === 0) {
      map.setView([48.8566, 2.3522], 13)
      return
    }

    const bounds = L.latLngBounds([])
    
    companies.forEach(company => {
      const marker = L.marker([company.lat, company.lon], {
        icon: createMarkerIcon(false),
      })

      // Créer le popup
      const popupContent = document.createElement('div')
      popupContent.className = 'p-2 min-w-[200px] sm:min-w-[240px]'
      popupContent.innerHTML = `
        <h3 class="font-semibold text-slate-900 mb-1 text-sm sm:text-base">${company.name}</h3>
        <p class="text-xs sm:text-sm text-slate-500 mb-3">${company.address}</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <button id="btn-maps-${company.siret}" class="flex-1 px-3 py-1.5 text-xs sm:text-sm border border-slate-300 rounded hover:bg-slate-50 transition-colors">
            📍 Maps
          </button>
          <button id="btn-postuler-${company.siret}" class="flex-1 px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            🚀 Postuler
          </button>
        </div>
      `

      marker.bindPopup(popupContent)

      // Gestion du clic sur le marqueur
      marker.on('click', () => {
        onSelectCompany(company)
      })

      // Gestion des boutons du popup
      marker.on('popupopen', () => {
        const btnMaps = document.getElementById(`btn-maps-${company.siret}`)
        const btnPostuler = document.getElementById(`btn-postuler-${company.siret}`)
        
        btnMaps?.addEventListener('click', (e) => {
          e.stopPropagation()
          onOpenGoogleMaps(company)
        })
        
        btnPostuler?.addEventListener('click', (e) => {
          e.stopPropagation()
          onSearchJobs(company)
        })
      })

      marker.addTo(map)
      markersMapRef.current.set(company.siret, marker)
      bounds.extend([company.lat, company.lon])
    })

    // Ajuster la vue pour englober tous les marqueurs
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
    }
  }, [companies]) // Dépendances minimales - pas de selectedCompany ici

  // Mettre en évidence le marqueur sélectionné (sans recréer les marqueurs)
  useEffect(() => {
    if (!selectedCompany) {
      // Réinitialiser tous les marqueurs à l'icône normale
      markersMapRef.current.forEach(marker => {
        marker.setIcon(createMarkerIcon(false))
      })
      return
    }

    const selectedMarker = markersMapRef.current.get(selectedCompany.siret)
    
    // Réinitialiser tous les marqueurs
    markersMapRef.current.forEach((marker, siret) => {
      marker.setIcon(createMarkerIcon(siret === selectedCompany.siret))
    })

    // Ouvrir le popup du marqueur sélectionné
    if (selectedMarker) {
      selectedMarker.openPopup()
    }
  }, [selectedCompany])

  return (
    <div 
      ref={mapContainerRef} 
      className="w-full h-full min-h-[300px] sm:min-h-[400px] lg:min-h-[500px] rounded-lg"
      style={{ zIndex: 1 }}
    />
  )
}
