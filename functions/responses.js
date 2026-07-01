exports.status_enums = {
    ACTIVE: "ACTIVE",
    SUBMITTED: "SUBMITTED",
    INACTIVE: "INACTIVE"
}

exports.return_response = (success, body = {}) => {
    return {success, body}
}
exports.entry_state = (status) => {
    return {status}
}