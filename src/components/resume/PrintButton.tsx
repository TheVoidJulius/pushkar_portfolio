"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rz-btn rz-btn-primary">
      Download PDF
    </button>
  );
}
