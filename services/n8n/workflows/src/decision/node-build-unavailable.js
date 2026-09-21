// The signal bundle or the farm context was unreadable, so there is
// nothing truthful to brief on. The farmer gets a plain message; the
// detail goes to the execution log so the failure stays diagnosable.

const data = $input.first() ? $input.first().json : {};
console.log(
  "Briefing context unusable:",
  JSON.stringify({
    hasSignals: !!data.signals,
    hasContext: !!data.context,
    farmId: data.context ? data.context.farmId : null
  })
);

return [
  {
    json: {
      status: "unavailable",
      reason: "Your farm briefing could not be prepared right now. Please try again."
    }
  }
];
