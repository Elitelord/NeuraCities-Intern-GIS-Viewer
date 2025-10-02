import React, {useState, useCallback} from "react";


const getFileExtension = (filename) => {
    return filename.split('.').pop().toLowerCase();
};

const fileUpload = () => {
    const [uploadedFile, setUploadedFile] = useState[""];

    return (<>
    <div>
        <input type = "file" value = {uploadedFile}>Choose File</input>
    </div>
    </>);
};
export default fileUpload;