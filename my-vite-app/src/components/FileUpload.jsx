import React, { useState } from 'react';

const FileUpload = () => {
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {

  };

  return (
    <>
      <div className="input-group">
        <input id="file" type="file" onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            if(e.target.files[0].size > 1000 * 1024){
              console.error("File size is too large");
              return false;
            }
            else {
              handleFileChange(e)
            }
          }
        }} />
      </div>
      {file && (
        <section>
          File details:
          <ul>
            <li>Name: {file.name}</li>
            <li>Type: {file.type}</li>
            <li>Size: {file.size} bytes</li>
          </ul>
        </section>
      )}

      {file && (
        <button 
          onClick={handleUpload}
          className="submit"
        >Upload a file</button>
      )}
    </>
  );
};

export default FileUpload;