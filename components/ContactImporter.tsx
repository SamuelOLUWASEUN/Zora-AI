"use client";

import React, { useState, useCallback } from "react";

// ─────────────────────────────────────────────
// TYPE SYSTEM
// ─────────────────────────────────────────────

interface ContactImportProps {
  onContactSaved: (name: string, phone: string) => void;
  onClose: () => void;
}

interface ManualForm {
  name: string;
  phone: string;
  email: string;
}

type ImportMode = "picker" | "manual";
type SaveState = "idle" | "saving" | "saved" | "error";

// ─────────────────────────────────────────────
// TOKEN SYSTEM (matches ChatInterface)
// ─────────────────────────────────────────────

const T = {
  bg: "#09090b",
  bgElevated: "#111113",
  bgHover: "#18181b",
  border: "#1e1e24",
  borderActive: "#3f3f46",
  textPrimary: "#ffffff",
  textMuted: "#a1a1aa",
  textDim: "#52525b",
  green: "#10b981",
  red: "#ef4444",
  radius: "4px",
  radiusMd: "6px",
  fontMono: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
  fontSans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
} as const;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Progressive enhancement: detect Contacts API support
function hasContactsAPI(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    // @ts-expect-error — ContactsManager not yet in TS lib
    typeof navigator.contacts?.select === "function"
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function ContactImporter({
  onContactSaved,
  onClose,
}: ContactImportProps) {
  const [mode, setMode] = useState<ImportMode>(
    hasContactsAPI() ? "picker" : "manual"
  );
  const [form, setForm] = useState<ManualForm>({ name: "", phone: "", email: "" });
  const [errors, setErrors] = useState<Partial<ManualForm>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pickerError, setPickerError] = useState<string | null>(null);

  // ── Web Contact Picker (Android Chrome Easter Egg) ──
  const launchPicker = useCallback(async () => {
    if (!hasContactsAPI()) {
      setMode("manual");
      return;
    }

    try {
      setPickerError(null);
      // @ts-expect-error — ContactsManager not in TS lib yet
      const contacts = await navigator.contacts.select(["name", "tel"], {
        multiple: false,
      });

      if (!contacts || contacts.length === 0) return;

      const picked = contacts[0];
      const name = picked.name?.[0] ?? "";
      const phone = picked.tel?.[0] ?? "";

      if (!name || !phone) {
        setPickerError("Contact missing name or phone. Enter manually.");
        setMode("manual");
        return;
      }

      // Pre-fill manual form with picker data and let user confirm
      setForm({ name, phone, email: "" });
      setMode("manual");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Picker failed";
      setPickerError(`Picker unavailable: ${msg}`);
      setMode("manual");
    }
  }, []);

  // ── Form validation ──────────────────────────
  function validate(): boolean {
    const newErrors: Partial<ManualForm> = {};

    if (!form.name.trim() || form.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    const cleanPhone = form.phone.replace(/[\s\-()]/g, "");
    if (!cleanPhone || cleanPhone.length < 7) {
      newErrors.phone = "Enter a valid phone number";
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Enter a valid email or leave blank";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // ── Save contact via /api/contacts ──────────
  const handleSave = useCallback(async () => {
    if (!validate()) return;

    setSaveState("saving");

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Save failed: ${res.status}`);
      }

      setSaveState("saved");
      onContactSaved(form.name.trim(), form.phone.trim());

      setTimeout(() => onClose(), 900);
    } catch (err) {
      console.error("[ContactImporter] Save error:", err);
      setSaveState("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, onContactSaved, onClose]);

  const updateField = (field: keyof ManualForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  return (
    <div style={s.backdrop} role="dialog" aria-modal="true" aria-label="Add contact">
      <div style={s.panel}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.eyebrow}>CONTACT VAULT</span>
            <h2 style={s.title}>Add Contact</h2>
          </div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Picker CTA — shown only if API available */}
        {hasContactsAPI() && mode === "manual" && (
          <button style={s.pickerBtn} onClick={launchPicker}>
            <span style={s.pickerIcon}>📇</span>
            Import from device contacts
          </button>
        )}

        {/* Picker error notice */}
        {pickerError && (
          <div style={s.notice} role="alert">
            {pickerError}
          </div>
        )}

        {/* Manual form — always rendered as primary path */}
        <div style={s.form}>
          <Field
            label="NAME"
            id="sv-contact-name"
            value={form.name}
            onChange={(v) => updateField("name", v)}
            placeholder="Full name"
            error={errors.name}
            autoFocus
          />
          <Field
            label="PHONE"
            id="sv-contact-phone"
            value={form.phone}
            onChange={(v) => updateField("phone", v)}
            placeholder="+44 7700 900000"
            type="tel"
            error={errors.phone}
          />
          <Field
            label="EMAIL"
            id="sv-contact-email"
            value={form.email}
            onChange={(v) => updateField("email", v)}
            placeholder="optional@email.com"
            type="email"
            error={errors.email}
          />
        </div>

        {/* Save error */}
        {saveState === "error" && (
          <div style={{ ...s.notice, borderColor: T.red, color: T.red }} role="alert">
            Failed to save. Check your connection and try again.
          </div>
        )}

        {/* Actions */}
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onClose} disabled={saveState === "saving"}>
            Cancel
          </button>
          <button
            style={{
              ...s.saveBtn,
              opacity: saveState === "saving" ? 0.6 : 1,
            }}
            onClick={handleSave}
            disabled={saveState === "saving" || saveState === "saved"}
            aria-label="Save contact"
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
              ? "✓ Saved"
              : "Save contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Field sub-component ──────────────────────

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  autoFocus,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <div style={s.fieldWrap}>
      <label htmlFor={id} style={s.fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          ...s.input,
          ...(error ? s.inputError : {}),
        }}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={!!error}
      />
      {error && (
        <span id={`${id}-error`} style={s.fieldError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.88)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 8000,
    padding: "0 0 env(safe-area-inset-bottom, 0)",
  },
  panel: {
    width: "100%",
    maxWidth: "480px",
    backgroundColor: T.bgElevated,
    border: `1px solid ${T.border}`,
    borderBottom: "none",
    borderRadius: "8px 8px 0 0",
    padding: "24px 20px 32px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    fontFamily: T.fontSans,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  eyebrow: {
    fontFamily: T.fontMono,
    fontSize: "9px",
    letterSpacing: "0.2em",
    color: T.textDim,
  },
  title: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: T.textPrimary,
    letterSpacing: "-0.01em",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: T.textDim,
    cursor: "pointer",
    fontSize: "14px",
    padding: "2px 4px",
  },
  pickerBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: "11px 14px",
    border: `1px dashed ${T.borderActive}`,
    borderRadius: T.radiusMd,
    backgroundColor: "transparent",
    color: T.textMuted,
    fontFamily: T.fontSans,
    fontSize: "13px",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  pickerIcon: { fontSize: "16px" },
  notice: {
    padding: "9px 12px",
    border: `1px solid ${T.borderActive}`,
    borderRadius: T.radius,
    fontFamily: T.fontMono,
    fontSize: "11px",
    color: T.textMuted,
    letterSpacing: "0.02em",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  fieldLabel: {
    fontFamily: T.fontMono,
    fontSize: "9px",
    letterSpacing: "0.15em",
    color: T.textDim,
  },
  input: {
    width: "100%",
    backgroundColor: T.bg,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    padding: "10px 12px",
    color: T.textPrimary,
    fontFamily: T.fontSans,
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s",
  },
  inputError: {
    borderColor: T.red,
  },
  fieldError: {
    fontFamily: T.fontMono,
    fontSize: "10px",
    color: T.red,
    letterSpacing: "0.03em",
  },
  actions: {
    display: "flex",
    gap: "8px",
    marginTop: "4px",
  },
  cancelBtn: {
    flex: 1,
    padding: "12px",
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    backgroundColor: "transparent",
    color: T.textMuted,
    fontFamily: T.fontSans,
    fontSize: "14px",
    cursor: "pointer",
  },
  saveBtn: {
    flex: 2,
    padding: "12px",
    border: "none",
    borderRadius: T.radius,
    backgroundColor: T.textPrimary,
    color: T.bg,
    fontFamily: T.fontSans,
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
};

// Inject CSS for input focus state (can't do pseudo-selectors inline)
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    #sv-contact-name:focus,
    #sv-contact-phone:focus,
    #sv-contact-email:focus {
      border-color: #3f3f46 !important;
      outline: none;
    }
  `;
  document.head.appendChild(style);
}
