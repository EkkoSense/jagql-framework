const uuid = require("uuid")

module.exports.notesData = [
    ...new Array(100000)
].map((_, i) => ({
    id: uuid.v4(),
    type: "notes",
    body: `First! ${i}`,
    timestamp: "2017-01-02",
    parent: null,
}))