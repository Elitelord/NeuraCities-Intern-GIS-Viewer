'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { ChromePicker } from 'react-color';

const DebouncedChromePicker = ({ color, onChange }) => {
    const debouncedOnChange = useMemo(() => {
        let timeout;
        return (colorResult) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                onChange(colorResult.hex);
            }, 100);
        };
    }, [onChange]);

    const handleColorChange = (colorResult) => {
        debouncedOnChange(colorResult);
    };

    return (
        <div className="flex justify-center">
            <ChromePicker
                color={color}
                onChange={handleColorChange}
                onChangeComplete={debouncedOnChange}
                disableAlpha={true}
            />
        </div>
    );
};

export default function HexColorPickerPortal({
    color,
    onChange,
    onClose,
    position,
    pickerTarget,
    layerData,
    onSymbologyChange
}) {
    const pickerRef = useRef(null);
    const [colorMode, setColorMode] = useState('single');
    const [selectedField, setSelectedField] = useState('');
    const [fieldValues, setFieldValues] = useState([]);
    const [valueColors, setValueColors] = useState({});
    const [showColorPicker, setShowColorPicker] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPosition = useRef({ x: 0, y: 0 });
    const [pickerPosition, setPickerPosition] = useState(position);

    const debouncedOnChange = useMemo(() => {
        let timeout;
        return (newColor) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                onChange(newColor);
            }, 50);
        };
    }, [onChange]);

    const getAllFields = () => {
        if (!layerData?.features?.length) return [];

        const allFields = new Set();

        layerData.features.slice(0, Math.min(50, layerData.features.length)).forEach(feature => {
            Object.keys(feature.properties || {}).forEach(key => {
                if (key.startsWith('_') || key === 'Feature ID' || key === 'Geometry Type') {
                    return;
                }
                allFields.add(key);
            });
        });

        return Array.from(allFields).sort();
    };

    const getUniqueValues = (fieldName) => {
        if (!layerData?.features?.length || !fieldName) return [];

        const values = new Set();

        layerData.features.forEach(feature => {
            const value = feature.properties?.[fieldName];
            if (value !== null && value !== undefined && value !== '') {
                values.add(String(value));
            }
        });

        return Array.from(values).sort();
    };

    const handleFieldSelection = (fieldName) => {
        setSelectedField(fieldName);

        if (colorMode === 'categorical') {
            const uniqueValues = getUniqueValues(fieldName);
            setFieldValues(uniqueValues);

            const defaultColors = {};
            const colorPalette = [
                '#008080', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
                '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
                '#85C1E9', '#F8C471', '#82E0AA', '#F1948A', '#D7BDE2'
            ];

            uniqueValues.forEach((value, index) => {
                defaultColors[value] = colorPalette[index % colorPalette.length];
            });

            setValueColors(defaultColors);
        }
    };

    const handleColorBoxClick = (value, event) => {
        event.stopPropagation();

        if (showColorPicker === value) {
            setShowColorPicker(null);
            return;
        }

        setShowColorPicker(value);
    };

    const handleValueColorChange = useMemo(() => {
        const changeHandlers = {};

        return (value, newColor) => {
            if (changeHandlers[value]) {
                clearTimeout(changeHandlers[value]);
            }

            const updatedColors = {
                ...valueColors,
                [value]: newColor
            };
            setValueColors(updatedColors);

            changeHandlers[value] = setTimeout(() => {
                const symbology = {
                    type: 'categorical',
                    field: selectedField,
                    valueColors: updatedColors
                };
                onSymbologyChange(symbology);
                delete changeHandlers[value];
            }, 150);
        };
    }, [valueColors, selectedField, onSymbologyChange]);

    useEffect(() => {
        if (!position || !pickerTarget) return;

        const handleClickOutside = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                onClose();
            }
        };

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                if (showColorPicker) {
                    setShowColorPicker(null);
                } else {
                    onClose();
                }
            }
        };

        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }, 150);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [position, pickerTarget, onClose, showColorPicker]);

    const handleApply = () => {
        if (colorMode === 'single') {
            onSymbologyChange({
                type: 'single',
                color: color
            });
        } else if (colorMode === 'categorical' && selectedField && Object.keys(valueColors).length > 0) {
            onSymbologyChange({
                type: 'categorical',
                field: selectedField,
                valueColors: valueColors
            });
        }
    };

    const handleDragStart = (e) => {
        setIsDragging(true);

        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        dragStartPosition.current = {
            x: clientX,
            y: clientY,
            initialLeft: pickerPosition.left,
            initialTop: pickerPosition.top
        };

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('touchend', handleDragEnd);

        e.preventDefault();
    };

    const handleDragMove = (e) => {
        if (!isDragging) return;

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        const dx = clientX - dragStartPosition.current.x;
        const dy = clientY - dragStartPosition.current.y;

        let newLeft = dragStartPosition.current.initialLeft + dx;
        let newTop = dragStartPosition.current.initialTop + dy;

        newLeft = Math.max(4, newLeft);
        newTop = Math.max(4, newTop);

        const dialogWidth = window.innerWidth <= 768 ? 280 : 300;
        const maxLeft = window.innerWidth - dialogWidth - 4;
        const maxTop = window.innerHeight - 500 - 4; // Increased height for ChromePicker

        newLeft = Math.min(newLeft, maxLeft);
        newTop = Math.min(newTop, maxTop);

        setPickerPosition({ left: newLeft, top: newTop });
        e.preventDefault();
    };

    const handleDragEnd = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('touchend', handleDragEnd);
    };

    useEffect(() => {
        if (position) {
            if (window.innerWidth <= 768) {
                const dialogWidth = 280;
                const dialogHeight = 500;
                const centeredPosition = {
                    left: (window.innerWidth - dialogWidth) / 2,
                    top: (window.innerHeight - dialogHeight) / 2
                };
                setPickerPosition(centeredPosition);
            } else {
                setPickerPosition(position);
            }
        }
    }, [position]);

    if (!position || !pickerTarget) {
        return null;
    }

    const tabs = [
        { id: 'single', label: 'Color' },
        { id: 'categorical', label: 'Unique' }
    ];

    const pickerElement = (
        <div
            ref={pickerRef}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 z-[100001] flex flex-col overflow-hidden"
            style={{
                position: 'fixed',
                top: `${pickerPosition.top}px`,
                left: `${pickerPosition.left}px`,
                width: window.innerWidth <= 768 ? '280px' : '300px',
                height: colorMode === 'single' ? '500px' : '480px' // Dynamic height based on mode
            }}
        >
            {/* Drag Handle */}
            <div className="p-2 flex justify-center">
                <div
                    className="cursor-grab active:cursor-grabbing flex justify-center items-center"
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                    style={{ touchAction: 'none' }}
                >
                    <div className="w-4 h-3 flex flex-col justify-center items-center gap-0.5">
                        <div className="flex space-x-0.5">
                            <span className="block w-0.5 h-0.5 bg-gray-400 rounded-full"></span>
                            <span className="block w-0.5 h-0.5 bg-gray-400 rounded-full"></span>
                            <span className="block w-0.5 h-0.5 bg-gray-400 rounded-full"></span>
                        </div>
                        <div className="flex space-x-0.5">
                            <span className="block w-0.5 h-0.5 bg-gray-400 rounded-full"></span>
                            <span className="block w-0.5 h-0.5 bg-gray-400 rounded-full"></span>
                            <span className="block w-0.5 h-0.5 bg-gray-400 rounded-full"></span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="px-4 pb-3 flex items-center justify-center relative">
                <div className="text-sm font-semibold text-teal-600">
                    Layer Symbology
                </div>
                <button
                    onClick={onClose}
                    className="absolute right-4 w-6 h-6 bg-white border border-teal-600 text-teal-600 rounded-full flex items-center justify-center hover:bg-teal-600 hover:text-white transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            setColorMode(tab.id);
                            setSelectedField('');
                            setFieldValues([]);
                            setValueColors({});
                            setShowColorPicker(null);
                        }}
                        className={`flex-1 py-2 px-5 text-xs font-semibold border-b-2 transition-colors ${colorMode === tab.id
                                ? 'border-teal-600 bg-white text-teal-600'
                                : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-3">
                {/* Single Color with ChromePicker */}
                {colorMode === 'single' && (
                    <div className="h-full flex justify-center items-center" style={{ pointerEvents: 'auto' }}>
                        <div style={{ pointerEvents: 'auto' }}>
                            <DebouncedChromePicker
                                color={color}
                                onChange={debouncedOnChange}
                            />
                        </div>
                    </div>
                )}

                {/* Categorical */}
                {colorMode === 'categorical' && (
                    <div className="h-full flex flex-col">
                        {/* Field Selection */}
                        <div className="mb-2">
                            <label className="text-xs font-semibold text-gray-700 block mb-1">
                                Choose Field
                            </label>
                            <select
                                value={selectedField}
                                onChange={(e) => handleFieldSelection(e.target.value)}
                                className="w-full p-2 text-xs border border-gray-300 rounded focus:border-teal-600 focus:outline-none"
                            >
                                <option value="">Select a field...</option>
                                {getAllFields().map(field => (
                                    <option key={field} value={field}>{field}</option>
                                ))}
                            </select>
                        </div>

                        {/* Values List */}
                        {selectedField && fieldValues.length > 0 && (
                            <div className="flex-1 flex flex-col">
                                <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <span>Unique Values</span>
                                    <span className="bg-teal-600 text-white text-xs px-1 py-0.5 rounded">
                                        {fieldValues.length}
                                    </span>
                                </div>

                                <div className="h-44 overflow-y-auto bg-gray-50 rounded p-2">
                                    {fieldValues.map(value => (
                                        <div key={value} className="mb-1">
                                            <div className="flex items-center p-1 bg-white rounded border text-xs">
                                                <div
                                                    className="w-4 h-4 border-2 border-white rounded cursor-pointer mr-2 hover:scale-110 transition-transform"
                                                    style={{ backgroundColor: valueColors[value] || '#cccccc' }}
                                                    onClick={(e) => handleColorBoxClick(value, e)}
                                                />
                                                <span className="flex-1 font-medium text-gray-700 truncate">
                                                    {value}
                                                </span>
                                            </div>

                                            {/* Inline ChromePicker */}
                                            {showColorPicker === value && (
                                                <div className="mt-2 flex justify-center">
                                                    <div className="transform scale-75 origin-center">
                                                        <ChromePicker
                                                            color={valueColors[value] || '#008080'}
                                                            onChange={(color) => handleValueColorChange(value, color.hex)}
                                                            disableAlpha={true}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Apply Button */}
            <div className="p-3 border-t border-gray-200 bg-gray-50 flex justify-center">
                <button
                    onClick={() => {
                        handleApply();
                        onClose();
                    }}
                    disabled={
                        colorMode === 'categorical' && (!selectedField || Object.keys(valueColors).length === 0)
                    }
                    className="px-4 py-2 text-xs font-semibold border border-teal-600 rounded bg-teal-600 text-white hover:bg-teal-700 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Apply to Map
                </button>
            </div>
        </div>
    );

    return ReactDOM.createPortal(pickerElement, document.body);
}