$(document).ready(function() {
    let $photo = $('#photo');
    let eyeCascade = null;
    let resizeHeight = 500;
    let resizeWidth = 400;

    $('#width').on('change', function() {
        let width = $(this).val();
        if (!width) {
            resizeWidth = parseInt(400, 10);;
        } else {
            resizeWidth = parseInt(width, 10);
        }
        $('#detail-width').text(resizeWidth);
    })

    $('#height').on('change', function() {
        let height = $(this).val()
        if (!height) {
            resizeHeight = parseInt(500, 10);;
        } else {
            resizeHeight = parseInt(height, 10);
        }
        $('#detail-height').text(resizeHeight);
    })

    // Load cv before process image
    cv.onRuntimeInitialized = function() {
        // Load Haar Cascade
        loadCascadeXML().then(() => {
            $photo.on('change', function() {
                let photoList = $photo[0].files;
                for (let i = 0; i < photoList.length; i++) {
                    editImage(photoList[i]);
                }
            });
        }).catch(err => {
            console.error('Error loading cascade XML:', err);
        });
    };

    function loadCascadeXML() {
        return new Promise((resolve, reject) => {
            const xml_model_url = 'https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_eye.xml';
            const xml_path = "haarcascade_eye.xml";

            let request = new XMLHttpRequest();
            request.open('GET', xml_model_url, true);
            request.responseType = 'arraybuffer';
            request.onload = function(ev) {
                if (request.readyState === 4 && request.status === 200) {
                    const data = new Uint8Array(request.response);
                    cv.FS_createDataFile('/', xml_path, data, true, false, false);
                    eyeCascade = new cv.CascadeClassifier(xml_path);
                    resolve();
                } else {
                    reject('Failed to load XML file');
                }
            };
            request.send();
        });
    }

    function editImage(file) {
        if (file) {
            const imgUrl = URL.createObjectURL(file);
            const fileName = file.name.substring(0, file.name.indexOf('.')) || "image";

            const img = new Image();
            img.src = imgUrl;

            img.onload = function() {
                processImage(img, fileName);
            };

            img.onerror = function() {
                console.error('Error loading image:', file.name);
            };
        }
    }

    function processImage(img, fileName) {
        let mat = cv.imread(img);
        let resized = new cv.Mat();

        let height = mat.rows;
        let width = mat.cols;

        // User requirements for photo size
        let addX = 400;
        let addTop = 450;
        let addBottom = 550;

        // Balance photo size based on pixel width
        if (width >= 900) {
            cv.resize(mat, resized, new cv.Size(900, 1600));
        } else {
            addX = 200;
            addTop = 225;
            addBottom = 275;
            cv.resize(mat, resized, new cv.Size(width, height));
        }

        let gray = new cv.Mat();
        cv.cvtColor(resized, gray, cv.COLOR_BGR2GRAY);

        let eyes = new cv.RectVector();
        eyeCascade.detectMultiScale(gray, eyes, 1.1, 5, 0);

        if (eyes.size() > 0) {
            let mid_x = 0;
            let mid_y = 0;

            for (let i = 0; i < eyes.size(); i++) {
                // Take only 2 eyes detected
                if (i >= 2) break;
                let x = eyes.get(i).x;
                let y = eyes.get(i).y;
                let w = eyes.get(i).width;
                let h = eyes.get(i).height;
                mid_x += x + w / 2;
                mid_y += y + h / 2;
            }

            let mid_x_fix = Math.floor(mid_x / 2);
            let mid_y_fix = Math.floor(mid_y / 2);

            let left = Math.max(mid_x_fix - addX, 0);
            let right = Math.min(mid_x_fix + addX, resized.cols);
            let top = Math.max(mid_y_fix - addTop, 0);
            let bottom = Math.min(mid_y_fix + addBottom, resized.rows);

            let crop = resized.roi(new cv.Rect(left, top, right - left, bottom - top));
            let resized_image = new cv.Mat();
            cv.resize(crop, resized_image, new cv.Size(resizeWidth, resizeHeight));
            cv.imshow('canvas-output', resized_image);
            $('#canvas-output').css('height', resizeHeight/1.5)
            $('#canvas-output').css('width', resizeWidth/1.5)

            // Convert to BMP format
            const bmpData = createBMP(resized_image);
            const blob = new Blob([bmpData], { type: 'image/bmp' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.bmp`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Clean up
            mat.delete();
            resized.delete();
            gray.delete();
            crop.delete();
            resized_image.delete();
        }
    }

    function createBMP(mat) {
        const width = mat.cols;
        const height = mat.rows;
        const rowSize = Math.ceil((width * 3) / 4) * 4; // Each row must be a multiple of 4 bytes
        const bmpFileSize = 54 + rowSize * height;
        const bmpBuffer = new Uint8Array(bmpFileSize);
        const dataView = new DataView(bmpBuffer.buffer);

        // BMP Header
        dataView.setUint16(0, 0x4D42, true); // Signature 'BM'
        dataView.setUint32(2, bmpFileSize, true); // File size
        dataView.setUint32(10, 54, true); // Offset to pixel data
        dataView.setUint32(14, 40, true); // DIB header size
        dataView.setUint32(18, width, true); // Width
        dataView.setUint32(22, height, true); // Height
        dataView.setUint16(26, 1, true); // Color planes
        dataView.setUint16(28, 24, true); // Bits per pixel
        dataView.setUint32(34, rowSize * height, true); // Size of pixel data

        // Pixel data
        const pixels = mat.data;
        let pixelIndex = 54;

        for (let y = height - 1; y >= 0; y--) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4; // For RGBA
                bmpBuffer[pixelIndex++] = pixels[idx + 2]; // R
                bmpBuffer[pixelIndex++] = pixels[idx + 1]; // G
                bmpBuffer[pixelIndex++] = pixels[idx];     // B
            }

            for (let padding = 0; padding < rowSize - (width * 3); padding++) {
                bmpBuffer[pixelIndex++] = 0; // Padding bytes
            }
        }

        return bmpBuffer;
    }
});
