// [] tidy up code
// figure out which email provider and how emails are sent
// test the email sending
// create the email templates for each type
// test email sending with actual data
// iterate step in each day and see what happens with the code
// set up manual endpoint links so that they can be called manually if daily check fails
// * create the birthday messages (reminders to those who isn't bday), (message to the person on their bday)
// upload cloud functions and hookup backend and frontend

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { send_email, create_newsletter_email, create_reminder_email, create_submission_link_email } = require('./emails')
const { status_enums, entry_state, return_response } = require('./responses');
const { error, group } = require("console");
const { getDownloadURL } = require("firebase-admin/storage");


admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "gs://friendship-newsletters.firebasestorage.app"
});
setGlobalOptions({ maxInstances: 10 });


const db = admin.firestore();
const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });
const frontend_url = "http://127.0.0.1:5500"


const create_and_send_submission_emails = async () => {
    try {
        const results = await db.collection("users").get();

        if (results.empty) return;

        const users = results.docs.map(result => ({ ...result.data() }));

        const batch = db.batch();

        const submission_merge = await create_submission_link_email(users)

        users.forEach(user => {
            const unique_code = crypto.randomBytes(6).toString("hex");

            const new_submission_ref = db.collection("entries").doc(`${year}-${month}-${user.name}`);

            batch.set(new_submission_ref, {
                unique_code: unique_code,
                status: status_enums.ACTIVE,
                caption: "",
                update: "",
                image: "",
                email: user.email,
                name: user.name,
                group: user.group,
                pfp: user.pfp
            });

            await send_email(user.email, submission_merge[user.name](frontend_url + '/submit.html#' + unique_code))
            logger.info(`Sent email to ${user.name}.`);
        });

        await batch.commit();
        logger.info("Successfully generated new monthly codes and newsletter entries!");

    } catch (error) {
        logger.error("Error generating monthly codes:", error);
    }
}

const create_and_send_reminder_emails = async () => {
    try {
        const results = await db.collection('entries').where("status", "==", status_enums.ACTIVE).get();

        if (results.empty) return

        const entries = results.docs.map(result => ({ ...result.data() }));

        const reminders_merge = await create_reminder_email(entries.map(entry => entry.name))

        entries.forEach(entry => {
            await send_email(entry.email, reminders_merge[entry.name](frontend_url + '/submit.html#' + entry.unique_code))
            logger.info(`Sent email to ${entry.name} for not submitting already.`);
        })

        logger.info("Successfully sent emails to late users.");

    } catch (error) {
        logger.error("Error sending mail to late users:", error);
    }
}

const create_and_send_newsletters = async () => {
    try {
        const [users_results, entries_results] = await Promise.all([
            db.collection("users").get(),
            db.collection("entries").where("status", "==", status_enums.SUBMITTED).get()
        ]);

        const users = users_results.docs.map(result => ({ ...result.data() }));
        const entries = entries_results.docs.map(result => ({ ref: result.ref,...result.data() }));

        const users_grouped = Object.groupBy(users, user => user.group);
        const entries_grouped = Object.groupBy(entries, entry => entry.group);
        
        for (let [group_name, group_list] of Object.entries(users_grouped)) {
            const submitted_entries = entries_grouped[group_name]
            
            if (!submitted_entries) {
                const newsletter_merge = await create_empty_newsletter_email(group_list)
                
                group_list.forEach(user => {
                    await send_email(user.email, newsletter_merge[user.name])
                    logger.info(`Successfully sent newsletter to  ${user.name}.`);
                })
            } 
            else {
                const newsletter_merge = await create_newsletter_email(submitted_entries, group_list)
                
                group_list.forEach(user => {
                    await send_email(user.email, newsletter_merge[user.name])
                    logger.info(`Successfully sent newsletter to  ${user.name}.`);
                })
                logger.info(`Successfully sent newsletter to users in group ${group_name}.`);
                
            }
        }
        const batch = db.batch();

        entries.forEach(entry => {
            batch.update(entry.ref, { status: status_enums.INACTIVE });
        })

        await batch.commit();
        logger.info("Successfully sent newsletter to users.");


    } catch (error) {
        logger.error("Error sending newsletter:", error);
    }
}

exports.manualNewsletterCreation = onRequest({ cors: true }, async (req, res) => {
    try {
        await create_and_send_newsletters()

        logger.info("Triggered manual creation of newsletters.");
        return res.status(200).send();

    } catch (error) {
        logger.error("Failed to execute: ", error);
        return res.status(500).send();
    }
});

