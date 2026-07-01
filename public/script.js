// todo
// fix the index.html
// host on firebase 
// connect backend and frontend links

const BASE_URL = "http://127.0.0.1:5001/friendship-newsletters/us-central1"

const pages = {
    screen_message: document.getElementById('screen_message'),
    loading: document.getElementById('loading'),
    form: document.getElementById('form')
}

const display = (page) => {
    pages.screen_message.style.display = 'none'
    pages.loading.style.display = 'none'
    pages.form.style.display = 'none'
    page.style.display = 'flex'
}

const screen_message = (heading, text) => {
    document.getElementById('screen_message_title').innerText = heading
    document.getElementById('screen_message_desc').innerText = text

    display(pages.screen_message)
}

// for loading image dataurl to file object
function dataURLtoFile(dataurl, filename) {
    let arr = dataurl.split(','), 
        mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), 
        n = bstr.length, 
        u8arr = new Uint8Array(n);
        
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], filename, {type:mime});
}

const brancher = async () => {
    display(pages.loading)

    const unique_user_code = window.location.hash.slice(1)

    if (unique_user_code == '') {
        screen_message("Invalid Website Entry", "Use the unique link in the email sent to you to access the submission page.")
        return
    }

    try {
        const response = await fetch(`${BASE_URL}/checkCode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                unique_code: unique_user_code,
            })
        });

        if (!response.ok) {
            // server issue
            screen_message("Uh Oh.", "Something went wrong in the backend. Click the link in your email and try again.")
            return
        }

        let data = await response.json();
        const status = data.body.status


        if (status == "ACTIVE") {
            display(pages.form)


            const fileInput = document.getElementById('fileInput');
            const dropZone = document.getElementById('dropZone');
            const imagePreview = document.getElementById('imagePreview');
            const update = document.getElementById('update');
            const caption = document.getElementById('caption');
            const uploadIcon = document.getElementById('uploadIcon');
            const uploadText = document.getElementById('uploadText');
            const submitForm = document.getElementById('submitForm');

            var image = localStorage.getItem(unique_user_code + 'image')
            var caption_text = localStorage.getItem(unique_user_code + 'caption')
            var update_text = localStorage.getItem(unique_user_code + 'update')

            // loading any saved data
            if (image) {
                imagePreview.src = image
                imagePreview.style.display = 'block';
                uploadIcon.style.display = 'none';
                uploadText.style.display = 'none'; // Hide text entirely

                // populate file field so that submission can happen without reselecting photo
                const file = dataURLtoFile(image, "autosaved-image.png");
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files; 
            }
            if (caption_text) caption.value = caption_text
            if (update_text) update.value = update_text

            // setting up auto saving data
            caption.onchange = (e) => localStorage.setItem(unique_user_code + 'caption', e.target.value)
            update.onchange = (e) => localStorage.setItem(unique_user_code + 'update', e.target.value)


            // Trigger file input
            dropZone.addEventListener('click', () => fileInput.click());

            // Handle file selection
            fileInput.addEventListener('change', function () {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        imagePreview.src = e.target.result;
                        localStorage.setItem(unique_user_code + 'image', e.target.result) // autosave picture
                        imagePreview.style.display = 'block';
                        uploadIcon.style.display = 'none';
                        uploadText.style.display = 'none'; // Hide text entirely
                    }
                    reader.readAsDataURL(file);
                }
            });

            // Handle Form Submission with Validation
            submitForm.addEventListener('submit', async (event) => {
                // Check if a file is actually selected
                if (fileInput.files.length === 0) {
                    event.preventDefault(); // Stop the submit
                    alert("Please upload an aesthetic asset before proceeding.");
                    return;
                }

                event.preventDefault();

                try {
                    // Send the submission details to backend (Includes Base64 image URL)
                    display(pages.loading)

                    const submitResponse = await fetch(`${BASE_URL}/submitUpdate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            unique_code: unique_user_code,
                            update: update.value,
                            image: imagePreview.src, // Base64 data url from preview
                            caption: caption.value
                        })
                    });

                    const result = await submitResponse.json();

                    if (submitResponse.ok && result.success) {
                        // Success! Clear autosaved content to keep storage tidy
                        localStorage.removeItem(unique_user_code + 'image');
                        localStorage.removeItem(unique_user_code + 'caption');
                        localStorage.removeItem(unique_user_code + 'update');

                        screen_message("Done & Dusted!", "Your update has been uploaded. Keep an eye on your inbox for the compiled newsletter at the end of the month!");
                    } else {
                        // Display error message from backend
                        screen_message("Submission Failed", result.error || "An unknown error occurred.");
                    }

                } catch (submitError) {
                    console.error("Submission error:", submitError);
                    screen_message("Error Sending Update", "Unable to establish connection with server to upload data.");
                }
            });

        }
        else if (status == "SUBMITTED") {
            screen_message("Don't be Daft", "You've already submitted your monthly update, don't stress we've received it!")
            return

        } else if (status == "INACTIVE") {
            screen_message("Check the Expiry", "This is an old link, look in your inbox for a more recent email from us for the unique submission link for this month.")
            return

        } else {
            screen_message("Scratching our Heads", "We don't know what went wrong. Try contact us.")
            return
        }

    } catch (error) {
        console.log(error)
        screen_message("Uh Oh.", "Couldn't talk to the server, are you not connected to wifi? Click the link in the email and try again.")
    }

}
brancher()