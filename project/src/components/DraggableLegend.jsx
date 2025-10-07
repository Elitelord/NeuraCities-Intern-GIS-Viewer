'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Layers, X, ChevronDown, ChevronUp } from 'lucide-react';
import HexColorPickerPortal from './HexColorPickerPortal.jsx';

const DraggableLegend = ({
    showLegend,
    setShowLegend,
    activeLayers,
    toggleLayer,
    expandedSections,
    toggleSection,
    layerColors,
    setLayerColors,
    layersData,
    currentMapView,
    handleMapViewChange,
    toggleBaseMap,
    mapContainerRef,
    layerSymbology,
    setLayerSymbology
}) => {
    const [layerOrder, setLayerOrder] = useState([]);
    const [baseMapVisible, setBaseMapVisible] = useState(true);
    const [legendPosition, setLegendPosition] = useState({ bottom: 20, left: 20 });
    const [isDraggingLegend, setIsDraggingLegend] = useState(false);
    const legendRef = useRef(null);
    const dragStartPosition = useRef({ x: 0, y: 0 });
    const [pickerPosition, setPickerPosition] = useState(null);
    const [pickerTarget, setPickerTarget] = useState(null);
    const [pickerLayerData, setPickerLayerData] = useState(null);

    useEffect(() => {
        if (layersData && Object.keys(layersData).length > 0) {
            const layerIds = Object.keys(layersData);
            if (JSON.stringify(layerIds) !== JSON.stringify(layerOrder)) {
                setLayerOrder(layerIds);
            }
        }
    }, [layersData, layerOrder]);

    const handleColorBoxClick = (e, layerId) => {
        e.preventDefault();
        e.stopPropagation();

        const layer = layersData[layerId]?.layer;
        let layerGeoJsonData = null;

        if (layer && layer.toGeoJSON) {
            layerGeoJsonData = layer.toGeoJSON();
        }

        if (pickerTarget === layerId) {
            setPickerTarget(null);
            setPickerPosition(null);
            setPickerLayerData(null);
            return;
        }

        if (!mapContainerRef?.current) {
            return;
        }

        const mapRect = mapContainerRef.current.getBoundingClientRect();
        const centerX = mapRect.left + mapRect.width / 2;
        const centerY = mapRect.top + mapRect.height / 2;

        const newPosition = {
            top: centerY - 200,
            left: centerX - 150
        };

        setTimeout(() => {
            setPickerTarget(layerId);
            setPickerPosition(newPosition);
            setPickerLayerData(layerGeoJsonData);
        }, 0);
    };

    const handleLegendDragStart = (e) => {
        setIsDraggingLegend(true);

        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        dragStartPosition.current = {
            x: clientX,
            y: clientY,
            initialLeft: legendPosition.left,
            initialBottom: legendPosition.bottom
        };

        document.addEventListener('mousemove', handleLegendDragMove);
        document.addEventListener('mouseup', handleLegendDragEnd);
        document.addEventListener('touchmove', handleLegendDragMove, { passive: false });
        document.addEventListener('touchend', handleLegendDragEnd);

        e.preventDefault();
    };

    const handleLegendDragMove = useCallback((e) => {
        if (!isDraggingLegend || !mapContainerRef.current || !legendRef.current) return;

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        const containerRect = mapContainerRef.current.getBoundingClientRect();
        const legendRect = legendRef.current.getBoundingClientRect();

        const dx = clientX - dragStartPosition.current.x;
        const dy = clientY - dragStartPosition.current.y;

        let newLeft = dragStartPosition.current.initialLeft + dx;
        let newBottom = dragStartPosition.current.initialBottom - dy;

        newLeft = Math.max(4, newLeft);
        newBottom = Math.max(4, newBottom);

        const legendHeight = legendRect.height;
        const containerHeight = containerRect.height;
        const maxBottom = containerHeight - legendHeight - 4;
        newBottom = Math.min(newBottom, maxBottom);

        const legendWidth = legendRect.width;
        const containerWidth = containerRect.width;
        const maxLeft = containerWidth - legendWidth - 4;
        newLeft = Math.min(newLeft, maxLeft);

        setLegendPosition({ left: newLeft, bottom: newBottom });
        e.preventDefault();
    }, [isDraggingLegend, mapContainerRef]);

    const handleLegendDragEnd = useCallback(() => {
        setIsDraggingLegend(false);

        document.removeEventListener('mousemove', handleLegendDragMove);
        document.removeEventListener('mouseup', handleLegendDragEnd);
        document.removeEventListener('touchmove', handleLegendDragMove);
        document.removeEventListener('touchend', handleLegendDragEnd);
    }, [handleLegendDragMove]);

    const mapStyles = [
        { id: 'light', name: 'Light' },
        { id: 'dark', name: 'Dark' },
        { id: 'satellite', name: 'Satellite' },
        { id: 'googlemaps', name: 'Google Maps' }
    ];

    if (!showLegend) return null;

    return (
        <div
            ref={legendRef}
            className="absolute w-[280px] bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-[1000] overflow-y-auto max-h-[70vh]"
            style={{
                bottom: `${legendPosition.bottom}px`,
                left: `${legendPosition.left}px`
            }}
        >

            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-gray-800 flex items-center">
                    <Layers className="mr-2 text-teal-600" size={18} />
                    Legend
                </h3>
                <button
                    onClick={() => setShowLegend(false)}
                    className="text-gray-400 hover:text-gray-600 p-2 -m-2"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="space-y-4">
                {/* Dynamic layers from layersData */}
                {layerOrder.map((layerId) => {
                    const layerInfo = layersData[layerId];
                    if (!layerInfo) return null;

                    return (
                        <div
                            key={layerId}
                            className="border-t border-gray-200 pt-3 first:border-none first:pt-0"
                        >
                            <div className="flex justify-between items-center">
                                <label className="flex items-center space-x-2 text-sm font-medium text-gray-800">
                                    <input
                                        type="checkbox"
                                        checked={activeLayers[layerId]}
                                        onChange={() => toggleLayer(layerId)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="cursor-pointer"
                                    />
                                    <span className="text-sm font-medium text-gray-800 break-words capitalize">
                                        {layerId.replace('-', ' ')}
                                    </span>
                                </label>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSection(layerId);
                                    }}
                                    className="text-gray-500 hover:text-gray-700"
                                >
                                    {expandedSections[layerId] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                            </div>

                            {expandedSections[layerId] && (
                                <div className="mt-2 pl-6 text-xs space-y-2">
                                    <div className="space-y-2">
                                        {(() => {
                                            const symbology = layerSymbology?.[layerId];

                                            if (symbology?.type === 'categorical') {
                                                return (
                                                    <div className="space-y-1">
                                                        <div className="text-xs font-medium text-gray-600 mb-2">Categorical Legend:</div>
                                                        <div className="max-h-20 overflow-y-auto space-y-1 pr-1">
                                                            {Object.entries(symbology.valueColors).map(([value, color]) => (
                                                                <div
                                                                    key={value}
                                                                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                                                                    onClick={(e) => handleColorBoxClick(e, layerId)}
                                                                    title="Click to edit symbology"
                                                                >
                                                                    <div
                                                                        className="w-4 h-4 border rounded flex-shrink-0 hover:border-2 hover:border-gray-400"
                                                                        style={{ backgroundColor: color }}
                                                                    />
                                                                    <span className="text-xs text-gray-700 truncate">{value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            } else {
                                                return (
                                                    <div
                                                        className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                                                        onClick={(e) => handleColorBoxClick(e, layerId)}
                                                        title="Click to edit symbology"
                                                    >
                                                        <div
                                                            className="w-8 h-6 border rounded hover:border-2 hover:border-gray-400"
                                                            style={{
                                                                backgroundColor: layerColors[layerId] || layerInfo.color,
                                                                minWidth: '32px',
                                                                minHeight: '24px'
                                                            }}
                                                        />
                                                        <span className="text-xs text-gray-600">Single Color</span>
                                                    </div>
                                                );
                                            }
                                        })()}
                                    </div>

                                    <div className="text-xs text-gray-500">
                                        Features: {layerInfo.featureCount || 0}
                                    </div>

                                    <div className="text-xs text-gray-500">
                                        Type: {layerInfo.geometryType || 'Mixed'}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="border-t border-gray-200 pt-3 mb-4">
                    <div className="flex justify-between items-center">
                        <label className="flex items-center space-x-2 text-sm font-medium text-gray-800">
                            <input
                                type="checkbox"
                                checked={baseMapVisible}
                                onChange={() => {
                                    const newState = !baseMapVisible;
                                    setBaseMapVisible(newState);
                                    toggleBaseMap(newState);
                                }}
                                className="cursor-pointer"
                            />
                            <span>Base Map</span>
                        </label>
                        <button
                            onClick={() => toggleSection('baseMap')}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            {expandedSections['baseMap'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    </div>

                    {expandedSections['baseMap'] && (
                        <div className="mt-2 pl-6 text-xs space-y-2">
                            <div className="grid grid-cols-2 gap-2 mt-2 px-1">
                                {mapStyles.map(style => (
                                    <button
                                        key={style.id}
                                        onClick={() => handleMapViewChange(style.id)}
                                        className={`h-10 w-full flex items-center justify-center text-xs rounded px-2 ${currentMapView === style.id
                                                ? 'bg-teal-600 text-white font-medium'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        {style.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {pickerTarget && pickerPosition && (
                <HexColorPickerPortal
                    color={layersData[pickerTarget]?.color || layerColors[pickerTarget] || '#008080'}
                    position={pickerPosition}
                    layerData={pickerLayerData}
                    onSymbologyChange={(symbology) => {
                        setLayerSymbology(prev => ({
                            ...prev,
                            [pickerTarget]: symbology
                        }));

                        if (symbology.type === 'single') {
                            setLayerColors(prev => ({
                                ...prev,
                                [pickerTarget]: symbology.color
                            }));
                        }
                    }}
                    pickerTarget={pickerTarget}
                    onChange={(hex) => {
                        setLayerColors((prev) => ({
                            ...prev,
                            [pickerTarget]: hex
                        }));
                    }}
                    onClose={() => {
                        setPickerTarget(null);
                        setPickerPosition(null);
                    }}
                />
            )}
        </div>
    );
};

export default DraggableLegend;