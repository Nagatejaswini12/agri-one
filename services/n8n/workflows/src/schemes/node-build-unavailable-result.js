// The curated catalog is empty or unreadable, so there is nothing
// truthful to show. The farmer gets a plain message; the detail goes to
// the n8n execution log so the failure stays diagnosable without leaking
// internals into the UI.

const data = $input.first() ? $input.first().json : {};
console.log(
  "Scheme catalog unusable:",
  JSON.stringify({ catalogVersion: data.catalogVersion, catalogCount: data.catalogCount })
);

return [
  {
    json: {
      status: "unavailable",
      reason: "The government scheme list is not available right now. Please try again."
    }
  }
];
