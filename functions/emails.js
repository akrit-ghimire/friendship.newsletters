exports.generate = async (prompt) => {
    const result = await model.generateContent(prompt);
    return result.response.text();
}

exports.prompts = {
    "submission": ``,
    "reminders": (days_left) => ``,
    "newsletter": (updates) => ``
}

exports.create_newsletter_email = async (entries, users) => {

    // returns {"name": ""}
}

exports.create_empty_newsletter_email = async (users) => {

    // returns {"name": ""}
}

exports.create_submission_link_email = async (users) => {

    // returns {"name": (link) => ``}
}

exports.create_reminder_email = async (users) => {

    // returs {"name": (link) => ``}
}

exports.send_email = async (email, text) => {

}