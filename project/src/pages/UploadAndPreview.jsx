import React, { useState } from 'react';
import UploadDropzone from '../components/UploadDropzone';
import PreviewRouter from '../components/PreviewRouter';
import MapComponent from '../components/MapComponent'; 

export default function UploadAndPreview() {
    const [fileObjects, setFileObjects] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null); 

    const handleFilesUpdate = (files) => {
        setFileObjects(files);
        if (files.length > 0) {
            setSelectedFile(files[0]); 
        } else {
            setSelectedFile(null);
        }
    };

    return (
        <div className="main-container">
            <UploadDropzone onFilesUpdate={handleFilesUpdate} />

            <div style={{ display: 'flex', height: '80vh', marginTop: '20px' }}>
                {/* Left Panel: File List and Previews */}
                <div style={{ flex: 1, marginRight: '10px', overflow: 'auto' }}>
                    <h3>Uploaded Files</h3>
                    <ul>
                        {fileObjects.map((file, index) => (
                            <li
                                key={index}
                                onClick={() => setSelectedFile(file)}
                                style={{
                                    cursor: 'pointer',
                                    fontWeight: selectedFile === file ? 'bold' : 'normal',
                                    padding: '5px'
                                }}
                            >
                                {file.fileName}
                            </li>
                        ))}
                    </ul>
                    <hr />
                    {selectedFile && <PreviewRouter file={selectedFile} />}
                </div>

                {/* Right Panel: Map */}
                <div style={{ flex: 2 }}>
                    <MapComponent geojsonData={selectedFile ? selectedFile.geoJsonData : null} />
                </div>
            </div>
        </div>
    );
}
