'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Layers, X, ChevronDown, ChevronUp } from 'lucide-react';
import DraggableLegend from './DraggableLegend'

// Dynamic import for Leaflet to avoid SSR issues
let L;

// Main Map Component
const MapComponent = () => {
    const mapContainerRef = useRef(null);
    const [map, setMap] = useState(null);
    const [layersData, setLayersData] = useState({});
    const [activeLayers, setActiveLayers] = useState({});
    const [showLegend, setShowLegend] = useState(true);
    const [expandedSections, setExpandedSections] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [layerSymbology, setLayerSymbology] = useState({});
    const [currentMapView, setCurrentMapView] = useState('light');
    const baseMapLayerRef = useRef(null);
    const [originalLayerData, setOriginalLayerData] = useState({});

    const [layerColors, setLayerColors] = useState({
        'parcels': '#3B82F6', // Blue
        'transit': '#EF4444'   // Red
    });
    const layersRef = useRef({});

    // Initialize Leaflet and map with performance optimizations
    useEffect(() => {
        const initializeMap = async () => {
            if (!mapContainerRef.current || map) return;

            try {
                await new Promise(resolve => setTimeout(resolve, 100));

                const leaflet = await import('leaflet');
                L = leaflet.default || leaflet;

                if (!mapContainerRef.current) {
                    throw new Error('Map container not found');
                }

                const container = mapContainerRef.current;
                if (container.style.height === '' || container.style.height === '0px') {
                    container.style.height = '100%';
                    container.style.width = '100%';
                }

                // Fix for default markers in Next.js
                if (L.Icon && L.Icon.Default) {
                    delete L.Icon.Default.prototype._getIconUrl;
                    L.Icon.Default.mergeOptions({
                        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
                        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                    });
                }

                // Create map with performance optimizations
                const leafletMap = L.map(container, {
                    zoomControl: true,
                    attributionControl: true,
                    minZoom: 2,
                    maxZoom: 18,
                    preferCanvas: true,
                    zoomAnimation: true,
                    fadeAnimation: true,
                    markerZoomAnimation: true
                });

                leafletMap.setView([49.2627, -123.0382], 13);

                const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 19
                });

                tileLayer.addTo(leafletMap);
                baseMapLayerRef.current = tileLayer;
                setMap(leafletMap);

                return () => {
                    if (leafletMap) {
                        leafletMap.remove();
                    }
                };
            } catch (error) {
                console.error('Error initializing map:', error);
                setError(`Failed to initialize map: ${error.message}`);
            }
        };

        const timer = setTimeout(initializeMap, 200);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (map && L) {
            L.Icon.Default.imagePath = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/';

            map.options.renderer = L.canvas({
                padding: 0.5,
                tolerance: 10
            });
        }
    }, [map]);

    const loadGeoJSONFile = useCallback(async (filename, layerName) => {
        try {
            const response = await fetch(`/${filename}`);
            if (!response.ok) {
                throw new Error(`Failed to load ${filename}: ${response.status}`);
            }
            const data = await response.json();
            return { layerName, data };
        } catch (error) {
            console.error(`Error loading ${filename}:`, error);
            return { layerName, data: getSampleData(layerName) };
        }
    }, []);

    const getSampleData = (layerName) => {
        if (layerName === 'parcels') {
            return {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "civic_number": "3106",
                            "streetname": "E 8TH AV",
                            "FSR": 4.4
                        },
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[
                                [-123.038760, 49.262509],
                                [-123.038757, 49.262844],
                                [-123.038895, 49.262844],
                                [-123.038898, 49.262510],
                                [-123.038760, 49.262509]
                            ]]
                        }
                    }
                ]
            };
        } else {
            return {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "station": "King Edward",
                            "geo_local_area": "Riley Park"
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [-123.115336, 49.249123]
                        }
                    }
                ]
            };
        }
    };

    const createPopupContent = useCallback((feature, layerName) => {
        const props = feature.properties || {};
        let content = `<div class="p-2 max-w-xs">`;
        content += `<h3 class="text-sm font-semibold text-gray-800 mb-2 capitalize">${layerName}</h3>`;

        Object.entries(props).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                content += `<p class="text-xs text-gray-600"><strong>${displayKey}:</strong> ${value}</p>`;
            }
        });

        content += `</div>`;
        return content;
    }, []);

    // Memoized layer style function
    const getLayerStyle = useMemo(() => {
        return (feature, layerName) => {
            const symbology = layerSymbology[layerName];
            let color = layerColors[layerName] || '#008080';

            if (symbology) {
                if (symbology.type === 'single') {
                    color = symbology.color;
                } else if (symbology.type === 'categorical' && symbology.field) {
                    const fieldValue = feature.properties?.[symbology.field];
                    if (fieldValue && symbology.valueColors?.[fieldValue]) {
                        color = symbology.valueColors[fieldValue];
                    }
                }
            }

            const geomType = feature.geometry.type;

            const basePolygonStyle = {
                fillColor: color,
                weight: 2,
                opacity: 1,
                color: color,
                fillOpacity: 0.3
            };

            const baseLineStyle = {
                color: color,
                weight: 3,
                opacity: 0.8
            };

            const basePointStyle = {
                radius: 6,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            };

            switch (geomType) {
                case 'Polygon':
                case 'MultiPolygon':
                    return basePolygonStyle;
                case 'LineString':
                case 'MultiLineString':
                    return baseLineStyle;
                default:
                    return basePointStyle;
            }
        };
    }, [layerSymbology, layerColors]);

    const updateLayerStyles = useCallback((layerName) => {
        const layer = layersRef.current[layerName];
        if (!layer || !map) return;

        layer.eachLayer((featureLayer) => {
            const feature = featureLayer.feature;
            if (feature) {
                const newStyle = getLayerStyle(feature, layerName);

                if (featureLayer.setStyle) {
                    featureLayer.setStyle(newStyle);
                } else if (featureLayer.setRadius) {
                    // For CircleMarkers
                    featureLayer.setStyle(newStyle);
                    featureLayer.setRadius(newStyle.radius || 6);
                }
            }
        });
    }, [getLayerStyle, map]);

    const debouncedUpdateStyles = useMemo(() => {
        const debounce = (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        };

        return debounce(updateLayerStyles, 150);
    }, [updateLayerStyles]);

    useEffect(() => {
        const changedLayers = Object.keys(layerSymbology);
        changedLayers.forEach(layerName => {
            debouncedUpdateStyles(layerName);
        });
    }, [layerSymbology, debouncedUpdateStyles]);

    useEffect(() => {
        if (!map || !L) return;

        const loadData = async () => {
            try {
                setIsLoading(true);

                const promises = [
                    loadGeoJSONFile('parcels-data.geojson', 'parcels'),
                    loadGeoJSONFile('transit-data.geojson', 'transit')
                ];

                const results = await Promise.all(promises);
                const newLayersData = {};
                const newActiveLayers = {};

                results.forEach(({ layerName, data }) => {
                    if (!data?.features?.length) {
                        console.warn(`No features found for layer: ${layerName}`);
                        return;
                    }

                    // Store original data
                    setOriginalLayerData(prev => ({
                        ...prev,
                        [layerName]: data
                    }));


                    const geoJsonLayer = L.geoJSON(data, {
                        style: (feature) => getLayerStyle(feature, layerName),
                        pointToLayer: (feature, latlng) => {
                            return L.circleMarker(latlng, getLayerStyle(feature, layerName));
                        },
                        onEachFeature: (feature, layer) => {

                            layer.on('click', (e) => {
                                L.DomEvent.stopPropagation(e);
                                if (!layer.getPopup()) {
                                    const popupContent = createPopupContent(feature, layerName);
                                    layer.bindPopup(popupContent, {
                                        className: 'custom-popup',
                                        maxWidth: 300
                                    });
                                }
                                layer.openPopup();
                            });
                        },

                    });

                    geoJsonLayer.addTo(map);
                    layersRef.current[layerName] = geoJsonLayer;

                    const geometryTypes = [...new Set(data.features.map(f => f.geometry.type))];
                    const geometryType = geometryTypes.length === 1 ? geometryTypes[0] : 'Mixed';

                    newLayersData[layerName] = {
                        layer: geoJsonLayer,
                        color: layerColors[layerName],
                        featureCount: data.features.length,
                        geometryType,
                        visible: true
                    };

                    newActiveLayers[layerName] = true;
                });

                setLayersData(newLayersData);
                setActiveLayers(newActiveLayers);


                requestAnimationFrame(() => {
                    const group = L.featureGroup(Object.values(layersRef.current));
                    if (group.getBounds().isValid()) {
                        map.fitBounds(group.getBounds(), {
                            padding: [20, 20],
                            maxZoom: 11
                        });
                    }
                });

            } catch (error) {
                console.error('Error loading data:', error);
                setError('Failed to load map data');
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [map, loadGeoJSONFile]);

    const toggleLayer = useCallback((layerName) => {
        const layerInfo = layersData[layerName];
        if (!layerInfo?.layer || !map) return;

        const isCurrentlyActive = activeLayers[layerName];

        requestAnimationFrame(() => {
            if (isCurrentlyActive) {
                map.removeLayer(layerInfo.layer);
            } else {
                map.addLayer(layerInfo.layer);
            }

            setActiveLayers(prev => ({
                ...prev,
                [layerName]: !isCurrentlyActive
            }));
        });
    }, [layersData, activeLayers, map]);

    const toggleSection = (sectionId) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionId]: !prev[sectionId]
        }));
    };

    const handleMapViewChange = (viewType) => {
        if (!map) return;

        // Remove old base layer
        if (baseMapLayerRef.current && map.hasLayer(baseMapLayerRef.current)) {
            map.removeLayer(baseMapLayerRef.current);
        }

        const mapStyles = {
            light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            satellite: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=AIzaSyBocqp5I8RvugNh7-V6YzXdUEhRUO6FZ4s',
            googlemaps: 'https://mt1.google.com/vt/lyrs=r&style=feature:all|element:geometry|color:0x212121&style=feature:all|element:labels|visibility:off&x={x}&y={y}&z={z}&key=AIzaSyBocqp5I8RvugNh7-V6YzXdUEhRUO6FZ4s',
        };

        const attributions = {
            light: '&copy; OSM & CARTO',
            dark: '&copy; OSM & CARTO',
            satellite: '&copy; Esri',
            googlemaps: '&copy; OSM & CARTO',
        };

        const newLayer = L.tileLayer(mapStyles[viewType], {
            attribution: attributions[viewType],
            subdomains: 'abcd',
            maxZoom: 19,
        });

        newLayer.addTo(map);
        baseMapLayerRef.current = newLayer;
        setCurrentMapView(viewType);
    };

    // Toggle base map visibility
    const toggleBaseMap = (visible) => {
        if (baseMapLayerRef.current && map) {
            if (visible) {
                map.addLayer(baseMapLayerRef.current);
            } else {
                map.removeLayer(baseMapLayerRef.current);
            }
        }
    };

    if (error) {
        return (
            <div className="w-full h-screen flex items-center justify-center bg-gray-100">
                <div className="text-center">
                    <div className="text-red-500 text-lg font-semibold mb-2">Map Error</div>
                    <div className="text-gray-600">{error}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-screen relative bg-gray-100">
            {/* Loading indicator */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-50">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
                        <div className="text-sm text-gray-600">Loading map...</div>
                    </div>
                </div>
            )}

            {/* Map container */}
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Legend toggle button */}
            {!showLegend && (
                <button
                    onClick={() => setShowLegend(true)}
                    className="absolute bottom-6 left-6 bg-white border border-gray-200 rounded-lg shadow-lg p-3 hover:bg-gray-50 transition-colors z-[999]"
                    title="Show Legend"
                >
                    <Layers className="text-teal-600" size={20} />
                </button>
            )}

            <DraggableLegend
                showLegend={showLegend}
                setShowLegend={setShowLegend}
                activeLayers={activeLayers}
                toggleLayer={toggleLayer}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                layerColors={layerColors}
                setLayerColors={setLayerColors}
                layersData={layersData}
                currentMapView={currentMapView}
                handleMapViewChange={handleMapViewChange}
                toggleBaseMap={toggleBaseMap}
                mapContainerRef={mapContainerRef}
                layerSymbology={layerSymbology}
                setLayerSymbology={setLayerSymbology}
            />
        </div>
    );
};

export default MapComponent;