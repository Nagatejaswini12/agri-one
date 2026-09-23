// The question was empty or unreadable, so there is nothing to answer.
// The farmer gets a plain message; the detail goes to the execution log
// so the failure stays diagnosable without leaking internals.

const data = $input.first() ? $input.first().json : {};
console.log(
  "Chat request unusable:",
  JSON.stringify({ hasQuestion: !!data.question, locale: data.locale })
);

return [
  {
    json: {
      status: "unavailable",
      reason: "I couldn't read that question. Please try typing it again."
    }
  }
];
