// Parse XLIFF 1.2 text into an array of segment objects.
export function xliffToSegments(xliffText) {
  const doc = new DOMParser().parseFromString(xliffText, "application/xml");

  // If the XML is malformed, the browser puts a <parsererror> node in the result.
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid XLIFF: the file is not well-formed XML.");
  }

  const units = doc.getElementsByTagName("trans-unit");
  const segments = [];

  for (const unit of units) {
    const source = unit.getElementsByTagName("source")[0];
    const target = unit.getElementsByTagName("target")[0];
    segments.push({
      id: unit.getAttribute("id"),
      source: source ? source.textContent.trim() : "",
      target: target ? target.textContent.trim() : "",
    });
  }

  return segments;
}