exports.manualReminders = onRequest({ cors: true }, async (req, res) => {
    try {
        await create_and_send_reminder_emails()

        logger.info("Triggered manual reminders to users who haven't submitted.");
        return res.status(200).send();

    } catch (error) {
        logger.error("Failed to execute: ", error);
        return res.status(500).send();
    }
});

exports.manualSubmissions = onRequest({ cors: true }, async (req, res) => {
    try {
        await create_and_send_submission_emails()

        logger.info("Triggered manual submission open.");
        return res.status(200).send();

    } catch (error) {
        logger.error("Failed to execute: ", error);
        return res.status(500).send();
    }
});

exports.dailyNewsletterTasks = onSchedule("0 9 * * *", async (event) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    // const date = today.getDate();
    const date = 30
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const daysLeft = lastDayOfMonth - date;

    logger.info(`Daily check running. Day of month: ${date}. Days left: ${daysLeft}`);

    if (date === 20) {
        logger.info("It's the 20th! Time to email initial submission links.");
        await create_and_send_submission_emails()

    } else if (daysLeft <= 4 && daysLeft > 0) {
        logger.info("End of month approaching. Checking for missing updates to send reminders.");
        await create_and_send_reminder_emails()

    } else if (daysLeft === 0) {
        logger.info("Last day of the month! Stitching updates with Gemini AI and mailing newsletter.");
        await create_and_send_newsletters()

    }
});

const upload_image = async (image, unique_code) => { // returns uploaded image url
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)

    if (!matches || matches.length !== 3) return null

    const mime_type = matches[1]
    const base64_data = matches[2]
    const image_buffer = Buffer.from(base64_data, 'base64')

    const bucket = admin.storage().bucket();

    const extension = mime_type.split('/')[1];
    const file_name = `newsletters/${unique_code}-${Date.now()}.${extension}`;
    const file = bucket.file(file_name);

    await file.save(image_buffer, {
        metadata: { contentType: mime_type },
    });

    const image_url = await getDownloadURL(file);

    return image_url
}

exports.submitUpdate = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).send(return_response(success = false));

    try {
        const { unique_code, caption, update, image } = req.body;

        // assumption that only can submit if active already has been checked

        const result = await db.collection('entries').where("unique_code", "==", unique_code).limit(1).get();

        if (result.empty) return res.status(404).send(return_response(success = false));

        const image_url = await upload_image(image, unique_code)

        if (!image_url) return res.status(500).send(return_response(success = false));

        result.docs[0].ref.update({
            caption,
            update,
            image: image_url,
            status: status_enums.SUBMITTED
        })

        return res.status(200).send(return_response(success = true));

    } catch (error) {
        logger.error("Error handling submission:", error);
        return res.status(500).send(return_response(success = false));
    }
});

exports.checkCode = onRequest({ cors: true }, async (req, res) => {
    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    try {
        const { unique_code } = req.body;

        const result = await db.collection('entries').where("unique_code", "==", unique_code).limit(1).get();

        if (result.empty) return res.status(404).send(return_response(success = false));

        const entry = result.docs[0].data()

        res.status(200).send(return_response(success = true, entry_state(status_enums[entry.status])));

    } catch (error) {
        console.error("Error fetching newsletter:", error);
        res.status(500).send(return_response(success = false));
    }
});

exports.dummy = onRequest({ cors: true }, async (req, res) => {
    try {
        const dummy_users = [
            {
                name: "Akrit Ghimire",
                email: "akrit.ghimire.developer@gmail.com",
                group: "Roxburgh",
                pfp: ""
            },
            {
                name: "Akrit Ghimire",
                email: "akrit.ghimire.developer@gmail.com",
                group: "Chai",
                pfp: ""
            },
            {
                name: "Iestyn Tilsey",
                email: "",
                group: "Roxburgh",
                pfp: ""
            },
            {
                name: "Eva",
                email: "",
                group: "Roxburgh",
                pfp: ""
            },
            {
                name: "James Hollingdale",
                email: "",
                group: "Roxburgh",
                pfp: ""
            },
            {
                name: "Nghi",
                email: "",
                group: "Roxburgh",
                pfp: ""
            },
            {
                name: "Gehana Spoorty",
                email: "",
                group: "Chai",
                pfp: ""
            },
        ];
        
        const user_promises = dummy_users.map(user => {
            return db.collection("users").add(user);
        })

        await Promise.all(entry_promises);
        await Promise.all(user_promises);

        logger.info("Successfully seeded dummy data!");
        return res.status(200).send();

    } catch (error) {
        logger.error("Error seeding dummy data:", error);
        return res.status(500).send();
    }
});
